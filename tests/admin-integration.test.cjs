const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

let child;
let baseUrl;
let runtimeDir;

test.before(async () => {
    runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wascell-admin-integration-'));
    const port = 39000 + (process.pid % 1000);
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['app.js'], {
        cwd: path.resolve(__dirname, '..'),
        env: {
            ...process.env,
            PORT: String(port),
            NODE_ENV: 'test',
            ADMIN_PASSWORD: 'integration-password',
            ADMIN_SESSION_SECRET: 'integration-session-secret',
            ADVISOR_DATA_DIR: path.join(runtimeDir, 'data'),
            ADVISOR_UPLOAD_DIR: path.join(runtimeDir, 'uploads'),
            STAFF_DATA_DIR: path.join(runtimeDir, 'staff'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let lastError;
    for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
            const response = await fetch(`${baseUrl}/`);
            if (response.ok) return;
        } catch (error) {
            lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw lastError || new Error('test server did not start');
});

test.after(async () => {
    if (child) child.kill('SIGTERM');
    if (runtimeDir) await fs.rm(runtimeDir, { recursive: true, force: true });
});

test('/admin stays hidden while /admin-pro serves the ARKSOMA admin', async () => {
    const hiddenEntry = await fetch(`${baseUrl}/admin`);
    assert.equal(hiddenEntry.status, 404);

    const response = await fetch(`${baseUrl}/admin-pro`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /ARKSOMA/);
    assert.match(html, /访问统计/);
    assert.match(html, /顾问申请/);
});

test('owner data APIs require an owner session', async () => {
    const unauthenticated = await fetch(`${baseUrl}/api/owner/realtime`);
    assert.equal(unauthenticated.status, 401);

    const login = await fetch(`${baseUrl}/api/owner/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'integration-password' }),
    });
    const cookie = login.headers.get('set-cookie');
    assert.equal(login.status, 200);
    assert.match(cookie, /HttpOnly/);

    const authenticated = await fetch(`${baseUrl}/api/owner/realtime`, { headers: { cookie } });
    assert.equal(authenticated.status, 200);
});

test('a customer application becomes an authenticated admin order', async () => {
    const form = new FormData();
    form.set('submissionKey', 'integration-order-001');
    form.set('periodId', '20260901');
    form.set('periodLabel', '2026·九月首期');
    form.set('name', '测试客户');
    form.set('contact', 'test_wechat');

    const created = await fetch(`${baseUrl}/api/advisor-applications`, { method: 'POST', body: form });
    const createdBody = await created.json();
    assert.equal(created.status, 201);
    assert.match(createdBody.orderId, /^ARK-/);

    const login = await fetch(`${baseUrl}/api/owner/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'integration-password' }),
    });
    const cookie = login.headers.get('set-cookie');
    const orders = await fetch(`${baseUrl}/api/owner/applications?query=测试客户`, { headers: { cookie } });
    const body = await orders.json();

    assert.equal(orders.status, 200);
    assert.equal(body.total, 1);
    assert.equal(body.items[0].name, '测试客户');
});
