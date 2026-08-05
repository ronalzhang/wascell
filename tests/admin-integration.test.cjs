const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createStaffStore } = require('../lib/staff-store');

let child;
let baseUrl;
let runtimeDir;
let salesOneId;
let salesTwoId;

test.before(async () => {
    runtimeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wascell-admin-integration-'));
    const integrationStaff = createStaffStore({ dataDir: path.join(runtimeDir, 'staff') });
    salesOneId = (await integrationStaff.createSales({
        username: 'sales.integration',
        displayName: '集成销售',
        password: 'Sales-Integration-2026',
    })).id;
    salesTwoId = (await integrationStaff.createSales({
        username: 'sales.other',
        displayName: '其他销售',
        password: 'Sales-Other-2026',
    })).id;
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
            BUSINESS_DATA_DIR: path.join(runtimeDir, 'business'),
            KNOWLEDGE_DATA_DIR: path.join(runtimeDir, 'knowledge'),
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

test('/admin and /admin-pro serve isolated sales and owner workspaces', async () => {
    const ownerResponse = await fetch(`${baseUrl}/admin-pro`);
    const ownerHtml = await ownerResponse.text();
    assert.equal(ownerResponse.status, 200);
    assert.match(ownerHtml, /ARKSOMA/);
    assert.match(ownerHtml, /访问统计/);
    assert.match(ownerHtml, /客户管理/);
    assert.match(ownerHtml, /销售答疑/);
    assert.match(ownerHtml, /商业配置/);
    assert.match(ownerHtml, /团队权限/);
    assert.doesNotMatch(ownerHtml, /name="username"/);
    assert.doesNotMatch(ownerHtml, /销售登录/);

    const salesResponse = await fetch(`${baseUrl}/admin`);
    const salesHtml = await salesResponse.text();
    assert.equal(salesResponse.status, 200);
    assert.match(salesHtml, /ARKSOMA/);
    assert.match(salesHtml, /客户管理/);
    assert.match(salesHtml, /销售答疑/);
    assert.match(salesHtml, /name="username"/);
    assert.doesNotMatch(salesHtml, /访问统计|商业配置|团队权限|管理员入口|admin-pro/);
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

test('public catalog is readable while commercial configuration is owner-only', async () => {
    const publicResponse = await fetch(`${baseUrl}/api/public/catalog`);
    const publicCatalog = await publicResponse.json();
    assert.equal(publicResponse.status, 200);
    assert.equal(publicCatalog.fullPlanPrice, 580000);
    assert.equal(publicCatalog.showPrivateJournal, false);
    assert.equal('standardCapacity' in publicCatalog, false);

    const salesLogin = await fetch(`${baseUrl}/api/sales/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'sales.integration', password: 'Sales-Integration-2026' }),
    });
    const salesCookie = salesLogin.headers.get('set-cookie');
    const salesConfig = await fetch(`${baseUrl}/api/owner/config`, { headers: { cookie: salesCookie } });
    assert.equal(salesConfig.status, 403);

    const ownerLogin = await fetch(`${baseUrl}/api/owner/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'integration-password' }),
    });
    const ownerCookie = ownerLogin.headers.get('set-cookie');
    const ownerConfig = await fetch(`${baseUrl}/api/owner/config`, { headers: { cookie: ownerCookie } });
    assert.equal(ownerConfig.status, 200);

    const update = await fetch(`${baseUrl}/api/owner/config`, {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ membershipFee: 21800, showPrivateJournal: true, reason: '集成测试调整' }),
    });
    assert.equal(update.status, 200);

    const refreshedPublic = await fetch(`${baseUrl}/api/public/catalog`);
    const refreshedCatalog = await refreshedPublic.json();
    assert.equal(refreshedCatalog.membershipFee, 21800);
    assert.equal(refreshedCatalog.showPrivateJournal, true);
});

test('sales customer APIs enforce assignment and owner-only membership changes', async () => {
    const secondForm = new FormData();
    secondForm.set('submissionKey', 'integration-order-002');
    secondForm.set('periodId', '20260902');
    secondForm.set('periodLabel', '2026·九月二期');
    secondForm.set('name', '其他客户');
    secondForm.set('contact', 'other_wechat');
    const secondCreated = await fetch(`${baseUrl}/api/advisor-applications`, { method: 'POST', body: secondForm });
    const secondId = (await secondCreated.json()).orderId;

    const ownerLogin = await fetch(`${baseUrl}/api/owner/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'integration-password' }),
    });
    const ownerCookie = ownerLogin.headers.get('set-cookie');
    const ownerList = await fetch(`${baseUrl}/api/owner/customers`, { headers: { cookie: ownerCookie } });
    const ownerCustomers = await ownerList.json();
    const firstId = ownerCustomers.items.find((item) => item.name === '测试客户').id;

    await fetch(`${baseUrl}/api/owner/customers/${firstId}/assignment`, {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ salesId: salesOneId }),
    });
    await fetch(`${baseUrl}/api/owner/customers/${secondId}/assignment`, {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ salesId: salesTwoId }),
    });
    const activate = await fetch(`${baseUrl}/api/owner/customers/${firstId}/membership`, {
        method: 'POST',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'plan_confirmed' }),
    });
    assert.equal(activate.status, 200);

    const salesLogin = await fetch(`${baseUrl}/api/sales/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'sales.integration', password: 'Sales-Integration-2026' }),
    });
    const salesCookie = salesLogin.headers.get('set-cookie');
    const salesList = await fetch(`${baseUrl}/api/sales/customers`, { headers: { cookie: salesCookie } });
    const salesCustomers = await salesList.json();
    assert.deepEqual(salesCustomers.items.map((item) => item.name), ['测试客户']);

    const crossSales = await fetch(`${baseUrl}/api/sales/customers/${secondId}`, { headers: { cookie: salesCookie } });
    assert.equal(crossSales.status, 403);

    const booking = await fetch(`${baseUrl}/api/sales/customers/${firstId}/internal-bookings`, {
        method: 'POST',
        headers: { cookie: salesCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
            periodId: '20270101',
            periodLabel: '2027·一月首期',
            guestCount: 2,
            relationship: '父母',
        }),
    });
    assert.equal(booking.status, 201);

    const forbiddenGift = await fetch(`${baseUrl}/api/owner/customers/${firstId}/membership`, {
        method: 'POST',
        headers: { cookie: salesCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'owner_adjusted', expiresAt: '2029-01-01', reason: '越权赠送' }),
    });
    assert.equal(forbiddenGift.status, 403);
});

test('owner manages staff and knowledge while sales receives only published knowledge', async () => {
    const ownerLogin = await fetch(`${baseUrl}/api/owner/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'integration-password' }),
    });
    const ownerCookie = ownerLogin.headers.get('set-cookie');

    const staff = await fetch(`${baseUrl}/api/owner/staff`, { headers: { cookie: ownerCookie } });
    assert.equal(staff.status, 200);
    assert.equal((await staff.json()).items.length, 2);

    const created = await fetch(`${baseUrl}/api/owner/knowledge`, {
        method: 'POST',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({
            stage: '首次沟通',
            question: '集成测试问题',
            shortAnswer: '仅供测试。',
            talkingPoints: ['第一点'],
            sources: [],
            published: false,
            order: 99,
        }),
    });
    assert.equal(created.status, 201);

    const salesLogin = await fetch(`${baseUrl}/api/sales/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'sales.integration', password: 'Sales-Integration-2026' }),
    });
    const salesCookie = salesLogin.headers.get('set-cookie');
    const knowledge = await fetch(`${baseUrl}/api/sales/knowledge`, { headers: { cookie: salesCookie } });
    const salesKnowledge = await knowledge.json();
    assert.equal(knowledge.status, 200);
    assert.ok(salesKnowledge.items.length >= 28);
    assert.equal(salesKnowledge.items.some((item) => item.question === '集成测试问题'), false);

    const forbiddenStaff = await fetch(`${baseUrl}/api/owner/staff`, { headers: { cookie: salesCookie } });
    assert.equal(forbiddenStaff.status, 403);
});
