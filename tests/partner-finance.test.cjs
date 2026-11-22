const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    createOrder, changeOrderStatus, recordMovement, orderView, getOrder, performance,
    previewCommission, dashboard, income, closeSettlement, handlePayment,
} = require('../lib/partner-finance');

const october = '2026-10-22T00:00:00.000Z';
const november = '2026-11-07T00:00:00.000Z';
const december = '2026-12-01T01:00:00.000Z';
const january = '2027-01-01T01:00:00.000Z';

function fixture() {
    const policy = {
        id: 'policy-1', enabled: true, minPlatformBps: 6000, projectShareBps: 2000,
        maturityDays: 0, lookbackDays: 90, tiers: [{ rateBps: 4000 }, { rateBps: 4500 }],
    };
    const product = {
        id: 'product-1', name: '行前行政协调', kind: 'non_medical', active: true,
        approvalRef: 'APP-1', maxRateBps: 5000, maxCommissionFen: null, minRetainedFen: 0,
    };
    const excluded = {
        ...product, id: 'product-2', name: '诊疗费用', kind: 'excluded',
    };
    const state = { policy, orders: [], settlements: [], payments: [], projects: [] };
    const context = {
        customerId: 'customer-1', customerName: '样本客户', partnerId: 'sales-1',
        partnerName: '样本销售', products: [product, excluded],
    };
    return { state, context, policy, product, excluded };
}

function draft(data, lines = [{ productId: data.product.id, quotedFen: 100000 }], date = october) {
    return createOrder(data.state, { lines }, data.context, date);
}

function sign(data, order, date = october, contractRef = `ORDER-${order.id}`) {
    return changeOrderStatus(data.state, { id: order.id, state: 'signed', contractRef },
        {
            policy: data.policy, productList: data.context.products, tierIndex: 0,
            customerIdentityId: data.context.customerIdentityId,
        }, date);
}

function deliver(data, order, date = october) {
    return changeOrderStatus(data.state, { id: order.id, state: 'delivered' }, {}, date);
}

function movement(data, order, type, amountFen, allocations, reference = type, date = october) {
    const input = {
        id: order.id, reference, type, amountFen,
        allocations: allocations || [{ lineId: order.lines[0].id, amountFen }],
    };
    return recordMovement(data.state, input, date);
}

function funded(data, date = october, reference = 'first') {
    const order = sign(data, draft(data, undefined, date), date);
    movement(data, order, 'receipt', 100000, undefined, reference + '-receipt', date);
    movement(data, order, 'cost', 50000, undefined, reference + '-cost', date);
    return deliver(data, order, date);
}

test('签约锁定政策货品；混合订单按已核验价款分摊，医疗、税额和代收不计佣', () => {
    const data = fixture();
    const { state, policy, product, excluded } = data;
    const order = sign(data, draft(data, [
        { productId: product.id, quotedFen: 100000 },
        { productId: excluded.id, quotedFen: 120000 },
    ]));
    const [first, second] = order.lines;
    assert.equal(first.eligible, true);
    assert.equal(second.eligible, false);
    policy.tiers[0].rateBps = 0;
    product.active = false;
    assert.throws(() => movement(data, order, 'receipt', 200000, [
        { lineId: first.id, amountFen: 100000 },
        { lineId: second.id, amountFen: 120000 },
    ]), { statusCode: 400 });
    const allocations = [
        { lineId: first.id, amountFen: 100000, taxFen: 10000, passThroughFen: 20000 },
        { lineId: second.id, amountFen: 120000, passThroughFen: 120000 },
    ];
    movement(data, order, 'receipt', 220000, allocations, 'BANK-1');
    movement(data, order, 'receipt', 220000, allocations.slice().reverse(), 'BANK-1', november);
    assert.equal(getOrder(state, order.id).movements.length, 1);
    assert.throws(() => movement(data, order, 'receipt', 100000, undefined, 'BANK-1'), { statusCode: 409 });
    movement(data, order, 'cost', 40000);
    const view = deliver(data, order);
    assert.equal(view.summary.receiptFen, 220000);
    assert.equal(view.summary.netFen, 70000);
    assert.equal(view.summary.contributionFen, 30000);
    assert.equal(view.summary.earnedFen, 12000);
    assert.equal(view.summary.pendingFen, 0);
});

test('退款和成本回收不能超过余额，各资金成分不能串用，重复回执不能挂到另一个订单', () => {
    const data = fixture();
    const first = sign(data, draft(data));
    const second = sign(data, draft(data));
    const [line] = first.lines;
    assert.throws(() => movement(data, first, 'receipt', 10000, [
        { lineId: line.id, amountFen: 5000 },
        { lineId: line.id, amountFen: 5000 },
    ]), { statusCode: 400 });
    movement(data, first, 'receipt', 100000, [
        { lineId: line.id, amountFen: 100000, taxFen: 10000, passThroughFen: 20000 },
    ]);
    assert.throws(() => movement(data, second, 'receipt', 100000), { statusCode: 409 });
    assert.throws(() => movement(data, first, 'refund', 80000), { statusCode: 400 });
    assert.throws(() => movement(data, first, 'refund', 40000, [
        { lineId: line.id, amountFen: 40000, passThroughFen: 30000 },
    ]), { statusCode: 400 });
    movement(data, first, 'cost', 20000);
    assert.throws(() => movement(data, first, 'cost_recovery', 25000), { statusCode: 400 });
    const adjusted = movement(data, first, 'refund', 15000, [
        { lineId: line.id, amountFen: 15000, taxFen: 1000, passThroughFen: 2000 },
    ]);
    assert.equal(adjusted.summary.netFen, 58000);
    assert.equal(adjusted.summary.contributionFen, 38000);
});

test('费用缺证据时暂缓，交付、足额收款和等待期一起决定明细成熟时点', () => {
    const data = fixture();
    data.policy.maturityDays = 2;
    const order = sign(data, draft(data));
    const [line] = order.lines;
    movement(data, order, 'receipt', 80000, undefined, 'part-main');
    deliver(data, order);
    movement(data, order, 'receipt', 20000, undefined, 'part-final', '2026-10-23T01:00:00.000Z');
    assert.equal(orderView(getOrder(data.state, order.id), november).summary.earnedFen, 0);
    movement(data, order, 'cost', 0, [{ lineId: line.id, amountFen: 0 }], 'confirmed-zero-cost',
        '2026-10-24T01:00:00.000Z');
    assert.equal(orderView(getOrder(data.state, order.id), '2026-10-25T00:59:59.999Z').summary.pendingFen, 40000);
    assert.equal(orderView(getOrder(data.state, order.id), '2026-10-25T01:00:00.000Z').summary.earnedFen, 40000);
    movement(data, order, 'refund', 20000, undefined, 'later-refund', november);
    assert.equal(orderView(getOrder(data.state, order.id), november).summary.earnedFen, 32000);
});

test('佣金预估同时保护工作室的比例留存和货品金额留存', () => {
    const { product, policy } = fixture();
    assert.equal(previewCommission(101, { ...policy, minPlatformBps: 6001 }, product, 0), 40);
    assert.equal(previewCommission(100000, policy, { ...product, minRetainedFen: 80000 }, 0), 20000);
    assert.equal(previewCommission(100000, policy, { ...product, maxCommissionFen: 16000 }, 0), 16000);
    assert.equal(previewCommission(100000, policy, { ...product, maxRateBps: 1000 }, 0), 10000);
    assert.equal(previewCommission(100000, { ...policy, enabled: false }, product, 0), 0);
    assert.equal(previewCommission(100000, policy, { ...product, kind: 'excluded' }, 0), 0);
    assert.equal(previewCommission(-1, policy, product, 0), 0);
});

test('个人窗口只计本人合格成熟贡献，终端客户不重复计算', () => {
    const data = fixture();
    const old = '2026-06-01T01:00:00.000Z';
    funded(data, old, 'old');
    funded(data, october, 'one');
    funded(data, october, 'two');
    data.context.partnerId = 'sales-2';
    funded(data, october, 'other');
    assert.deepEqual(performance(data.state, 'sales-1', data.policy, november),
        { customers: 1, contributionFen: 100000 });
});

test('签约固化客户身份，重复申请只计一个终端客户，旧单可按原客户编号回退', () => {
    const data = fixture();
    const old = funded(data, october, 'original');
    data.context.customerId = 'new-application-for-customer';
    data.context.customerIdentityId = old.customerId;
    const later = funded(data, october, 'additional-visit');
    data.context.customerId = 'different-customer';
    data.context.customerIdentityId = null;
    funded(data, october, 'different');
    assert.equal(getOrder(data.state, later.id).customerIdentityId, old.customerId);
    assert.deepEqual(performance(data.state, 'sales-1', data.policy, november),
        { customers: 2, contributionFen: 150000 });
});

test('北京时间月结可安全重试，后续退款和成本变动只记累计差额', () => {
    const data = fixture();
    const boundary = '2026-10-31T16:00:00.000Z';
    const order = funded(data, '2026-10-31T15:59:59.999Z', 'before');
    funded(data, boundary, 'after');
    assert.throws(() => closeSettlement(data.state, { period: '2026-10' },
        '2026-10-31T15:59:59.999Z'), { statusCode: 409 });
    const first = closeSettlement(data.state, { period: '2026-10' }, boundary);
    assert.equal(first.entries.length, 1);
    assert.equal(first.entries[0].sourceId, order.id);
    assert.equal(first.entries[0].amountFen, 20000);
    assert.equal(first.entries[0].sourceType, 'order');
    assert.equal(closeSettlement(data.state, { period: '2026-10' }, november).id, first.id);
    movement(data, order, 'refund', 20000, undefined, 'refund-1', november);
    movement(data, order, 'cost_recovery', 5000, undefined, 'cost-recovery-1', november);
    const next = closeSettlement(data.state, { period: '2026-11' }, december);
    assert.equal(next.entries.find(entry => entry.sourceId === order.id).amountFen, -6000);
    assert.equal(next.entries.reduce((sum, entry) => sum + entry.amountFen, 0), 14000);
    assert.throws(() => closeSettlement(data.state, { period: '2026-09' }, december), { statusCode: 409 });
    assert.equal(closeSettlement(data.state, { period: '2026-12' }, january).entries.length, 0);
    assert.equal(income(data.state, 'sales-1', january).adjustmentFen, -6000);
});

test('项目费用以实际验收快照结算，待审申请占位，开放项目不占预算', () => {
    const data = fixture();
    data.policy.tiers[0].rateBps = 3000;
    data.product.minRetainedFen = 31000;
    const order = funded(data);
    const { state } = data;
    const add = (id, status, feeFen, extra) => state.projects.push({
        id, status, feeFen, partnerId: 'sales-1', ...extra,
    });
    add('open', 'open', 18000);
    add('applied', 'applied', 800);
    add('assigned', 'assigned', 900);
    add('submitted', 'submitted', 1000);
    add('accepted', 'accepted', 1200, { acceptedAt: october });
    const overview = dashboard(state, november);
    assert.equal(overview.eligibleNetFen, 100000);
    assert.equal(overview.contributionFen, 50000);
    assert.equal(overview.commissionsFen, 15000);
    assert.equal(overview.projectBudgetFen, 4000);
    assert.equal(overview.projectAvailableFen, 100);
    assert.equal(overview.projectCommittedFen, 3900);
    assert.equal(overview.projectAcceptedFen, 1200);
    state.policy = { ...data.policy, minPlatformBps: 5100 };
    assert.equal(dashboard(state, november).projectBudgetFen, 4000);
    assert.equal(dashboard(state, november).projectAvailableFen, 100);
    movement(data, order, 'refund', 10000, undefined, 'late-refund', november);
    assert.equal(dashboard(state, november).projectAvailableFen, 0);
    const statement = closeSettlement(state, { period: '2026-10' }, november);
    const projects = statement.entries.filter(entry => entry.sourceType === 'project');
    assert.equal(projects.length, 1);
    assert.equal(projects[0].sourceId, 'accepted');
    assert.equal(projects[0].amountFen, 1200);
    assert.equal(income(state, 'sales-1', november).payableFen, 10200);
});

test('未关账退款压低付款额度，未关账新收入不可挪用，核对和回填可重试', () => {
    const data = fixture();
    const { state } = data;
    const order = funded(data);
    closeSettlement(state, { period: '2026-10' }, november);
    movement(data, order, 'refund', 20000, undefined, 'refund-1', november);
    funded(data, november, 'unlocked');
    const begin = { action: 'begin', partnerId: 'sales-1', period: '2026-10' };
    assert.equal(dashboard(state, november).paymentQueue[0].dueFen, 12000);
    const payment = handlePayment(state, begin, november);
    assert.equal(payment.grossFen, 12000);
    assert.equal(payment.status, 'reconciling');
    assert.equal(handlePayment(state, begin, november).id, payment.id);
    assert.equal(dashboard(state, november).paymentQueue.length, 0);
    const paid = handlePayment(state, {
        action: 'confirm', id: payment.id, reference: 'payout-1', taxFen: 1000,
    }, november);
    assert.equal(paid.paidFen, 11000);
    assert.equal(handlePayment(state, {
        action: 'confirm', id: payment.id, reference: 'payout-1', taxFen: 1000,
    }, november).id, payment.id);
    assert.throws(() => handlePayment(state, {
        action: 'confirm', id: payment.id, reference: 'another', taxFen: 1000,
    }, november), { statusCode: 409 });
    assert.equal(income(state, 'sales-1', november).withheldFen, 1000);
    assert.equal(income(state, 'sales-1', november).payableFen, 20000);
    assert.throws(() => handlePayment(state, begin, november), { statusCode: 409 });
    closeSettlement(state, { period: '2026-11' }, december);
    assert.equal(dashboard(state, december).paymentQueue.reduce((sum, item) => sum + item.dueFen, 0), 20000);
    assert.equal(state.payments[0].paidFen, 11000);
});

test('银行确认未付款后允许新指令，实付回执全局唯一，晚到退款保留实付并显示多付', () => {
    const data = fixture();
    const first = funded(data);
    data.context.partnerId = 'sales-2';
    funded(data, october, 'second');
    closeSettlement(data.state, { period: '2026-10' }, november);
    const begin = { action: 'begin', period: '2026-10', partnerId: 'sales-1' };
    const failed = handlePayment(data.state, begin, november);
    handlePayment(data.state, {
        action: 'fail', id: failed.id, reason: '银行确认未付款',
    }, november);
    const replacement = handlePayment(data.state, begin, november);
    assert.notEqual(replacement.id, failed.id);
    handlePayment(data.state, {
        action: 'confirm', id: replacement.id, reference: 'outgoing-1', taxFen: 0,
    }, november);
    const second = handlePayment(data.state, { ...begin, partnerId: 'sales-2' }, november);
    assert.throws(() => handlePayment(data.state, {
        action: 'confirm', id: second.id, reference: 'outgoing-1', taxFen: 0,
    }, november), { statusCode: 409 });
    movement(data, first, 'refund', 20000, undefined, 'refund-1', november);
    assert.equal(income(data.state, 'sales-1', november).paidFen, 20000);
    assert.equal(income(data.state, 'sales-1', november).refundableBalanceFen, 8000);
});

test('相关来源的对账异议暂缓关账与付款，其他来源与既有记录仍按原账处理', () => {
    const data = fixture();
    const { state } = data;
    const first = funded(data, october, 'contested');
    const second = funded(data, october, 'clear');
    const dispute = { partnerId: 'sales-1', referenceType: 'order', referenceId: first.id, status: 'open' };
    state.disputes = [dispute];
    const closed = closeSettlement(state, { period: '2026-10' }, november);
    assert.deepEqual(closed.entries.map(entry => entry.sourceId), [second.id]);
    assert.equal(dashboard(state, november).paymentQueue[0].dueFen, 20000);
    assert.equal(income(state, 'sales-1', november).payableFen, 40000);
    dispute.status = 'resolved';
    const revised = closeSettlement(state, { period: '2026-11' }, december);
    assert.deepEqual(revised.entries.map(entry => entry.sourceId), [first.id]);

    state.disputes.push({ partnerId: 'sales-1', referenceType: 'settlement', referenceId: revised.id, status: 'open' });
    assert.deepEqual(dashboard(state, december).paymentQueue, [
        { partnerId: 'sales-1', period: '2026-10', dueFen: 20000 },
    ]);
    assert.throws(() => handlePayment(state, { action: 'begin', partnerId: 'sales-1', period: '2026-11' }, december),
        { statusCode: 409 });
    assert.deepEqual(revised.entries.map(entry => entry.sourceId), [first.id]);
});

test('核对中出现退款时提示重查，既成银行付款仍可按原回执补记', () => {
    const data = fixture();
    const { state } = data;
    const order = funded(data);
    closeSettlement(state, { period: '2026-10' }, november);
    const input = { action: 'begin', partnerId: 'sales-1', period: '2026-10' };
    const original = handlePayment(state, input, november);
    assert.deepEqual(dashboard(state, november).paymentRechecks, []);
    movement(data, order, 'refund', 20000, undefined, 'refund-after-instruction', november);
    assert.deepEqual(dashboard(state, november).paymentRechecks, [{ id: original.id, currentDueFen: 12000 }]);
    const retried = handlePayment(state, input, november);
    assert.equal(retried.id, original.id);
    assert.equal(retried.grossFen, 20000);
    assert.equal(retried.currentDueFen, 12000);
    assert.equal(handlePayment(state, {
        action: 'confirm', id: original.id, reference: 'verified-historical-outgoing', taxFen: 0,
    }, november).paidFen, 20000);
    assert.equal(income(state, 'sales-1', november).refundableBalanceFen, 8000);
    assert.deepEqual(dashboard(state, november).paymentRechecks, []);
});

test('首次足额之后、成熟之前的退款会打断收款资格，才能按重新足额的日期成熟', () => {
    const data = fixture();
    const { state } = data;
    const order = sign(data, draft(data));
    movement(data, order, 'receipt', 100000, undefined, 'first-full');
    movement(data, order, 'cost', 0, undefined, 'verified-zero');
    movement(data, order, 'refund', 90000, undefined, 'refund-before-delivery');
    const delivered = deliver(data, order);
    assert.equal(delivered.summary.netFen, 10000);
    assert.equal(delivered.summary.earnedFen, 0);
    assert.equal(closeSettlement(state, { period: '2026-10' }, november).entries.length, 0);
    const restored = movement(data, order, 'receipt', 90000, undefined, 'first-topup', november);
    assert.equal(restored.summary.earnedFen, 40000);
    assert.equal(restored.lines[0].maturity, Date.parse(november));

    const second = funded(data, november, 'deliver-before-refund');
    const afterDelivery = movement(data, second, 'refund', 10000, undefined, 'same-time-after-delivery', november);
    assert.equal(afterDelivery.summary.earnedFen, 16000);

    data.policy.maturityDays = 2;
    const third = funded(data, november, 'waits-two-days');
    const firstDay = '2026-11-08T00:00:00.000Z';
    const later = '2026-11-10T00:00:00.000Z';
    movement(data, third, 'refund', 10000, undefined, 'refund-during-window', firstDay);
    assert.equal(orderView(getOrder(state, third.id), later).summary.earnedFen, 0);
    movement(data, third, 'receipt', 10000, undefined, 'restore-during-window', later);
    assert.equal(orderView(getOrder(state, third.id), later).summary.earnedFen, 0);
    assert.equal(orderView(getOrder(state, third.id), '2026-11-12T00:00:00.000Z').summary.earnedFen, 20000);
});

test('同月来源先后提出异议时，已付金额只扣已结算的实际来源', () => {
    const data = fixture();
    const { state } = data;
    const first = funded(data, october, 'first-source');
    const second = funded(data, october, 'second-source');
    const settlement = closeSettlement(state, { period: '2026-10' }, november);
    state.disputes = [{
        partnerId: 'sales-1', referenceType: 'order', referenceId: first.id, status: 'open',
    }];
    const begin = { action: 'begin', partnerId: 'sales-1', period: '2026-10' };
    const secondPayment = handlePayment(state, begin, november);
    assert.equal(secondPayment.grossFen, 20000);
    handlePayment(state, {
        action: 'confirm', id: secondPayment.id, reference: 'paid-out-second', taxFen: 0,
    }, november);
    state.disputes[0].status = 'resolved';
    state.disputes.push({ partnerId: 'sales-1', referenceType: 'order', referenceId: second.id, status: 'open' });
    assert.deepEqual(dashboard(state, november).paymentQueue, [
        { partnerId: 'sales-1', period: '2026-10', dueFen: 20000 },
    ]);
    assert.deepEqual(secondPayment.allocations, [{
        settlementId: settlement.id, sourceType: 'order', sourceId: second.id,
        lineId: second.lines[0].id, amountFen: 20000,
    }]);
    const firstPayment = handlePayment(state, begin, november);
    assert.equal(firstPayment.grossFen, 20000);
    assert.deepEqual(firstPayment.allocations, [{
        settlementId: settlement.id, sourceType: 'order', sourceId: first.id,
        lineId: first.lines[0].id, amountFen: 20000,
    }]);
    assert.equal(dashboard(state, november).paymentQueue.length, 0);
});

test('核对中的款项仅验证其原来源，现有总额相同也要检查来源变动', () => {
    const data = fixture();
    const { state } = data;
    const first = funded(data, october, 'available-first');
    const second = funded(data, october, 'blocked-first');
    closeSettlement(state, { period: '2026-10' }, november);
    state.disputes = [{ partnerId: 'sales-1', referenceType: 'order', referenceId: second.id, status: 'open' }];
    const begin = { action: 'begin', partnerId: 'sales-1', period: '2026-10' };
    const payment = handlePayment(state, begin, november);
    assert.equal(payment.grossFen, 20000);
    state.disputes[0].status = 'resolved';
    state.disputes.push({ partnerId: 'sales-1', referenceType: 'order', referenceId: first.id, status: 'open' });
    assert.deepEqual(dashboard(state, november).paymentRechecks, [{ id: payment.id, currentDueFen: 0 }]);
    handlePayment(state, { action: 'fail', id: payment.id, reason: '银行确认未付款' }, november);
    const replacement = handlePayment(state, begin, november);
    assert.equal(replacement.grossFen, 20000);
    assert.equal(replacement.allocations[0].sourceId, second.id);
});

test('缺少来源分摊的既有付款继续按原账期保守扣减', () => {
    const data = fixture();
    const { state } = data;
    funded(data);
    closeSettlement(state, { period: '2026-10' }, november);
    state.payments.push({
        id: 'legacy-payment', partnerId: 'sales-1', period: '2026-10', status: 'paid',
        grossFen: 5000, taxFen: 0, paidFen: 5000, reference: 'legacy',
    });
    const payment = handlePayment(state, { action: 'begin', partnerId: 'sales-1', period: '2026-10' }, november);
    assert.equal(payment.grossFen, 15000);
    assert.equal(payment.allocations[0].amountFen, 15000);
    assert.equal(state.payments[0].allocations, undefined);
});

test('已签合同凭证只能锁定一次，取消后保留原凭证并防止重复计提', () => {
    const data = fixture();
    const first = sign(data, draft(data), october, 'CONTRACT-2026-001');
    changeOrderStatus(data.state, { id: first.id, state: 'cancelled' }, {}, october);
    const second = draft(data);
    assert.throws(() => sign(data, second, october, ' contract-2026-001 '), { statusCode: 409 });
    assert.equal(getOrder(data.state, second.id).state, 'draft');
    assert.equal(getOrder(data.state, first.id).contractRef, 'CONTRACT-2026-001');
});

test('已付订单的后续退款仍抵减同一伙伴的其他来源可付余额', () => {
    const data = fixture();
    const { state } = data;
    const first = funded(data, october, 'paid-then-refunded');
    const second = funded(data, october, 'clear-when-refunded');
    closeSettlement(state, { period: '2026-10' }, november);
    state.disputes = [{ partnerId: 'sales-1', referenceType: 'order', referenceId: second.id, status: 'open' }];
    const begin = { action: 'begin', partnerId: 'sales-1', period: '2026-10' };
    const firstPayment = handlePayment(state, begin, november);
    handlePayment(state, { action: 'confirm', id: firstPayment.id, reference: 'original-sent' }, november);
    state.disputes[0].status = 'resolved';
    movement(data, first, 'refund', 20000, undefined, 'part-refund', november);
    const secondPayment = handlePayment(state, begin, november);
    assert.equal(secondPayment.grossFen, 12000);
    assert.equal(secondPayment.allocations[0].sourceId, second.id);
    assert.equal(firstPayment.grossFen, 20000);
});

function closeThreeMonthsAfterFullRefund({ paidBeforeRefund = false } = {}) {
    const data = fixture();
    const { state } = data;
    const order = sign(data, draft(data, [{ productId: data.product.id, quotedFen: 10000 }]));
    movement(data, order, 'receipt', 10000, undefined, 'october-receipt');
    movement(data, order, 'cost', 2500, undefined, 'direct-cost');
    deliver(data, order);
    const first = closeSettlement(state, { period: '2026-10' }, november);

    let paid;
    if (paidBeforeRefund) {
        movement(data, order, 'refund', 2500, undefined, 'november-part-refund', november);
        const instruction = handlePayment(state, { action: 'begin', partnerId: 'sales-1', period: '2026-10' }, november);
        paid = handlePayment(state, { action: 'confirm', id: instruction.id, reference: 'confirmed-october' }, november);
    }
    movement(data, order, 'refund', paidBeforeRefund ? 7500 : 10000, undefined, 'november-final-refund', november);
    const correction = closeSettlement(state, { period: '2026-11' }, december);
    assert.equal(dashboard(state, december).paymentQueue.length, 0);
    movement(data, order, 'receipt', 10000, undefined, 'december-new-receipt', december);
    const recovery = closeSettlement(state, { period: '2026-12' }, january);
    assert.deepEqual([first, correction, recovery].map(batch => batch.entries[0].amountFen), [3000, -3000, 3000]);
    return { state, first, recovery, paid };
}

test('全额冲正后的恢复付款属于新的结算月，已冲销月份不再生成指令', () => {
    const { state, recovery } = closeThreeMonthsAfterFullRefund();
    assert.deepEqual(dashboard(state, january).paymentQueue, [
        { partnerId: 'sales-1', period: '2026-12', dueFen: 3000 },
    ]);
    const input = { action: 'begin', partnerId: 'sales-1', period: '2026-10' };
    assert.throws(() => handlePayment(state, input, january), { statusCode: 409 });
    const payment = handlePayment(state, { ...input, period: '2026-12' }, january);
    assert.equal(payment.allocations[0].settlementId, recovery.id);
    assert.equal(payment.allocations[0].amountFen, 3000);
});

test('恢复月份扣除历史已付实款，旧批次、银行凭证和分摊保留', () => {
    const { state, first, recovery, paid } = closeThreeMonthsAfterFullRefund({ paidBeforeRefund: true });
    assert.deepEqual(dashboard(state, january).paymentQueue, [
        { partnerId: 'sales-1', period: '2026-12', dueFen: 1000 },
    ]);
    assert.equal(paid.allocations[0].settlementId, first.id);
    assert.equal(paid.grossFen, 2000);
    assert.equal(paid.reference, 'confirmed-october');
    const payment = handlePayment(state, { action: 'begin', partnerId: 'sales-1', period: '2026-12' }, january);
    assert.equal(payment.allocations[0].settlementId, recovery.id);
    assert.equal(payment.allocations[0].amountFen, 1000);
    assert.equal(income(state, 'sales-1', january).paidFen, 2000);
});

test('收款、退款和实付回执共用规范化银行流水，双向拦住重复入账', () => {
    const data = fixture();
    const { state } = data;
    const order = funded(data);
    movement(data, order, 'refund', 2500, undefined, 'refund-ticket', october);
    closeSettlement(state, { period: '2026-10' }, november);
    const payment = handlePayment(state, { action: 'begin', partnerId: 'sales-1', period: '2026-10' }, november);
    const confirm = reference => handlePayment(state, { action: 'confirm', id: payment.id, reference }, november);
    assert.throws(() => confirm('ＦＩＲＳＴ－ＲＥＣＥＩＰＴ'), { statusCode: 409 });
    assert.throws(() => confirm('REFUND-TICKET'), { statusCode: 409 });
    assert.equal(payment.status, 'reconciling');
    const paid = confirm('PAYOUT-TICKET');
    assert.equal(confirm('ｐａｙｏｕｔ－ｔｉｃｋｅｔ').id, paid.id);
    assert.throws(() => movement(data, order, 'receipt', 2500, undefined, 'payout-ticket', november), { statusCode: 409 });
    assert.throws(() => movement(data, order, 'refund', 2500, undefined, 'ＰＡＹＯＵＴ－ＴＩＣＫＥＴ', november), { statusCode: 409 });
    movement(data, order, 'refund', 2500, undefined, 'ＲＥＦＵＮＤ－ＴＩＣＫＥＴ', november);
    assert.equal(getOrder(state, order.id).movements.length, 3);
});

test('成本票据单独编号，可以与银行流水同号', () => {
    const data = fixture();
    const { state } = data;
    const order = sign(data, draft(data));
    movement(data, order, 'receipt', 100000, undefined, 'SAME-001');
    movement(data, order, 'cost', 50000, undefined, 'ｓａｍｅ－００１');
    movement(data, order, 'cost', 50000, undefined, 'SAME-001');
    assert.equal(getOrder(state, order.id).movements.length, 2);
    movement(data, order, 'cost_recovery', 10000, undefined, 'OUT-001');
    deliver(data, order);
    closeSettlement(state, { period: '2026-10' }, november);
    const payment = handlePayment(state, { action: 'begin', partnerId: 'sales-1', period: '2026-10' }, november);
    const paid = handlePayment(state, { action: 'confirm', id: payment.id, reference: 'ｏｕｔ－００１' }, november);
    assert.equal(paid.grossFen, 24000);
});
