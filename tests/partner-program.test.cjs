const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const owner = { role: 'owner', userId: 'owner' };
const actors = ['first', 'second', 'third'].map(userId => ({ role: 'sales', userId, displayName: userId }));
const [first, second, third] = actors;

async function fixture(t) {
    const { createPartnerProgram } = require('../lib/partner-program');
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wascell-partner-program-'));
    t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
    const accounts = actors.map(({ userId, displayName }) => ({ id: userId, displayName, username: userId, active: true }));
    const customers = new Map([
        ['client-a', { id: 'client-a', name: '客户甲', assignedSalesId: first.userId }],
        ['client-b', { id: 'client-b', name: '客户乙', assignedSalesId: second.userId }],
    ]);
    let now = new Date('2026-09-08T08:00:00.000Z');
    const options = {
        dataDir,
        listAccounts: async () => accounts,
        getCustomer: async id => customers.get(id),
        getCustomers: async ids => new Map(ids.filter(id => customers.has(id)).map(id => [id, customers.get(id)])),
        now: () => now,
    };
    const program = createPartnerProgram(options);
    return {
        program, customers, reopen: () => createPartnerProgram(options),
        setDate: date => { now = new Date(date); },
        asOwner: (action, input) => program.command(owner, action, input),
        asSales: (actor, action, input) => program.command(actor, action, input),
    };
}

async function activate(f, changes = {}) {
    const { policy } = await f.program.ownerView(owner);
    return f.asOwner('policy', { ...policy, enabled: true, maturityDays: 0, mentorMinCustomers: 0, reason: '测试规则', ...changes });
}

const validProduct = {
    kind: 'non_medical', active: true, name: '独立行政服务测试项', approvalRef: '测试核验',
    forecastContributionFen: 100000, maxRateBps: 10000, maxCommissionFen: null, minRetainedFen: 0, reason: '测试品项',
};

const cert = id => ({ id, status: 'certified', contractRef: 'COOP-' + id, reason: '已确认独立合作' });

test('policy starts disabled, requires platform majority, persists editable versions, and stays private', async t => {
    const f = await fixture(t);
    const initially = await f.program.ownerView(owner);
    assert.equal(initially.policy.enabled, false);
    assert.deepEqual(initially.products, []);
    await assert.rejects(f.program.ownerView(first), { statusCode: 403 });
    await assert.rejects(activate(f, { minPlatformBps: 5000 }), { statusCode: 400 });
    const one = await activate(f, { mentorCapacity: 3, maxForecastCustomers: 12 });
    const two = await activate(f, { mentorCapacity: 4, maxForecastCustomers: 15 });
    assert.notEqual(one.id, two.id);
    const saved = await f.reopen().ownerView(owner);
    assert.equal(saved.policy.mentorCapacity, 4);
    assert.equal(saved.policies[0].maxForecastCustomers, 12);
    const sales = await f.program.salesView(first);
    assert.equal(sales.policy.maxForecastCustomers, 15);
    assert.equal('minPlatformBps' in sales.policy, false);
    assert.equal('accounts' in sales, false);
    await assert.rejects(f.asSales(first, 'policy', { enabled: true }), { statusCode: 403 });
});

test('all certified partners can refer and apply to teach, candidate count changes only coaching capacity', async t => {
    const f = await fixture(t);
    await activate(f, { mentorCapacity: 2 });
    const product = await f.asOwner('product', validProduct);
    await assert.rejects(f.asSales(first, 'referral', { name: '未认证候选', contact: 'test-a', consent: true }), { statusCode: 403 });
    for (const actor of actors) await f.asOwner('partner', cert(actor.userId));
    await f.asSales(first, 'mentor-request', { evidence: '提供演练和课程样本' });
    await f.asOwner('partner', { id: first.userId, mentorStatus: 'approved', reason: '审核通过' });
    await f.asOwner('mentorship', { mentorId: first.userId, traineeId: second.userId, scope: '报价演练', reason: '独立委派' });
    const candidate = await f.asSales(second, 'referral', { name: '候选伙伴', contact: 'sensitive-ref-contact', consent: true, note: '同意提交' });
    assert.equal(candidate.status, 'pending');
    await f.asSales(second, 'mentor-request', { evidence: '已完成脱敏复盘' });
    await f.asOwner('partner', { id: second.userId, mentorStatus: 'approved', reason: '审核通过' });
    await f.asOwner('mentorship', { mentorId: second.userId, traineeId: third.userId, scope: '流程演练', reason: '独立委派' });
    await assert.rejects(f.asOwner('mentorship', { mentorId: second.userId, traineeId: first.userId, scope: '重复环路', reason: '测试' }), { statusCode: 409 });

    const input = { productId: product.id, customers: 2, projectIds: [] };
    const original = await f.asSales(second, 'preview', { ...input, referrals: 0 });
    const extra = await f.asSales(second, 'preview', { ...input, referrals: 4 });
    assert.equal(extra.salesFen, 60000);
    assert.equal(extra.totalFen, original.totalFen);
    assert.equal(extra.referrals, 4);
    assert.equal(extra.slotsRemaining, 1);

    const sales = await f.program.salesView(second);
    assert.equal(sales.referrals[0].name, '候选伙伴');
    assert.equal('contact' in sales.referrals[0], false);
    assert.equal((await f.program.salesView(third)).referrals.length, 0);
    assert.equal((await f.program.ownerView(owner)).referrals[0].contact, 'sensitive-ref-contact');
    assert.deepEqual(sales.income, (await f.program.salesView(third)).income);
});

test('future work can be paused and restored while personal order history and earnings stay readable', async t => {
    const f = await fixture(t);
    await activate(f, { remediationDays: 5 });
    const product = await f.asOwner('product', validProduct);
    await f.asOwner('partner', cert(first.userId));
    await f.asOwner('partner', cert(second.userId));
    const sold = await f.asSales(first, 'order', { customerId: 'client-a', lines: [{ productId: product.id, quotedFen: 100000 }] });
    await f.asOwner('order-status', { id: sold.id, state: 'signed', contractRef: 'SIGNED-100', reason: '归因核对' });
    await f.asOwner('movement', {
        id: sold.id, type: 'receipt', reference: 'RCPT-100', amountFen: 100000,
        allocations: [{ lineId: sold.lines[0].id, amountFen: 100000, taxFen: 0, passThroughFen: 0 }], reason: '对账',
    });
    await f.asOwner('movement', { id: sold.id, type: 'cost', reference: 'COST-100', amountFen: 0, allocations: [{ lineId: sold.lines[0].id, amountFen: 0 }], reason: '核验无直接成本' });
    await f.asOwner('order-status', { id: sold.id, state: 'delivered', reason: '确认交付成本' });
    const paused = await f.asOwner('quality', { id: first.userId, qualityStatus: 'paused', reason: '补齐沟通记录' });
    assert.equal(paused.reviewAt.slice(0, 10), '2026-09-13');
    await assert.rejects(f.asSales(first, 'referral', { name: '暂停', contact: 'paused-test', consent: true }), { statusCode: 403 });
    f.customers.get('client-a').assignedSalesId = second.userId;
    const sales = await f.program.salesView(first);
    assert.equal(sales.income.payableFen, 30000);
    assert.equal(sales.orders[0].customerName, '已交接客户');
    assert.equal('movements' in sales.orders[0], false);
    assert.equal((await f.program.salesView(second)).orders.length, 0);
    await assert.rejects(f.asSales(first, 'dispute', { referenceType: 'order', referenceId: 'nonexistent', reason: '测试' }), { statusCode: 404 });
    await f.asOwner('quality', { id: first.userId, qualityStatus: 'clear', reason: '通过复审' });
    assert.equal((await f.program.salesView(first)).profile.qualityStatus, 'clear');
    const restored = await f.asSales(first, 'referral', { name: '已恢复', contact: 'restored-test', consent: true });
    assert.equal(restored.status, 'pending');
});

test('payment projects share budget above the platform floor and retain approved fixed fees', async t => {
    const f = await fixture(t);
    await activate(f, { minPlatformBps: 5500, projectShareBps: 2000 });
    const product = await f.asOwner('product', validProduct);
    await f.asOwner('partner', cert(first.userId));
    const template = await f.asOwner('template', {
        name: '区域演练', category: 'regional', feeFen: 10000, deliverable: '活动合规执行及复盘', active: true, requiresMentor: false, reason: '试点',
    });
    await assert.rejects(f.asOwner('project', { templateId: template.id, scope: '无预算时拒绝', partnerId: first.userId, reason: '测试' }), { statusCode: 409 });
    const order = await f.asOwner('order', { customerId: 'client-a', partnerId: first.userId, lines: [{ productId: product.id, quotedFen: 100000 }] });
    await f.asOwner('order-status', { id: order.id, state: 'signed', contractRef: 'P-BUDGET', reason: '核对归因' });
    await f.asOwner('movement', { id: order.id, type: 'receipt', reference: 'FS-BUDGET', amountFen: 100000, allocations: [{ lineId: order.lines[0].id, amountFen: 100000 }], reason: '核销' });
    await f.asOwner('movement', { id: order.id, type: 'cost', reference: 'COST-BUDGET', amountFen: 0, allocations: [{ lineId: order.lines[0].id, amountFen: 0 }], reason: '核验无直接成本' });
    await f.asOwner('order-status', { id: order.id, state: 'delivered', reason: '履约及成本核对' });
    const project = await f.asOwner('project', { templateId: template.id, scope: '独立实际运营', reason: '测试项目' });
    const preview = await f.asSales(first, 'preview', { customers: 0, referrals: 0, projectIds: [project.id] });
    assert.equal(preview.projectFen, 10000);
    await f.asSales(first, 'project-apply', { id: project.id, note: '申请' });
    await f.asOwner('project', { id: project.id, action: 'assign', partnerId: first.userId, reason: '审批' });
    await f.asSales(first, 'project-submit', { id: project.id, submission: '标准资料和运营结果' });
    await f.asOwner('project', { id: project.id, action: 'accept', reason: '按合同验收' });
    const view = await f.program.ownerView(owner);
    assert.equal(view.dashboard.projectAcceptedFen, 10000);
    assert.equal(view.dashboard.projectAvailableFen, 4000);
    assert.equal(view.dashboard.platformRetainedFen, 60000);
    assert.equal((await f.program.salesView(first)).income.payableFen, 40000);
});

test('a returned application can reopen without showing its private decision to other partners', async t => {
    const f = await fixture(t);
    await activate(f);
    await f.asOwner('partner', cert(first.userId));
    await f.asOwner('partner', cert(second.userId));
    const product = await f.asOwner('product', validProduct);
    const order = await f.asOwner('order', { customerId: 'client-a', partnerId: first.userId, lines: [{ productId: product.id, quotedFen: 200000 }] });
    await f.asOwner('order-status', { id: order.id, state: 'signed', contractRef: 'COOP-PRIVACY', reason: '核对归因' });
    for (const [type, amountFen] of [['receipt', 200000], ['cost', 0]]) {
        await f.asOwner('movement', {
            id: order.id, type, reference: 'PROJECT-PRIVACY-' + type, amountFen,
            allocations: [{ lineId: order.lines[0].id, amountFen }], reason: '财务已核验',
        });
    }
    await f.asOwner('order-status', { id: order.id, state: 'delivered', reason: '完成交付' });
    const template = await f.asOwner('template', {
        name: '复盘', category: 'quality', feeFen: 1000, deliverable: '活动复盘', active: true, requiresMentor: false, reason: '新模板',
    });
    const project = await f.asOwner('project', { templateId: template.id, scope: '选一份公开复盘', reason: '发布项目' });
    await f.asSales(first, 'project-apply', { id: project.id, note: '本人私人申请材料' });
    await f.asOwner('project', { id: project.id, action: 'return', reason: '针对第一位申请人的处理意见' });
    const publicProjection = (await f.program.salesView(second)).projects.find(item => item.id === project.id);
    assert.equal(publicProjection.owned, false);
    assert.equal(publicProjection.reason, undefined);
    assert.equal(publicProjection.submission, undefined);
    assert.equal(publicProjection.scope, '选一份公开复盘');
    const newApplication = await f.asSales(second, 'project-apply', { id: project.id, note: '另一位伙伴的申请' });
    assert.equal(newApplication.reason, '');
    assert.equal(newApplication.submission, '');
});
