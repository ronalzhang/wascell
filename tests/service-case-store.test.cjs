const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createServiceCaseStore } = require('../lib/service-case-store');

async function fixture() {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arksoma-cases-'));
    const events = [];
    const store = createServiceCaseStore({
        dataDir,
        now: () => new Date('2026-08-05T12:00:00.000Z'),
        auditLog: { append: async (event) => events.push(event) },
    });
    return { store, events, dataDir };
}

test('service cases assign the next private-journal chapter without mixing membership state', async (t) => {
    const { store, dataDir } = await fixture();
    t.after(() => fs.rm(dataDir, { recursive: true, force: true }));

    const first = await store.createCase({ customerId: 'customer-1', periodId: '20260901', periodLabel: '2026·九月首期', assignedSalesId: 'sales-1' }, { role: 'owner', userId: 'owner' });
    const second = await store.createCase({ customerId: 'customer-1', periodId: '20261001', periodLabel: '2026·十月首期', assignedSalesId: 'sales-1' }, { role: 'owner', userId: 'owner' });

    assert.equal(first.caseStatus, 'planning');
    assert.equal(first.paymentStatus, 'unpaid');
    assert.equal(first.nonRefundableLocked, false);
    assert.deepEqual(first.journal, { volumeNumber: 1, chapter: '序', status: 'awaiting_media', photoCount: 0 });
    assert.deepEqual(second.journal, { volumeNumber: 2, chapter: '启', status: 'awaiting_media', photoCount: 0 });
    assert.equal('membershipStatus' in first, false);
});

test('assigned sales can progress and append journal work but cannot confirm payment', async (t) => {
    const { store, events, dataDir } = await fixture();
    t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
    const owner = { role: 'owner', userId: 'owner' };
    const sales = { role: 'sales', userId: 'sales-1' };
    const otherSales = { role: 'sales', userId: 'sales-2' };
    const created = await store.createCase({ customerId: 'customer-1', periodId: '20260901', periodLabel: '2026·九月首期', assignedSalesId: 'sales-1' }, owner);

    const progressed = await store.updateProgress(created.id, 'first_visit_pending', sales);
    const journal = await store.updateJournal(created.id, { status: 'selecting', photoCount: 36 }, sales);
    assert.equal(progressed.caseStatus, 'first_visit_pending');
    assert.equal(journal.journal.status, 'selecting');
    assert.equal(journal.journal.photoCount, 36);
    await assert.rejects(() => store.updateProgress(created.id, 'first_visit_active', otherSales), /无权访问/);
    await assert.rejects(() => store.confirmPayment(created.id, { amount: 580000, payerName: '客户本人' }, sales), /仅所有者/);
    assert.ok(events.some((event) => event.action === 'service_case_progress_updated'));
    assert.ok(events.some((event) => event.action === 'service_case_journal_updated'));
});

test('owner payment confirmation locks the commercial fields and records the payer snapshot', async (t) => {
    const { store, dataDir } = await fixture();
    t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
    const owner = { role: 'owner', userId: 'owner' };
    const created = await store.createCase({ customerId: 'customer-1', periodId: '20260901', periodLabel: '2026·九月首期', assignedSalesId: 'sales-1' }, owner);

    const paid = await store.confirmPayment(created.id, { amount: 580000, payerName: '某某有限公司', reference: 'BANK-20260805' }, owner);
    assert.equal(paid.caseStatus, 'confirmed');
    assert.equal(paid.paymentStatus, 'paid');
    assert.equal(paid.nonRefundableLocked, true);
    assert.deepEqual(paid.payment, {
        amount: 580000,
        payerName: '某某有限公司',
        reference: 'BANK-20260805',
        confirmedAt: '2026-08-05T12:00:00.000Z',
        confirmedBy: 'owner',
    });
});
