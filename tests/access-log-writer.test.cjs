const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createAccessLogWriter } = require('../lib/access-log-writer');
test('access log bursts and rotation have explicit memory and disk limits', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'access-writer-'));
    try {
        const writer = createAccessLogWriter({ file: path.join(dir, 'access.log'), maxBytes: 80, maxFiles: 2, maxBufferBytes: 128 });
        for (let batch = 0; batch < 10; batch++) {
            for (let i = 0; i < 100; i++) writer.record({ url: '/example-long-enough' });
            assert.ok(writer.status().pendingBytes <= 128);
            await writer.flush();
        }
        assert.ok(writer.status().dropped > 0);
        assert.equal((await fs.readdir(dir)).length, 3);
        await writer.close();
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
