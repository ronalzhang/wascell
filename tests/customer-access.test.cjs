const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createAdvisorStore } = require('../lib/advisor-store');

async function withStore(run) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wascell-customer-access-'));
    let tick = 0;
    const store = createAdvisorStore({
        dataDir: path.join(root, 'data'),
        uploadDir: path.join(root, 'uploads'),
        now: () => new Date(Date.UTC(2026, 6, 31, 8, tick++)),
    });
    try {
        return await run(store);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
}

async function createCustomer(store, key, name) {
    return (await store.createApplication({
        submissionKey: key,
        periodId: '20260901',
        periodLabel: '2026·九月首期',
        name,
        contact: `${key}_wechat`,
    })).order;
}

test('sales lists and opens only customers assigned to that sales account', async () => {
    await withStore(async (store) => {
        const first = await createCustomer(store, 'customer-a', '客户甲');
        const second = await createCustomer(store, 'customer-b', '客户乙');
        await store.assignSales(first.id, 'sales-a');
        await store.assignSales(second.id, 'sales-b');

        const result = await store.listForPrincipal({ role: 'sales', userId: 'sales-a' });

        assert.deepEqual(result.items.map((item) => item.name), ['客户甲']);
        assert.equal((await store.getForPrincipal(first.id, { role: 'sales', userId: 'sales-a' })).name, '客户甲');
        assert.equal(await store.getForPrincipal(second.id, { role: 'sales', userId: 'sales-a' }), null);
    });
});

test('active assigned member gets an internal booking without creating a duplicate customer', async () => {
    await withStore(async (store) => {
        const customer = await createCustomer(store, 'member-a', '连续会员');
        await store.assignSales(customer.id, 'sales-a');
        await store.recordMembershipEvent(customer.id, {
            type: 'plan_confirmed',
            actorId: 'owner',
            priceSnapshot: 580000,
            months: 12,
        });

        const booking = await store.createInternalBooking(
            customer.id,
            {
                periodId: '20270101',
                periodLabel: '2027·一月首期',
                guestCount: 2,
                relationship: '夫妻',
                medicalDocumentsStatus: 'needs_update',
                note: '偏好安静房型',
            },
            { role: 'sales', userId: 'sales-a' },
        );

        const customers = await store.listApplications();
        const refreshed = await store.getApplication(customer.id);
        assert.equal(customers.total, 1);
        assert.equal(booking.status, 'draft');
        assert.equal(refreshed.internalBookings.length, 1);
    });
});

test('expired member cannot receive a sales-created internal booking', async () => {
    await withStore(async (store) => {
        const customer = await createCustomer(store, 'expired-a', '到期客户');
        await store.assignSales(customer.id, 'sales-a');
        await store.adjustMembership(customer.id, {
            expiresAt: '2025-01-01T00:00:00.000Z',
            reason: '测试到期',
            actorId: 'owner',
        });

        await assert.rejects(
            store.createInternalBooking(
                customer.id,
                { periodId: '20270101', periodLabel: '2027·一月首期', guestCount: 1 },
                { role: 'sales', userId: 'sales-a' },
            ),
            /会员已到期/,
        );
    });
});
