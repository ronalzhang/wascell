const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('owner script authenticates only through owner endpoints and exposes five views', async () => {
    const script = await fs.readFile(path.join(root, 'admin-pro.mjs'), 'utf8');
    assert.match(script, /\/api\/owner\/login/);
    assert.doesNotMatch(script, /\/api\/sales\/login/);
    for (const route of ['/api/owner/customers', '/api/owner/knowledge', '/api/owner/config', '/api/owner/staff']) {
        assert.match(script, new RegExp(route.replaceAll('/', '\\/')));
    }
    assert.match(script, /autocomplete="new-password"/);
});

test('sales script authenticates through sales endpoint and has no owner API route', async () => {
    const script = await fs.readFile(path.join(root, 'admin.mjs'), 'utf8');
    assert.match(script, /\/api\/sales\/login/);
    assert.match(script, /\/api\/sales\/customers/);
    assert.match(script, /\/api\/sales\/knowledge/);
    assert.doesNotMatch(script, /\/api\/owner\//);
});
