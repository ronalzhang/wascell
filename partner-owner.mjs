const endpoint = '/api/owner/partner-program';
const currency = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' });
const timestamp = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' });

const statusNames = {
    unverified: '待认证', certified: '已认证', suspended: '已停用', none: '未开通', requested: '待核准',
    approved: '已通过', clear: '正常', review: '整改观察', paused: '暂停新增', pending: '待审核',
    reviewing: '审核中', active: '带教中', completed: '已完成', assigned: '已指派', in_training: '实训中',
    ready: '待结业', draft: '草稿', signed: '已签约', delivered: '已确认交付', cancelled: '已取消',
    open: '待处理', applied: '已申请', submitted: '待验收', accepted: '已验收', closed: '已关闭',
    resolved: '已处理', reconciling: '核对中', paid: '已支付', failed: '未支付'
};
const movements = { receipt: '收款', refund: '退款', cost: '直接成本', cost_recovery: '成本返还' };
const categories = { mentoring: '带教', quality: '质量复核', regional: '区域运营' };
const sourceTypes = { order: '订单', settlement: '结算批次', project: '运营项目', payment: '付款' };
const auditNames = {
    policy: '发布政策', product: '更新产品', partner: '审核资格', referral: '审核推荐',
    mentorship: '更新带教', quality: '更新质量状态', template: '更新模板', project: '处理项目',
    order: '录入订单', 'order-status': '更新订单', movement: '记账流水', settlement: '锁定月结',
    payment: '核对付款', dispute: '处理对账异议', 'mentor-request': '申请带教',
    'mentorship-progress': '更新带教进度', 'project-apply': '申请承接项目', 'project-submit': '提交项目交付'
};
const policyFields = [
    ['lookbackDays', '贡献观察期（天）'],
    ['minPlatformBps', '平台最低留存（%）', 'percent', '高于 50%'],
    ['projectShareBps', '项目预算占可用留存（%）', 'percent'],
    ['maturityDays', '交付后等待期（天）'],
    ['mentorCapacity', '每位导师同时带教上限'],
    ['mentorMinCustomers', '带教资格 · 本人客户数'],
    ['mentorMinContributionFen', '带教资格 · 本人贡献（元）', 'money'],
    ['maxForecastCustomers', '单次试算客户上限'],
    ['maxForecastProjects', '单次试算项目上限'],
    ['remediationDays', '整改复审期（天）']
];

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const ledger = (amount) => Number.isFinite(amount) ? currency.format(amount / 100) : '—';
const percent = (amount) => Number.isFinite(amount) ? `${amount / 100}%` : '—';
const decimal = (value) => Number.isFinite(value) ? (value / 100).toFixed(2) : '';
const formatDate = (value) => value && Number.isFinite(new Date(value).getTime()) ? timestamp.format(new Date(value)) : '—';
const list = (value) => Array.isArray(value) ? value : [];
const safeText = (value) => esc(value) || '—';

export function parseHundredths(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('请填写非负数，最多保留两位小数');
    const [whole, fraction = ''] = text.split('.');
    const total = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(total)) throw new Error('输入数值超出范围');
    return total;
}

function parseInteger(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error('请填写有效的非负整数');
    return Number(text);
}

export function readPolicyForm(fields) {
    const values = Object.fromEntries(policyFields.map(([key, , units]) => [
        key, units ? parseHundredths(fields.get(key)) : parseInteger(fields.get(key))
    ]));
    const tiers = [0, 1, 2].map((index) => ({
        name: String(fields.get(`tier-${index}-name`) || '').trim(),
        rateBps: parseHundredths(fields.get(`tier-${index}-rate`)),
        minCustomers: parseInteger(fields.get(`tier-${index}-customers`)),
        minContributionFen: parseHundredths(fields.get(`tier-${index}-contribution`))
    }));
    return { ...values, enabled: fields.get('enabled') === 'on', reason: String(fields.get('reason') || '').trim(), tiers };
}

export function readMovementForm(fields, order) {
    const type = fields.get('type');
    const bankMovement = type === 'receipt' || type === 'refund';
    const amountFen = parseHundredths(fields.get('amountFen'));
    const allocations = list(order.lines).flatMap((line, index) => {
        const specified = textValue(fields, `allocation-${index}`);
        const amount = parseHundredths(specified || '0');
        const taxFen = bankMovement ? parseHundredths(fields.get(`tax-${index}`) || '0') : 0;
        const passThroughFen = bankMovement ? parseHundredths(fields.get(`pass-through-${index}`) || '0') : 0;
        return amount || taxFen || passThroughFen || (type === 'cost' && specified)
            ? [{ lineId: line.id, amountFen: amount, taxFen, passThroughFen }] : [];
    });
    if (!allocations.length || (!amountFen && type !== 'cost') ||
        allocations.reduce((sum, allocation) => sum + allocation.amountFen, 0) !== amountFen) {
        throw new Error('请核对分摊明细与凭证金额。收款、退款和成本返还需要正金额。');
    }
    if (allocations.some(({ amountFen: amount, taxFen, passThroughFen }) => taxFen + passThroughFen > amount)) {
        throw new Error('每条明细分摊的税额与代收款合计不能超过该项金额');
    }
    return {
        id: order.id, type, amountFen, allocations,
        reference: String(fields.get('reference') || '').trim(), reason: String(fields.get('reason') || '').trim()
    };
}

function button(label, action, id = '', primary = false) {
    return `<button type="button" class="owner-action${primary ? ' owner-primary' : ''}" data-owner-action="${esc(action)}" data-owner-id="${esc(id)}">${esc(label)}</button>`;
}

export function orderMovementControls(order) {
    if (!order.signedAt) return { choices: [], action: '', notice: '' };

    const cancelled = order.state === 'cancelled';
    const choices = Object.entries(movements).filter(([type]) => !cancelled || type !== 'receipt');
    const { receiptFen, refundFen } = order.summary || {};
    const balanceFen = Number.isFinite(receiptFen) && Number.isFinite(refundFen) ? receiptFen - refundFen : null;
    const notice = cancelled ? `<p class="owner-notice owner-notice--warn">
        签约订单已取消。请按合同和凭证核对退款。已收减已退余额为 ${ledger(balanceFen)}。
    </p>` : '';
    const action = button(cancelled ? '登记退款／成本' : '登记收退／成本', 'movement-new', order.id, true);
    return { choices, action, notice };
}

function badge(state, text = statusNames[state]) {
    const tone = ['certified', 'approved', 'accepted', 'paid', 'clear', 'completed'].includes(state)
        ? 'good' : ['paused', 'suspended', 'failed', 'review'].includes(state) ? 'warn' : 'quiet';
    return `<span class="owner-status owner-status--${tone}">${safeText(text || state)}</span>`;
}

function rowTitle(title, sub = '') {
    return `<strong>${safeText(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}`;
}

function table(headers, rows, emptyText = '暂无记录') {
    if (!rows.length) return `<p class="owner-empty">${esc(emptyText)}</p>`;
    return `<div class="owner-table" tabindex="0" role="region" aria-label="表格，横向滚动可看完整字段"><table><thead><tr>${headers.map((heading) =>
        `<th scope="col">${esc(heading)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) =>
        `<tr>${row.map((value) => `<td>${value}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function panel(title, content, actions = '', description = '') {
    return `<section class="owner-panel"><header class="owner-panel-header"><div><h2>${esc(title)}</h2>${
        description ? `<p>${esc(description)}</p>` : ''}</div>${actions ? `<div class="owner-actions">${actions}</div>` : ''}
    </header>${content}</section>`;
}

function infoPairs(entries) {
    return `<dl class="owner-details">${entries.map(([key, value]) =>
        `<div><dt>${esc(key)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

function numberInput(name, label, value, { decimalPlaces = false, required = true, minimum = 0, maximum, note = '' } = {}) {
    const max = maximum == null ? '' : ` max="${maximum}"`;
    return `<label>${esc(label)}<input type="number" name="${esc(name)}" value="${esc(value)}" min="${minimum}"${max}
        step="${decimalPlaces ? '0.01' : '1'}" inputmode="${decimalPlaces ? 'decimal' : 'numeric'}"${required ? ' required' : ''}>${
        note ? `<small>${esc(note)}</small>` : ''}</label>`;
}

function input(name, caption, value = '', options = {}) {
    return `<label>${esc(caption)}<input type="${options.type || 'text'}" name="${esc(name)}" value="${esc(value)}"${
        options.required === false ? '' : ' required'}${options.max ? ` max="${esc(options.max)}"` : ''}></label>`;
}

function notes(name, caption, value = '', required = true) {
    return `<label class="owner-span">${esc(caption)}<textarea name="${esc(name)}" rows="3"${required ? ' required' : ''}>${esc(value)}</textarea></label>`;
}

function check(name, label, checked) {
    return `<label class="owner-check"><input type="checkbox" name="${esc(name)}"${checked ? ' checked' : ''}>${esc(label)}</label>`;
}

function select(name, label, options, selected, blank = '请选择', required = true) {
    return `<label>${esc(label)}<select name="${esc(name)}"${required ? ' required' : ''}>${
        blank !== null ? `<option value="">${esc(blank)}</option>` : ''
    }${options.map(([key, caption]) => `<option value="${esc(key)}"${key === selected ? ' selected' : ''}>${esc(caption)}</option>`).join('')}</select></label>`;
}

function choices(keys) {
    return keys.map((key) => [key, statusNames[key] || key]);
}

function policyForm(policy) {
    const fields = policyFields.map(([key, label, units, note]) => numberInput(key, label,
        units ? decimal(policy[key]) : policy[key], {
            decimalPlaces: Boolean(units), minimum: key === 'minPlatformBps' ? 50.01 : 0,
            maximum: units === 'percent' ? 100 : undefined, note
        })).join('');
    return `<form class="owner-form owner-policy-form" data-owner-form="policy">
        <div class="owner-policy-head">${check('enabled', '启用伙伴结算与项目政策', policy.enabled)}
        <span>${policy.id && policy.id !== 'draft' ? `版本 ${esc(policy.id)}` : '待发布'}</span></div>
        <div class="owner-tier-grid">${[0, 1, 2].map((index) => {
            const tier = policy.tiers?.[index] || {};
            return `<fieldset><legend>第 ${index + 1} 档</legend>${input(`tier-${index}-name`, '档位名称', tier.name)}${
                numberInput(`tier-${index}-rate`, '本人贡献佣金（%）', decimal(tier.rateBps), { decimalPlaces: true, maximum: 100 })
            }${numberInput(`tier-${index}-customers`, '累计终端客户数', tier.minCustomers)}${
                numberInput(`tier-${index}-contribution`, '累计本人贡献（元）', decimal(tier.minContributionFen), { decimalPlaces: true })
            }</fieldset>`;
        }).join('')}</div><div class="owner-form-grid">${fields}${notes('reason', '发布原因')}</div>
        <div class="owner-form-footer"><p data-owner-error role="alert"></p><button class="owner-action owner-primary" type="submit">发布新版本</button></div>
    </form>`;
}

function renderOverview(data) {
    const metrics = data.dashboard || {};
    const actualRetention = metrics.contributionFen > 0 && Number.isFinite(metrics.platformRetainedFen)
        ? Math.round(metrics.platformRetainedFen * 10000 / metrics.contributionFen) : null;
    const counters = [
        ['候选人待审核', metrics.candidateCount, 'go-people'],
        ['进行中的带教', metrics.activeMentorships, 'go-people'],
        ['待核对付款', list(metrics.paymentQueue).length + list(data.payments).filter((payment) => payment.status === 'reconciling').length, 'go-orders'],
        ['待回应异议', metrics.openDisputes, 'go-orders']
    ];
    const mentorRequests = list(data.partners).filter((partner) => partner.mentorStatus === 'requested');
    return `<section class="owner-summary" aria-label="经营资金">
        <article class="owner-retention"><div class="owner-retention-top">
        <span class="owner-label">平台留存</span>${badge(data.policy?.enabled ? 'clear' : 'none', data.policy?.enabled ? '计划已启用' : '计划待启用')}</div>
        <strong>${ledger(metrics.platformRetainedFen)}</strong><p>已实现贡献扣除佣金、项目承诺及超额付款占用</p>
        <div class="owner-retention-rule"><span>政策最低留存</span><b>${percent(data.policy?.minPlatformBps)}</b>${
            actualRetention !== null ? `<span>当前留存占比</span><b>${percent(actualRetention)}</b>` : ''
        }</div>${button('查看激励政策', 'go-policy')}</article>
        <div class="owner-kpis">${[
            ['合格净实收', metrics.eligibleNetFen, '已核验合格业务'],
            ['已实现贡献', metrics.contributionFen, '已扣直接履约成本'],
            ['已计销售佣金', metrics.commissionsFen, '本人订单合计'],
            ['待分配项目预算', metrics.projectAvailableFen, `预算总额 ${ledger(metrics.projectBudgetFen)}`]
        ].map(([label, amount, hint]) => `<article><span class="owner-label">${esc(label)}</span><strong>${ledger(amount)}</strong><small>${esc(hint)}</small></article>`).join('')}</div>
    </section>
    ${panel('需要跟进', `<div class="owner-queue">${counters.map(([label, count, action]) =>
        `<button type="button" data-owner-action="${action}"><span>${esc(label)}</span><strong>${Number.isFinite(count) ? count : '—'}</strong></button>`).join('')}</div>${
        mentorRequests.length ? `<ul class="owner-task-list">${mentorRequests.map((person) =>
            `<li><span>${safeText(person.displayName)}申请带教资格</span>${button('查看资格', 'partner-edit', person.id)}</li>`).join('')}</ul>` : ''
    }`)}
    ${panel('最近变更', table(['时间', '操作', '依据'], list(data.audit).slice(0, 12).map((record) => [
        formatDate(record.createdAt), rowTitle(auditNames[record.action] || record.action, record.targetId), safeText(record.reason)
    ])))}`;
}

function renderPeople(data) {
    const policy = data.policy || {};
    return [
        panel('伙伴名册', table(['伙伴', '资格 / 质量', '当前档', '本人有效贡献', '操作'], list(data.partners).map((person) => [
            rowTitle(person.displayName, person.contractRef),
            `<div class="owner-inline">${badge(person.status)}${badge(person.qualityStatus, statusNames[person.qualityStatus])}</div>`,
            safeText(policy.tiers?.[person.tierIndex]?.name),
            rowTitle(ledger(person.performance?.contributionFen), Number.isFinite(person.performance?.customers) ? `${person.performance.customers} 位有效客户` : ''),
            `<div class="owner-inline">${button('资格', 'partner-edit', person.id)}${button('质量', 'quality-edit', person.id)}</div>`
        ]), '从团队权限创建销售账号后，可在这里完成伙伴认证'), button('管理账号', 'go-staff')),
        panel('推荐审核', table(['候选人', '推荐伙伴', '时间', '状态', '操作'], list(data.referrals).map((item) => [
            rowTitle(item.name, item.contact), safeText(item.partnerName), formatDate(item.createdAt), badge(item.status),
            button('查看', 'referral-edit', item.id)
        ]), '暂无推荐')),
        panel('带教任务', table(['导师', '学员与交付范围', '进度', '操作'], list(data.mentorships).map((item) => [
            safeText(item.mentorName), rowTitle(item.traineeName, item.scope),
            `<div class="owner-inline">${badge(item.status)}${badge(item.progress)}</div>`, button('查看', 'mentorship-review', item.id)
        ]), '暂无委派的带教任务'), button('委派带教', 'mentorship-new', '', true),
        '同一资格标准适用于所有伙伴。带教任务用于记录训练成果及独立认证。')
    ].join('');
}

function renderPolicy(data) {
    return [
        panel('佣金与预算规则', policyForm(data.policy || {}), '',
            '按本人订单贡献计佣。新版本适用于之后签约的订单。'),
        panel('产品与试算口径', table(['产品', '计佣范围', '试算贡献', '费率上限', '佣金与留存约束', '操作'], list(data.products).map((item) => [
            rowTitle(item.name, item.approvalRef), item.active && item.kind === 'non_medical'
                ? badge('clear', '符合条件时计佣') : badge('none', item.active ? '仅记录账目' : '已停用'),
            ledger(item.forecastContributionFen), percent(item.maxRateBps),
            rowTitle(item.maxCommissionFen == null ? '按其他上限' : ledger(item.maxCommissionFen), `最低留存 ${ledger(item.minRetainedFen)}`),
            button('配置', 'product-edit', item.id)
        ]), '暂无产品。先确认产品资格、实际收款主体和可计佣口径。'), button('新增产品', 'product-new', '', true)),
        panel('项目模板与定价', table(['项目模板', '类别', '固定项目费', '状态', '操作'], list(data.templates).map((item) => [
            rowTitle(item.name, item.deliverable), safeText(categories[item.category]), ledger(item.feeFen),
            badge(item.active ? 'clear' : 'none', item.active ? '已启用' : '已停用'), button('配置', 'template-edit', item.id)
        ]), '暂无项目模板'), button('新增模板', 'template-new')),
        panel('版本记录', table(['版本', '生效时间', '状态', '原因', '规则'], list(data.policies).map((item) => [
            safeText(item.id), formatDate(item.updatedAt), badge(item.enabled ? 'clear' : 'none', item.enabled ? '已启用' : '未启用'),
            safeText(item.reason), button('查看', 'policy-detail', item.id)
        ]), '尚未发布政策'))
    ].join('');
}

function renderOrders(data) {
    const pending = list(data.dashboard?.paymentQueue);
    const payments = list(data.payments);
    const pendingRows = pending.map((payment) => [
        safeText(payment.partnerName || payment.partnerId), safeText(payment.period), ledger(payment.dueFen), badge('open', '待建指令'),
        button('建立核对指令', 'payment-begin', `${payment.period}:${payment.partnerId}`)
    ]);
    const paymentsRows = payments.map((payment) => {
        const recheck = selectedId(data.dashboard?.paymentRechecks, payment.id);
        return [
            safeText(payment.partnerName || list(data.partners).find((person) => person.id === payment.partnerId)?.displayName || payment.partnerId),
            safeText(payment.period), rowTitle(ledger(payment.grossFen), recheck ? `当前可付 ${ledger(recheck.currentDueFen)}` : ''),
            recheck ? badge('review', '待重核') : badge(payment.status),
            button(recheck ? '核实银行结果' : '查看', 'payment-review', payment.id)
        ];
    });
    return [
        panel('经营订单', table(['客户 / 订单', '归因伙伴', '状态', '已收 / 已退', '佣金', '操作'], list(data.orders).map((order) => [
            rowTitle(order.customerName, order.id), safeText(order.partnerName), badge(order.state),
            rowTitle(ledger(order.summary?.receiptFen), `已退 ${ledger(order.summary?.refundFen)}`),
            rowTitle(ledger(order.summary?.earnedFen), `待成熟 ${ledger(order.summary?.pendingFen)}`), button('查看', 'order-detail', order.id)
        ]), '暂无经营订单'), button('新增订单', 'order-new', '', true)),
        panel('月度结算', table(['账期', '锁定时间', '入账明细', '本期应付变化', '操作'], list(data.settlements).map((batch) => [
            safeText(batch.period), formatDate(batch.lockedAt), String(list(batch.entries).length),
            ledger(list(batch.entries).reduce((sum, item) => sum + item.amountFen, 0)), button('查看', 'settlement-detail', batch.id)
        ]), '暂无已锁定账期'), button('锁定月结', 'settlement-new'),
        '按北京时间结算。锁定账期后收到的退款与调整进入后续账期。'),
        panel('线下付款核对', table(['收款伙伴', '账期', '税前金额', '状态', '操作'], [...pendingRows, ...paymentsRows], '暂无待核对或已付款记录')),
        panel('对账异议', table(['发起伙伴', '关联记录', '提交时间', '状态', '操作'], list(data.disputes).map((item) => [
            safeText(item.partnerName), rowTitle(sourceTypes[item.referenceType] || item.referenceType, item.referenceId),
            formatDate(item.createdAt), badge(item.status), button('查看', 'dispute-review', item.id)
        ]), '暂无对账异议'))
    ].join('');
}

function renderProjects(data) {
    const summary = data.dashboard || {};
    return `<section class="owner-mini-summary" aria-label="项目预算">${[
        ['可分配余额', summary.projectAvailableFen], ['已承诺项目费', summary.projectCommittedFen], ['已验收项目费', summary.projectAcceptedFen]
    ].map(([label, value]) => `<article><span>${esc(label)}</span><strong>${ledger(value)}</strong></article>`).join('')}</section>${
        panel('经营项目', table(['项目', '承接伙伴', '固定项目费', '状态', '操作'], list(data.projects).map((item) => [
            rowTitle(item.name, categories[item.category]), safeText(item.partnerName), ledger(item.feeFen),
            badge(item.status, item.status === 'open' ? '可申请' : undefined), button('查看', 'project-review', item.id)
        ]), '暂无经营项目'), button('发布项目', 'project-new', '', true) + button('设置模板', 'go-policy'),
        '按实物或服务成果验收。申请、指派后的项目预占预算。')
    }`;
}

const views = {
    partnerOverview: renderOverview, partnerPeople: renderPeople, partnerPolicy: renderPolicy,
    partnerOrders: renderOrders, partnerProjects: renderProjects
};

export function renderOwnerView(view, data) {
    return views[view]?.(data) || '';
}

function monthBeforeNow() {
    const dateParts = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric', month: 'numeric', timeZone: 'Asia/Shanghai'
    }).formatToParts().filter(({ type }) => type !== 'literal');
    const { year, month } = Object.fromEntries(dateParts.map(({ type, value }) => [type, Number(value)]));
    return `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, '0')}`;
}

const textValue = (data, key) => String(data.get(key) || '').trim();
const selectedId = (values, id) => list(values).find((item) => item.id === id);

export function createPartnerOwner({ root, api, drawer, openDrawer, closeDrawer, toast, navigate }) {
    let data;
    let currentView;
    let loadVersion = 0;

    async function load(view) {
        const changingView = currentView !== view;
        currentView = view;
        const version = ++loadVersion;
        root.setAttribute('aria-busy', 'true');
        if (!data || changingView) root.innerHTML = '<p class="owner-empty" role="status">正在读取伙伴经营数据</p>';
        try {
            const snapshot = await api(endpoint);
            if (version !== loadVersion) return false;
            data = snapshot;
            root.innerHTML = renderOwnerView(view, data);
            return true;
        } catch (error) {
            if (version !== loadVersion) return false;
            root.innerHTML = panel('读取数据失败', `<p class="owner-empty" role="alert">${esc(error.message)}</p>`, button('重试', 'retry'));
            return false;
        } finally {
            if (version === loadVersion) root.setAttribute('aria-busy', 'false');
        }
    }

    function clear() {
        data = undefined;
        ++loadVersion;
        root.innerHTML = '';
        root.removeAttribute('aria-busy');
    }

    async function write(form, action, payload, success, onSuccess) {
        const control = form.querySelector('[type="submit"]');
        if (control.disabled) return;
        const error = form.querySelector('[data-owner-error]');
        error.textContent = '';
        control.disabled = true;
        form.setAttribute('aria-busy', 'true');
        const actionView = currentView;
        let result;
        try {
            result = await api(`${endpoint}/${action}`, { method: 'POST', body: JSON.stringify(payload(new FormData(form))) });
        } catch (failure) {
            error.textContent = failure.message;
            return;
        } finally {
            control.disabled = false;
            form.removeAttribute('aria-busy');
        }
        if (drawer.contains(form)) closeDrawer();
        toast(success);
        if (await load(currentView) && onSuccess && currentView === actionView && !root.closest('[hidden]')) onSuccess(result);
    }

    function dialogForm(title, markup, action, payload, options = {}) {
        openDrawer(title, `${options.details || ''}<form class="owner-form owner-dialog-form">
            <div class="owner-form-grid">${markup}</div>
            <div class="owner-form-footer"><p data-owner-error role="alert"></p><button class="owner-action owner-primary" type="submit">${esc(options.submit || '保存')}</button></div>
        </form>`, 'PARTNER OPERATIONS');
        const form = drawer.querySelector('form');
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            write(form, action, payload, options.success || '已保存', options.onSuccess);
        });
        return form;
    }

    function accountChoices({ mentors = false, certified = false } = {}) {
        return list(data.accounts).filter((account) => account.active).filter((account) => {
            const partner = selectedId(data.partners, account.id);
            if (mentors) return partner?.status === 'certified' && partner?.mentorStatus === 'approved' && partner?.qualityStatus !== 'paused';
            return !certified || (partner?.status === 'certified' && partner?.qualityStatus !== 'paused');
        }).map((account) => [account.id, account.displayName || account.username]);
    }

    function partnerName(id) {
        return selectedId(data.partners, id)?.displayName || selectedId(data.accounts, id)?.displayName || id;
    }

    function productForm(product = {}) {
        const form = dialogForm(product.id ? '配置产品' : '新增产品', `${input('name', '产品名称', product.name)}
            ${select('kind', '计佣类别', [['non_medical', '独立非医疗产品或服务'], ['excluded', '仅记录业务，排除计佣']], product.kind || 'excluded', null)}
            ${input('approvalRef', '产品核验依据', product.approvalRef, { required: false })}
            ${numberInput('forecastContributionFen', '销售端试算贡献（元）', decimal(product.forecastContributionFen ?? 0), { decimalPlaces: true })}
            ${numberInput('maxRateBps', '产品佣金比例上限（%）', decimal(product.maxRateBps ?? 0), { decimalPlaces: true, maximum: 100 })}
            ${numberInput('maxCommissionFen', '绝对佣金上限（元）', decimal(product.maxCommissionFen), {
                decimalPlaces: true, required: false, note: '留空时按费率上限和最低留存计算'
            })}
            ${numberInput('minRetainedFen', '最低留存金额（元）', decimal(product.minRetainedFen ?? 0), { decimalPlaces: true })}
            ${check('active', '启用此产品', product.active)}${notes('reason', '变更原因')}
        `, 'product', (fields) => ({
            id: product.id, name: textValue(fields, 'name'), kind: textValue(fields, 'kind'),
            approvalRef: textValue(fields, 'approvalRef'), active: fields.has('active'),
            forecastContributionFen: parseHundredths(fields.get('forecastContributionFen')),
            maxRateBps: parseHundredths(fields.get('maxRateBps')),
            maxCommissionFen: textValue(fields, 'maxCommissionFen') ? parseHundredths(fields.get('maxCommissionFen')) : null,
            minRetainedFen: parseHundredths(fields.get('minRetainedFen')), reason: textValue(fields, 'reason')
        }));
        function syncApproval() {
            form.elements.approvalRef.required = form.elements.active.checked && form.elements.kind.value === 'non_medical';
        }
        form.addEventListener('change', syncApproval);
        syncApproval();
    }

    function templateForm(template = {}) {
        const form = dialogForm(template.id ? '配置项目模板' : '新增项目模板', `${input('name', '模板名称', template.name)}
            ${select('category', '项目类别', Object.entries(categories), template.category)}
            ${numberInput('feeFen', '固定项目费（元）', decimal(template.feeFen), { decimalPlaces: true, minimum: 0.01 })}
            ${check('requiresMentor', '要求带教资格', template.requiresMentor)}
            ${notes('deliverable', '独立交付物和验收标准', template.deliverable)}
            ${check('active', '启用此模板', template.active)}${notes('reason', '变更原因')}
        `, 'template', (fields) => ({
            id: template.id, name: textValue(fields, 'name'), category: textValue(fields, 'category'),
            feeFen: parseHundredths(fields.get('feeFen')), deliverable: textValue(fields, 'deliverable'),
            active: fields.has('active'), requiresMentor: fields.has('requiresMentor'), reason: textValue(fields, 'reason')
        }));
        function syncMentorRule() {
            const mentoring = form.elements.category.value === 'mentoring';
            if (mentoring) form.elements.requiresMentor.checked = true;
            form.elements.requiresMentor.disabled = mentoring;
        }
        form.elements.category.addEventListener('change', syncMentorRule);
        syncMentorRule();
    }

    function policyDetail(id) {
        const policy = selectedId(data.policies, id);
        if (!policy) return;
        const fields = policyFields.map(([key, label, units]) => [label, units === 'percent' ? percent(policy[key])
            : units === 'money' ? ledger(policy[key]) : safeText(policy[key])]);
        openDrawer('激励政策版本', `${infoPairs([['版本', safeText(policy.id)], ['更新时间', formatDate(policy.updatedAt)],
            ['发布原因', safeText(policy.reason)], ['状态', policy.enabled ? '已启用' : '未启用'], ...fields])}
            ${table(['档位', '费率', '客户数', '本人贡献'], list(policy.tiers).map((tier) => [
                safeText(tier.name), percent(tier.rateBps), safeText(tier.minCustomers), ledger(tier.minContributionFen)
            ]))}`, 'PARTNER POLICIES');
    }

    function partnerForm(id) {
        const partner = selectedId(data.partners, id);
        if (!partner) return;
        dialogForm(`${partner.displayName} · 伙伴资格`, `
            ${select('status', '合作状态', choices(['unverified', 'certified', 'suspended']), partner.status, null)}
            ${input('contractRef', '工作室直接签约凭证', partner.contractRef, { required: false })}
            ${select('mentorStatus', '带教资格', choices(['none', 'requested', 'approved']), partner.mentorStatus, null)}
            ${select('tierIndex', '调整本人佣金档', list(data.policy?.tiers).map((tier, index) => [String(index), `${tier.name} · ${percent(tier.rateBps)}`]), '', '保持现有审核档位', false)}
            ${notes('reason', '核准或调整原因')}`, 'partner', (fields) => ({
                id, status: textValue(fields, 'status'), contractRef: textValue(fields, 'contractRef'),
                mentorStatus: textValue(fields, 'mentorStatus'),
                tierIndex: textValue(fields, 'tierIndex') === '' ? undefined : parseInteger(fields.get('tierIndex')),
                reason: textValue(fields, 'reason')
            }), {
                details: infoPairs([['当前生效佣金档', safeText(data.policy?.tiers?.[partner.tierIndex]?.name)], ['达标客户', safeText(partner.performance?.customers)], ['达标贡献', ledger(partner.performance?.contributionFen)],
                    ['带教申请依据', safeText(partner.mentorEvidence)]])
            });
    }

    function qualityForm(id) {
        const partner = selectedId(data.partners, id);
        if (!partner) return;
        dialogForm(`${partner.displayName} · 质量复审`, `
            ${select('qualityStatus', '处理措施', [['clear', '恢复正常'], ['review', '整改观察'], ['paused', '暂停新增业务']], partner.qualityStatus, null)}
            ${notes('reason', '整改要求／复审依据')}`, 'quality', (fields) => ({
                id, qualityStatus: textValue(fields, 'qualityStatus'), reason: textValue(fields, 'reason')
            }), {
                details: infoPairs([['当前措施', badge(partner.qualityStatus)], ['复审时间', formatDate(partner.reviewAt)],
                    ['当前处理依据', safeText(partner.qualityReason)]])
                    + '<p class="owner-notice">整改措施只控制新增业务资格，既有权益按原订单和合同结算。</p>'
            });
    }

    function referralForm(id) {
        const referral = selectedId(data.referrals, id);
        if (!referral) return;
        const form = dialogForm(`审核推荐 · ${referral.name}`, `
            ${select('status', '审核结果', choices(['pending', 'reviewing', 'approved', 'closed']), referral.status, null)}
            ${select('candidateId', '候选人销售账号', accountChoices(), referral.candidateId, '暂未关联', false)}
            ${notes('reason', '审核依据或后续要求', referral.reviewNote)}
        `, 'referral', (fields) => ({
            id, status: textValue(fields, 'status'), candidateId: textValue(fields, 'candidateId'), reason: textValue(fields, 'reason')
        }), { details: infoPairs([['推荐伙伴', safeText(referral.partnerName)], ['联系方式', safeText(referral.contact)],
            ['推荐说明', safeText(referral.note)], ['提交日期', formatDate(referral.createdAt)]]) });
        function syncCandidate() {
            const approve = form.elements.status.value === 'approved';
            form.elements.candidateId.required = approve;
            form.elements.candidateId.closest('label').hidden = !approve;
        }
        form.elements.status.addEventListener('change', syncCandidate);
        syncCandidate();
    }

    function mentorshipForm() {
        dialogForm('委派带教', `${select('mentorId', '导师', accountChoices({ mentors: true }))}
            ${select('traineeId', '学员', accountChoices())}
            ${notes('scope', '训练范围与交付要求')}${notes('reason', '委派依据')}
        `, 'mentorship', (fields) => ({
            mentorId: textValue(fields, 'mentorId'), traineeId: textValue(fields, 'traineeId'),
            scope: textValue(fields, 'scope'), reason: textValue(fields, 'reason')
        }));
    }

    function mentorshipReview(id) {
        const item = selectedId(data.mentorships, id);
        if (!item) return;
        const details = infoPairs([['导师', safeText(item.mentorName)], ['学员', safeText(item.traineeName)],
            ['带教范围', safeText(item.scope)], ['当前进度', badge(item.progress)], ['训练证据', safeText(item.evidence)]]);
        if (item.status === 'active') {
            dialogForm('核定带教成果', `${select('status', '处理结果', choices(['completed', 'closed']))}
                ${notes('reason', '核定依据')}`, 'mentorship',
            (fields) => ({ id, status: textValue(fields, 'status'), reason: textValue(fields, 'reason') }), { details });
        } else {
            openDrawer('带教记录', details, 'PARTNER MENTORSHIP');
        }
    }

    function projectForm() {
        const options = list(data.templates).filter((item) => item.active)
            .map((item) => [item.id, `${item.name} · ${ledger(item.feeFen)}`]);
        if (!options.length) {
            openDrawer('发布项目', '<p class="owner-notice">请先在激励政策中启用带有固定价格和验收标准的项目模板。</p>', 'PARTNER PROJECTS');
            return;
        }
        dialogForm('发布项目', `${select('templateId', '项目模板', options)}
            ${select('partnerId', '承接伙伴', accountChoices({ certified: true }), '', '开放申请', false)}
            ${notes('scope', '本次工作范围')}${notes('reason', '立项依据')}
        `, 'project', (fields) => ({
            templateId: textValue(fields, 'templateId'), scope: textValue(fields, 'scope'),
            partnerId: textValue(fields, 'partnerId'), reason: textValue(fields, 'reason')
        }));
    }

    function projectReview(id) {
        const project = selectedId(data.projects, id);
        if (!project) return;
        const details = infoPairs([['状态', badge(project.status)], ['承接伙伴', safeText(project.partnerName)],
            ['固定项目费', ledger(project.feeFen)], ['验收标准', safeText(project.deliverable)],
            ['工作范围', safeText(project.scope)], ['申请说明', safeText(project.applicationNote)], ['交付物说明', safeText(project.submission)],
            ['最近处理原因', safeText(project.reason)], ['验收时间', formatDate(project.acceptedAt)]]);
        const workflow = {
            open: [['assign', '指派伙伴'], ['close', '关闭项目']],
            applied: [['assign', '核准申请'], ['return', '退回申请'], ['close', '关闭项目']],
            assigned: [['close', '关闭项目']],
            submitted: [['accept', '通过验收'], ['return', '退回补充'], ['close', '关闭项目']]
        };
        const actions = workflow[project.status];
        if (!actions) {
            openDrawer(project.name, details, 'PARTNER PROJECTS');
            return;
        }
        const form = dialogForm(project.name, `${select('action', '项目处理', actions)}
            ${select('partnerId', '承接伙伴', accountChoices({ certified: true }), project.partnerId, '请选择', false)}
            ${notes('reason', '办理原因')}`, 'project', (fields) => ({
                id, action: textValue(fields, 'action'), partnerId: textValue(fields, 'partnerId'), reason: textValue(fields, 'reason')
            }), { details });
        const partnerInput = form.elements.partnerId;
        function syncAction() {
            partnerInput.closest('label').hidden = form.elements.action.value !== 'assign';
            partnerInput.required = !partnerInput.closest('label').hidden;
        }
        form.elements.action.addEventListener('change', syncAction);
        syncAction();
    }

    function draftLine() {
        const products = list(data.products).filter((product) => product.active)
            .map((product) => [product.id, product.name]);
        return `<div class="owner-draft-line">
            ${select('productId', '产品', products)}${numberInput('quotedFen', '约定应收（元）', '', { decimalPlaces: true, minimum: 0.01 })}
            <button class="owner-action" type="button" data-remove-line>移除</button>
        </div>`;
    }

    function orderForm() {
        if (!list(data.products).some((product) => product.active)) {
            openDrawer('新增经营订单', '<p class="owner-notice">请先在激励政策中启用要录入的产品。</p>', 'PARTNER ORDERS');
            return;
        }
        const form = dialogForm('新增经营订单', `
            <div class="owner-search owner-span">${input('customerSearch', '查找客户', '', { required: false, type: 'search' })}
                <button type="button" class="owner-action" data-find-customer>查找</button></div>
            <p class="owner-search-status owner-span" data-customer-status role="status"></p>
            ${select('customerId', '客户', [])}
            ${select('partnerId', '本人订单归因', accountChoices({ certified: true }))}
            <div class="owner-line-workflow owner-span"><div data-draft-lines>${draftLine()}</div>
                <button class="owner-action" type="button" data-add-line>添加产品明细</button>
            </div>${notes('note', '订单说明', '', false)}
        `, 'order', (fields) => ({
            customerId: textValue(fields, 'customerId'), partnerId: textValue(fields, 'partnerId'),
            note: textValue(fields, 'note'), lines: fields.getAll('productId').map((productId, index) => ({
                productId, quotedFen: parseHundredths(fields.getAll('quotedFen')[index])
            }))
        }), { submit: '保存草稿', success: '经营订单草稿已保存' });
        const results = new Map();
        const customerSelect = form.elements.customerId;
        const status = form.querySelector('[data-customer-status]');
        const find = form.querySelector('[data-find-customer]');
        async function searchCustomers() {
            const query = textValue(new FormData(form), 'customerSearch');
            find.disabled = true;
            status.textContent = '正在查找';
            try {
                const parameters = new URLSearchParams({ query, pageSize: '30' });
                const response = await api(`/api/owner/customers?${parameters}`);
                results.clear();
                customerSelect.length = 1;
                for (const item of list(response.items)) {
                    results.set(item.id, item);
                    customerSelect.add(new Option(item.name || item.id, item.id));
                }
                status.textContent = customerSelect.length > 1 ? `当前结果 ${customerSelect.length - 1} 位。选择客户后核对原归属。` : '未找到客户，请调整关键词。';
            } catch (error) {
                status.textContent = error.message;
            } finally {
                find.disabled = false;
            }
        }
        find.addEventListener('click', searchCustomers);
        form.elements.customerSearch.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                if (!find.disabled) searchCustomers();
            }
        });
        customerSelect.addEventListener('change', () => {
            const partnerId = results.get(customerSelect.value)?.assignedSalesId || '';
            form.elements.partnerId.value = partnerId;
        });
        const lines = form.querySelector('[data-draft-lines]');
        form.querySelector('[data-add-line]').addEventListener('click', () => {
            lines.insertAdjacentHTML('beforeend', draftLine());
            lines.lastElementChild.querySelector('select').focus();
        });
        lines.addEventListener('click', (event) => {
            if (event.target.matches('[data-remove-line]') && lines.childElementCount > 1) {
                event.target.closest('.owner-draft-line').remove();
            }
        });
        searchCustomers();
    }

    function orderDetail(id) {
        const order = selectedId(data.orders, id);
        if (!order) return;
        const details = infoPairs([['客户', safeText(order.customerName)], ['归因伙伴', safeText(order.partnerName)],
            ['订单编号', safeText(order.id)], ['当前状态', badge(order.state)], ['合同凭证', safeText(order.contractRef)],
            ['签约时间', formatDate(order.signedAt)], ['确认交付', formatDate(order.deliveredAt)], ['订单说明', safeText(order.note)],
            ['工作室净实收', ledger(order.summary?.netFen)], ['可计提贡献', ledger(order.summary?.contributionFen)],
            ['累计已核验成本', ledger(order.summary?.costFen)], ['已计佣金', ledger(order.summary?.earnedFen)]]);
        const lines = panel('产品明细', table(['产品', '应收金额', '签约计佣依据'], list(order.lines).map((line) => [
            rowTitle(line.productName, line.id), ledger(line.quotedFen), order.state === 'draft' ? '待签约锁定' :
                line.eligible ? rowTitle(percent(line.snapshot?.rateBps), line.snapshot?.policyId || '') : '仅记录账目'
        ])));
        const flows = panel('收退与成本流水', table(['类别 / 凭证', '金额', '分摊', '登记时间'], list(order.movements).map((movement) => [
            rowTitle(movements[movement.type] || movement.type, movement.reference), ledger(movement.amountFen),
            `<ul class="owner-allocation-list">${list(movement.allocations).map((allocation) => `<li>
            ${safeText(selectedId(order.lines, allocation.lineId)?.productName || allocation.lineId)} · ${ledger(allocation.amountFen)}${
            allocation.taxFen || allocation.passThroughFen ? `<small>税 ${ledger(allocation.taxFen)} · 代收 ${ledger(allocation.passThroughFen)}</small>` : ''
        }</li>`).join('')}</ul>`, formatDate(movement.createdAt)
        ]), '暂无流水'));
        const movement = orderMovementControls(order);
        const controls = [
            ['draft', 'signed'].includes(order.state) ? button('更新订单状态', 'order-state', id) : '',
            movement.action
        ].join('');
        openDrawer('经营订单详情', `${details}${movement.notice}${controls ? `<div class="owner-dialog-actions">${controls}</div>` : ''}${lines}${flows}`, 'PARTNER ORDERS');
    }

    function orderStatusForm(id) {
        const order = selectedId(data.orders, id);
        if (!order) return;
        const options = order.state === 'draft' ? [['signed', '签约并锁定口径'], ['cancelled', '取消草稿']]
            : [['delivered', '确认已交付'], ['cancelled', '取消订单']];
        const form = dialogForm('更新订单状态', `${select('state', '处理动作', options)}
            ${input('contractRef', '合同凭证编号', '', { required: false })}
            ${notes('reason', '核验或取消依据')}`, 'order-status', (fields) => ({
                id, state: textValue(fields, 'state'), contractRef: textValue(fields, 'contractRef'), reason: textValue(fields, 'reason')
            }), { onSuccess: () => orderDetail(id) });
        const syncRequired = () => {
            const contract = form.elements.contractRef;
            contract.required = form.elements.state.value === 'signed';
            contract.closest('label').hidden = !contract.required;
        };
        form.elements.state.addEventListener('change', syncRequired);
        syncRequired();
    }

    function movementForm(id) {
        const order = selectedId(data.orders, id);
        if (!order) return;
        const { choices, notice } = orderMovementControls(order);
        if (!choices.length) return;
        const fieldsMarkup = list(order.lines).map((line, index) => `<fieldset class="owner-allocation">
            <legend>${safeText(line.productName)} · 应收 ${ledger(line.quotedFen)}</legend>
            <div class="owner-form-grid">
                ${numberInput(`allocation-${index}`, '本项金额（元）', '', { decimalPlaces: true, required: false })}
                <div class="owner-bank-allocation owner-span">${numberInput(`tax-${index}`, '其中税额（元）', '', { decimalPlaces: true, required: false })}
                    ${numberInput(`pass-through-${index}`, '其中代收款（元）', '', { decimalPlaces: true, required: false })}
                </div>
            </div></fieldset>`).join('');
        const title = order.state === 'cancelled' ? '登记退款／成本流水' : '登记收退／成本流水';
        const form = dialogForm(title, `${select('type', '凭证类别', choices, choices[0][0], null)}
            ${input('reference', '唯一凭证编号')}${numberInput('amountFen', '凭证总金额（元）', '', { decimalPlaces: true, minimum: 0.01 })}
            <div class="owner-span">
                <p data-cost-tip class="owner-notice" hidden>无直接成本的明细也需要核验。该项填 0，未涉及的明细留空。</p>
                ${fieldsMarkup}<p class="owner-allocation-total" data-owner-allocation-total role="status"></p>
            </div>
            ${notes('reason', '账目核验说明')}
        `, 'movement', (fields) => readMovementForm(fields, order), {
            details: notice, submit: '核验入账', success: '流水已核验', onSuccess: () => orderDetail(id)
        });
        function syncFields() {
            const type = form.elements.type.value;
            const bank = type === 'receipt' || type === 'refund';
            for (const label of form.querySelectorAll('.owner-bank-allocation')) label.hidden = !bank;
            form.querySelector('[data-cost-tip]').hidden = type !== 'cost';
            form.elements.amountFen.min = type === 'cost' ? 0 : 0.01;
        }
        form.elements.type.addEventListener('change', syncFields);
        function syncAllocations() {
            let total = 0;
            try {
                for (const input of form.querySelectorAll('[name^="allocation-"]')) total += parseHundredths(input.value || '0');
            } catch {
                return;
            }
            form.querySelector('[data-owner-allocation-total]').textContent = `已分摊 ${ledger(total)}`;
        }
        form.addEventListener('input', syncAllocations);
        syncFields();
        syncAllocations();
    }

    function settlementForm() {
        const latest = monthBeforeNow();
        dialogForm('锁定月度结算', `${input('period', '已结束账期（北京时间）', latest, { type: 'month', max: latest })}
            ${notes('reason', '锁定依据')}`, 'settlement',
        (fields) => ({ period: textValue(fields, 'period'), reason: textValue(fields, 'reason') }), {
            submit: '锁定账期', success: '结算账期已锁定'
        });
    }

    function settlementDetail(id) {
        const batch = selectedId(data.settlements, id);
        if (!batch) return;
        const details = infoPairs([['账期', safeText(batch.period)], ['批次编号', safeText(batch.id)], ['锁定时间', formatDate(batch.lockedAt)]]);
        openDrawer('月度结算明细', `${details}${table(['伙伴', '入账来源', '金额'], list(batch.entries).map((entry) => [
            safeText(partnerName(entry.partnerId)), rowTitle(sourceTypes[entry.sourceType] || entry.sourceType, entry.sourceId), ledger(entry.amountFen)
        ]), '本期没有应付变化')}`, 'PARTNER SETTLEMENT');
    }

    function startPayment(key) {
        const [period, ...parts] = key.split(':');
        const partnerId = parts.join(':');
        const item = list(data.dashboard?.paymentQueue).find((candidate) => candidate.period === period && candidate.partnerId === partnerId);
        if (!item) return;
        dialogForm('建立线下付款核对', notes('reason', '建立指令依据'), 'payment',
            (fields) => ({ action: 'begin', period, partnerId, reason: textValue(fields, 'reason') }), {
                details: infoPairs([['伙伴', safeText(item.partnerName || partnerName(partnerId))],
                    ['账期', safeText(period)], ['待付税前金额', ledger(item.dueFen)]])
                    + '<p class="owner-notice">此操作建立核对记录。请以线下实际划款凭证确认结果。</p>',
                submit: '建立核对指令', success: '付款待核对'
            });
    }

    function paymentReview(id) {
        const payment = selectedId(data.payments, id);
        if (!payment) return;
        const recheck = selectedId(data.dashboard?.paymentRechecks, id);
        const details = infoPairs([['伙伴', safeText(payment.partnerName || partnerName(payment.partnerId))],
            ['指令编号', safeText(id)], ['状态', recheck ? badge('review', '待重核') : badge(payment.status)],
            ['账期', safeText(payment.period)], ['税前指令金额', ledger(payment.grossFen)],
            ...(recheck ? [['当前可付', ledger(recheck.currentDueFen)]] : []),
            ['扣缴税额', ledger(payment.taxFen)], ['已实际划款', ledger(payment.paidFen)], ['线下凭证', safeText(payment.reference)]])
            + (recheck ? '<p class="owner-notice owner-notice--warn">应付款发生变化。请先核实银行结果。实际已划款则按回执补记。确认未划款后可关闭旧指令，再按最新金额建立指令。</p>' : '');
        if (payment.status !== 'reconciling') {
            openDrawer('线下付款记录', details, 'PARTNER SETTLEMENT');
            return;
        }
        const form = dialogForm('确认线下付款', `${select('action', '凭证核对结果', [['confirm', '已实际划款'], ['fail', '核实未划款']])}
            ${input('reference', '线下凭证或核查编号', '', { required: false })}
            ${numberInput('taxFen', '实际扣缴（元）', '0.00', { decimalPlaces: true, maximum: payment.grossFen / 100 })}
            ${notes('reason', '核对依据')}`, 'payment', (fields) => ({
                id, action: textValue(fields, 'action'), reference: textValue(fields, 'reference'),
                taxFen: fields.get('action') === 'confirm' ? parseHundredths(fields.get('taxFen')) : 0,
                reason: textValue(fields, 'reason')
            }), { details, submit: '确认核对结果' });
        function syncPayment() {
            const confirm = form.elements.action.value === 'confirm';
            form.elements.taxFen.required = confirm;
            form.elements.taxFen.closest('label').hidden = !confirm;
            form.elements.reference.required = confirm;
        }
        form.elements.action.addEventListener('change', syncPayment);
        syncPayment();
    }

    function disputeReview(id) {
        const item = selectedId(data.disputes, id);
        if (!item) return;
        const details = infoPairs([['发起伙伴', safeText(item.partnerName)], ['状态', badge(item.status)],
            ['关联记录', safeText(item.referenceId)], ['原始说明', safeText(item.reason)], ['处理答复', safeText(item.response)]]);
        if (item.status === 'open') {
            dialogForm('回复对账异议', notes('response', '核对结果与答复'), 'dispute',
                (fields) => ({ id, response: textValue(fields, 'response') }), { details, submit: '保存处理结果' });
        } else {
            openDrawer('对账异议', details, 'PARTNER SETTLEMENT');
        }
    }

    const actions = {
        retry: () => load(currentView),
        'go-people': () => navigate('partnerPeople'),
        'go-orders': () => navigate('partnerOrders'),
        'go-policy': () => navigate('partnerPolicy'),
        'go-staff': () => navigate('staff'),
        'product-new': () => productForm(),
        'product-edit': (id) => productForm(selectedId(data.products, id)),
        'template-new': () => templateForm(),
        'template-edit': (id) => templateForm(selectedId(data.templates, id)),
        'policy-detail': policyDetail,
        'partner-edit': partnerForm,
        'quality-edit': qualityForm,
        'referral-edit': referralForm,
        'mentorship-new': mentorshipForm,
        'mentorship-review': mentorshipReview,
        'project-new': projectForm,
        'project-review': projectReview,
        'order-new': orderForm,
        'order-detail': orderDetail,
        'order-state': orderStatusForm,
        'movement-new': movementForm,
        'settlement-new': settlementForm,
        'settlement-detail': settlementDetail,
        'payment-begin': startPayment,
        'payment-review': paymentReview,
        'dispute-review': disputeReview
    };
    function dispatch(event) {
        const control = event.target.closest('[data-owner-action]');
        if (!control) return;
        const action = control.dataset.ownerAction;
        if (data || action === 'retry') actions[action]?.(control.dataset.ownerId);
    }
    root.addEventListener('click', dispatch);
    drawer.addEventListener('click', dispatch);
    root.addEventListener('submit', (event) => {
        if (event.target.dataset.ownerForm !== 'policy') return;
        event.preventDefault();
        write(event.target, 'policy', readPolicyForm, '激励政策已发布');
    });

    return { load, clear };
}
