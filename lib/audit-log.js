const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

function createAuditLog({ dataDir, now = () => new Date() } = {}) {
    if (!dataDir) throw new Error('审计目录未配置');
    const auditFile = path.join(dataDir, 'audit-log.jsonl');
    let writeQueue = Promise.resolve();

    async function append(event) {
        const operation = writeQueue.then(async () => {
            await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
            const record = {
                id: `audit_${crypto.randomBytes(8).toString('hex')}`,
                createdAt: now().toISOString(),
                ...event,
            };
            await fs.appendFile(auditFile, `${JSON.stringify(record)}\n`, { mode: 0o600 });
            return record;
        });
        writeQueue = operation.catch(() => undefined);
        return operation;
    }

    async function list({ actorId, action, limit = 200 } = {}) {
        try {
            const content = await fs.readFile(auditFile, 'utf8');
            let events = content.split('\n').filter(Boolean).map((line) => JSON.parse(line));
            if (actorId) events = events.filter((event) => event.actorId === actorId);
            if (action) events = events.filter((event) => event.action === action);
            return events.slice(-Math.min(1000, Math.max(1, Number(limit) || 200))).reverse();
        } catch (error) {
            if (error.code === 'ENOENT') return [];
            throw error;
        }
    }

    return { append, list };
}

module.exports = { createAuditLog };
