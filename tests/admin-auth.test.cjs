const test = require('node:test');
const assert = require('node:assert/strict');

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

test('login rejects an incorrect password without setting a cookie', async () => {
    const auth = createAdminAuth({ password: 'correct horse', secret: 'test-secret' });
    const res = createResponse();

    await auth.ownerLogin({ body: { password: 'wrong' } }, res);

    assert.equal(res.statusCode, 401);
    assert.equal(res.headers['set-cookie'], undefined);
    assert.deepEqual(res.body, { success: false, message: '密码错误' });
});

test('login issues an HttpOnly strict cookie that the session endpoint accepts', async () => {
    const auth = createAdminAuth({
        password: 'correct horse',
        secret: 'test-secret',
        now: () => 1_700_000_000_000,
        ttlMs: 60_000,
        secureCookie: true,
    });
    const loginRes = createResponse();

    await auth.ownerLogin({ body: { password: 'correct horse' } }, loginRes);

    assert.equal(loginRes.statusCode, 200);
    assert.match(loginRes.headers['set-cookie'], /^wascell_admin_session=/);
    assert.match(loginRes.headers['set-cookie'], /HttpOnly/);
    assert.match(loginRes.headers['set-cookie'], /SameSite=Strict/);
    assert.match(loginRes.headers['set-cookie'], /Secure/);

    const cookie = loginRes.headers['set-cookie'].split(';')[0];
    const sessionRes = createResponse();
    await auth.session({ headers: { cookie } }, sessionRes);

    assert.equal(sessionRes.statusCode, 200);
    assert.equal(sessionRes.body.authenticated, true);
    assert.equal(sessionRes.body.principal.role, 'owner');
});

test('requireOwner rejects a missing or tampered session cookie', async () => {
    const auth = createAdminAuth({ password: 'correct horse', secret: 'test-secret' });
    const missingRes = createResponse();
    let nextCalled = false;

    await auth.requireOwner({ headers: {} }, missingRes, () => { nextCalled = true; });
    assert.equal(missingRes.statusCode, 401);
    assert.equal(nextCalled, false);

    const tamperedRes = createResponse();
    await auth.requireOwner(
        { headers: { cookie: 'wascell_admin_session=invalid.payload' } },
        tamperedRes,
        () => { nextCalled = true; },
    );
    assert.equal(tamperedRes.statusCode, 401);
    assert.equal(nextCalled, false);
});
