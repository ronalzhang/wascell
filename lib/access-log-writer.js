const fs = require('node:fs');
const fsp = require('node:fs/promises');

function createAccessLogWriter({ file, maxBytes = 10 * 1024 * 1024, maxFiles = 7, maxBufferBytes = 1024 * 1024, intervalMs = 1000, onError = console.error }) {
    let pending = [];
    let pendingBytes = 0;
    let dropped = 0;
    let writing = null;
    let size = fs.existsSync(file) ? fs.statSync(file).size : 0;
    function record(entry) {
        const line = `${JSON.stringify(entry)}\n`;
        const bytes = Buffer.byteLength(line);
        if (bytes > maxBufferBytes || pendingBytes + bytes > maxBufferBytes) { dropped++; return false; }
        pending.push(line); pendingBytes += bytes;
        return true;
    }
    function flush() {
        if (writing) return writing;
        if (!pending.length) return Promise.resolve();
        const batch = pending.join('');
        pending = []; pendingBytes = 0;
        writing = (async () => {
            if (size >= maxBytes) {
                for (let i = maxFiles - 1; i >= 1; i--) {
                    await fsp.rename(`${file}.${i}`, `${file}.${i + 1}`).catch(error => { if (error.code !== 'ENOENT') throw error; });
                }
                await fsp.rename(file, `${file}.1`);
                size = 0;
            }
            await fsp.appendFile(file, batch, { mode: 0o600 });
            size += Buffer.byteLength(batch);
        })().catch(error => { dropped += batch.split('\n').length - 1; throw error; }).finally(() => { writing = null; });
        return writing;
    }
    const timer = setInterval(() => { flush().catch(onError); }, intervalMs);
    timer.unref();
    return { record, flush, status: () => ({ pendingBytes, dropped }), async close() { clearInterval(timer); if (writing) await writing; await flush(); } };
}
module.exports = { createAccessLogWriter };
