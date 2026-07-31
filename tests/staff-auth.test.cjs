const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createStaffStore } = require('../lib/staff-store');
const { createAdminAuth } = require('../lib/admin-auth');

function createResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        json(value) { this.body = value; return this; },
    };
}

async function withStore(run) {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wascell-staff-'));
    try {
        return await run(
            createStaffStore({ dataDir, now: () => new Date('2026-07-31T08:00:00.000Z') }),
            dataDir,
        );
    } finally {
        await fs.rm(dataDir, { recursive: true, force: true });
    }
}

test('sales passwords are hashed and username lookup is case-insensitive', async () => {
    await withStore(async (store, dataDir) => {
        const account = await store.createSales({
            username: 'Lina.Zhang',
            displayName: '张琳',
            password: 'Lina-Strong-2026',
        });

        const saved = JSON.parse(await fs.readFile(path.join(dataDir, 'staff.json'), 'utf8'));
        assert.equal(saved[0].username, 'lina.zhang');
        assert.equal('password' in saved[0], false);
        assert.notEqual(saved[0].passwordHash, 'Lina-Strong-2026');

        const principal = await store.verifySales('LINA.ZHANG', 'Lina-Strong-2026');
        assert.deepEqual(principal, {
            role: 'sales',
            userId: account.id,
            username: 'lina.zhang',
            displayName: '张琳',
            sessionVersion: 1,
        });
    });
});

test('disabling an account invalidates its previous session version', async () => {
    await withStore(async (store) => {
        const account = await store.createSales({
            username: 'sales.one',
            displayName: '销售一',
            password: 'Sales-One-2026',
        });
        assert.equal(await store.getSessionVersion(account.id), 1);

        await store.setActive(account.id, false);

        assert.equal(await store.getSessionVersion(account.id), null);
        assert.equal(await store.verifySales('sales.one', 'Sales-One-2026'), null);
    });
});

test('owner and sales logins issue distinct signed principals', async () => {
    await withStore(async (staffStore) => {
        const account = await staffStore.createSales({
            username: 'sales.two',
            displayName: '销售二',
            password: 'Sales-Two-2026',
        });
        const auth = createAdminAuth({
            ownerPassword: 'owner-password',
            secret: 'test-session-secret',
            staffStore,
            now: () => 1_700_000_000_000,
        });

        const ownerRes = createResponse();
        await auth.ownerLogin({ body: { password: 'owner-password' } }, ownerRes);
        const ownerCookie = ownerRes.headers['set-cookie'].split(';')[0];
        const ownerSession = createResponse();
        await auth.session({ headers: { cookie: ownerCookie } }, ownerSession);
        assert.equal(ownerSession.body.principal.role, 'owner');
        assert.equal(ownerSession.body.principal.userId, 'owner');

        const salesRes = createResponse();
        await auth.salesLogin({ body: { username: 'sales.two', password: 'Sales-Two-2026' } }, salesRes);
        const salesCookie = salesRes.headers['set-cookie'].split(';')[0];
        const salesSession = createResponse();
        await auth.session({ headers: { cookie: salesCookie } }, salesSession);
        assert.equal(salesSession.body.principal.role, 'sales');
        assert.equal(salesSession.body.principal.userId, account.id);
    });
});

test('owner-only middleware returns 403 for an authenticated sales principal', async () => {
    await withStore(async (staffStore) => {
        await staffStore.createSales({
            username: 'sales.three',
            displayName: '销售三',
            password: 'Sales-Three-2026',
        });
        const auth = createAdminAuth({ ownerPassword: 'owner-password', secret: 'test-session-secret', staffStore });
        const loginRes = createResponse();
        await auth.salesLogin({ body: { username: 'sales.three', password: 'Sales-Three-2026' } }, loginRes);

        const req = { headers: { cookie: loginRes.headers['set-cookie'].split(';')[0] } };
        const res = createResponse();
        let nextCalled = false;
        await auth.requireOwner(req, res, () => { nextCalled = true; });

        assert.equal(res.statusCode, 403);
        assert.equal(nextCalled, false);
    });
});
