const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const loginScreen = $('#loginScreen');
const adminShell = $('#adminShell');
const toast = $('#adminToast');
const statusLabels = { new: '新申请', contacted: '已联系', qualified: '待确认', confirmed: '已确认', closed: '已关闭' };
let currentView = 'stats';
let currentPeriod = 'day';
let currentOrder = null;
let chart = null;
let toastTimer = null;

function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function formatDate(value, withTime = true) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit', day: '2-digit',
        ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
    }).format(date);
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function showLogin(message = '') {
    adminShell.hidden = true;
    loginScreen.hidden = false;
    $('#loginMessage').textContent = message;
    $('#password').focus();
}

function showAdmin() {
    loginScreen.hidden = true;
    adminShell.hidden = false;
}

async function api(url, options = {}) {
    const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: { ...(options.body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...(options.headers || {}) },
    });
    if (response.status === 401) {
        showLogin('会话已失效，请重新登录');
        throw new Error('unauthorized');
    }
    const contentType = response.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) throw new Error(body?.message || '请求失败');
    return body;
}

async function handleLogin(event) {
    event.preventDefault();
    const button = $('#loginButton');
    button.disabled = true;
    button.textContent = '正在验证…';
    $('#loginMessage').textContent = '';
    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: $('#password').value }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || '登录失败');
        $('#password').value = '';
        showAdmin();
        await Promise.all([loadStats(), loadOrders()]);
    } catch (error) {
        $('#loginMessage').textContent = error.message;
    } finally {
        button.disabled = false;
        button.textContent = '进入管理中心';
    }
}

async function logout() {
    try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); } catch { /* session may already be gone */ }
    showLogin('已安全退出');
}

function setView(view) {
    currentView = view;
    $('#statsView').hidden = view !== 'stats';
    $('#ordersView').hidden = view !== 'orders';
    $$('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
    $('#pageTitle').textContent = view === 'stats' ? '访问统计' : '顾问申请';
    $('#pageEyebrow').textContent = view === 'stats' ? 'VISITOR INTELLIGENCE' : 'PRIVATE ADVISORY ORDERS';
}

function stampUpdated() {
    $('#lastUpdated').textContent = `更新于 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())}`;
}

function renderChart(periodData = []) {
    if (chart) chart.destroy();
    const canvas = $('#visitsChart');
    chart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: periodData.map((item) => item.label || item.date),
            datasets: [
                { label: '访问量', data: periodData.map((item) => item.visits), borderColor: '#b9a27b', backgroundColor: 'rgba(185,162,123,.1)', borderWidth: 1.5, pointRadius: 1.5, tension: .32, fill: true },
                { label: '独立访客', data: periodData.map((item) => item.uniqueIPs), borderColor: '#789d88', borderWidth: 1, pointRadius: 1, tension: .32 },
            ],
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#777b76', boxWidth: 12, boxHeight: 1, font: { size: 10 } } } },
            scales: {
                x: { grid: { color: 'rgba(221,207,179,.06)' }, ticks: { color: '#5f635f', maxTicksLimit: 10, font: { size: 9 } } },
                y: { beginAtZero: true, grid: { color: 'rgba(221,207,179,.07)' }, ticks: { color: '#5f635f', precision: 0, font: { size: 9 } } },
            },
        },
    });
}

function renderIPs(data) {
    const body = $('#ipBody');
    const items = data.topIPs || [];
    body.innerHTML = items.map((item) => `<tr>
        <td><strong>${escapeHtml(item.ip)}</strong></td>
        <td>${escapeHtml(item.location || '未知')}</td>
        <td>${Number(item.count || 0).toLocaleString('zh-CN')}</td>
        <td>${formatDate(item.firstVisit)}</td>
        <td>${formatDate(item.lastVisit)}</td>
        <td><span class="status-pill ${item.isBlacklisted ? 'status-new' : 'status-contacted'}">${item.isBlacklisted ? '风险' : '正常'}</span></td>
    </tr>`).join('');
    $('#ipEmpty').hidden = items.length !== 0;
    $('#ipResultCount').textContent = `${data.pagination?.totalIPs ?? items.length} 条记录`;
}

async function loadStats() {
    try {
        const [realtime, stats] = await Promise.all([
            api('/api/admin/realtime'),
            api(`/api/admin/stats?period=${encodeURIComponent(currentPeriod)}&filter=${encodeURIComponent($('#ipFilter').value)}`),
        ]);
        $('#todayVisits').textContent = Number(realtime.todayVisits || 0).toLocaleString('zh-CN');
        $('#todayUnique').textContent = Number(realtime.todayUniqueIPs || 0).toLocaleString('zh-CN');
        $('#totalVisits').textContent = Number(realtime.totalVisits || 0).toLocaleString('zh-CN');
        $('#totalIPs').textContent = Number(realtime.totalIPs || 0).toLocaleString('zh-CN');
        renderChart(stats.periodData || []);
        renderIPs(stats);
        stampUpdated();
    } catch (error) {
        if (error.message !== 'unauthorized') showToast(`统计读取失败：${error.message}`);
    }
}

function renderOrderMetrics(summary = {}) {
    $('#metricAll').textContent = summary.all ?? 0;
    $('#metricNew').textContent = summary.new ?? 0;
    $('#metricContacted').textContent = summary.contacted ?? 0;
    $('#metricConfirmed').textContent = summary.confirmed ?? 0;
    $('#navNewCount').textContent = summary.new ?? 0;
}

function updatePeriodOptions(periods = []) {
    const select = $('#periodFilter');
    const selected = select.value;
    select.innerHTML = '<option value="all">全部期次</option>' + periods.map((period) => `<option value="${escapeHtml(period.id)}">${escapeHtml(period.label)}</option>`).join('');
    if ([...select.options].some((option) => option.value === selected)) select.value = selected;
}

function renderOrders(data) {
    $('#ordersBody').innerHTML = data.items.map((order) => `<tr data-order-id="${escapeHtml(order.id)}" tabindex="0">
        <td>${formatDate(order.createdAt)}</td>
        <td><strong>${escapeHtml(order.name)}</strong><small>${escapeHtml(order.id)}</small></td>
        <td>${escapeHtml(order.contact || order.email || '—')}<small>${escapeHtml(order.company || '')}</small></td>
        <td>${escapeHtml(order.periodLabel || '—')}</td>
        <td>${order.attachments?.length || 0}</td>
        <td><span class="status-pill status-${escapeHtml(order.status)}">${escapeHtml(statusLabels[order.status] || order.status)}</span></td>
    </tr>`).join('');
    $('#resultCount').textContent = `${data.total} 条记录`;
    $('#emptyState').hidden = data.items.length !== 0;
    renderOrderMetrics(data.summary);
    updatePeriodOptions(data.periods);
}

async function loadOrders() {
    const params = new URLSearchParams({
        status: $('#statusFilter').value,
        periodId: $('#periodFilter').value,
        query: $('#orderSearch').value.trim(),
        page: '1',
        pageSize: '100',
    });
    try {
        const data = await api(`/api/admin/applications?${params}`);
        renderOrders(data);
        stampUpdated();
    } catch (error) {
        if (error.message !== 'unauthorized') showToast(`订单读取失败：${error.message}`);
    }
}

function attachmentMarkup(order) {
    if (!order.attachments?.length) return '<p>客户未上传附件</p>';
    return `<div class="attachment-list">${order.attachments.map((file) => `<a href="/api/admin/applications/${encodeURIComponent(order.id)}/attachments/${encodeURIComponent(file.id)}" download><span>${escapeHtml(file.displayName)}<small>${(file.size / 1024 / 1024).toFixed(1)} MB</small></span><small>下载</small></a>`).join('')}</div>`;
}

function renderDrawer(order) {
    currentOrder = order;
    $('#drawerContent').innerHTML = `<div class="drawer-content">
        <section class="order-identity"><p>${escapeHtml(order.id)}</p><h3>${escapeHtml(order.name)}</h3><span class="status-pill status-${escapeHtml(order.status)}">${escapeHtml(statusLabels[order.status])}</span></section>
        <dl class="detail-grid">
            <div><dt>提交时间</dt><dd>${escapeHtml(new Date(order.createdAt).toLocaleString('zh-CN'))}</dd></div>
            <div><dt>申请期次</dt><dd>${escapeHtml(order.periodLabel || '—')}</dd></div>
            <div><dt>微信 / 手机</dt><dd>${escapeHtml(order.contact || '—')}</dd></div>
            <div><dt>邮箱</dt><dd>${escapeHtml(order.email || '—')}</dd></div>
            <div><dt>企业 / 身份</dt><dd>${escapeHtml(order.company || '—')}</dd></div>
        </dl>
        <section class="detail-section"><h4>希望优先了解</h4><p>${escapeHtml(order.note || '客户暂未补充')}</p></section>
        <section class="detail-section"><h4>附件 ${order.attachments?.length || 0}</h4>${attachmentMarkup(order)}</section>
        <form class="admin-form" id="orderUpdateForm">
            <label>状态<select id="drawerStatus">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${order.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
            <label>内部备注<textarea id="drawerNote" placeholder="仅后台可见">${escapeHtml(order.adminNote || '')}</textarea></label>
            <button type="submit">保存处理结果</button>
        </form>
    </div>`;
    $('#orderDrawer').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#orderUpdateForm').addEventListener('submit', updateOrder);
}

async function openOrder(id) {
    try { renderDrawer(await api(`/api/admin/applications/${encodeURIComponent(id)}`)); }
    catch (error) { if (error.message !== 'unauthorized') showToast(error.message); }
}

function closeDrawer() {
    $('#orderDrawer').hidden = true;
    document.body.style.overflow = '';
    currentOrder = null;
}

async function updateOrder(event) {
    event.preventDefault();
    try {
        const result = await api(`/api/admin/applications/${encodeURIComponent(currentOrder.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: $('#drawerStatus').value, adminNote: $('#drawerNote').value.trim() }),
        });
        renderDrawer(result.order);
        await loadOrders();
        showToast('订单处理结果已保存');
    } catch (error) {
        if (error.message !== 'unauthorized') showToast(`保存失败：${error.message}`);
    }
}

let searchTimer;
$('#loginForm').addEventListener('submit', handleLogin);
$('#logoutButton').addEventListener('click', logout);
$('#refreshCurrent').addEventListener('click', () => currentView === 'stats' ? loadStats() : loadOrders());
$$('[data-view]').forEach((button) => button.addEventListener('click', () => { setView(button.dataset.view); if (button.dataset.view === 'orders') loadOrders(); }));
$$('[data-period]').forEach((button) => button.addEventListener('click', () => {
    currentPeriod = button.dataset.period;
    $$('[data-period]').forEach((item) => item.classList.toggle('active', item === button));
    loadStats();
}));
$('#ipFilter').addEventListener('change', loadStats);
$('#statusFilter').addEventListener('change', loadOrders);
$('#periodFilter').addEventListener('change', loadOrders);
$('#orderSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadOrders, 240); });
$('#ordersBody').addEventListener('click', (event) => { const row = event.target.closest('[data-order-id]'); if (row) openOrder(row.dataset.orderId); });
$('#ordersBody').addEventListener('keydown', (event) => { const row = event.target.closest('[data-order-id]'); if (row && (event.key === 'Enter' || event.key === ' ')) openOrder(row.dataset.orderId); });
$$('[data-close-drawer]').forEach((button) => button.addEventListener('click', closeDrawer));

try {
    await api('/api/admin/session');
    showAdmin();
    await Promise.all([loadStats(), loadOrders()]);
} catch (error) {
    if (error.message !== 'unauthorized') showLogin('后台连接失败，请稍后重试');
}
