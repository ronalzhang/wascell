const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createKnowledgeStore } = require('../lib/knowledge-store');

async function withStore(run) {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wascell-knowledge-'));
    try {
        return await run(createKnowledgeStore({
            dataDir,
            seedFile: path.resolve(__dirname, '../data/knowledge-seed.zh-CN.json'),
            now: () => new Date('2026-07-31T08:00:00.000Z'),
        }));
    } finally {
        await fs.rm(dataDir, { recursive: true, force: true });
    }
}

test('seed knowledge covers the complete sales journey with at least 28 published answers', async () => {
    await withStore(async (store) => {
        const items = await store.list({ publishedOnly: true });
        assert.ok(items.length >= 28);
        assert.equal(new Set(items.map((item) => item.stage)).size, 12);
        assert.equal(items.every((item) => item.question && item.shortAnswer && item.talkingPoints.length), true);
        assert.equal(items.some((item) => item.sources.length > 0), true);
        assert.deepEqual(items.map((item) => item.order), [...items.map((item) => item.order)].sort((a, b) => a - b));
    });
});

test('owner can create, edit and unpublish an answer while sales sees published content only', async () => {
    await withStore(async (store) => {
        const created = await store.create({
            stage: '首次沟通',
            question: '为什么需要提前预约？',
            shortAnswer: '为了完成专业准备与有限资源配置。',
            talkingPoints: ['先了解健康资料', '匹配合适的在日安排'],
            sources: [{ title: 'JNTO 医疗指南', url: 'https://www.jnto.go.jp/emergency/jpn/mi_guide.html' }],
            published: true,
            order: 5,
        });
        assert.match(created.id, /^qa_/);

        const updated = await store.update(created.id, { published: false, shortAnswer: '内部修订中。' });
        assert.equal(updated.published, false);
        assert.equal((await store.list({ publishedOnly: true })).some((item) => item.id === created.id), false);
        assert.equal((await store.list()).some((item) => item.id === created.id), true);
    });
});

test('knowledge store rejects unsafe source URLs and incomplete answers', async () => {
    await withStore(async (store) => {
        await assert.rejects(() => store.create({
            stage: '首次沟通',
            question: '测试问题',
            shortAnswer: '测试回答',
            talkingPoints: ['说明'],
            sources: [{ title: '错误来源', url: 'javascript:alert(1)' }],
        }), /来源链接/);
        await assert.rejects(() => store.create({ stage: '', question: '', shortAnswer: '' }), /完整/);
    });
});
