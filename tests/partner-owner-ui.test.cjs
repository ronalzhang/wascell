const { readFile } = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('owner shell exposes the partner workspace alongside existing systems', async () => {
    const page = await readFile(path.resolve(__dirname, '../admin-pro.html'), 'utf8');
    for (const view of ['partnerOverview', 'partnerPeople', 'partnerOrders', 'partnerPolicy', 'partnerProjects', 'stats', 'customers', 'knowledge', 'config', 'staff']) {
        assert.ok(page.includes(`data-view="${view}"`), view);
    }
    assert.match(page, /id="partnerProgramView"/);
    assert.match(page, /partner-owner\.css/);
});

test('owner policy form preserves editable zero amounts and exact cent and basis-point amounts', async () => {
    const { readPolicyForm, parseHundredths } = await import('../partner-owner.mjs');
    const fields = new Map([
        ['enabled', 'on'], ['reason', '更新合作政策'], ['lookbackDays', '75'], ['minPlatformBps', '56.25'],
        ['projectShareBps', '18.3'], ['maturityDays', '0'], ['mentorCapacity', '3'], ['mentorMinCustomers', '0'],
        ['mentorMinContributionFen', '0'], ['maxForecastCustomers', '12'], ['maxForecastProjects', '4'],
        ['remediationDays', '14'], ['tier-0-name', '基础'], ['tier-0-rate', '20.05'], ['tier-0-customers', '0'],
        ['tier-0-contribution', '0'], ['tier-1-name', '成长'], ['tier-1-rate', '26.2'], ['tier-1-customers', '2'],
        ['tier-1-contribution', '501.10'], ['tier-2-name', '资深'], ['tier-2-rate', '34'], ['tier-2-customers', '5'],
        ['tier-2-contribution', '2000.01']
    ]);
    assert.deepEqual(readPolicyForm(fields), {
        enabled: true, reason: '更新合作政策', lookbackDays: 75, minPlatformBps: 5625, projectShareBps: 1830,
        maturityDays: 0, mentorCapacity: 3, mentorMinCustomers: 0, mentorMinContributionFen: 0,
        maxForecastCustomers: 12, maxForecastProjects: 4, remediationDays: 14,
        tiers: [
            { name: '基础', rateBps: 2005, minCustomers: 0, minContributionFen: 0 },
            { name: '成长', rateBps: 2620, minCustomers: 2, minContributionFen: 50110 },
            { name: '资深', rateBps: 3400, minCustomers: 5, minContributionFen: 200001 }
        ]
    });
    assert.equal(parseHundredths('0.29'), 29);
    for (const input of ['', '-1', '1e4', '9.999', '999999999999999999999']) {
        assert.throws(() => parseHundredths(input), Error, input);
    }
});

test('owner financial form requires exact and nonzero movement allocations', async () => {
    const { readMovementForm } = await import('../partner-owner.mjs');
    const order = { id: 'order-1', lines: [{ id: 'line-1' }, { id: 'line-2' }, { id: 'line-3' }] };
    const fields = new Map([
        ['type', 'receipt'], ['reference', 'bank-101'], ['reason', '核银行到账'],
        ['amountFen', '11.00'], ['allocation-0', '6.35'], ['tax-0', '0.05'], ['allocation-1', '4.65'],
        ['pass-through-1', '1.00']
    ]);
    assert.deepEqual(readMovementForm(fields, order), {
        id: 'order-1', type: 'receipt', amountFen: 1100, reference: 'bank-101', reason: '核银行到账',
        allocations: [
            { lineId: 'line-1', amountFen: 635, taxFen: 5, passThroughFen: 0 },
            { lineId: 'line-2', amountFen: 465, taxFen: 0, passThroughFen: 100 }
        ]
    });
    fields.set('amountFen', '11.01');
    assert.throws(() => readMovementForm(fields, order), /分摊/);
    fields.set('amountFen', '11.00');
    fields.set('tax-2', '0.01');
    assert.throws(() => readMovementForm(fields, order), /分摊/);
    fields.set('type', 'cost');
    assert.ok(readMovementForm(fields, order).allocations.every((item) => !item.taxFen && !item.passThroughFen));
});

test('owner overview renders actual data and escapes the visible partner name', async () => {
    const { renderOwnerView } = await import('../partner-owner.mjs');
    const html = renderOwnerView('partnerOverview', {
        policy: { enabled: true, minPlatformBps: 5500 },
        dashboard: { contributionFen: 120000, platformRetainedFen: 78000 },
        partners: [{ id: 'sales-1', displayName: '<img src=x onerror=alert(1)>', mentorStatus: 'requested' }]
    });
    assert.match(html, /¥780\.00/);
    assert.match(html, /55%/);
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /<img/);
});

test('owner overview counts saved products, excluded items and unpriced templates', async () => {
    const { renderOwnerView } = await import('../partner-owner.mjs');
    const html = renderOwnerView('partnerOverview', {
        products: [{ kind: 'excluded' }, { kind: 'excluded' }, { kind: 'non_medical' }],
        templates: [{ active: false, feeFen: null }, { active: false, feeFen: 2000 }, { active: true, feeFen: 3000 }],
    });
    assert.match(html, /产品目录<\/span>\s*<strong>3<\/strong>/);
    assert.match(html, /排除计佣<\/span>\s*<strong>2<\/strong>/);
    assert.match(html, /准备中的项目模板<\/span>\s*<strong>1<\/strong>/);
});

test('owner policy shows excluded product amounts as inapplicable', async () => {
    const { renderOwnerView } = await import('../partner-owner.mjs');
    const html = renderOwnerView('partnerPolicy', { products: [{
        id: 'excluded', name: '基础体检', kind: 'excluded', active: false,
        forecastContributionFen: 0, maxRateBps: 0, maxCommissionFen: 0, minRetainedFen: 0,
    }] });
    const row = html.match(/<tr>.*?<\/tr>/gs)?.find((item) => item.includes('基础体检'));
    assert.ok(row);
    assert.equal((row.match(/不适用/g) || []).length, 3);
    assert.doesNotMatch(row, /¥0|0%/);
});

test('owner operations lists unpriced preparations before they become actual projects', async () => {
    const { renderOwnerView } = await import('../partner-owner.mjs');
    const data = {
        projects: [],
        templates: [
            { id: 'draft', name: '跨境资料交接复核', category: 'quality', active: false, feeFen: null, deliverable: '完成交接清单' },
            { id: 'retired', name: '历史付费模板', category: 'regional', active: false, feeFen: 2000 },
        ],
    };
    const policy = renderOwnerView('partnerPolicy', data);
    const operations = renderOwnerView('partnerProjects', data);
    for (const html of [policy, operations]) {
        assert.match(html, /跨境资料交接复核/);
        assert.match(html, /准备中/);
        assert.match(html, /费用待确认/);
    }
    assert.match(operations, /完成交接清单/);
    assert.match(operations, /历史付费模板/);
    assert.doesNotMatch(operations, /可申请/);
});

test('owner cost verification distinguishes an explicit zero from an untouched order line', async () => {
    const { readMovementForm } = await import('../partner-owner.mjs');
    const order = { id: 'order-2', lines: [{ id: 'line-a' }, { id: 'line-b' }] };
    const fields = new Map([['type', 'cost'], ['reference', 'cost-2'], ['amountFen', '0'], ['allocation-1', '0']]);
    assert.deepEqual(readMovementForm(fields, order).allocations, [{ lineId: 'line-b', amountFen: 0, taxFen: 0, passThroughFen: 0 }]);
    fields.delete('allocation-1');
    assert.throws(() => readMovementForm(fields, order), /分摊/);
    fields.set('allocation-0', '0');
    for (const type of ['receipt', 'refund', 'cost_recovery']) {
        fields.set('type', type);
        assert.throws(() => readMovementForm(fields, order), /分摊/);
    }
});

test('owner payments distinguish a stale bank instruction from the latest releasable amount', async () => {
    const { renderOwnerView } = await import('../partner-owner.mjs');
    const html = renderOwnerView('partnerOrders', {
        dashboard: { paymentRechecks: [{ id: 'payment-a', currentDueFen: 10025 }] },
        payments: [{ id: 'payment-a', partnerId: 'sales-1', period: '2026-10', status: 'reconciling', grossFen: 12500 }]
    });
    assert.match(html, /待重核/);
    assert.match(html, /当前可付 ¥100\.25/);
    assert.match(html, /¥125\.00/);
});

test('owner order detail keeps refund and cost reconciliation open only for orders that were signed', async () => {
    const { orderMovementControls } = await import('../partner-owner.mjs');
    const summary = { receiptFen: 20100, refundFen: 4000 };
    const signedAt = '2026-11-21T04:00:00.000Z';

    const cancelledDraft = orderMovementControls({ id: 'draft', state: 'cancelled', signedAt: null, summary });
    assert.deepEqual(cancelledDraft.choices, []);
    assert.equal(cancelledDraft.action, '');
    assert.equal(cancelledDraft.notice, '');

    const cancelledContract = orderMovementControls({ id: 'cancelled', state: 'cancelled', signedAt, summary });
    assert.deepEqual(cancelledContract.choices.map(([value]) => value), ['refund', 'cost', 'cost_recovery']);
    assert.match(cancelledContract.action, /登记退款／成本/);
    assert.match(cancelledContract.notice, /核对退款/);
    assert.match(cancelledContract.notice, /¥161\.00/);

    for (const state of ['signed', 'delivered']) {
        const order = orderMovementControls({ id: state, state, signedAt, summary });
        assert.deepEqual(order.choices.map(([value]) => value), ['receipt', 'refund', 'cost', 'cost_recovery']);
        assert.match(order.action, /登记收退／成本/);
        assert.equal(order.notice, '');
    }
});
