const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTrafficStore } = require('../lib/traffic-store');

test('a burst keeps exact counters with one shared snapshot and no per-request write queue', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'traffic-store-'));
    try {
        const file = path.join(dir, 'stats.json');
        const store = createTrafficStore({ file, flushIntervalMs: 60000 });
        for (let i = 0; i < 10000; i++) store.record({ timestamp: '2026-10-24T00:00:00Z', ip: '1.2.3.4', url: `/?nonce=${i}`, method: 'GET' });
        assert.equal(store.get().totalVisits, 10000);
        assert.equal(store.get().ipStats['1.2.3.4'].count, 10000);
        assert.equal(Object.keys(store.get().daily['2026-10-24'].pages).length, 1);
        await Promise.all([store.flush(), store.flush(), store.flush()]);
        assert.equal(JSON.parse(await fs.readFile(file)).totalVisits, 10000);
        await store.close();
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('traffic cardinality and prototype keys cannot grow memory without bounds', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'traffic-store-'));
    try {
        const store = createTrafficStore({ file: path.join(dir, 'stats.json'), maxIPs: 3, maxPages: 3, maxDays: 2 });
        for (let day = 1; day <= 5; day++) for (let i = 0; i < 20; i++) store.record({ timestamp: `2026-10-0${day}T00:00:00Z`, ip: `10.0.0.${i}`, url: `/page${i}` });
        store.record({ timestamp: '2026-10-05T00:00:00Z', ip: '__proto__', url: '/__proto__' });
        assert.equal(store.get().totalVisits, 101);
        assert.ok(Object.keys(store.get().ipStats).length <= 3);
        assert.ok(Object.keys(store.get().daily).length <= 2);
        for (const day of Object.values(store.get().daily)) {
            assert.ok(Object.keys(day.pages).length <= 4);
            assert.ok(day.uniqueIPs.size <= 3);
        }
        assert.ok(store.get().retention.unlistedIPVisits > 0);
        await store.close();
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('corrupt or oversized statistics never get overwritten with empty data', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'traffic-store-'));
    const file = path.join(dir, 'stats.json');
    try {
        await fs.writeFile(file, '{broken');
        assert.throws(() => createTrafficStore({ file }), /统计/);
        assert.equal(await fs.readFile(file, 'utf8'), '{broken');
        await fs.writeFile(file, ' '.repeat(100));
        assert.throws(() => createTrafficStore({ file, maxFileBytes: 10 }), /统计/);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
