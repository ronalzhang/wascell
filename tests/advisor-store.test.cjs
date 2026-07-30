const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createAdvisorStore } = require('../lib/advisor-store');

async function makeStore(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wascell-advisor-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    return createAdvisorStore({
        dataDir: path.join(root, 'data'),
        uploadDir: path.join(root, 'uploads'),
        now: () => new Date('2026-07-31T01:02:03.000Z'),
    });
}

test('createApplication persists one order and reuses it for the same submission key', async (t) => {
    const store = await makeStore(t);
    const input = {
        submissionKey: 'submission-001',
        periodId: '20260901',
        periodLabel: '2026·九月首期',
        name: '周先生',
        contact: 'zhou_private',
        email: '',
        company: '澄远控股',
        note: '希望了解时间安排',
        source: { page: '/20260901' },
    };

    const first = await store.createApplication(input, []);
    const repeated = await store.createApplication(input, []);
    const listed = await store.listApplications({ page: 1, pageSize: 20 });

    assert.match(first.order.id, /^ARK-20260731-[A-Z0-9]{6}$/);
    assert.equal(first.created, true);
    assert.equal(repeated.created, false);
    assert.equal(repeated.order.id, first.order.id);
    assert.equal(listed.total, 1);
    assert.equal(listed.items[0].status, 'new');
});

test('listApplications filters by status, period and search text', async (t) => {
    const store = await makeStore(t);
    await store.createApplication({ submissionKey: 'a', periodId: '20260901', periodLabel: '九月首期', name: '周先生', contact: 'wx_zhou' }, []);
    const second = await store.createApplication({ submissionKey: 'b', periodId: '20260902', periodLabel: '九月二期', name: '陈女士', contact: '13900000000' }, []);
    await store.updateApplication(second.order.id, { status: 'contacted', adminNote: '已联系' });

    const result = await store.listApplications({ status: 'contacted', periodId: '20260902', query: '陈女士', page: 1, pageSize: 20 });

    assert.equal(result.total, 1);
    assert.equal(result.items[0].name, '陈女士');
    assert.equal(result.items[0].adminNote, '已联系');
});

test('createApplication stores an attachment under a random server filename', async (t) => {
    const store = await makeStore(t);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wascell-upload-'));
    t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
    const tempPath = path.join(tempDir, 'incoming');
    await fs.writeFile(tempPath, 'safe pdf fixture');

    const created = await store.createApplication(
        { submissionKey: 'file-1', periodId: '20260901', periodLabel: '九月首期', name: '顾女士', contact: 'gu_private' },
        [{ path: tempPath, originalname: '../体检报告.pdf', size: 16, mimetype: 'application/pdf' }],
    );
    const attachment = created.order.attachments[0];
    const resolved = await store.getAttachment(created.order.id, attachment.id);

    assert.equal(attachment.displayName, '体检报告.pdf');
    assert.match(attachment.storageName, /^[a-f0-9]{24}\.pdf$/);
    assert.equal(path.dirname(resolved.path).endsWith(created.order.id), true);
    assert.equal(await fs.readFile(resolved.path, 'utf8'), 'safe pdf fixture');
});

test('updateApplication rejects an unsupported status', async (t) => {
    const store = await makeStore(t);
    const created = await store.createApplication({ submissionKey: 'status-1', periodId: '20260901', periodLabel: '九月首期', name: '许先生', contact: '13800000000' }, []);

    await assert.rejects(
        store.updateApplication(created.order.id, { status: 'deleted', adminNote: '' }),
        /无效的订单状态/,
    );
});
