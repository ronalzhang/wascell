const assert = require('node:assert/strict');
const test = require('node:test');
const { createClientAddress, createRateLimiter } = require('../lib/request-guard');

function request(remoteAddress, headers = {}, headersDistinct) {
    return { socket: { remoteAddress }, headers, headersDistinct, ip: '198.51.100.90' };
}

const trustedProxy = { trustLoopbackProxy: true };

test('accepts one canonical X-Real-IP only from a configured loopback proxy', () => {
    const headers = { 'x-real-ip': ' 2001:0DB8:0000:0000:0000:0000:0000:0012 ' };
    assert.equal(createClientAddress(request('127.0.0.2', headers), trustedProxy), '2001:db8::12');
    assert.equal(createClientAddress(request('::1', headers), trustedProxy), '2001:db8::12');
    assert.equal(createClientAddress(request('::ffff:7f00:1', headers), trustedProxy), '2001:db8::12');
    assert.equal(createClientAddress(request('::ffff:127.0.0.1', headers)), '127.0.0.1');
    assert.equal(createClientAddress(request('198.51.100.3', headers), trustedProxy), '198.51.100.3');
});

test('ignores other forwarded address headers and handles an unavailable socket address', () => {
    const headers = {
        'cf-connecting-ip': '203.0.113.8',
        'x-forwarded-for': '203.0.113.9',
    };
    assert.equal(createClientAddress(request('::1', headers), trustedProxy), '::1');
    assert.equal(createClientAddress(request(undefined, headers), trustedProxy), 'unknown');
});

test('rejects malformed and repeated X-Real-IP values', () => {
    const badValues = ['198.51.100.4, 198.51.100.5', '198.51.100.4:443', '[2001:db8::1]', 'fe80::1%en0'];
    for (const value of badValues) {
        assert.equal(createClientAddress(request('::1', { 'x-real-ip': value }), trustedProxy), '::1');
    }
    const duplicated = request('::1', { 'x-real-ip': '198.51.100.4' }, {
        'x-real-ip': ['198.51.100.4', '198.51.100.4'],
    });
    assert.equal(createClientAddress(duplicated, trustedProxy), '::1');
});

test('sends distinct hosts within the same IPv6 /64 to one limit bucket', () => {
    const take = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 10, now: () => 0 });
    assert.equal(take('2001:0db8:0:1:1::a').allowed, true);
    assert.equal(take('2001:db8:0:1:ffff::b').allowed, false);
    assert.equal(take('2001:db8:0:2::b').allowed, true);
    assert.equal(take('2001:db8::192.0.2.1').allowed, true);
    assert.equal(take('2001:0DB8:0000:0000:0000:0000:c000:0202').allowed, false);
});

test('keeps IPv4 hosts distinct and normalizes their IPv6-mapped equivalents', () => {
    const take = createRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 10, now: () => 0 });
    assert.equal(take('192.0.2.1').allowed, true);
    assert.equal(take('::ffff:192.0.2.1').allowed, false);
    assert.equal(take('0:0:0:0:0:FFFF:C000:0201').allowed, false);
    assert.equal(take('192.0.2.2').allowed, true);
    assert.equal(createClientAddress(request('::1', { 'x-real-ip': '::ffff:c000:201' }), trustedProxy), '192.0.2.1');
});

test('enforces the request budget until the next fixed-window boundary', () => {
    let now = 1_050;
    const take = createRateLimiter({ limit: 2, windowMs: 100, maxKeys: 10, now: () => now });
    assert.deepEqual(take('192.0.2.1'), { allowed: true, retryAfterMs: 0 });
    assert.deepEqual(take('192.0.2.1'), { allowed: true, retryAfterMs: 0 });
    assert.deepEqual(take('192.0.2.1'), { allowed: false, retryAfterMs: 50 });
    now = 1_099;
    assert.deepEqual(take('192.0.2.1'), { allowed: false, retryAfterMs: 1 });
    now = 1_100;
    assert.deepEqual(take('192.0.2.1'), { allowed: true, retryAfterMs: 0 });
});

test('blocks new buckets at capacity without evicting active ones', () => {
    let now = 0;
    const take = createRateLimiter({ limit: 2, windowMs: 100, maxKeys: 2, now: () => now });
    assert.equal(take('192.0.2.1').allowed, true);
    assert.equal(take('192.0.2.1').allowed, true);
    assert.equal(take('192.0.2.2').allowed, true);
    assert.deepEqual(take('192.0.2.3'), { allowed: false, retryAfterMs: 100 });
    assert.equal(take('192.0.2.1').allowed, false);
    assert.equal(take('192.0.2.2').allowed, true);
    now = 100;
    assert.equal(take('192.0.2.3').allowed, true);
});

test('shares a bucket for unrecognized addresses', () => {
    const take = createRateLimiter({ limit: 1, windowMs: 100, maxKeys: 2, now: () => 0 });
    assert.equal(take('unknown').allowed, true);
    assert.equal(take(undefined).allowed, false);
    assert.equal(take('malformed address').allowed, false);
});
