const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const crypto = require('node:crypto');

const SIGNAL_KEYS = ['automatedCount', 'pageCount', 'assetCount', 'apiCount', 'nonGetCount'];
const AUTOMATED_USER_AGENT = /\b(bot|spider|crawler|curl|wget|python|scanner|nmap|go-http-client|httpclient)\b/i;
const ASSET_PATH = /\.(?:avif|css|gif|ico|jpe?g|js|mjs|png|svg|webp|woff2?)(?:\?|$)/i;

function normalizeSignal(signal = {}) {
    return Object.fromEntries(SIGNAL_KEYS.map((key) => [key, Math.max(0, Number(signal[key] || 0))]));
}

function accumulateTrafficSignal(signal, logEntry = {}) {
    const next = normalizeSignal(signal);
    const url = String(logEntry.url || '').toLowerCase();
    const method = String(logEntry.method || 'GET').toUpperCase();
    const userAgent = String(logEntry.userAgent || '');

    if (AUTOMATED_USER_AGENT.test(userAgent)) next.automatedCount += 1;
    if (method !== 'GET' && method !== 'HEAD') next.nonGetCount += 1;
    if (url.startsWith('/api/')) next.apiCount += 1;
    else if (ASSET_PATH.test(url) || url.startsWith('/imgs/')) next.assetCount += 1;
    else next.pageCount += 1;

    return next;
}

function classifyTrafficSignals(input = {}) {
    const count = Math.max(0, Number(input.count || 0));
    const maliciousCount = Math.max(0, Number(input.maliciousCount || 0));
    const signal = normalizeSignal(input.signals || input);
    const maliciousRatio = maliciousCount / Math.max(count, 1);

    if (maliciousCount >= 5 && (maliciousRatio >= 0.5 || count >= 50)) {
        return { kind: 'high_risk', label: '高风险扫描', reason: '恶意路径占比高，且自动化特征明显', rank: 4 };
    }
    if (maliciousCount > 0) return { kind: 'scan', label: '疑似扫描', reason: '命中常见探测路径', rank: 3 };
    if (signal.automatedCount > 0) return { kind: 'automated', label: '自动化访问', reason: 'User-Agent 显示自动化特征', rank: 2 };
    if (signal.pageCount > 0) return { kind: 'likely_human', label: '可能为正常访问', reason: '存在正常页面与资源访问序列', rank: 1 };
    return { kind: 'unknown', label: '信息不足', reason: '尚无足够访问序列', rank: 0 };
}

async function listAccessLogs(logDir) {
    const files = await fsp.readdir(logDir);
    return files.filter((file) => /^access(?:-[\w.-]+)?\.log$/.test(file)).sort().map((file) => path.join(logDir, file));
}

async function rebuildTrafficIntelligence({ logFiles, statsFile }) {
    const parsed = JSON.parse(await fsp.readFile(statsFile, 'utf8'));
    const perIp = new Map();
    let processed = 0;

    for (const logFile of logFiles) {
        const stream = fs.createReadStream(logFile, { encoding: 'utf8' });
        const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
        for await (const line of lines) {
            if (!line.trim()) continue;
            try {
                const entry = JSON.parse(line);
                if (!entry.ip) continue;
                perIp.set(entry.ip, accumulateTrafficSignal(perIp.get(entry.ip), entry));
                processed += 1;
            } catch { /* ignore malformed historic log entries */ }
        }
    }

    for (const [ip, ipStats] of Object.entries(parsed.ipStats || {})) {
        ipStats.signals = normalizeSignal(perIp.get(ip));
    }
    const tempFile = `${statsFile}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fsp.writeFile(tempFile, JSON.stringify(parsed, null, 2), { mode: 0o600 });
    await fsp.rename(tempFile, statsFile);

    const summary = { likely_human: 0, automated: 0, scan: 0, high_risk: 0, unknown: 0 };
    for (const item of Object.values(parsed.ipStats || {})) summary[classifyTrafficSignals(item).kind] += 1;
    return { processed, ips: perIp.size, summary };
}

module.exports = {
    accumulateTrafficSignal,
    classifyTrafficSignals,
    listAccessLogs,
    rebuildTrafficIntelligence,
};
