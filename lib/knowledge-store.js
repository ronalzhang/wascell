const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const STAGES = ['品牌与定位', '首次沟通', '预约规则', '会员机制', '健康资料', '方案与费用', '日本准备', '抵日接待', '医疗服务', '在日行程', '回国延续', '异议与边界'];

function text(value, max) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

function normalizeSource(source) {
    const title = text(source && source.title, 120);
    const url = text(source && source.url, 500);
    if (!title || !/^https:\/\//i.test(url)) throw new Error('来源链接必须是完整的 HTTPS 地址');
    return { title, url };
}

function validate(input, existing = {}) {
    const stage = text(input.stage === undefined ? existing.stage : input.stage, 40);
    const question = text(input.question === undefined ? existing.question : input.question, 180);
    const shortAnswer = text(input.shortAnswer === undefined ? existing.shortAnswer : input.shortAnswer, 500);
    const pointsInput = input.talkingPoints === undefined ? existing.talkingPoints : input.talkingPoints;
    const talkingPoints = Array.isArray(pointsInput) ? pointsInput.map((item) => text(item, 300)).filter(Boolean).slice(0, 8) : [];
    const sourcesInput = input.sources === undefined ? existing.sources : input.sources;
    const sources = Array.isArray(sourcesInput) ? sourcesInput.map(normalizeSource).slice(0, 6) : [];
    if (!STAGES.includes(stage) || !question || !shortAnswer || !talkingPoints.length) throw new Error('请填写完整的答疑内容');
    const order = Number(input.order === undefined ? (existing.order ?? 999) : input.order);
    if (!Number.isInteger(order) || order < 1 || order > 9999) throw new Error('排序值无效');
    return {
        stage,
        question,
        shortAnswer,
        talkingPoints,
        sources,
        published: input.published === undefined ? (existing.published ?? true) : Boolean(input.published),
        order,
    };
}

function createKnowledgeStore({ dataDir, seedFile, now = () => new Date() } = {}) {
    if (!dataDir) throw new Error('答疑库目录未配置');
    const dataFile = path.join(dataDir, 'knowledge.json');
    let writeQueue = Promise.resolve();

    async function read() {
        await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
        try {
            const parsed = JSON.parse(await fs.readFile(dataFile, 'utf8'));
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            const seed = seedFile ? JSON.parse(await fs.readFile(seedFile, 'utf8')) : [];
            const timestamp = now().toISOString();
            const items = seed.map((item, index) => ({
                id: item.id || `qa_seed_${String(index + 1).padStart(2, '0')}`,
                ...validate(item),
                createdAt: timestamp,
                updatedAt: timestamp,
            }));
            await write(items);
            return items;
        }
    }

    async function write(items) {
        await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
        const temp = `${dataFile}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
        await fs.writeFile(temp, JSON.stringify(items, null, 2), { mode: 0o600 });
        await fs.rename(temp, dataFile);
    }

    function mutate(operation) {
        const result = writeQueue.then(operation);
        writeQueue = result.catch(() => undefined);
        return result;
    }

    async function list({ publishedOnly = false } = {}) {
        let items = await read();
        if (publishedOnly) items = items.filter((item) => item.published);
        return items.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
    }

    async function create(input) {
        return mutate(async () => {
            const items = await read();
            const timestamp = now().toISOString();
            const item = { id: `qa_${crypto.randomBytes(8).toString('hex')}`, ...validate(input), createdAt: timestamp, updatedAt: timestamp };
            items.push(item);
            await write(items);
            return item;
        });
    }

    async function update(id, changes) {
        return mutate(async () => {
            const items = await read();
            const index = items.findIndex((item) => item.id === id);
            if (index === -1) return null;
            items[index] = { ...items[index], ...validate(changes, items[index]), id: items[index].id, createdAt: items[index].createdAt, updatedAt: now().toISOString() };
            await write(items);
            return items[index];
        });
    }

    return { list, create, update, stages: STAGES };
}

module.exports = { createKnowledgeStore, STAGES };
