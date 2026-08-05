const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createAuditLog } = require('../lib/audit-log');
const { createBusinessConfigStore, DEFAULT_CONFIG } = require('../lib/business-config-store');

async function withStores(run) {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wascell-config-'));
    const now = () => new Date('2026-07-31T10:00:00.000Z');
    try {
        const auditLog = createAuditLog({ dataDir, now });
        const store = createBusinessConfigStore({ dataDir, now, auditLog });
        return await run({ store, auditLog, dataDir });
    } finally {
        await fs.rm(dataDir, { recursive: true, force: true });
    }
}

test('public catalog exposes prices and copy but not internal capacity', async () => {
    await withStores(async ({ store }) => {
        const catalog = await store.getPublic();

        assert.equal(catalog.fullPlanPrice, 580000);
        assert.equal(catalog.membershipFee, 19800);
        assert.equal(catalog.membershipMonths, 12);
        assert.equal(catalog.showPrivateJournal, false);
        assert.deepEqual(catalog.filialPeriod, {
            price: 560000,
            familyGroups: 3,
            publicCopy: catalog.filialPeriod.publicCopy,
        });
        assert.equal('standardCapacity' in catalog, false);
        assert.equal('filialMaxGuests' in catalog.filialPeriod, false);
        assert.equal('reminderDays' in catalog, false);
    });
});

test('private journal stays hidden by default and owner changes are audited', async () => {
    await withStores(async ({ store, auditLog }) => {
        assert.equal((await store.getPrivate()).showPrivateJournal, false);

        const updated = await store.update(
            { showPrivateJournal: true },
            { actorId: 'owner', reason: '实体纪行已具备交付条件' },
        );
        const events = await auditLog.list();

        assert.equal(updated.showPrivateJournal, true);
        assert.equal((await store.getPublic()).showPrivateJournal, true);
        assert.deepEqual(events[0].changes.showPrivateJournal, { before: false, after: true });
    });
});

test('continuity copy upgrades only the former default and preserves owner-authored copy', async () => {
    assert.equal(DEFAULT_CONFIG.publicMembershipCopy, '三次起可制定连续方案 · 首年方舟席位已含');

    await withStores(async ({ store, dataDir }) => {
        await fs.writeFile(path.join(dataDir, 'business-config.json'), JSON.stringify({
            ...DEFAULT_CONFIG,
            publicMembershipCopy: '已包含首个 12 个月方舟年度席位',
        }));
        assert.equal((await store.getPublic()).publicMembershipCopy, '三次起可制定连续方案 · 首年方舟席位已含');

        await fs.writeFile(path.join(dataDir, 'business-config.json'), JSON.stringify({
            ...DEFAULT_CONFIG,
            publicMembershipCopy: '管理员自定义公开说明',
        }));
        assert.equal((await store.getPublic()).publicMembershipCopy, '管理员自定义公开说明');
    });
});

test('owner configuration update records before and after values', async () => {
    await withStores(async ({ store, auditLog }) => {
        const updated = await store.update(
            { membershipFee: 21800, fullPlanPrice: 600000 },
            { actorId: 'owner', reason: '年度价格调整' },
        );
        const events = await auditLog.list();

        assert.equal(updated.membershipFee, 21800);
        assert.equal(updated.fullPlanPrice, 600000);
        assert.deepEqual(events[0].changes.membershipFee, { before: 19800, after: 21800 });
        assert.deepEqual(events[0].changes.fullPlanPrice, { before: 580000, after: 600000 });
        assert.equal(events[0].actorId, 'owner');
        assert.equal(events[0].reason, '年度价格调整');
    });
});

test('invalid capacity relationship leaves the previous configuration intact', async () => {
    await withStores(async ({ store }) => {
        await assert.rejects(
            store.update(
                { filialFamilyGroups: 4, filialMaxGuests: 3 },
                { actorId: 'owner', reason: '无效测试' },
            ),
            /最大人数不能少于家庭组数/,
        );

        const current = await store.getPrivate();
        assert.equal(current.filialFamilyGroups, 3);
        assert.equal(current.filialMaxGuests, 6);
    });
});

test('configuration update requires a reason and rejects unknown fields', async () => {
    await withStores(async ({ store }) => {
        await assert.rejects(
            store.update({ membershipFee: 20000 }, { actorId: 'owner', reason: '' }),
            /修改原因/,
        );
        await assert.rejects(
            store.update({ ownerPassword: 'leak' }, { actorId: 'owner', reason: '测试' }),
            /不支持的配置项/,
        );
    });
});
