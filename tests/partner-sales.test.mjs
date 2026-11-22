import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const data = {
    profile: { status: 'certified', qualityStatus: 'clear', mentorStatus: 'none', tierIndex: 0,
        performance: { customers: 1, contributionFen: 150000 } },
    qualification: { tierName: '起步伙伴', rateBps: 3000, remainingCustomers: 1, remainingContributionFen: 50000,
        nextTier: { name: '成长伙伴', minCustomers: 2, minContributionFen: 200000 } },
    policy: { enabled: true, lookbackDays: 90, mentorCapacity: 2, maxForecastCustomers: 12, maxForecastProjects: 3 },
    products: [{ id: 'eligible', name: '协调服务', forecastContributionFen: 20000 }],
    income: { paidFen: 12000, payableFen: 48000, pendingFen: 27000, adjustmentFen: -2000 },
    projects: [{ id: 'work-1', name: '区域活动', feeFen: 90000, status: 'open', scope: '活动执行',
        deliverable: '脱敏执行报告' }],
};

test('sales entry adds the personal workspace and retains its existing customer and resource panels', async () => {
    const html = await readFile(new URL('../admin.html', import.meta.url), 'utf8');
    assert.match(html, /id="partnerView"/);
    assert.match(html, /data-view="overview"/);
    assert.match(html, /id="customersView"/);
    assert.match(html, /id="knowledgeView"/);
    assert.doesNotMatch(html, /admin-pro/);
});

test('personal overview labels settled cash, mature obligations and forecast independently', async () => {
    const { renderSalesView } = await import('../partner-sales.mjs');
    const html = renderSalesView('overview', data);
    assert.match(html, /累计已到账[\s\S]*?¥120\.00/);
    assert.match(html, /已赚未付[\s\S]*?¥480\.00/);
    assert.match(html, /待成熟估算[\s\S]*?¥270\.00/);
    assert.match(html, /增收试算/);
    assert.match(html, /距离成长伙伴/);
    assert.match(html, /max="12"/);
    assert.doesNotMatch(html, /¥900\.00[^<]*预计已赚/);
});

test('a forecast names revenue sources and displays candidate counts only in capacity feedback', async () => {
    const { renderPreviewResult, renderCapacityResult } = await import('../partner-sales.mjs');
    const result = {
        customers: 3, referrals: 7, salesFen: 19000, projectFen: 90000, totalFen: 109000,
        forecastContributionFen: 20000, rateBps: 3000, nextTierReached: true, slotsRemaining: 2,
    };
    const income = renderPreviewResult(result);
    assert.match(income, /¥1,090\.00/);
    assert.match(income, /本人订单[\s\S]*?¥190\.00/);
    assert.match(income, /项目验收[\s\S]*?¥900\.00/);
    assert.match(income, /复核后适用于新签订单/);
    assert.doesNotMatch(income, /候选|下线|推荐/);
    const capacity = renderCapacityResult(result);
    assert.match(capacity, /7 位候选人/);
    assert.match(capacity, /2 个带教名额/);
    assert.doesNotMatch(capacity, /[¥￥]/);
});

test('certified partners can recommend and request mentor approval regardless of commission tier', async () => {
    const { renderSalesView } = await import('../partner-sales.mjs');
    for (const tierIndex of [0, 1, 2]) {
        const html = renderSalesView('partnership', { ...data, profile: { ...data.profile, tierIndex } });
        assert.match(html, /data-action="referral"/);
        assert.match(html, /name="consent"[^>]*required/);
        assert.match(html, /data-action="mentor-request"/);
    }
    const paused = renderSalesView('partnership', {
        ...data, profile: { ...data.profile, qualityStatus: 'paused', qualityReason: '请先提交整改材料' },
    });
    assert.match(paused, /请先提交整改材料/);
    assert.doesNotMatch(paused, /data-action="referral"|data-action="mentor-request"/);
});

test('disabled policy and absent financial data display clear status without invented amounts', async () => {
    const { renderSalesView } = await import('../partner-sales.mjs');
    const html = renderSalesView('overview', { profile: { status: 'unverified' }, policy: { enabled: false } });
    assert.match(html, /合作计划尚未启用/);
    assert.doesNotMatch(html, /¥0\.00|30%|data-preview-input/);
});

test('order drafts parse exact fen and sales rendering avoids private movement details', async () => {
    const { renderSalesView, parseQuoteFen } = await import('../partner-sales.mjs');
    assert.equal(parseQuoteFen('15000.09'), 1500009);
    assert.equal(parseQuoteFen('0.01'), 1);
    assert.equal(parseQuoteFen('1e3'), null);
    assert.equal(parseQuoteFen('1.234'), null);
    assert.equal(parseQuoteFen('0'), null);

    const html = renderSalesView('orders', { ...data, orders: [{
        id: 'O-42', customerName: '客户<script>', state: 'signed',
        lines: [{ productName: '协调服务', quotedFen: 50000, snapshot: { minPlatformBps: 6500 } }],
        movements: [{ reference: 'ACCOUNT-PRIVATE-MOVEMENT' }],
        summary: { earnedFen: 3000, pendingFen: 2000, costFen: 12345 },
    }] }, { customers: [{ id: 'customer-1', name: '李顾问' }] });
    assert.match(html, /客户&lt;script&gt;/);
    assert.match(html, /data-action="order"/);
    assert.doesNotMatch(html, /ACCOUNT-PRIVATE-MOVEMENT|¥123\.45|6500|客户<script>/);
});

test('personal statements retain correction signs and permit case filing while paused', async () => {
    const { renderSalesView } = await import('../partner-sales.mjs');
    const html = renderSalesView('statements', {
        ...data, profile: { ...data.profile, qualityStatus: 'paused' },
        statements: [{ id: 'statement-1', period: '2026-10',
            entries: [{ sourceType: 'order', sourceId: 'order-1', amountFen: -2000 }],
            payments: [{ status: 'paid', paidFen: 14000, taxFen: 2000, reference: 'PAYMENT-PRIVATE' }] }],
    });
    assert.match(html, /2026-10/);
    assert.match(html, /-¥20\.00/);
    assert.match(html, /data-action="dispute"/);
    assert.doesNotMatch(html, /PAYMENT-PRIVATE/);
});

test('customer panel exposes an idempotent consented lead form and private follow-up actions', async () => {
    const html = await readFile(new URL('../admin.html', import.meta.url), 'utf8');
    const script = await readFile(new URL('../admin.mjs', import.meta.url), 'utf8');
    assert.match(html, /id="leadCreateForm"/);
    assert.match(html, /name="consent"[^>]*required/);
    assert.match(script, /requestId:\s*leadRequestId/);
    assert.match(script, /\/follow-up/);
    assert.match(script, /name="salesNote"/);
});

test('corrective pause preserves access to finishing assignments already entrusted to the partner', async () => {
    const { renderSalesView } = await import('../partner-sales.mjs');
    const paused = {
        ...data,
        profile: { ...data.profile, mentorStatus: 'approved', qualityStatus: 'paused' },
        projects: [...data.projects, { id: 'assigned-1', owned: true, status: 'assigned', name: '服务培训', feeFen: 9000 }],
        mentorships: [{ id: 'm1', status: 'active', viewerRole: 'mentor', progress: 'in_training', traineeName: '配对新人' }],
    };
    const projects = renderSalesView('projects', paused);
    assert.match(projects, /data-action="project-submit"/);
    assert.doesNotMatch(projects, /data-action="project-apply"/);
    const mentoring = renderSalesView('partnership', paused);
    assert.match(mentoring, /data-action="mentorship-progress"/);
    assert.doesNotMatch(mentoring, /data-action="referral"/);
});
