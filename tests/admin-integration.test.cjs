const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createStaffStore } = require('../lib/staff-store');
const { getPeriodLabel } = require('../lib/program-catalog');

const clock = new Date();
const nextMonthId = new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth() + 1, 1))
    .toISOString().slice(0, 7).replace('-', '') + '01';

let child;
let baseUrl;
let runtimeDir;
let salesOneId;
let salesTwoId;
let workflowIntakeId;

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

test('public static serving never exposes server code, statistics or crash artifacts', async () => {
    for (const resource of ['/app.js', '/stats.json', '/access.log', '/deploy.sh', '/package.json', '/lib/admin-auth.js', '/core.123', '/core', '/stats.json.tmp', '/data/knowledge-seed.zh-CN.json']) {
        const response = await fetch(`${baseUrl}${resource}`, { method: 'HEAD' });
        assert.equal(response.status, 404, resource);
    }
    assert.equal((await fetch(`${baseUrl}/arksoma.css`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/arksoma-ui.mjs`)).status, 200);
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

    const traffic = await fetch(`${baseUrl}/api/owner/stats?period=day&classification=all`, { headers: { cookie } });
    assert.equal(traffic.status, 200);
    assert.deepEqual(Object.keys((await traffic.json()).summary).sort(), ['automated', 'high_risk', 'likely_human', 'scan', 'unknown']);
});

test('a customer application becomes an authenticated admin order', async () => {
    const form = new FormData();
    form.set('submissionKey', 'integration-order-001');
    form.set('periodId', '20261201');
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

    const journalUpdate = await fetch(`${baseUrl}/api/owner/config/private-journal`, {
        method: 'PATCH',
        headers: { cookie: ownerCookie, 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
    });
    assert.equal(journalUpdate.status, 200);
    assert.deepEqual(await journalUpdate.json(), { success: true, showPrivateJournal: true });

    const publishedCatalog = await fetch(`${baseUrl}/api/public/catalog`);
    assert.equal((await publishedCatalog.json()).showPrivateJournal, true);

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
    secondForm.set('periodId', '20261202');
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
            periodId: nextMonthId,
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

const testSessions = new Map();

async function sessionCookie(role, body) {
    const key = JSON.stringify([role, body]);
    if (testSessions.has(key)) return testSessions.get(key);
    const login = await fetch(`${baseUrl}/api/${role}/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    testSessions.set(key, cookie);
    return cookie;
}

function callJson(url, cookie, method, body) {
    return fetch(baseUrl + url, {
        method, headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
}

test('partner workspace API routes require the appropriate role and keep policy configuration private', async () => {
    const sales = await sessionCookie('sales', { username: 'sales.integration', password: 'Sales-Integration-2026' });
    const admin = await sessionCookie('owner', { password: 'integration-password' });
    const root = '/api/owner/partner-program';
    const desk = '/api/sales/partner-program';
    assert.equal((await fetch(baseUrl + root)).status, 401);
    assert.equal((await fetch(baseUrl + root, { headers: { cookie: sales } })).status, 403);
    assert.equal((await fetch(baseUrl + desk, { headers: { cookie: admin } })).status, 403);
    const response = await fetch(baseUrl + root, { headers: { cookie: admin } });
    assert.equal(response.status, 200);
    const { policy } = await response.json();
    assert.equal(policy.enabled, false);
    const updated = await callJson(root + '/policy', admin, 'POST', {
        ...policy, reason: '测试版本', mentorCapacity: 3, maxForecastCustomers: 22,
    });
    assert.equal(updated.status, 200);
    assert.equal((await callJson(desk + '/policy', sales, 'POST', { ...policy, enabled: true })).status, 403);
    const preview = await callJson(desk + '/preview', sales, 'POST', { customers: 0, referrals: 2 });
    assert.equal(preview.status, 200);
    assert.equal((await preview.json()).totalFen, 0);
    const personal = await fetch(baseUrl + desk, { headers: { cookie: sales } });
    assert.equal(personal.status, 200);
    const view = await personal.json();
    assert.equal(view.policy.maxForecastCustomers, 22);
    assert.equal(view.policy.minPlatformBps, undefined);
    assert.equal(view.accounts, undefined);
    assert.equal(view.income.paidFen, 0);
});

test('customer transfers revoke old service-case access and sales responses omit private financial fields', async () => {
    const admin = await sessionCookie('owner', { password: 'integration-password' });
    const sales = await sessionCookie('sales', { username: 'sales.integration', password: 'Sales-Integration-2026' });
    const other = await sessionCookie('sales', { username: 'sales.other', password: 'Sales-Other-2026' });
    const form = new FormData();
    form.set('submissionKey', 'partner-case-acl');
    form.set('portfolio', '1');
    form.set('programId', 'autologous-stem-cells');
    form.set('contactConsent', 'yes');
    form.set('name', '案例客户一');
    form.set('contact', 'case-01');
    form.set('note', '不属于销售资料的测试备注');
    const created = await fetch(baseUrl + '/api/advisor-applications', { method: 'POST', body: form });
    assert.equal(created.status, 201);
    const { orderId } = await created.json();
    workflowIntakeId = orderId;
    const ownerPath = '/api/owner/customers/' + orderId;
    const salesPath = '/api/sales/customers/' + orderId;
    assert.equal((await callJson(ownerPath + '/assignment', admin, 'PATCH', { salesId: salesOneId })).status, 200);
    const customer = await (await fetch(baseUrl + salesPath, { headers: { cookie: sales } })).json();
    assert.equal(customer.name, '案例客户一');
    for (const field of ['note', 'adminNote', 'attachments', 'submissionKey']) assert.equal(customer[field], undefined);

    const createdCase = await callJson(ownerPath + '/service-cases', admin, 'POST', { periodId: '20261201', periodLabel: '十二月首期' });
    assert.equal(createdCase.status, 201);
    const { serviceCase } = await createdCase.json();
    const detailPath = '/api/sales/service-cases/' + serviceCase.id;
    const payment = await callJson('/api/owner/service-cases/' + serviceCase.id + '/payment', admin, 'PATCH', {
        amount: 1000, payerName: '测试付款方', reference: 'PAID-ACL-TEST',
    });
    assert.equal(payment.status, 200);
    const original = await (await fetch(baseUrl + '/api/sales/service-cases', { headers: { cookie: sales } })).json();
    assert.equal(original.items[0].paymentStatus, 'paid');
    assert.equal(original.items[0].payment, undefined);

    assert.equal((await callJson(ownerPath + '/assignment', admin, 'PATCH', { salesId: salesTwoId })).status, 200);
    const oldCases = await (await fetch(baseUrl + '/api/sales/service-cases', { headers: { cookie: sales } })).json();
    assert.ok(oldCases.items.every(item => item.id !== serviceCase.id));
    assert.equal((await callJson(detailPath + '/journal', sales, 'PATCH', { photoCount: 1 })).status, 403);
    const newCases = await (await fetch(baseUrl + '/api/sales/service-cases', { headers: { cookie: other } })).json();
    assert.ok(newCases.items.some(item => item.id === serviceCase.id));
    const journal = await callJson(detailPath + '/journal', other, 'PATCH', { photoCount: 1 });
    assert.equal(journal.status, 200);
    assert.equal((await journal.json()).serviceCase.payment, undefined);
});

test('sales can record and follow up a consented private lead, once, under the current assignment', async () => {
    const admin = await sessionCookie('owner', { password: 'integration-password' });
    const sales = await sessionCookie('sales', { username: 'sales.integration', password: 'Sales-Integration-2026' });
    const other = await sessionCookie('sales', { username: 'sales.other', password: 'Sales-Other-2026' });
    const root = '/api/sales/customers';
    const lead = {
        requestId: 'a79b95e5-b18f-4dce-aca4-b83d47fd23a1', name: '内部线索一', contact: 'lead-901',
    };
    assert.equal((await callJson(root, sales, 'POST', lead)).status, 400);
    const created = await callJson(root, sales, 'POST', { ...lead, consent: true });
    assert.equal(created.status, 201);
    const { customer } = await created.json();
    assert.equal(customer.assignedSalesId, salesOneId);
    const retried = await callJson(root, sales, 'POST', { ...lead, consent: true });
    assert.equal(retried.status, 200);
    assert.equal((await retried.json()).customer.id, customer.id);
    const duplicate = await callJson(root, other, 'POST', { ...lead, consent: true });
    assert.equal(duplicate.status, 409);
    const follow = root + '/' + customer.id + '/follow-up';
    assert.equal((await callJson(follow, other, 'PATCH', { status: 'contacted' })).status, 403);
    assert.equal((await callJson(follow, sales, 'PATCH', { status: 'confirmed' })).status, 400);
    const updated = await callJson(follow, sales, 'PATCH', { status: 'contacted', salesNote: '已约定联系时间' });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).customer.salesNote, '已约定联系时间');
    const fromAdmin = await fetch(baseUrl + '/api/owner/customers/' + customer.id, { headers: { cookie: admin } });
    assert.equal((await fromAdmin.json()).status, 'contacted');
});

test('consultation reference links to an owner service order and a confirmed follow-up booking', async () => {
    const admin = await sessionCookie('owner', { password: 'integration-password' });
    const sales = await sessionCookie('sales', { username: 'sales.integration', password: 'Sales-Integration-2026' });
    const other = await sessionCookie('sales', { username: 'sales.other', password: 'Sales-Other-2026' });
    const id = workflowIntakeId;
    assert.match(id, /^ARK-/);
    const customerPath = '/api/owner/customers/' + id;
    assert.equal((await callJson(customerPath + '/assignment', admin, 'PATCH', { salesId: 'missing' })).status, 400);
    assert.equal((await callJson(customerPath + '/assignment', admin, 'PATCH', { salesId: salesOneId })).status, 200);
    assert.equal((await callJson('/api/sales/customers/' + id + '/follow-up', sales, 'PATCH', { status: 'qualified' })).status, 200);
    const consultationPath = customerPath + '/consultation';
    const appointment = { status: 'scheduled', dateTime: '2027-01-10T10:30', channel: 'phone', reason: '已与客户确认回电' };
    assert.equal((await callJson(consultationPath, admin, 'PATCH', { ...appointment, dateTime: '2027-02-31T10:30' })).status, 400);
    assert.equal((await callJson(consultationPath, admin, 'PATCH', { status: 'completed', reason: '尚未安排' })).status, 409);
    assert.equal((await callJson(consultationPath, sales, 'PATCH', appointment)).status, 403);
    const salesConsultationPath = '/api/sales/customers/' + id + '/consultation';
    assert.equal((await callJson(salesConsultationPath, other, 'PATCH', appointment)).status, 403);
    assert.equal((await callJson(salesConsultationPath, sales, 'PATCH', appointment)).status, 200);
    const fromOwner = await (await fetch(baseUrl + customerPath, { headers: { cookie: admin } })).json();
    assert.equal(fromOwner.consultation.dateTime, appointment.dateTime);
    assert.equal(fromOwner.consultation.updatedBy, salesOneId);
    const appointmentOnSales = await (await fetch(baseUrl + '/api/sales/customers/' + id, { headers: { cookie: sales } })).json();
    assert.equal(appointmentOnSales.consultation.status, 'scheduled');
    assert.equal(appointmentOnSales.consultation.reason, undefined);
    assert.equal((await callJson(consultationPath, admin, 'PATCH', { status: 'completed', reason: '已沟通需求和准备计划' })).status, 200);
    const completedOnSales = await (await fetch(baseUrl + '/api/sales/customers/' + id, { headers: { cookie: sales } })).json();
    assert.equal(completedOnSales.consultation.status, 'completed');
    assert.equal(completedOnSales.consultation.reason, undefined);
    const orderPath = '/api/owner/partner-program/service-order';
    const orderData = { customerId: id, programId: 'autologous-stem-cells', currency: 'CNY', quotedFen: 100000, requestId: 'flow-001' };
    const drafted = await callJson(orderPath, admin, 'POST', orderData);
    assert.equal(drafted.status, 200);
    const order = await drafted.json();
    assert.equal(order.periodId, '');
    const orderStatusPath = '/api/owner/partner-program/order-status';
    const sign = { id: order.id, state: 'signed', contractRef: 'WORKFLOW-SIGN-001', contractingParty: '测试签约主体', reason: '已核对签约和服务期次' };
    assert.equal((await callJson(orderStatusPath, admin, 'POST', sign)).status, 400);
    assert.equal((await callJson(orderStatusPath, admin, 'POST', { ...sign, servicePeriodId: '20000101' })).status, 409);
    const signed = await callJson(orderStatusPath, admin, 'POST', { ...sign, servicePeriodId: nextMonthId });
    assert.equal(signed.status, 200);
    assert.equal((await signed.json()).periodLabel, getPeriodLabel(nextMonthId));
    const bookingPath = '/api/sales/customers/' + id + '/internal-bookings';
    const activation = { type: 'plan_confirmed', firstActivation: true, reason: '测试首期方案确认凭证' };
    assert.equal((await callJson(customerPath + '/membership', admin, 'POST', { ...activation, reason: '' })).status, 400);
    assert.equal((await callJson(customerPath + '/membership', admin, 'POST', activation)).status, 200);
    assert.equal((await callJson(customerPath + '/membership', admin, 'POST', activation)).status, 409);
    const bookingInput = { periodId: nextMonthId, periodLabel: '无效的来客标题', guestCount: 2 };
    assert.equal((await callJson(bookingPath, sales, 'POST', { ...bookingInput, periodId: '20000101' })).status, 409);
    assert.equal((await callJson(bookingPath, sales, 'POST', { ...bookingInput, periodId: '20990101' })).status, 409);
    const booked = await callJson(bookingPath, sales, 'POST', bookingInput);
    assert.equal(booked.status, 201);
    const { booking } = await booked.json();
    assert.equal(booking.periodLabel, getPeriodLabel(nextMonthId));
    assert.equal((await callJson(bookingPath, sales, 'POST', bookingInput)).status, 409);
    const reviewPath = customerPath + '/internal-bookings/' + booking.id;
    assert.equal((await callJson(reviewPath, sales, 'PATCH', { status: 'confirmed', reason: '无权确认' })).status, 403);
    const nextOrder = { ...orderData, bookingId: booking.id, requestId: 'flow-002' };
    assert.equal((await callJson(orderPath, admin, 'POST', nextOrder)).status, 409);
    assert.equal((await callJson(reviewPath, admin, 'PATCH', { status: 'confirmed', reason: '已核对席位并联系客户' })).status, 200);
    const follow = await callJson(orderPath, admin, 'POST', nextOrder);
    assert.equal(follow.status, 200);
    const followOrder = await follow.json();
    assert.equal(followOrder.periodId, nextMonthId);
    const cancelBooking = { status: 'cancelled', reason: '客户申请改期' };
    assert.equal((await callJson(reviewPath, admin, 'PATCH', cancelBooking)).status, 409);
    const detail = await (await fetch(baseUrl + customerPath, { headers: { cookie: admin } })).json();
    assert.equal(detail.internalBookings[0].status, 'confirmed');
    assert.equal(detail.linkedOrders.length, 2);
    assert.equal(detail.linkedOrders[0].customerId, id);
    assert.equal(detail.linkedOrders[1].bookingId, booking.id);
    assert.equal(detail.note, '不属于销售资料的测试备注');
    const salesDesk = async cookie => (await fetch(baseUrl + '/api/sales/partner-program', { headers: { cookie } })).json();
    const visible = (await salesDesk(sales)).orders.find(item => item.id === order.id);
    assert.equal(visible.serviceOrder, true);
    for (const field of ['note', 'movements', 'summary', 'contractingParty']) assert.equal(visible[field], undefined);
    assert.equal((await salesDesk(other)).orders.some(item => item.id === order.id), false);
    await callJson(customerPath + '/assignment', admin, 'PATCH', { salesId: salesTwoId });
    assert.equal((await callJson(salesConsultationPath, sales, 'PATCH', appointment)).status, 403);
    assert.equal((await callJson(salesConsultationPath, other, 'PATCH', appointment)).status, 200);
    assert.equal((await salesDesk(sales)).orders.some(item => item.id === order.id), false);
    assert.equal((await salesDesk(other)).orders.some(item => item.id === order.id), true);
    const cancelledOrder = await callJson(orderStatusPath, admin, 'POST', { id: followOrder.id, state: 'cancelled', reason: '预约改期，草稿未签约' });
    assert.equal(cancelledOrder.status, 200);
    assert.equal((await callJson(reviewPath, admin, 'PATCH', cancelBooking)).status, 200);
});

test('public application rejects unpublished dates, cross-site submissions and mismatched uploads', async () => {
    function form(period, key) {
        const data = new FormData();
        data.set('periodId', period);
        data.set('submissionKey', key);
        data.set('name', '体例客户');
        data.set('contact', 'example_visitor_001');
        return data;
    }
    const url = baseUrl + '/api/advisor-applications';
    const unavailable = await fetch(url, { method: 'POST', body: form('20260901', 'retired-period') });
    assert.equal(unavailable.status, 400);
    const cross = await fetch(url, { method: 'POST', headers: { origin: 'https://example.com' }, body: form('20261201', 'cross-site') });
    assert.equal(cross.status, 403);
    const mismatched = form('20261201', 'bad-file');
    mismatched.append('attachments', new Blob(['ordinary text'], { type: 'application/pdf' }), 'sample.pdf');
    assert.equal((await fetch(url, { method: 'POST', body: mismatched })).status, 400);
    const valid = form('20261201', 'validated-once');
    const created = await fetch(url, { method: 'POST', body: valid });
    assert.equal(created.status, 201);
    const repeat = await fetch(url, { method: 'POST', body: form('20261201', 'validated-once') });
    assert.equal(repeat.status, 200);
    assert.equal((await repeat.json()).duplicate, true);
    const renamed = form('20261201', 'other-submission-token');
    renamed.set('name', '另一个姓名');
    const newer = await fetch(url, { method: 'POST', body: renamed });
    assert.equal(newer.status, 409);
    assert.equal((await newer.json()).orderId, undefined);
});

test('administrator login aliases share a rate limit and log response status without query credentials', async () => {
    const login = await callJson('/api/owner/login', '', 'POST', { password: 'integration-password' });
    assert.equal(login.status, 200);
    const attempts = [];
    for (let i = 0; i < 24; i++) {
        const endpoint = i % 2 ? '/api/admin/login' : '/api/owner/login';
        const response = await callJson(endpoint + '?probe=omit-this-value', '', 'POST', { password: 'invalid-for-security-test' });
        attempts.push(response.status);
        if (response.status === 429) {
            assert.ok(Number(response.headers.get('retry-after')) > 0);
            break;
        }
    }
    assert.ok(attempts.includes(429));
    const logfile = path.join(runtimeDir, 'access.log');
    let logs = '';
    for (let attempt = 0; attempt < 30; attempt++) {
        logs = await fs.readFile(logfile, 'utf8').catch(error => {
            if (error.code === 'ENOENT') return '';
            throw error;
        });
        if (logs.includes('"statusCode":429')) break;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    const records = logs.trim().split('\n').filter(Boolean).map(JSON.parse);
    assert.ok(records.some(record => record.url === '/api/owner/login' && record.statusCode === 401));
    assert.ok(records.some(record => record.url === '/api/owner/login' && record.statusCode === 200 && record.role === 'owner'));
    assert.ok(records.some(record => record.statusCode === 429 && /\/api\/(?:admin|owner)\/login/.test(record.url)));
    assert.ok(records.every(record => !record.url.includes('omit-this-value')));
});
