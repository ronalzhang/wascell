const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createStaffStore } = require('../lib/staff-store');

let child;
let baseUrl;
let runtimeDir;
let salesOneId;

test.before(async () => {
    runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wascell-admin-integration-'));
    const integrationStaff = createStaffStore({ dataDir: path.join(runtimeDir, 'staff') });
    salesOneId = (await integrationStaff.createSales({
        username: 'sales.integration',
        displayName: '集成销售',
        password: 'Sales-Integration-2026',
    })).id;
    const port = 41000 + (process.pid % 1000);
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
            BUSINESS_DATA_DIR: path.join(runtimeDir, 'business'),
            KNOWLEDGE_DATA_DIR: path.join(runtimeDir, 'knowledge'),
            SERVICE_CASE_DATA_DIR: path.join(runtimeDir, 'service-cases'),
            TRAFFIC_STATS_FILE: path.join(runtimeDir, 'traffic.json'),
            TRAFFIC_LOG_FILE: path.join(runtimeDir, 'access.log'),
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
    if (child?.exitCode === null && child.signalCode === null) {
        const stopped = once(child, 'exit');
        child.kill('SIGTERM');
        await stopped;
    }
    if (runtimeDir) await fs.rm(runtimeDir, { recursive: true, force: true });
});

test('program price controls authorize the owner and expose only the selected published quote', async () => {
    const publicUrl = `${baseUrl}/api/public/programs`;
    const settingsUrl = `${baseUrl}/api/owner/program-prices`;
    const before = await fetch(publicUrl);
    assert.equal(before.status, 200);
    const original = await before.json();
    assert.equal(original.programs.length, 11);
    assert.equal(original.programs.some((program) => Object.hasOwn(program, 'quote')), false);
    assert.equal((await fetch(settingsUrl)).status, 401);

    const headers = { 'content-type': 'application/json' };
    const sales = await fetch(`${baseUrl}/api/sales/login`, {
        method: 'POST', headers,
        body: JSON.stringify({ username: 'sales.integration', password: 'Sales-Integration-2026' }),
    });
    assert.equal((await fetch(settingsUrl, { headers: { cookie: sales.headers.get('set-cookie') } })).status, 403);

    const owner = await fetch(`${baseUrl}/api/owner/login`, {
        method: 'POST', headers,
        body: JSON.stringify({ password: 'integration-password' }),
    });
    headers.cookie = owner.headers.get('set-cookie');
    const existing = await fetch(settingsUrl, { headers });
    assert.equal(existing.status, 200);
    const initial = await existing.json();
    const pricing = {
        revision: initial.pricing.revision, show: true, currency: 'JPY',
        quotes: {
            'periodontal-regeneration': {
                show: true, amounts: {
                    JPY: { min: 3300000, tax: 'inclusive' },
                    USD: { min: 22000.55, tax: 'exclusive' },
                },
            },
        },
    };
    const update = (next) => fetch(settingsUrl, {
        method: 'PATCH', headers, body: JSON.stringify({ pricing: next, reason: '验证项目报价' }),
    });
    const saved = await update(pricing);
    assert.equal(saved.status, 200);
    let active = await (await fetch(publicUrl)).json();
    const dental = (catalog) => catalog.programs.find((program) => program.id === 'periodontal-regeneration');
    assert.deepEqual(dental(active).quote, { currency: 'JPY', min: 3300000, tax: 'inclusive' });
    assert.ok(!JSON.stringify(active).includes('22000.55'));
    assert.equal((await update(pricing)).status, 409);

    pricing.revision++;
    pricing.currency = 'CNY';
    assert.equal((await update(pricing)).status, 200);
    active = await (await fetch(publicUrl)).json();
    assert.equal(Object.hasOwn(dental(active), 'quote'), false);

    pricing.revision++;
    pricing.currency = 'USD';
    pricing.show = false;
    assert.equal((await update(pricing)).status, 200);
    active = await (await fetch(publicUrl)).json();
    assert.equal(Object.hasOwn(dental(active), 'quote'), false);
});

test('portfolio routes load and a selected project stays attached to a consultation', async () => {
    for (const route of ['/', '/portfolio', '/portfolio/projects', '/portfolio/assessment', '/portfolio/arrangements']) {
        const response = await fetch(baseUrl + route);
        assert.equal(response.status, 200);
        assert.match(await response.text(), /探索再生项目/);
    }
    const legacy = await fetch(baseUrl + '/flagship-journey');
    assert.equal(legacy.status, 200);
    assert.match(await legacy.text(), /periodSheet/);
    const published = await (await fetch(baseUrl + '/api/public/program-periods')).json();
    assert.ok(published.periods.length >= 5);
    for (const period of published.periods) {
        assert.equal(period.href, '/' + period.id);
        const page = await fetch(baseUrl + period.href);
        assert.equal(page.status, 200);
        assert.match(await page.text(), new RegExp('data-period-id="' + period.id + '"'));
    }
    const body = new FormData();
    body.set('name', '本地测试');
    body.set('contact', 'test-contact');
    body.set('submissionKey', 'portfolio-test-request');
    body.set('portfolio', '1');
    body.set('programId', 'hair-follicle');
    body.set('reportStatus', 'incomplete');
    const applicationUrl = baseUrl + '/api/advisor-applications';
    assert.equal((await fetch(applicationUrl, { method: 'POST', body })).status, 400);
    body.set('contactConsent', 'yes');
    body.set('programLabel', 'ignored-client-label');
    const application = await fetch(applicationUrl, { method: 'POST', body });
    assert.equal(application.status, 201);
    const { orderId } = await application.json();
    const owner = await fetch(`${baseUrl}/api/owner/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'integration-password' }),
    });
    const response = await fetch(`${baseUrl}/api/owner/applications/${orderId}`, {
        headers: { cookie: owner.headers.get('set-cookie') },
    });
    const order = await response.json();
    assert.equal(order.programId, 'hair-follicle');
    assert.equal(order.reportStatus, 'incomplete');
    assert.equal(order.contactConsent, true);
    assert.equal(order.programLabel, '自体毛囊细胞方案');
    assert.equal(order.source.page, '/portfolio');

    body.set('programId', 'periodontal-regeneration');
    assert.equal((await fetch(applicationUrl, { method: 'POST', body })).status, 409);

    const assigned = await fetch(baseUrl + '/api/owner/customers/' + orderId + '/assignment', {
        method: 'PATCH',
        headers: { cookie: owner.headers.get('set-cookie'), 'content-type': 'application/json' },
        body: JSON.stringify({ salesId: salesOneId }),
    });
    assert.equal(assigned.status, 200);
    const sales = await fetch(baseUrl + '/api/sales/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'sales.integration', password: 'Sales-Integration-2026' }),
    });
    const salesResponse = await fetch(baseUrl + '/api/sales/customers/' + orderId, {
        headers: { cookie: sales.headers.get('set-cookie') },
    });
    assert.equal(salesResponse.status, 200);
    const customer = await salesResponse.json();
    assert.equal(customer.programLabel, '自体毛囊细胞方案');
    assert.equal(customer.reportStatus, 'incomplete');
    assert.equal(customer.contactConsent, undefined);
});
