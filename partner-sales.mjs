const programRoute = '/api/sales/partner-program';
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeZone: 'Asia/Shanghai' });
const moneyFormat = new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency: 'CNY', currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const labels = {
    order: { draft: '待签约', signed: '已签约', delivered: '已交付', cancelled: '已取消' },
    referral: { pending: '待审核', reviewing: '审核中', approved: '已通过', closed: '已结束' },
    mentoring: { assigned: '待开始', in_training: '带教中', ready: '待复核', completed: '已完成', closed: '已结束' },
    project: { open: '可申请', applied: '申请待评估', assigned: '待交付', submitted: '待验收', accepted: '已验收', closed: '已结束' },
    category: { mentoring: '带教实训', quality: '服务质量', regional: '区域运营' },
    payment: { reconciling: '到账核对中', paid: '已到账', failed: '付款待处理' },
    source: { order: '业务订单', project: '运营项目', settlement: '结算账单' },
};

export const escapeHtml = (value = '') => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

const money = (fen) => Number.isSafeInteger(fen) ? moneyFormat.format(fen / 100) : '—';
const percent = (bps) => Number.isSafeInteger(bps) ? `${bps / 100}%` : '—';
const list = (value) => Array.isArray(value) ? value : [];
const checked = (condition) => condition ? ' checked' : '';
const selected = (condition) => condition ? ' selected' : '';
const count = (value) => Number.isSafeInteger(Number(value)) ? Math.max(0, Number(value)) : 0;
const boundedCount = (value, limit) => Math.min(count(value), count(limit));
const empty = (message, extra = '') => `<div class="ps-empty"><p>${escapeHtml(message)}</p>${extra}</div>`;
const chip = (label, tone = '') => `<span class="ps-chip ${tone ? 'ps-' + tone : ''}">${escapeHtml(label)}</span>`;
const date = (value) => {
    const time = new Date(value);
    return value && !Number.isNaN(time.getTime()) ? dateFormat.format(time) : '';
};

const canStart = (data) => data.policy?.enabled && data.profile?.status === 'certified' &&
    data.profile?.qualityStatus !== 'paused';

function limitation(data) {
    const profile = data.profile || {};
    if (profile.qualityStatus === 'paused' || profile.qualityStatus === 'review') {
        const title = profile.qualityStatus === 'paused' ? '新增业务权限暂停' : '需要整改复核';
        const due = date(profile.reviewAt);
        return `<aside class="ps-notice" aria-label="业务状态"><strong>${title}</strong>
            <p>${escapeHtml(profile.qualityReason || '请根据管理端的复核安排推进整改。')}${due ? ` <span>复核日期 ${due}</span>` : ''}</p>
        </aside>`;
    }
    if (!data.policy?.enabled) return `<aside class="ps-notice"><strong>合作计划尚未启用</strong><p>客户管理和销售答疑仍可使用。</p></aside>`;
    if (profile.status === 'suspended') return `<aside class="ps-notice"><strong>合作资格暂缓</strong><p>您可以查看已有记录和收益账单。</p></aside>`;
    if (profile.status !== 'certified') return `<aside class="ps-notice"><strong>合作资格待确认</strong><p>签约及资格确认后可创建订单、推荐候选人并申请带教。</p></aside>`;
    return '';
}

function incomeStrip(income = {}) {
    return `<dl class="ps-income">
        <div class="ps-income-primary"><dt>累计已到账</dt><dd>${money(income.paidFen)}</dd><span>付款确认后的实际到账金额</span></div>
        <div><dt>已赚未付 <small>税前</small></dt><dd>${money(income.payableFen)}</dd><span>已达到计提条件，待结算或付款</span></div>
        <div><dt>待成熟估算</dt><dd>${money(income.pendingFen)}</dd><span>待收款、交付、等待期或项目验收</span></div>
    </dl>`;
}

function progress(label, current, target, formatter) {
    if (!Number.isSafeInteger(target) || target <= 0) return '';
    const value = Number.isSafeInteger(current) ? Math.max(current, 0) : 0;
    return `<div class="ps-progress"><div><span>${label}</span><strong>${formatter(value)} / ${formatter(target)}</strong></div>
        <progress aria-label="${label}" max="${target}" value="${Math.min(value, target)}"></progress></div>`;
}

function qualification(data) {
    const current = data.qualification || {};
    const performance = data.profile?.performance || {};
    const next = current.nextTier;
    if (!data.policy?.enabled || data.profile?.status !== 'certified' || !current.tierName) return '';
    const gapCustomers = count(current.remainingCustomers);
    const gapContribution = count(current.remainingContributionFen);
    return `<section class="ps-card ps-qualification">
        <div class="ps-card-heading"><div><h2>我的佣金档位</h2><p>近 ${count(data.policy.lookbackDays)} 天的个人成熟客户与可计提贡献</p></div></div>
        <div class="ps-tier-current"><strong>${escapeHtml(current.tierName)}</strong><span>税前阶梯费率 ${percent(current.rateBps)}</span></div>
        ${next ? `<div class="ps-tier-next"><h3>距离${escapeHtml(next.name)}</h3>
            ${progress('成熟客户', performance.customers, next.minCustomers, (value) => `${value} 位`)}
            ${progress('可计提贡献', performance.contributionFen, next.minContributionFen, money)}
            <p>${gapCustomers || gapContribution ? `还差 ${gapCustomers} 位成熟客户、${money(gapContribution)} 可计提贡献。` : '已达到数量与贡献门槛，等待复核。'}</p>
        </div>` : '<p class="ps-muted">当前已在最高档位。</p>'}
        <small class="ps-muted">档位经复核后适用于新签订单。每笔佣金以该订单适用规则为准。</small>
    </section>`;
}

function availableProjects(data) {
    return list(data.projects).filter((project) => project.status === 'open' ||
        (project.owned && ['applied', 'assigned', 'submitted'].includes(project.status)));
}

function forecast(data, scenario) {
    if (!canStart(data)) return '';
    const products = list(data.products);
    const projects = availableProjects(data);
    if (!products.length && !projects.length) {
        return `<section class="ps-card"><h2>增收试算</h2>${empty('合格产品或可承接项目上线后，即可试算。')}</section>`;
    }
    const limit = count(data.policy.maxForecastCustomers);
    const projectLimit = count(data.policy.maxForecastProjects);
    const productId = products.some((item) => item.id === scenario.productId) ? scenario.productId : products[0]?.id;
    const product = products.find((item) => item.id === productId);
    const customers = product ? boundedCount(scenario.customers ?? 1, limit) : 0;
    const selectedIds = list(scenario.projectIds).filter((id) => projects.some((project) => project.id === id)).slice(0, projectLimit);
    return `<section class="ps-card ps-forecast">
        <div class="ps-card-heading"><div><h2>增收试算</h2><p>对比多完成几位客户或多交付一个项目的收益。</p></div></div>
        <form class="ps-form ps-scenario" data-preview-form="income">
            ${product ? `<label>试算产品<select name="productId" data-preview-input>
                ${products.map((item) => `<option value="${escapeHtml(item.id)}"${selected(item.id === productId)}>${escapeHtml(item.name)}</option>`).join('')}
            </select></label>
            <label for="psForecastCustomers">新增成熟客户</label>
            <div class="ps-stepper">
                <button type="button" data-step="-1" aria-label="减少一位客户">−</button>
                <input id="psForecastCustomers" data-preview-input name="customers" type="number" inputmode="numeric" min="0" max="${limit}" value="${customers}" required>
                <button type="button" data-step="1" aria-label="增加一位客户">+</button>
                <span>位</span>
            </div>` : '<p class="ps-muted">目前可试算已列出的项目费用。</p>'}
            ${projects.length && projectLimit ? `<fieldset class="ps-forecast-projects">
                <legend>加入预计验收的项目 <small>最多 ${projectLimit} 项</small></legend>
                ${projects.map((item) => `<label><input type="checkbox" name="projectId" value="${escapeHtml(item.id)}"
                    data-preview-input${checked(selectedIds.includes(item.id))}>
                    <span>${escapeHtml(item.name)} <small>${labels.project[item.status] || ''}</small></span><strong>${money(item.feeFen)}</strong></label>`).join('')}
            </fieldset>` : ''}
        </form>
        <div id="psPreviewOutput" class="ps-preview-output" aria-live="polite"><p class="ps-muted">正在准备试算…</p></div>
    </section>`;
}

export function renderPreviewResult(result, { includesPendingProject = false } = {}) {
    if (!result) return '<p class="ps-muted">正在按当前条件计算…</p>';
    const milestone = result.nextTierReached
        ? '本场景达到下一档门槛，档位复核后适用于新签订单。'
        : (count(result.remainingCustomers) || count(result.remainingContributionFen))
            ? `本场景距离下一档还差 ${count(result.remainingCustomers)} 位成熟客户、${money(result.remainingContributionFen)} 可计提贡献。`
            : '';
    return `<div class="ps-preview-lead"><span>预计新增收益 <small>税前试算</small></span><strong>${money(result.totalFen)}</strong></div>
        <dl class="ps-preview-breakdown"><div><dt>本人订单</dt><dd>${money(result.salesFen)}</dd></div>
        <div><dt>项目验收</dt><dd>${money(result.projectFen)}</dd></div></dl>
        ${result.customers > 0 ? `<p class="ps-muted">按每位 ${money(result.forecastContributionFen)} 可计提贡献和当前 ${percent(result.rateBps)} 档位试算，适用订单限额。</p>` : ''}
        ${milestone ? `<p class="ps-preview-next">${milestone}</p>` : ''}
        <small class="ps-muted">结算以实际订单达到计提条件及项目验收为准。</small>
        ${includesPendingProject ? '<p class="ps-muted">所选的待交付和待验收项目也列在账面的待成熟估算里。</p>' : ''}`;
}

function overview(data, { scenario = {} }) {
    return `<section aria-label="个人收益" class="ps-hero">
        <div class="ps-hero-heading"><h2>个人收益</h2><button class="ps-text-link" type="button" data-partner-view="statements">查看账单 <span aria-hidden="true">→</span></button></div>
        ${incomeStrip(data.income)}
    </section><div class="ps-overview-grid">${qualification(data)}${forecast(data, scenario)}</div>`;
}

function heading(title, description = '') {
    return `<div class="ps-card-heading"><div><h2>${title}</h2>${description ? `<p>${description}</p>` : ''}</div></div>`;
}

function formFeedback() {
    return '<p class="ps-form-feedback" data-form-feedback role="status"></p>';
}

function referralForm() {
    return `<details class="ps-action-panel"><summary>推荐候选人</summary>
        <form class="ps-form" data-action="referral">
            <div class="ps-two-fields">
                <label>候选人姓名<input name="name" required maxlength="100" autocomplete="off"></label>
                <label>联系方式<input name="contact" required maxlength="160" autocomplete="off"></label>
            </div>
            <label>推荐说明 <small>选填</small><textarea name="note" maxlength="500" rows="2"></textarea></label>
            <label class="ps-check"><input type="checkbox" name="consent" required>候选人已同意将上述信息提交给工作室进行合作审核。</label>
            ${formFeedback()}<button class="ps-button primary" type="submit">提交推荐</button>
        </form></details>`;
}

function mentorRequest() {
    return `<details class="ps-action-panel"><summary>申请带教资格</summary>
        <form class="ps-form" data-action="mentor-request">
            <label>带教经验与计划<textarea name="evidence" rows="4" maxlength="1000" required placeholder="简述您可带教的内容和所需支持"></textarea></label>
            ${formFeedback()}<button class="ps-button primary" type="submit">提交申请</button>
        </form></details>`;
}

function capacityForecast(data, activeCount, capacityValue) {
    if (!canStart(data)) return '';
    const limit = count(data.policy.maxForecastCustomers);
    if (!limit) return '';
    return `<form class="ps-form ps-capacity-form" data-preview-form="capacity">
        <label for="psCapacityCount">试算拟新增候选人</label>
        <div class="ps-stepper">
            <button type="button" data-step="-1" aria-label="减少一位候选人">−</button>
            <input id="psCapacityCount" data-preview-input name="referrals" type="number" inputmode="numeric"
                min="0" max="${limit}" value="${boundedCount(capacityValue ?? 1, limit)}" required>
            <button type="button" data-step="1" aria-label="增加一位候选人">+</button>
            <span>位</span>
        </div>
        <div id="psCapacityOutput" aria-live="polite"><p class="ps-muted">当前有 ${activeCount} 项带教进行中。</p></div>
    </form>`;
}

export function renderCapacityResult(result) {
    const candidates = count(result?.referrals);
    const slots = count(result?.slotsRemaining);
    const scheduled = Math.min(candidates, slots);
    const spill = Math.max(0, candidates - slots);
    return `<p class="ps-capacity-result">拟推荐 <strong>${candidates} 位候选人</strong>，当前有 <strong>${slots} 个带教名额</strong>。
        ${scheduled ? `其中最多 ${scheduled} 位可安排至本人。` : ''}
        ${spill ? `其余 ${spill} 位由工作室按资格和容量统筹。` : ''}</p>`;
}

function mentorshipCard(item) {
    const trainer = item.viewerRole === 'mentor';
    const stage = item.status === 'active' ? item.progress : item.status;
    return `<article class="ps-record">
        <div class="ps-record-heading"><div><h3>${escapeHtml(trainer ? item.traineeName : item.mentorName)}</h3>
            <p>${trainer ? '本人负责带教' : '我的带教人'}</p></div>${chip(labels.mentoring[stage] || '待确认', stage === 'completed' ? 'positive' : '')}</div>
        ${item.scope ? `<p>${escapeHtml(item.scope)}</p>` : ''}
        ${item.evidence ? `<p class="ps-note">${escapeHtml(item.evidence)}</p>` : ''}
        ${trainer && item.status === 'active' ? `<details class="ps-action-panel compact"><summary>记录带教进度</summary>
            <form class="ps-form" data-action="mentorship-progress">
                <input type="hidden" name="id" value="${escapeHtml(item.id)}">
                <label>进度<select name="progress"><option value="in_training"${selected(item.progress === 'in_training')}>带教中</option>
                    <option value="ready"${selected(item.progress === 'ready')}>完成带教，提交复核</option></select></label>
                <label>带教记录<textarea name="evidence" maxlength="1800" rows="3" placeholder="提交复核时填写脱敏的带教成果"></textarea></label>
                ${formFeedback()}<button class="ps-button primary" type="submit">保存进度</button>
            </form></details>` : ''}
    </article>`;
}

function partnership(data, { capacityValue }) {
    const allowed = canStart(data);
    const mentors = list(data.mentorships);
    const referrals = list(data.referrals);
    const activeCount = mentors.filter((item) => item.viewerRole === 'mentor' && item.status === 'active').length;
    const approval = data.profile?.mentorStatus;
    const max = approval === 'approved' ? count(data.policy?.mentorCapacity) : 0;
    const mentorState = { approved: '带教资格已确认', requested: '带教资格复核中' }[approval] || '可申请带教资格';
    return `<div class="ps-work-grid">
        <section class="ps-card">${heading('候选推荐', '工作室负责核对资格并安排培养。')}
            ${allowed ? referralForm() : ''}
            <div class="ps-records">${referrals.length ? referrals.map((item) => `<article class="ps-record">
                <div class="ps-record-heading"><div><h3>${escapeHtml(item.name)}</h3><p>${date(item.createdAt)}</p></div>
                ${chip(labels.referral[item.status] || '待确认', item.status === 'approved' ? 'positive' : '')}</div>
                ${item.reviewNote ? `<p class="ps-note">${escapeHtml(item.reviewNote)}</p>` : ''}</article>`).join('')
                : empty('暂未提交候选推荐。')}</div>
        </section>
        <section class="ps-card">
            ${heading('带教资格与任务')}
            <div class="ps-capacity-stat"><strong>${mentorState}</strong>${approval === 'approved' ? `<span>${activeCount} / ${max} 位在训</span>` : ''}</div>
            ${allowed && (approval === 'none' || !approval) ? `
                ${(count(data.policy.mentorMinCustomers) || count(data.policy.mentorMinContributionFen)) ? `<p class="ps-muted">资格参考 ${count(data.policy.mentorMinCustomers)} 位成熟客户及 ${money(count(data.policy.mentorMinContributionFen))} 个人可计提贡献。</p>` : ''}
                ${mentorRequest()}` : ''}
            ${capacityForecast(data, activeCount, capacityValue)}
            <div class="ps-records">${mentors.length ? mentors.map((item) => mentorshipCard(item)).join('') : empty('暂无已分配的带教任务。')}</div>
        </section>
    </div>`;
}

function disputeForm(type, id) {
    if (!id) return '';
    return `<details class="ps-action-panel compact"><summary>提出异议</summary>
        <form class="ps-form" data-action="dispute">
            <input type="hidden" name="referenceType" value="${type}">
            <input type="hidden" name="referenceId" value="${escapeHtml(id)}">
            <label>需要复核的事项<textarea name="reason" rows="3" maxlength="400" required></textarea></label>
            ${formFeedback()}<button class="ps-button primary" type="submit">提交异议</button>
        </form></details>`;
}

function projectForm(id, apply) {
    return `<details class="ps-action-panel compact"><summary>${apply ? '申请项目' : '提交交付'}</summary>
        <form class="ps-form" data-action="${apply ? 'project-apply' : 'project-submit'}">
            <input type="hidden" name="id" value="${escapeHtml(id)}">
            <label>${apply ? '承接说明 <small>选填</small>' : '交付说明与成果索引'}
                <textarea name="${apply ? 'note' : 'submission'}" rows="3" maxlength="2000"${apply ? '' : ' required'}></textarea>
            </label>
            ${formFeedback()}<button class="ps-button primary" type="submit">${apply ? '提交申请' : '提交验收'} </button>
        </form></details>`;
}

function projects(data) {
    return `<section class="ps-card">${heading('项目列表', '承接已定义的项目，提交约定的交付物后由工作室验收。')}
        <div class="ps-projects">${list(data.projects).map((item) => `<article class="ps-record ps-project">
            <div class="ps-record-heading"><div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(labels.category[item.category] || '运营项目')}</p></div>
            ${chip(labels.project[item.status] || '待确认', item.status === 'accepted' ? 'positive' : '')}</div>
            <div class="ps-project-fee"><span>验收后报酬 <small>税前</small></span><strong>${money(item.feeFen)}</strong></div>
            ${item.scope ? `<p>${escapeHtml(item.scope)}</p>` : ''}
            ${item.deliverable ? `<p class="ps-note"><strong>交付物</strong> ${escapeHtml(item.deliverable)}</p>` : ''}
            ${item.submission && item.owned ? `<p class="ps-note"><strong>本人提交</strong> ${escapeHtml(item.submission)}</p>` : ''}
            ${item.reason && item.owned ? `<p class="ps-note">${escapeHtml(item.reason)}</p>` : ''}
            ${canStart(data) && item.status === 'open' ? projectForm(item.id, true) : ''}
            ${item.owned && item.status === 'assigned' ? projectForm(item.id, false) : ''}
            ${item.owned ? disputeForm('project', item.id) : ''}
        </article>`).join('') || empty('暂无本人可承接或已分配的运营项目。')}</div>
    </section>`;
}

function customerOptions(customers, prefill = '') {
    return `<option value="">请选择已分配客户</option>${customers.map((customer) =>
        `<option value="${escapeHtml(customer.id)}"${selected(customer.id === prefill)}>${escapeHtml(customer.name)}</option>`).join('')}`;
}

function orderLine(products) {
    return `<div class="ps-order-line">
        <label>产品<select name="lineProduct" required><option value="">请选择</option>
            ${products.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}
        </select></label>
        <label>拟报价（元）<input name="lineQuote" type="text" inputmode="decimal" maxlength="13"
            pattern="[0-9]+([.][0-9]{1,2})?" required placeholder="0.00"></label>
        <button class="ps-text-link ps-line-remove" type="button" data-remove-line hidden>删除</button>
    </div>`;
}

function orderForm(data, { customers = [], customersError = '', prefillCustomer = '' }) {
    if (!canStart(data)) return '';
    if (!list(data.products).length) return empty('暂无可用于建单的合格产品。');
    return `<details class="ps-action-panel"${prefillCustomer ? ' open' : ''}><summary>创建订单草稿</summary>
        <form class="ps-form" data-action="order">
            <div class="ps-two-fields">
                <label>查找已分配客户<input type="search" data-order-customer-search placeholder="输入姓名或联系方式"></label>
                <label>关联客户<select id="psOrderCustomer" name="customerId" required>${customerOptions(customers, prefillCustomer)}</select></label>
            </div>
            <p class="ps-muted ps-customer-feedback" data-customer-feedback aria-live="polite">${escapeHtml(customersError)}</p>
            <div data-order-lines class="ps-order-lines">${orderLine(data.products)}</div>
            <button class="ps-text-link align-start" type="button" data-add-line>＋ 添加产品</button>
            <label>业务备注 <small>选填</small><textarea name="note" rows="3" maxlength="1000" placeholder="记录报价范围或需要审核的事项"></textarea></label>
            ${formFeedback()}<button class="ps-button primary" type="submit">提交订单草稿</button>
        </form>
    </details>`;
}

function orders(data, options) {
    const items = list(data.orders);
    return `<section class="ps-card">${heading('订单记录', '提交本人负责的订单草稿，后续由工作室核对合同和付款。')}
        ${orderForm(data, options)}
        <div class="ps-records">${items.length ? items.map((order) => `<article class="ps-record">
            <div class="ps-record-heading"><div><h3>${escapeHtml(order.customerName || '客户订单')}</h3><p>${escapeHtml(order.id)}</p></div>
            ${chip(labels.order[order.state] || '待确认', order.state === 'delivered' ? 'positive' : '')}</div>
            <dl class="ps-ledger-lines">${list(order.lines).map((line) => `<div><dt>${escapeHtml(line.productName)}</dt><dd>${money(line.quotedFen)}</dd></div>`).join('')}</dl>
            ${order.state === 'delivered' || order.state === 'signed' ? `<dl class="ps-ledger-lines">
                <div><dt>成熟佣金 <small>税前</small></dt><dd>${money(order.summary?.earnedFen)}</dd></div>
                <div><dt>待成熟估算</dt><dd>${money(order.summary?.pendingFen)}</dd></div></dl>` : ''}
            ${disputeForm('order', order.id)}
        </article>`).join('') : empty('暂无本人订单。')}</div>
    </section>`;
}

function statementCard(statement) {
    return `<article class="ps-record">
        <div class="ps-record-heading"><div><h3>${escapeHtml(statement.period)} 结算账单</h3>
            <p>${date(statement.lockedAt) ? `关账日期 ${date(statement.lockedAt)}` : ''}</p></div>${chip('已关账')}</div>
        <dl class="ps-ledger-lines">${list(statement.entries).map((entry) => `<div><dt>${escapeHtml(labels.source[entry.sourceType] || '结算项目')}
            ${entry.amountFen < 0 ? ' · 冲正' : ''} <small>${escapeHtml(entry.sourceId)}</small></dt><dd>${money(entry.amountFen)}</dd></div>`).join('')}</dl>
        ${list(statement.payments).length ? `<dl class="ps-ledger-lines ps-payment-lines">${statement.payments.map((payment) =>
            `<div><dt>${labels.payment[payment.status] || '付款记录'}${payment.status === 'paid' ? ` <small>已扣缴 ${money(payment.taxFen)}</small>` : ''}</dt>
            <dd>${money(payment.status === 'paid' ? payment.paidFen : payment.grossFen)}</dd></div>`).join('')}</dl>` : ''}
        ${disputeForm('settlement', statement.id)}</article>`;
}

function statements(data) {
    const income = data.income || {};
    const cases = list(data.disputes);
    return `<section class="ps-hero" aria-label="结算摘要">
        <div class="ps-hero-heading"><h2>结算摘要</h2></div>${incomeStrip(income)}
        ${[income.adjustmentFen, income.withheldFen, income.refundableBalanceFen].some(Number.isSafeInteger) ? `
            <dl class="ps-ledger-meta">
                <div><dt>账单调整合计</dt><dd>${money(income.adjustmentFen)}</dd></div>
                <div><dt>累计扣缴</dt><dd>${money(income.withheldFen)}</dd></div>
                ${income.refundableBalanceFen > 0 ? `<div><dt>待处理冲减</dt><dd>${money(income.refundableBalanceFen)}</dd></div>` : ''}
            </dl>` : ''}
    </section>
    <div class="ps-work-grid">
        <section class="ps-card">${heading('月度账单')}
            <div class="ps-records">${list(data.statements).map(statementCard).join('') || empty('暂无已关账的账单。')}</div>
        </section>
        <section class="ps-card">${heading('对账异议', '可在订单、项目或账单记录中提出异议。')}
            <div class="ps-records">${cases.length ? cases.map((item) => `<article class="ps-record">
                <div class="ps-record-heading"><div><h3>${escapeHtml(labels.source[item.referenceType] || '对账事项')}</h3><p>${escapeHtml(item.referenceId)}</p></div>
                ${chip(item.status === 'resolved' ? '已答复' : '待处理', item.status === 'resolved' ? 'positive' : '')}</div>
                <p>${escapeHtml(item.reason)}</p>${item.response ? `<p class="ps-note">${escapeHtml(item.response)}</p>` : ''}
            </article>`).join('') : empty('暂无本人提交的异议。')}</div>
        </section>
    </div>`;
}

const content = { overview, orders, partnership, projects, statements };

export function renderSalesView(view, data, options = {}) {
    return limitation(data) + (content[view] || overview)(data, options);
}

export function parseQuoteFen(value) {
    const input = String(value ?? '').trim();
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(input)) return null;
    const [whole, fraction = ''] = input.split('.');
    const fen = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return fen > 0 && Number.isSafeInteger(fen) ? fen : null;
}

const successMessage = {
    referral: '推荐已提交',
    'mentor-request': '带教资格申请已提交',
    'mentorship-progress': '带教进度已保存',
    'project-apply': '项目申请已提交',
    'project-submit': '交付已提交验收',
    order: '订单草稿已提交',
    dispute: '对账异议已提交',
};
const formReaders = {
    referral: (form) => ({ name: form.get('name').trim(), contact: form.get('contact').trim(),
        note: form.get('note').trim(), consent: form.get('consent') === 'on' }),
    'mentor-request': (form) => ({ evidence: form.get('evidence').trim() }),
    'mentorship-progress': (form) => {
        const progress = form.get('progress');
        const evidence = form.get('evidence').trim();
        if (progress === 'ready' && !evidence) throw new Error('请填写脱敏的带教成果，再提交复核。');
        return { id: form.get('id'), progress, evidence };
    },
    'project-apply': (form) => ({ id: form.get('id'), note: form.get('note').trim() }),
    'project-submit': (form) => ({ id: form.get('id'), submission: form.get('submission').trim() }),
    dispute: (form) => ({ referenceType: form.get('referenceType'), referenceId: form.get('referenceId'), reason: form.get('reason').trim() }),
    order: (form) => {
        const quotes = form.getAll('lineQuote');
        const lines = form.getAll('lineProduct').map((productId, index) => ({ productId, quotedFen: parseQuoteFen(quotes[index]) }));
        if (lines.some((line) => !line.quotedFen)) throw new Error('请输入正数报价，最多保留两位小数。');
        return { customerId: form.get('customerId'), lines, note: form.get('note').trim() };
    },
};

export function createPartnerSales({ root, api, notify, navigate, onData = () => {} }) {
    let view = '';
    let epoch = 0;
    let sessionEpoch = 0;
    let previewEpoch = 0;
    let searchEpoch = 0;
    let previewTimer;
    let searchTimer;
    let data;
    let scenario = {};
    let capacityValue;

    const post = (action, body) => api(`${programRoute}/${action}`, {
        method: 'POST', body: JSON.stringify(body),
    });

    function cancelUpdates() {
        clearTimeout(previewTimer);
        clearTimeout(searchTimer);
        previewEpoch += 1;
        searchEpoch += 1;
    }

    function hide() {
        view = '';
        epoch += 1;
        cancelUpdates();
        root.removeAttribute('aria-busy');
    }

    function reset() {
        hide();
        sessionEpoch += 1;
        data = undefined;
        scenario = {};
        capacityValue = undefined;
        root.replaceChildren();
    }

    async function show(nextView, { customer } = {}) {
        const request = ++epoch;
        const changed = view !== nextView;
        view = nextView;
        cancelUpdates();
        root.setAttribute('aria-busy', 'true');
        if (changed || !data) root.innerHTML = empty('正在读取您的工作台…');

        let customers = [];
        let customersError = '';
        const customerRequest = nextView === 'orders'
            ? api('/api/sales/customers?pageSize=100').then((result) => { customers = list(result.items); })
                .catch((error) => { customersError = error.message; })
            : Promise.resolve();

        try {
            const [response] = await Promise.all([api(programRoute), customerRequest]);
            if (request !== epoch) return false;
            data = response;
            onData(response);
            if (customer && !customers.some((item) => item.id === customer.id)) customers.unshift(customer);
            root.innerHTML = renderSalesView(view, { ...data, policy: data.policy || {} }, {
                scenario, capacityValue, customers, customersError, prefillCustomer: customer?.id,
            });
            const forecastForm = root.querySelector('[data-preview-form]');
            if (forecastForm) queuePreview(forecastForm, { delay: 0 });
            return true;
        } catch (error) {
            if (request !== epoch) return false;
            root.innerHTML = empty('暂时无法读取您的工作台。', `<p role="status">${escapeHtml(error.message)}</p>`);
            return false;
        } finally {
            if (request === epoch) root.removeAttribute('aria-busy');
        }
    }

    function previewBody(form) {
        const fields = new FormData(form);
        if (form.dataset.previewForm === 'capacity') {
            capacityValue = boundedCount(fields.get('referrals'), data.policy?.maxForecastCustomers);
            return { productId: '', customers: 0, projectIds: [], referrals: capacityValue };
        }
        const limit = count(data.policy?.maxForecastProjects);
        const projectIds = fields.getAll('projectId').slice(0, limit);
        const productId = fields.get('productId') || '';
        const customers = productId ? boundedCount(fields.get('customers'), data.policy?.maxForecastCustomers) : 0;
        scenario = { customers, productId, projectIds };
        form.querySelectorAll('[name="projectId"]').forEach((element) => {
            element.disabled = !element.checked && projectIds.length >= limit;
        });
        return { ...scenario, referrals: 0 };
    }

    function queuePreview(form, { delay = 180 } = {}) {
        clearTimeout(previewTimer);
        const request = ++previewEpoch;
        const capacity = form.dataset.previewForm === 'capacity';
        const output = root.querySelector(capacity ? '#psCapacityOutput' : '#psPreviewOutput');
        if (!output) return;
        if (!form.checkValidity()) {
            output.innerHTML = '<p class="ps-muted">请填写有效人数后继续。</p>';
            return;
        }

        const body = previewBody(form);
        output.innerHTML = '<p class="ps-muted">正在按当前条件计算…</p>';
        previewTimer = setTimeout(async () => {
            try {
                const result = await post('preview', body);
                if (request !== previewEpoch || !output.isConnected) return;
                const includesPendingProject = list(data.projects).some((project) =>
                    body.projectIds.includes(project.id) && project.owned && ['assigned', 'submitted'].includes(project.status));
                output.innerHTML = capacity ? renderCapacityResult(result) : renderPreviewResult(result, { includesPendingProject });
            } catch (error) {
                if (request !== previewEpoch || !output.isConnected) return;
                output.textContent = error.message || '试算暂时不可用。';
            }
        }, delay);
    }

    function searchCustomers(input) {
        clearTimeout(searchTimer);
        const request = ++searchEpoch;
        const form = input.form;
        const select = form.elements.namedItem('customerId');
        const feedback = form.querySelector('[data-customer-feedback]');
        const query = input.value.trim();
        feedback.textContent = '正在查找…';

        searchTimer = setTimeout(async () => {
            try {
                const response = await api(`/api/sales/customers?query=${encodeURIComponent(query)}&pageSize=100`);
                if (request !== searchEpoch || !select.isConnected) return;
                const customers = list(response.items);
                const chosen = select.value;
                const chosenName = select.selectedOptions[0]?.textContent;
                if (chosen && !customers.some((item) => item.id === chosen)) {
                    customers.unshift({ id: chosen, name: chosenName });
                }
                select.innerHTML = customerOptions(customers, chosen);
                feedback.textContent = response.total ? `找到 ${response.total} 位已分配客户` : '未找到匹配的已分配客户。';
            } catch (error) {
                if (request === searchEpoch && feedback.isConnected) feedback.textContent = error.message;
            }
        }, 180);
    }

    function refreshRemoveButtons(container) {
        const removeButtons = [...container.querySelectorAll('[data-remove-line]')];
        removeButtons.forEach((button) => { button.hidden = removeButtons.length <= 1; });
    }

    root.addEventListener('click', (event) => {
        const trigger = event.target.closest('button');
        if (!trigger || !root.contains(trigger)) return;
        if (trigger.dataset.partnerView) {
            navigate(trigger.dataset.partnerView);
            return;
        }
        if (trigger.dataset.step) {
            const form = trigger.closest('[data-preview-form]');
            const input = form.querySelector('input[type="number"]');
            input.value = boundedCount(Number(input.value) + Number(trigger.dataset.step), input.max);
            queuePreview(form);
            return;
        }
        if (trigger.hasAttribute('data-add-line')) {
            const lines = trigger.form.querySelector('[data-order-lines]');
            lines.insertAdjacentHTML('beforeend', orderLine(list(data?.products)));
            refreshRemoveButtons(lines);
        }
        if (trigger.hasAttribute('data-remove-line')) {
            const row = trigger.closest('.ps-order-line');
            const lines = row.parentElement;
            if (lines.childElementCount > 1) row.remove();
            refreshRemoveButtons(lines);
        }
    });

    root.addEventListener('input', (event) => {
        if (event.target.matches('[data-preview-input]')) queuePreview(event.target.form);
        if (event.target.matches('[data-order-customer-search]')) searchCustomers(event.target);
    });

    root.addEventListener('submit', async (event) => {
        const form = event.target;
        if (form.matches('[data-preview-form]')) {
            event.preventDefault();
            queuePreview(form, { delay: 0 });
            return;
        }
        const action = form.dataset.action;
        const read = formReaders[action];
        if (!read) return;
        event.preventDefault();
        if (form.dataset.submitting === 'true') return;
        form.dataset.submitting = 'true';
        const submit = form.querySelector('button[type="submit"]');
        const feedback = form.querySelector('[data-form-feedback]');
        const requestSession = sessionEpoch;
        submit.disabled = true;
        feedback.textContent = '正在提交…';

        try {
            await post(action, read(new FormData(form)));
            if (requestSession !== sessionEpoch) return;
            notify(successMessage[action]);
            if (view) await show(view);
        } catch (error) {
            if (requestSession === sessionEpoch && feedback.isConnected) feedback.textContent = error.message;
        } finally {
            delete form.dataset.submitting;
            submit.disabled = false;
        }
    });

    return { show, hide, reset };
}
