import { sessionLoginMessage } from './session-state.mjs';
import { createPartnerSales, escapeHtml } from './partner-sales.mjs?v=20261121-1';

const select = (query) => document.querySelector(query);
const navigation = [...document.querySelectorAll('[data-view]')];
const views = {
    overview: '经营概览',
    customers: '客户管理',
    orders: '业务订单',
    partnership: '推荐与带教',
    projects: '运营项目',
    statements: '收益账单',
    knowledge: '销售答疑',
};
const followUpStatus = {
    new: '待跟进',
    contacted: '已联系',
    qualified: '已确认需求',
    confirmed: '已确认',
    closed: '已关闭',
};
const editableFollowUp = ['new', 'contacted', 'qualified'];
const state = { view: 'overview', knowledge: [] };
const dateFormat = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai',
});
const formatDate = (value) => value && !Number.isNaN(new Date(value).getTime())
    ? dateFormat.format(new Date(value))
    : '未启用';
const member = (customer) => !customer.membershipExpiresAt
    ? '未启用'
    : new Date(customer.membershipExpiresAt) < new Date() ? '已到期' : '会员有效';
let toastTimer;
let searchTimer;
let sessionEstablished = false;
let loadRequest = 0;
let customerRequest = 0;
let drawerTrigger;
let drawerRequest = 0;
let leadRequestId;

function toast(message) {
    select('#adminToast').textContent = message;
    select('#adminToast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => select('#adminToast').classList.remove('show'), 2800);
}

function login(message = '') {
    loadRequest += 1;
    customerRequest += 1;
    clearTimeout(searchTimer);
    closeCustomer({ restoreFocus: false });
    partner.reset();
    state.view = 'overview';
    state.knowledge = [];
    select('#customersBody').replaceChildren();
    select('#customerCount').textContent = '—';
    select('#knowledgeList').replaceChildren();
    select('#customerSearch').value = '';
    select('#leadCreateForm').reset();
    select('#leadFeedback').textContent = '';
    leadRequestId = undefined;
    showLeadPanel(false);
    setLeadPermission();
    select('#knowledgeSearch').value = '';
    select('#lastUpdated').textContent = '';
    select('#advisorName').textContent = '';
    select('#adminToast').textContent = '';
    select('#adminToast').classList.remove('show');
    select('#adminShell').hidden = true;
    select('#loginScreen').hidden = false;
    select('#loginMessage').textContent = message;
    select('#username').focus();
}

async function api(url, options = {}) {
    const response = await fetch(url, {
        credentials: 'same-origin', ...options,
        headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
        login(sessionLoginMessage(sessionEstablished));
        throw new Error('unauthorized');
    }
    if (!response.ok) throw new Error(data.message || '请求失败');
    return data;
}

const partner = createPartnerSales({
    root: select('#partnerView'),
    api,
    notify: toast,
    navigate: setView,
    onData: ({ profile }) => setLeadPermission(profile),
});

function showError(error) {
    if (error.message !== 'unauthorized') toast(error.message || '请求失败');
}

function markUpdated() {
    select('#lastUpdated').textContent = `更新于 ${new Date().toLocaleTimeString('zh-CN', {
        timeZone: 'Asia/Shanghai', hour12: false, hour: '2-digit', minute: '2-digit',
    })}`;
}

async function refreshCurrent(options) {
    const request = ++loadRequest;
    const view = state.view;
    const button = select('#refreshCurrent');
    button.disabled = true;
    button.textContent = '刷新中…';

    try {
        let success = false;
        if (view === 'customers') success = await loadCustomers();
        else if (view === 'knowledge') success = await loadKnowledge();
        else success = await partner.show(view, options);
        if (success && request === loadRequest) markUpdated();
    } catch (error) {
        if (request === loadRequest) showError(error);
    } finally {
        if (request === loadRequest) {
            button.disabled = false;
            button.textContent = '刷新';
        }
    }
}

function setView(view, options) {
    if (!views[view]) return;
    state.view = view;
    select('#pageTitle').textContent = views[view];
    select('#lastUpdated').textContent = '';
    select('#customersView').hidden = view !== 'customers';
    select('#knowledgeView').hidden = view !== 'knowledge';
    const hidePartner = view === 'customers' || view === 'knowledge';
    select('#partnerView').hidden = hidePartner;
    if (hidePartner) partner.hide();
    for (const button of navigation) {
        const active = button.dataset.view === view;
        button.classList.toggle('active', active);
        if (active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    }
    return refreshCurrent(options);
}

function showWorkspace(session) {
    if (session.principal?.role !== 'sales') throw new Error('unauthorized');
    sessionEstablished = true;
    select('#advisorName').textContent = session.principal.displayName;
    select('#loginScreen').hidden = true;
    select('#adminShell').hidden = false;
    return setView('overview');
}

select('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = select('#loginButton');
    if (button.disabled) return;
    button.disabled = true;
    try {
        await api('/api/sales/login', {
            method: 'POST',
            body: JSON.stringify({ username: select('#username').value, password: select('#password').value }),
        });
        await showWorkspace(await api('/api/session'));
    } catch (error) {
        select('#loginMessage').textContent = error.message === 'unauthorized'
            ? '请检查销售账号和密码。' : error.message;
    } finally {
        select('#password').value = '';
        button.disabled = false;
    }
});

select('#logoutButton').addEventListener('click', async () => {
    try {
        await api('/api/session/logout', { method: 'POST', body: '{}' });
        sessionEstablished = false;
        login('已安全退出');
    } catch (error) {
        showError(error);
    }
});

async function loadCustomers() {
    const request = ++customerRequest;
    const query = select('#customerSearch').value.trim();
    const data = await api(`/api/sales/customers?query=${encodeURIComponent(query)}&pageSize=100`);
    if (request !== customerRequest || state.view !== 'customers') return false;

    select('#customerCount').textContent = `${data.total} 位客户`;
    select('#customersBody').innerHTML = data.items.map((customer) => `<tr data-customer-row>
        <td data-label="客户"><button class="ps-text-link ps-customer-link" type="button" data-customer="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</button>
            <small>${escapeHtml(customer.id)}</small></td>
        <td data-label="联系方式">${escapeHtml(customer.contact || customer.email || '—')}</td>
        <td data-label="最近期次">${escapeHtml(customer.periodLabel || '—')}</td>
        <td data-label="会员期限">${formatDate(customer.membershipExpiresAt)}</td>
        <td data-label="跟进阶段"><span class="status-pill">${followUpStatus[customer.status] || '待确认'}</span></td>
        <td data-label="会员状态"><span class="status-pill">${member(customer)}</span></td>
    </tr>`).join('') || '<tr><td class="ps-muted" colspan="6">暂无匹配的已分配客户。</td></tr>';

    return true;
}

function closeCustomer({ restoreFocus = true } = {}) {
    drawerRequest += 1;
    select('#adminShell').inert = false;
    select('#drawer').hidden = true;
    select('#drawerContent').replaceChildren();
    select('#drawerTitle').textContent = '客户详情';
    document.body.style.overflow = '';
    if (restoreFocus && drawerTrigger) {
        const target = drawerTrigger.isConnected ? drawerTrigger : [...select('#customersBody').querySelectorAll('[data-customer]')]
            .find((button) => button.dataset.customer === drawerTrigger.dataset.customer);
        target?.focus();
    }
    drawerTrigger = undefined;
}

function bookingForm() {
    return `<form class="admin-form" id="bookingForm">
        <h4>建立会员后续预约</h4>
        <label>期次编号<input id="periodId" required></label>
        <label>期次名称<input id="periodLabel" required></label>
        <label>同行人数<input id="guestCount" type="number" min="1" max="10" value="1" required></label>
        <label>同行关系<input id="relationship" placeholder="本人 / 父母 / 家庭"></label>
        <label>内部备注<textarea id="bookingNote"></textarea></label>
        <button type="submit">建立内部预约</button>
    </form>`;
}

function setLeadPermission(profile) {
    const blocked = profile?.qualityStatus === 'paused' || profile?.status === 'suspended';
    select('#leadPanelToggle').disabled = blocked;
    select('#leadRestriction').hidden = !blocked;
    select('#leadRestriction').textContent = blocked ? '新增线索暂缓，请查看经营概览中的复核安排。' : '';
    if (blocked) showLeadPanel(false);
}

function showLeadPanel(visible) {
    select('#leadPanel').hidden = !visible;
    select('#leadPanelToggle').setAttribute('aria-expanded', String(visible));
    if (visible) select('#leadCreateForm [name="name"]').focus();
}

select('#leadPanelToggle').addEventListener('click', () => showLeadPanel(select('#leadPanel').hidden));
select('#leadCreateForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    const feedback = select('#leadFeedback');
    if (button.disabled || select('#leadPanelToggle').disabled) return;
    const fields = new FormData(form);
    const contact = fields.get('contact').trim();
    const email = fields.get('email').trim();
    if (!contact && !email) {
        feedback.textContent = '请填写微信、手机或邮箱。';
        form.elements.namedItem('contact').focus();
        return;
    }
    leadRequestId ||= crypto.randomUUID();
    const request = leadRequestId;
    button.disabled = true;
    feedback.textContent = '正在保存…';
    try {
        await api('/api/sales/customers', {
            method: 'POST',
            body: JSON.stringify({
                name: fields.get('name').trim(),
                contact,
                email,
                consent: fields.get('consent') === 'on',
                requestId: leadRequestId,
            }),
        });
        if (request !== leadRequestId) return;
        leadRequestId = undefined;
        feedback.textContent = '';
        form.reset();
        showLeadPanel(false);
        toast('已保存客户线索');
        if (state.view === 'customers') {
            select('#customerSearch').value = '';
            await loadCustomers();
        }
    } catch (error) {
        if (request === leadRequestId) feedback.textContent = error.message;
        else showError(error);
    } finally {
        button.disabled = false;
    }
});

function followUpForm(customer) {
    const editable = editableFollowUp.includes(customer.status);
    return `<form class="ps-form ps-follow-up" id="followUpForm">
        <h3>客户跟进</h3>
        ${editable ? `<label>跟进阶段<select name="status">
            ${editableFollowUp.map((status) => `<option value="${status}"${status === customer.status ? ' selected' : ''}>${followUpStatus[status]}</option>`).join('')}
        </select></label>` : `<p class="ps-muted">跟进阶段 ${followUpStatus[customer.status] || '待确认'}</p>`}
        <label>销售备注<textarea name="salesNote" rows="3" maxlength="2000">${escapeHtml(customer.salesNote)}</textarea></label>
        <p class="ps-form-feedback" data-follow-up-feedback role="status"></p>
        <button class="ps-button primary" type="submit">保存跟进</button>
    </form>`;
}

async function submitFollowUp(event, customer) {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    const feedback = form.querySelector('[data-follow-up-feedback]');
    if (button.disabled) return;
    const fields = new FormData(form);
    const status = fields.get('status');
    button.disabled = true;
    feedback.textContent = '正在保存…';
    try {
        await api(`/api/sales/customers/${encodeURIComponent(customer.id)}/follow-up`, {
            method: 'PATCH',
            body: JSON.stringify({ ...(status ? { status } : {}), salesNote: fields.get('salesNote').trim() }),
        });
        feedback.textContent = '';
        if (form.isConnected) toast('跟进记录已保存');
        if (state.view === 'customers') await loadCustomers();
    } catch (error) {
        if (form.isConnected) feedback.textContent = error.message;
    } finally {
        button.disabled = false;
    }
}

async function submitBooking(event, customer) {
    event.preventDefault();
    const button = event.target.querySelector('button[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    const request = drawerRequest;
    try {
        await api(`/api/sales/customers/${encodeURIComponent(customer.id)}/internal-bookings`, {
            method: 'POST',
            body: JSON.stringify({
                periodId: select('#periodId').value,
                periodLabel: select('#periodLabel').value,
                guestCount: Number(select('#guestCount').value),
                relationship: select('#relationship').value,
                note: select('#bookingNote').value,
            }),
        });
        toast('后续预约已建立');
        if (request === drawerRequest) closeCustomer();
        if (state.view === 'customers') await loadCustomers();
    } catch (error) {
        showError(error);
    } finally {
        button.disabled = false;
    }
}

async function openCustomer(trigger) {
    const request = ++drawerRequest;
    const customer = await api(`/api/sales/customers/${encodeURIComponent(trigger.dataset.customer)}`);
    if (request !== drawerRequest || state.view !== 'customers' || !trigger.isConnected) return;
    drawerTrigger = trigger;
    select('#drawerTitle').textContent = customer.name;
    select('#drawerContent').innerHTML = `<div class="drawer-content">
        <section class="order-identity"><p>${escapeHtml(customer.id)}</p><h3>${escapeHtml(customer.name)}</h3>
            <span class="status-pill">${member(customer)}</span></section>
        <dl class="detail-grid">
            <div><dt>联系方式</dt><dd>${escapeHtml(customer.contact || customer.email || '—')}</dd></div>
            <div><dt>会员到期</dt><dd>${formatDate(customer.membershipExpiresAt)}</dd></div>
            <div><dt>内部预约</dt><dd>${(customer.internalBookings || []).length} 条</dd></div>
        </dl>
        <button type="button" class="ps-button ps-drawer-draft" id="customerDraft">创建订单草稿</button>
        ${followUpForm(customer)}
        ${member(customer) === '会员有效' ? bookingForm()
            : '<section class="detail-section"><h4>预约状态</h4><p>请按新客户流程重新评估会员及预约资格。</p></section>'}
    </div>`;
    select('#adminShell').inert = true;
    select('#drawer').hidden = false;
    document.body.style.overflow = 'hidden';
    select('.drawer-head [data-close-drawer]').focus();
    select('#customerDraft').onclick = () => {
        closeCustomer({ restoreFocus: false });
        setView('orders', { customer });
    };
    select('#followUpForm').addEventListener('submit', (event) => submitFollowUp(event, customer));
    select('#bookingForm')?.addEventListener('submit', (event) => submitBooking(event, customer));
}

function safeSource(source) {
    try {
        const url = new URL(source.url);
        if (url.protocol === 'https:' || url.protocol === 'http:') return `<a href="${escapeHtml(url.href)}" target="_blank" rel="noreferrer">${escapeHtml(source.title)}</a>`;
    } catch {
        return '';
    }
    return '';
}

function renderKnowledge() {
    const lookup = select('#knowledgeSearch').value.trim().toLowerCase();
    const items = state.knowledge.filter((entry) =>
        `${entry.stage}${entry.question}${entry.shortAnswer}${entry.talkingPoints.join('')}`.toLowerCase().includes(lookup));
    select('#knowledgeList').innerHTML = items.map((entry) => {
        const sources = entry.sources.map(safeSource).filter(Boolean);
        return `<article class="knowledge-card">
            <header><span>${escapeHtml(entry.stage)}</span><b>标准口径</b></header>
            <h3>${escapeHtml(entry.question)}</h3><p>${escapeHtml(entry.shortAnswer)}</p>
            <ul>${entry.talkingPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul>
            ${sources.length ? `<small>参考 ${sources.join(' · ')}</small>` : ''}
        </article>`;
    }).join('') || '<p class="ps-muted">暂无匹配的销售答疑。</p>';
}

async function loadKnowledge() {
    const request = loadRequest;
    const response = await api('/api/sales/knowledge');
    if (request !== loadRequest || state.view !== 'knowledge') return false;
    state.knowledge = response.items;
    renderKnowledge();
    return true;
}

navigation.forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
select('#refreshCurrent').addEventListener('click', () => refreshCurrent());
select('#customerSearch').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadCustomers().catch(showError), 180);
});
select('#knowledgeSearch').addEventListener('input', renderKnowledge);
select('#customersBody').addEventListener('click', (event) => {
    const row = event.target.closest('[data-customer-row]');
    const trigger = row?.querySelector('[data-customer]');
    if (trigger) openCustomer(trigger).catch(showError);
});
document.querySelectorAll('[data-close-drawer]').forEach((button) => button.addEventListener('click', () => closeCustomer()));
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !select('#drawer').hidden) closeCustomer();
});

try {
    await showWorkspace(await api('/api/session'));
} catch (error) {
    if (error.message === 'unauthorized') login(sessionLoginMessage(sessionEstablished));
    else login('工作台暂时无法连接，请重试。');
}
