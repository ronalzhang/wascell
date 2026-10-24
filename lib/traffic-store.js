const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { accumulateTrafficSignal } = require('./traffic-intelligence');

// One process owns one snapshot. Requests never parse or enqueue whole copies.
function createTrafficStore({ file, flushIntervalMs = 1000, maxIPs = 20000, maxPages = 512, maxDays = 400, maxFileBytes = 128 * 1024 * 1024, onError = console.error }) {
    let stats = { totalVisits: 0, daily: {}, ipStats: {}, createdAt: new Date().toISOString() };
    if (fs.existsSync(file)) {
        if (fs.statSync(file).size > maxFileBytes) throw new Error('统计文件超过安全加载上限，请先离线归档；原文件未修改');
        try {
            stats = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (!stats || !stats.daily || !stats.ipStats || !Number.isFinite(stats.totalVisits)) throw new Error('invalid schema');
        } catch (error) { throw new Error(`统计文件无法安全读取；原文件未修改: ${error.message}`); }
    }
    stats.daily = Object.assign(Object.create(null), stats.daily);
    stats.ipStats = Object.assign(Object.create(null), stats.ipStats);
    stats.retention = { maxDays, maxIPs, maxPages, unlistedIPVisits: 0, ...(stats.retention || {}) };
    let ipCount = Object.keys(stats.ipStats).length;
    const days = Object.keys(stats.daily).sort();
    // Legacy history is preserved during migration; new cardinality cannot expand it.
    for (const day of Object.values(stats.daily)) {
        day.uniqueIPs = new Set(day.uniqueIPs || []);
        day.pages = Object.assign(Object.create(null), day.pages || {});
    }
    let generation = 0;
    let savedGeneration = 0;
    let writing = null;
    function record(entry) {
        const timestamp = new Date(entry.timestamp || Date.now());
        if (!Number.isFinite(timestamp.getTime())) return;
        const today = new Date(timestamp.getTime() + 8 * 3600000).toISOString().slice(0, 10);
        if (!Object.hasOwn(stats.daily, today)) {
            stats.daily[today] = { totalVisits: 0, uniqueIPs: new Set(), pages: Object.create(null) };
            days.push(today); days.sort();
            while (days.length > maxDays) delete stats.daily[days.shift()];
        }
        const day = stats.daily[today];
        if (!day) return;
        const ip = String(entry.ip || 'unknown').slice(0, 64);
        stats.totalVisits++; day.totalVisits++;
        if (day.uniqueIPs.size < maxIPs) day.uniqueIPs.add(ip);
        let url = String(entry.url || '/').split('?')[0].slice(0, 256);
        if (!Object.hasOwn(day.pages, url) && Object.keys(day.pages).length >= maxPages) url = '[other]';
        day.pages[url] = (day.pages[url] || 0) + 1;
        if (!Object.hasOwn(stats.ipStats, ip) && ipCount < maxIPs) {
            stats.ipStats[ip] = { count: 0, maliciousCount: 0, firstVisit: entry.timestamp, lastVisit: entry.timestamp, signals: {} };
            ipCount++;
        }
        if (Object.hasOwn(stats.ipStats, ip)) {
            const item = stats.ipStats[ip];
            item.count++; item.lastVisit = entry.timestamp;
            item.maliciousCount = (item.maliciousCount || 0) + (entry.isMalicious ? 1 : 0);
            item.signals = accumulateTrafficSignal(item.signals, entry);
        } else stats.retention.unlistedIPVisits++;
        generation++;
    }
    function flush() {
        if (writing) return writing;
        if (savedGeneration === generation) return Promise.resolve();
        const version = generation;
        const json = JSON.stringify({ ...stats, lastUpdated: new Date().toISOString() }, (_key, value) => value instanceof Set ? Array.from(value) : value);
        const temp = `${file}.tmp`;
        writing = fsp.writeFile(temp, json, { mode: 0o600 }).then(() => fsp.rename(temp, file)).then(() => { savedGeneration = version; }).finally(() => { writing = null; });
        return writing;
    }
    const timer = setInterval(() => { flush().catch(onError); }, flushIntervalMs);
    timer.unref();
    return {
        get: () => stats,
        record,
        markDirty: () => { generation++; },
        flush,
        async close() { clearInterval(timer); if (writing) await writing; await flush(); },
    };
}

module.exports = { createTrafficStore };
