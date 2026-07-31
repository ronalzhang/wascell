const test = require('node:test');
const assert = require('node:assert/strict');

const { applyMembershipEvent, membershipStatus } = require('../lib/membership-service');

const now = new Date('2026-10-01T00:00:00.000Z');

test('first confirmed plan activates twelve months from confirmation', () => {
    const updated = applyMembershipEvent(
        { membershipExpiresAt: null, membershipEvents: [] },
        { type: 'plan_confirmed', actorId: 'owner', priceSnapshot: 580000, months: 12 },
        now,
    );

    assert.equal(updated.membershipExpiresAt, '2027-10-01T00:00:00.000Z');
    assert.equal(updated.membershipEvents[0].beforeExpiresAt, null);
    assert.equal(updated.membershipEvents[0].afterExpiresAt, '2027-10-01T00:00:00.000Z');
});

test('active confirmed plan extends from existing expiry instead of confirmation date', () => {
    const updated = applyMembershipEvent(
        { membershipExpiresAt: '2027-01-15T00:00:00.000Z', membershipEvents: [] },
        { type: 'plan_confirmed', actorId: 'owner', priceSnapshot: 580000, months: 12 },
        now,
    );

    assert.equal(updated.membershipExpiresAt, '2028-01-15T00:00:00.000Z');
});

test('expired customer cannot renew with annual fee alone', () => {
    assert.throws(
        () => applyMembershipEvent(
            { membershipExpiresAt: '2026-09-30T23:59:59.000Z', membershipEvents: [] },
            { type: 'fee_renewed', actorId: 'owner', priceSnapshot: 19800, months: 12 },
            now,
        ),
        /会员已到期/,
    );
});

test('owner adjustment records gifted date change and reason', () => {
    const updated = applyMembershipEvent(
        { membershipExpiresAt: '2027-01-15T00:00:00.000Z', membershipEvents: [] },
        {
            type: 'owner_adjusted',
            actorId: 'owner',
            expiresAt: '2027-07-15T00:00:00.000Z',
            reason: '重要客户礼遇',
        },
        now,
    );

    assert.equal(updated.membershipExpiresAt, '2027-07-15T00:00:00.000Z');
    assert.equal(updated.membershipEvents[0].reason, '重要客户礼遇');
    assert.equal(updated.membershipEvents[0].beforeExpiresAt, '2027-01-15T00:00:00.000Z');
});

test('membership status uses the nearest configured reminder boundary', () => {
    assert.equal(membershipStatus('2026-10-08T00:00:00.000Z', now, [60, 30, 7]), 'expiring_7');
    assert.equal(membershipStatus('2026-10-20T00:00:00.000Z', now, [60, 30, 7]), 'expiring_30');
    assert.equal(membershipStatus('2026-12-15T00:00:00.000Z', now, [60, 30, 7]), 'active');
    assert.equal(membershipStatus('2026-09-30T00:00:00.000Z', now, [60, 30, 7]), 'expired');
    assert.equal(membershipStatus(null, now, [60, 30, 7]), 'inactive');
});
