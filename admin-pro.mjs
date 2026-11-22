import { consultationSection, bindConsultationFields } from './consultation-form.mjs?v=20261122-1';
import { advisorReportLabel, sessionLoginMessage } from './session-state.mjs?v=20261122-1';
import { createPartnerOwner } from './partner-owner.mjs?v=20261122-3';
import { createProgramPricesView } from './admin-program-prices.mjs?v=20261122-1';

const $=(s)=>document.querySelector(s), $$=(s)=>[...document.querySelectorAll(s)];
const state={view:'partnerOverview',customers:[],staff:[],knowledge:[],config:null,chart:null,trafficPeriod:'day',trafficClassification:'all',trafficPage:1};
const partnerTitles = {
    partnerOverview: ['OWNER WORKSPACE', '经营概览'],
    partnerPeople: ['PARTNER DEVELOPMENT', '伙伴与带教'],
    partnerOrders: ['ORDER ACCOUNTING', '订单与结算'],
    partnerProjects: ['OPERATING PROJECTS', '运营项目'],
    partnerPolicy: ['PARTNER POLICIES', '激励政策']
};
const titles={...partnerTitles,stats:['VISITOR INTELLIGENCE','访问统计'],customers:['CUSTOMER CONTINUITY','客户管理'],knowledge:['SALES PLAYBOOK','销售答疑'],prices:['','项目价格'],config:['COMMERCIAL CONTROL','商业配置'],staff:['ACCESS CONTROL','团队权限']};
const esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money=(v)=>`¥ ${Number(v||0).toLocaleString('zh-CN')}`;
const date=(v)=>v?new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)):'未启用';
const countText = (value) => Number.isFinite(value) ? value.toLocaleString('zh-CN') : '—';
let toastTimer, sessionEstablished = false, drawerTrigger, customerSearchTimer;
let customerPage = 1, customerListRequest = 0, customerDrawerRequest = 0;
const partnerOwner = createPartnerOwner({
    root: $('#partnerProgramView'), api, drawer: $('#drawerContent'),
    openDrawer, closeDrawer, toast, navigate: setView
});
function toast(message){$('#adminToast').textContent=message;$('#adminToast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#adminToast').classList.remove('show'),2600)}
function login(message=''){ closeDrawer(false);partnerOwner.clear();programPrices.clear();$('#adminShell').hidden=true;$('#loginScreen').hidden=false;$('#loginMessage').textContent=message;$('#password').focus() }
function workspace(){ $('#loginScreen').hidden=true;$('#adminShell').hidden=false }
async function api(url, options = {}) {
    const response = await fetch(url, {
        credentials: 'same-origin', ...options,
        headers: { 'content-type': 'application/json', ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data;
    if (response.status === 401) login(sessionLoginMessage(sessionEstablished));
    throw Object.assign(new Error(data.message || (response.status === 401 ? 'unauthorized' : '请求失败')), { status: response.status });
}
function stamp(){ $('#lastUpdated').textContent=`更新于 ${new Date().toLocaleTimeString('zh-CN',{hour12:false})}` }
const programPrices = createProgramPricesView($('#pricesView'), { api, esc, onSaved: () => { if (state.view === 'prices') stamp(); } });

async function handleLogin(e){e.preventDefault();const btn=$('#loginButton');btn.disabled=true;try{await api('/api/owner/login',{method:'POST',body:JSON.stringify({password:$('#password').value})});$('#password').value='';sessionEstablished=true;workspace();await loadCurrent()}catch(err){$('#loginMessage').textContent=err.message==='unauthorized'?'':err.message}finally{btn.disabled=false}}
async function logout(){await api('/api/session/logout',{method:'POST',body:'{}'}).catch(()=>{});sessionEstablished=false;login('已安全退出')}
async function setView(view, context = {}) {
    if (!Object.hasOwn(titles, view)) return;
    closeDrawer(false);
    state.view = view;
    const panelId = Object.hasOwn(partnerTitles, view) ? 'partnerProgramView' : `${view}View`;
    for (const panel of $$('.view-panel')) panel.hidden = panel.id !== panelId;
    for (const button of $$('[data-view]')) {
        const active = button.dataset.view === view;
        button.classList.toggle('active', active);
        if (active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    }
    const [eyebrow, title] = titles[view];
    $('#pageEyebrow').textContent = eyebrow;
    $('#pageEyebrow').hidden = !eyebrow;
    $('#pageTitle').textContent = title;
    const loaded = await loadCurrent();
    if (!loaded || state.view !== view) return;
    if (context.customerId && view === 'customers') await openCustomer(context.customerId).catch(error => toast(error.message));
    if (view === 'partnerOrders') {
        if (context.customer) partnerOwner.serviceOrderForm(context.customer, context.bookingId);
        else if (context.orderId) partnerOwner.orderDetail(context.orderId);
    }
}
async function loadCurrent({ refresh = false } = {}) {
    const view = state.view;
    const loaders = { stats: loadStats, customers: loadCustomers, knowledge: loadKnowledge, config: loadConfig, staff: loadStaff };
    try {
        if (Object.hasOwn(partnerTitles, view)) {
            if (!await partnerOwner.load(view)) return;
        } else if (view === 'prices') {
            if (!await programPrices.load({ refresh })) return;
        } else {
            await loaders[view]();
        }
        if (state.view === view) stamp();
        return true;
    } catch (error) {
        if (!$('#adminShell').hidden) toast(error.message);
    }
}

const trafficDate=(value)=>value?new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'—';
function renderTrafficIps(stats){const items=stats.topIPs||[];const pagination=stats.pagination||{};const empty=Array.isArray(stats.topIPs)?'当前筛选下暂无 IP 记录':'暂未取得 IP 记录';$('#trafficIpsBody').innerHTML=items.length?items.map(item=>`<tr><td><strong>${esc(item.ip)}</strong></td><td>${esc(item.location||'地区待确认')}</td><td>${countText(item.count)}<small>恶意路径 ${countText(item.maliciousCount)}</small></td><td>${trafficDate(item.lastVisit)}</td><td><span class="traffic-status traffic-${esc(item.classification?.kind||'unknown')}">${esc(item.classification?.label||'信息不足')}</span></td><td>${esc(item.classification?.reason||'尚无足够访问序列')}</td></tr>`).join(''):`<tr><td class="empty-state" colspan="6">${empty}</td></tr>`;$('#trafficPageInfo').textContent=`${countText(pagination.currentPage)} / ${countText(pagination.totalPages)} 页 · ${countText(pagination.totalIPs)} 个 IP`;$('#trafficPrev').disabled=!pagination.hasPrevPage;$('#trafficNext').disabled=!pagination.hasNextPage}
async function loadStats(){const query=new URLSearchParams({period:state.trafficPeriod,classification:state.trafficClassification,page:String(state.trafficPage)});const [live,stats]=await Promise.all([api('/api/owner/realtime'),api(`/api/owner/stats?${query}`)]);$('#todayVisits').textContent=countText(live.todayVisits);$('#todayUnique').textContent=countText(live.todayUniqueIPs);$('#totalVisits').textContent=countText(live.totalVisits);$('#totalIPs').textContent=countText(live.totalIPs);const summary=stats.summary||{};$('#trafficLikelyHuman').textContent=countText(summary.likely_human);$('#trafficAutomated').textContent=countText(summary.automated);$('#trafficScan').textContent=countText(summary.scan);$('#trafficHighRisk').textContent=countText(summary.high_risk);$('#trafficPeriod').value=state.trafficPeriod;$('#trafficClassification').value=state.trafficClassification;if(state.chart)state.chart.destroy();state.chart=new Chart($('#visitsChart'),{type:'line',data:{labels:(stats.periodData||[]).map(x=>x.label||x.date),datasets:[{label:'访问次数',data:(stats.periodData||[]).map(x=>x.visits),borderColor:'#e1c28b',backgroundColor:'rgba(225,194,139,.10)',fill:true,tension:.32,pointRadius:1},{label:'独立 IP',data:(stats.periodData||[]).map(x=>x.uniqueIPs),borderColor:'#86b2e5',backgroundColor:'transparent',fill:false,tension:.32,pointRadius:1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#a6b4ca'}}},scales:{x:{ticks:{color:'#a6b4ca'},grid:{color:'rgba(166,190,221,.13)'}},y:{ticks:{color:'#a6b4ca'},grid:{color:'rgba(166,190,221,.13)'}}}}});renderTrafficIps(stats)}
function memberLabel(c){if(!c.membershipExpiresAt)return '未启用';const days=Math.ceil((new Date(c.membershipExpiresAt)-Date.now())/86400000);if(days<0)return '已到期';if(days<=60)return `${days} 天后到期`;return '有效会员'}
function salesName(id){return state.staff.find(s=>s.id===id)?.displayName||'待分配'}
async function ensureStaff(){if(!state.staff.length)state.staff=(await api('/api/owner/staff')).items}
const intakeStages = { new: '待联系', contacted: '已联系', qualified: '需求已确认', confirmed: '已办理', closed: '已结案' };
const bookingStages = { draft: '待管理员确认', confirmed: '已确认', cancelled: '已取消' };
const orderStages = { draft: '草稿', signed: '已签约', delivered: '已确认交付', cancelled: '已取消' };

async function loadCustomers() {
    const request = ++customerListRequest;
    const params = new URLSearchParams({
        query: $('#customerSearch').value.trim(), status: $('#customerStage').value,
        bookingStatus: $('#customerBookingFilter').value, page: String(customerPage), pageSize: '25',
    });
    const [data] = await Promise.all([api(`/api/owner/customers?${params}`), ensureStaff()]);
    if (request !== customerListRequest || state.view !== 'customers') return;
    if (data.page > data.totalPages) {
        customerPage = data.totalPages;
        return loadCustomers();
    }
    state.customers = data.items;
    $('#customerCount').textContent = `${countText(data.total)} 条记录`;
    $('#customerPageInfo').textContent = `第 ${data.page} / ${data.totalPages} 页`;
    $('#customerPrev').disabled = data.page <= 1;
    $('#customerNext').disabled = data.page >= data.totalPages;
    const newCount = $('#navNewCount');
    newCount.hidden = !Number.isFinite(data.summary?.new);
    newCount.textContent = newCount.hidden ? '' : countText(data.summary.new);
    $('#customersBody').innerHTML = data.items.map(customer => `<tr>
        <td><button type="button" class="line-button" data-customer="${esc(customer.id)}">${esc(customer.name)}</button><small>${esc(customer.id)}</small></td>
        <td>${esc(customer.contact || customer.email || '—')}</td>
        <td>${esc(customer.programLabel || customer.periodLabel || '待确认')}
            ${customer.programLabel && customer.periodLabel ? `<small>${esc(customer.periodLabel)}</small>` : ''}</td>
        <td>${date(customer.membershipExpiresAt)}</td>
        <td>${esc(salesName(customer.assignedSalesId))}</td>
        <td><span class="status-pill">${esc(intakeStages[customer.status] || '待核对')}</span>
            ${customer.internalBookings?.some(item => item.status === 'draft') ? '<small>有后续预约待确认</small>' : ''}</td>
    </tr>`).join('') || '<tr><td class="empty-state" colspan="6">暂无匹配的客户或预约。</td></tr>';
}
function openDrawer(title, html, eyebrow='PRIVATE RECORD') {
    if ($('#drawer').hidden) drawerTrigger = document.activeElement;
    $('#drawerTitle').textContent = title;
    $('#drawerEyebrow').textContent = eyebrow;
    $('#drawerContent').innerHTML = `<div class="drawer-content">${html}</div>`;
    $('#drawer').hidden = false;
    $('#adminShell').inert = true;
    document.body.style.overflow = 'hidden';
    $('.drawer-head button').focus();
}
function closeDrawer(restoreFocus = true) {
    customerDrawerRequest++;
    $('#drawer').hidden = true;
    $('#adminShell').inert = false;
    $('#drawerContent').replaceChildren();
    document.body.style.overflow = '';
    if (restoreFocus === true) drawerTrigger?.focus();
    drawerTrigger = undefined;
}
function customerOptions(entries, selected) {
    return Object.entries(entries).map(([key, label]) => `<option value="${esc(key)}"${key === selected ? ' selected' : ''}>${esc(label)}</option>`).join('');
}

function bookingSection(customer, canOrder) {
    return (customer.internalBookings || []).map(booking => {
        const order = customer.linkedOrders?.find(item => item.bookingId === booking.id && item.state !== 'cancelled');
        return `<article class="customer-booking"><strong>${esc(booking.periodLabel)} · ${esc(bookingStages[booking.status] || booking.status)}</strong>
            <p>${esc(booking.guestCount)} 人 · ${esc(booking.relationship || '同行关系待确认')}</p>
            ${booking.note ? `<p>${esc(booking.note)}</p>` : ''}
            ${booking.reviewReason ? `<p>${esc(booking.reviewReason)}</p>` : ''}
            ${['draft', 'confirmed'].includes(booking.status) ? `<form class="admin-form" data-review-booking="${esc(booking.id)}">
                <label>预约处理<select name="status">${booking.status === 'draft' ? '<option value="confirmed">确认预约</option>' : ''}<option value="cancelled">取消预约</option></select></label>
                <label>处理依据<input name="reason" maxlength="400" placeholder="席位与客户沟通结果，或取消原因" required></label>
                <button type="submit">保存预约处理</button>
            </form>` : ''}
            ${booking.status === 'confirmed' && !order && canOrder ? `<button type="button" class="line-button" data-open-service="${esc(booking.id)}">为此预约开单</button>` : ''}
        </article>`;
    }).join('') || '<p>暂无后续预约。有效会员可由负责销售提交预约。</p>';
}

async function openCustomer(id) {
    const request = ++customerDrawerRequest;
    const path = `/api/owner/customers/${encodeURIComponent(id)}`;
    const [customer] = await Promise.all([api(path), ensureStaff()]);
    if (request !== customerDrawerRequest || state.view !== 'customers' || $('#adminShell').hidden) return;
    const orders = customer.linkedOrders || [];
    const canOrder = ['qualified', 'confirmed'].includes(customer.status);
    const files = (customer.attachments || []).map(file => `<a href="/api/owner/applications/${encodeURIComponent(id)}/attachments/${encodeURIComponent(file.id)}">${esc(file.displayName)} · 下载</a>`).join('') || '无附件';
    const source = customer.contactConsent ? '官网顾问预约' : customer.source?.page === 'sales-workbench' ? '销售录入' : '期次申请';
    const staffOptions = Object.fromEntries(state.staff.filter(sales => sales.active || sales.id === customer.assignedSalesId)
        .map(sales => [sales.id, sales.displayName + (sales.active ? '' : '（已停用）')]));
    openDrawer(customer.name, `<section class="order-identity"><p>${esc(id)}</p><h3>${esc(customer.name)}</h3>
        <span class="status-pill">${esc(intakeStages[customer.status] || '待核对')}</span></section>
        <dl class="detail-grid">
            <div><dt>来源</dt><dd>${esc(source)}</dd></div>
            <div><dt>联系方式</dt><dd>${esc(customer.contact || customer.email || '—')}</dd></div>
            <div><dt>关注项目</dt><dd>${esc(customer.programLabel || '待确认')}</dd></div>
            <div><dt>意向期次</dt><dd>${esc(customer.periodLabel || '由顾问协调')}</dd></div>
            <div><dt>体检资料（客户填写）</dt><dd>${esc(advisorReportLabel(customer.reportStatus) || '未登记')}</dd></div>
            <div><dt>会员到期</dt><dd>${date(customer.membershipExpiresAt)}</dd></div>
            <div><dt>客户留言</dt><dd>${esc(customer.note || '—')}</dd></div>
            <div><dt>销售跟进记录</dt><dd>${esc(customer.salesNote || '—')}</dd></div>
            <div><dt>资料附件</dt><dd class="download-list">${files}</dd></div>
        </dl>
        <p data-customer-feedback class="customer-feedback" role="alert"></p>
        <section class="detail-section"><h4>分配与跟进</h4>
            <form class="admin-form" id="customerAssignment">
                <label>负责销售<select name="salesId">${customerOptions({ '': '待分配', ...staffOptions }, customer.assignedSalesId || '')}</select></label>
                <button type="submit">保存客户归属</button>
            </form>
            <form class="admin-form" id="customerFollowUp">
                <label>跟进阶段<select name="status">${customerOptions(intakeStages, customer.status)}</select></label>
                <label>管理员跟进记录<textarea name="adminNote" maxlength="2000">${esc(customer.adminNote)}</textarea></label>
                <button type="submit">保存跟进</button>
            </form>
        </section>
        ${consultationSection(customer, esc, { showReason: true })}
        <section class="detail-section"><h4>关联业务订单</h4>
            ${orders.length ? orders.map(order => `<p><button class="line-button" type="button" data-open-order="${esc(order.id)}">${esc(order.label)} · ${esc(orderStages[order.state] || order.state)}</button></p>`).join('') : '<p>当前没有关联订单。</p>'}
            ${canOrder ? '<button type="button" class="line-button" data-open-service="">开服务订单</button>' : '<p>先联系客户并保存「需求已确认」，即可开服务订单。</p>'}
        </section>
        <section class="detail-section"><h4>会员后续预约</h4>${bookingSection(customer, canOrder)}</section>
        <section class="detail-section"><h4>会员管理</h4>
            <form class="admin-form" id="memberAdjust">
                <label>赠送 / 调整会员期限<input name="expiresAt" type="date" value="${esc(customer.membershipExpiresAt?.slice(0, 10) || '')}" required></label>
                <label>调整原因<textarea name="reason" maxlength="400" required></textarea></label>
                <button type="submit">保存会员调整</button>
            </form>
            ${!customer.membershipExpiresAt ? '<form class="admin-form" id="memberActivate"><label>已确认的首期方案依据<input name="reason" maxlength="400" required></label><button type="submit">确认首次方案并启用会员</button></form>' : ''}
        </section>`);

    function bindMutation(form, url, method, message, mutate = body => body) {
        if (!form) return;
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const button = form.querySelector('button[type="submit"]');
            const feedback = $('[data-customer-feedback]');
            if (button.disabled) return;
            button.disabled = true;
            try {
                const data = mutate(Object.fromEntries(new FormData(form)));
                await api(url, { method, body: JSON.stringify(data) });
                toast(message);
                if (form.isConnected) await Promise.all([loadCustomers(), openCustomer(id)]);
            } catch (error) {
                feedback.textContent = error.message;
                if (feedback.isConnected) feedback.scrollIntoView({ block: 'nearest' });
            } finally {
                button.disabled = false;
            }
        });
    }
    bindMutation($('#customerAssignment'), path + '/assignment', 'PATCH', '客户归属已保存');
    bindMutation($('#customerFollowUp'), `/api/owner/applications/${encodeURIComponent(id)}`, 'PATCH', '跟进阶段已保存');
    const consultationForm = $('#consultationForm');
    bindConsultationFields(consultationForm);
    bindMutation(consultationForm, path + '/consultation', 'PATCH', '顾问预约安排已保存');
    bindMutation($('#memberAdjust'), path + '/membership', 'POST', '会员期限已保存', body => ({ ...body, type: 'owner_adjusted' }));
    bindMutation($('#memberActivate'), path + '/membership', 'POST', '首次会员已启用', body => ({ ...body, type: 'plan_confirmed', firstActivation: true }));
    for (const form of $$('[data-review-booking]')) {
        bindMutation(form, path + '/internal-bookings/' + encodeURIComponent(form.dataset.reviewBooking), 'PATCH', '预约处理已保存');
    }
    for (const control of $$('[data-open-order]')) control.onclick = () => setView('partnerOrders', { orderId: control.dataset.openOrder });
    for (const control of $$('[data-open-service]')) control.onclick = () => setView('partnerOrders', { customer, bookingId: control.dataset.openService });
}

async function loadKnowledge(){const data=await api('/api/owner/knowledge');state.knowledge=data.items;renderKnowledge()}
function renderKnowledge(){const q=$('#knowledgeSearch').value.trim().toLowerCase();const items=state.knowledge.filter(i=>`${i.stage}${i.question}${i.shortAnswer}`.toLowerCase().includes(q));$('#knowledgeList').innerHTML=items.map(i=>`<article class="knowledge-card" data-knowledge="${i.id}"><header><span>${esc(i.stage)}</span><b>${i.published?'已发布':'草稿'}</b></header><h3>${esc(i.question)}</h3><p>${esc(i.shortAnswer)}</p><small>${i.talkingPoints.map(esc).join(' · ')}</small></article>`).join('')}
function knowledgeForm(item={}){openDrawer(item.id?'编辑答疑':'新增答疑',`<form class="admin-form" id="knowledgeForm"><label>客户旅程阶段<select id="kStage">${['品牌与定位','首次沟通','预约规则','会员机制','健康资料','方案与费用','日本准备','抵日接待','医疗服务','在日行程','回国延续','异议与边界'].map(s=>`<option ${s===item.stage?'selected':''}>${s}</option>`).join('')}</select></label><label>客户问题<input id="kQuestion" value="${esc(item.question||'')}"></label><label>简明回答<textarea id="kAnswer">${esc(item.shortAnswer||'')}</textarea></label><label>销售要点（每行一条）<textarea id="kPoints">${esc((item.talkingPoints||[]).join('\n'))}</textarea></label><label>排序<input id="kOrder" type="number" value="${item.order||999}"></label><label class="check-field"><input id="kPublished" type="checkbox" ${item.published===false?'':'checked'}> 对销售发布</label><button type="submit">保存答疑</button></form>`);$('#knowledgeForm').onsubmit=async e=>{e.preventDefault();const body={stage:$('#kStage').value,question:$('#kQuestion').value,shortAnswer:$('#kAnswer').value,talkingPoints:$('#kPoints').value.split('\n').filter(Boolean),sources:item.sources||[],published:$('#kPublished').checked,order:Number($('#kOrder').value)};await api(item.id?`/api/owner/knowledge/${item.id}`:'/api/owner/knowledge',{method:item.id?'PATCH':'POST',body:JSON.stringify(body)});closeDrawer();toast('答疑已保存');await loadKnowledge()}}

const numericConfigLabels={fullPlanPrice:'标准方案价格',membershipFee:'会员年费',membershipMonths:'会员期限（月）',standardCapacity:'标准期内部席位',filialPrice:'敬亲礼遇期价格',filialFamilyGroups:'公开家庭组数',filialMaxGuests:'内部人数上限'};
function renderPrivateJournalControl(){const enabled=state.config?.showPrivateJournal===true;$('#privateJournalStatus').textContent=enabled?'已公开':'未公开';const button=$('#privateJournalToggle');button.textContent=enabled?'停止公开':'立即公开';button.disabled=false}
async function loadConfig(){state.config=await api('/api/owner/config');const numericFields=Object.entries(numericConfigLabels).map(([key,label])=>`<label><span>${label}</span><input name="${key}" type="number" value="${state.config[key]}"><small>${key.includes('Price')||key==='membershipFee'?money(state.config[key]):'仅内部可见'}</small></label>`).join('');$('#configFields').innerHTML=numericFields;renderPrivateJournalControl()}
async function togglePrivateJournal(){const button=$('#privateJournalToggle');const enabled=state.config?.showPrivateJournal===true;button.disabled=true;try{const saved=await api('/api/owner/config/private-journal',{method:'PATCH',body:JSON.stringify({enabled:!enabled})});state.config={...state.config,showPrivateJournal:saved.showPrivateJournal};renderPrivateJournalControl();toast(saved.showPrivateJournal?'方舟生命纪行已公开':'方舟生命纪行已停止公开')}catch(error){toast(error.message)}finally{button.disabled=false}}
async function saveConfig(e){e.preventDefault();const body={reason:$('#configReason').value};new FormData(e.currentTarget).forEach((v,k)=>{if(k in numericConfigLabels)body[k]=Number(v)});await api('/api/owner/config',{method:'PATCH',body:JSON.stringify(body)});$('#configReason').value='';toast('商业配置已保存');await loadConfig()}

async function loadStaff(){state.staff=(await api('/api/owner/staff')).items;$('#staffList').innerHTML=state.staff.map(s=>`<article class="staff-card"><div><span>${s.active?'ACTIVE':'DISABLED'}</span><h3>${esc(s.displayName)}</h3><p>${esc(s.username)}</p></div><div><button data-staff-status="${s.id}" data-active="${!s.active}">${s.active?'停用':'启用'}</button><button data-staff-reset="${s.id}">重置密码</button></div></article>`).join('')}
function newStaff(){openDrawer('新增销售账号',`<form class="admin-form" id="staffForm" autocomplete="off"><label>销售姓名<input id="sName" autocomplete="name" required></label><label>登录用户名<input id="sUsername" autocomplete="off" required></label><label>初始密码<input id="sPassword" type="password" autocomplete="new-password" minlength="10" required></label><button type="submit">创建账号</button></form>`);$('#staffForm').onsubmit=async e=>{e.preventDefault();await api('/api/owner/staff',{method:'POST',body:JSON.stringify({displayName:$('#sName').value,username:$('#sUsername').value,password:$('#sPassword').value})});closeDrawer();toast('销售账号已创建');await loadStaff()}}

$('#loginForm').onsubmit=handleLogin;$('#logoutButton').onclick=logout;$('#refreshCurrent').onclick=()=>loadCurrent({refresh:true});$$('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('#knowledgeSearch').oninput=renderKnowledge;$('#knowledgeList').onclick=e=>{const c=e.target.closest('[data-knowledge]');if(c)knowledgeForm(state.knowledge.find(i=>i.id===c.dataset.knowledge))};$('#newKnowledge').onclick=()=>knowledgeForm();$('#configForm').onsubmit=saveConfig;$('#privateJournalToggle').onclick=togglePrivateJournal;$('#trafficPeriod').onchange=e=>{state.trafficPeriod=e.target.value;state.trafficPage=1;loadStats()};$('#trafficClassification').onchange=e=>{state.trafficClassification=e.target.value;state.trafficPage=1;loadStats()};$('#trafficPrev').onclick=()=>{if(state.trafficPage>1){state.trafficPage-=1;loadStats()}};$('#trafficNext').onclick=()=>{state.trafficPage+=1;loadStats()};$('#newStaff').onclick=newStaff;$('#staffList').onclick=async e=>{const status=e.target.closest('[data-staff-status]');const reset=e.target.closest('[data-staff-reset]');if(status){await api(`/api/owner/staff/${status.dataset.staffStatus}/status`,{method:'PATCH',body:JSON.stringify({active:status.dataset.active==='true'})});toast('账号状态已更新');await loadStaff()}if(reset){const password=prompt('输入新的临时密码（至少 10 位）');if(password){await api(`/api/owner/staff/${reset.dataset.staffReset}/reset-password`,{method:'POST',body:JSON.stringify({password})});toast('密码已重置，旧会话已失效')}}};$$('[data-close-drawer]').forEach((button) => button.onclick = () => closeDrawer());
function refreshCustomers(page = 1) {
    customerPage = page;
    loadCustomers().catch(error => toast(error.message));
}
$('#customerSearch').oninput = () => {
    clearTimeout(customerSearchTimer);
    customerSearchTimer = setTimeout(() => refreshCustomers(), 180);
};
$('#customerStage').onchange = () => refreshCustomers();
$('#customerBookingFilter').onchange = () => refreshCustomers();
$('#customerPrev').onclick = () => refreshCustomers(customerPage - 1);
$('#customerNext').onclick = () => refreshCustomers(customerPage + 1);
$('#customersBody').onclick = event => {
    const button = event.target.closest('[data-customer]');
    if (button) openCustomer(button.dataset.customer).catch(error => toast(error.message));
};
document.addEventListener('keydown', (event) => {
    if ($('#drawer').hidden) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        closeDrawer();
        return;
    }
    if (event.key === 'Tab') {
        const focusable = [...$('.drawer-panel').querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
            .filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }
});
try{const session=await api('/api/session');if(session.principal.role!=='owner')throw new Error('unauthorized');sessionEstablished=true;workspace();await loadCurrent()}catch(err){if(err.message!=='unauthorized')login('后台连接失败')}
