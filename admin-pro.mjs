import { advisorReportLabel, sessionLoginMessage } from './session-state.mjs?v=20261122-1';
import { createPartnerOwner } from './partner-owner.mjs?v=20261122-1';
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
let toastTimer,sessionEstablished=false,drawerTrigger;
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
function setView(view) {
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
    loadCurrent();
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
async function loadCustomers() {
    await ensureStaff();
    const query = $('#customerSearch').value.trim();
    const data = await api(`/api/owner/customers?query=${encodeURIComponent(query)}&pageSize=100`);
    state.customers = data.items;
    $('#customerCount').textContent = Number.isFinite(data.total) ? `${countText(data.total)} 位客户` : '—';
    const newCount = $('#navNewCount');
    newCount.hidden = !Number.isFinite(data.summary?.new);
    newCount.textContent = newCount.hidden ? '' : countText(data.summary.new);
    $('#customersBody').innerHTML = data.items.map(customer => `<tr data-customer="${esc(customer.id)}" tabindex="0">
        <td><strong>${esc(customer.name)}</strong><small>${esc(customer.id)}</small></td>
        <td>${esc(customer.contact || customer.email || '—')}</td>
        <td>${esc(customer.programLabel || customer.periodLabel || '—')}
            ${customer.programLabel && customer.periodLabel ? `<small>${esc(customer.periodLabel)}</small>` : ''}</td>
        <td>${date(customer.membershipExpiresAt)}</td>
        <td>${esc(salesName(customer.assignedSalesId))}</td>
        <td><span class="status-pill">${esc(memberLabel(customer))}</span></td>
    </tr>`).join('') || '<tr><td class="empty-state" colspan="6">暂无匹配的客户。</td></tr>';
}
function openDrawer(title, html, eyebrow='PRIVATE RECORD') {
    if ($('#drawer').hidden) drawerTrigger = document.activeElement;
    $('#drawerTitle').textContent = title;
    $('#drawerEyebrow').textContent = eyebrow;
    $('#drawerContent').innerHTML = `<div class="drawer-content">${html}</div>`;
    $('#drawer').hidden = false;
    document.body.style.overflow = 'hidden';
    $('.drawer-head button').focus();
}
function closeDrawer(restoreFocus = true) {
    $('#drawer').hidden = true;
    $('#drawerContent').replaceChildren();
    document.body.style.overflow = '';
    if (restoreFocus === true) drawerTrigger?.focus();
    drawerTrigger = undefined;
}
async function openCustomer(id){await ensureStaff();const c=await api(`/api/owner/customers/${encodeURIComponent(id)}`);const files=(c.attachments||[]).map(f=>`<a href="/api/owner/applications/${encodeURIComponent(c.id)}/attachments/${encodeURIComponent(f.id)}">${esc(f.displayName)} · 下载</a>`).join('')||'无附件';openDrawer(c.name,`<section class="order-identity"><p>${esc(c.id)}</p><h3>${esc(c.name)}</h3><span class="status-pill">${esc(memberLabel(c))}</span></section><dl class="detail-grid"><div><dt>联系方式</dt><dd>${esc(c.contact||c.email||'—')}</dd></div><div><dt>申请期次</dt><dd>${esc(c.periodLabel||'—')}</dd></div><div><dt>关注项目</dt><dd>${esc(c.programLabel || '未登记')}</dd></div><div><dt>体检资料（客户填写）</dt><dd>${esc(advisorReportLabel(c.reportStatus) || (c.reportStatus ? '待确认' : '未登记'))}</dd></div><div><dt>会员到期</dt><dd>${date(c.membershipExpiresAt)}</dd></div><div><dt>资料附件</dt><dd class="download-list">${files}</dd></div></dl><form class="admin-form" id="customerAdminForm"><label>负责销售<select id="assignSales"><option value="">待分配</option>${state.staff.map(s=>`<option value="${esc(s.id)}" ${s.id===c.assignedSalesId?'selected':''}>${esc(s.displayName)}</option>`).join('')}</select></label><button type="button" id="saveAssignment">保存客户归属</button><label>赠送 / 调整会员期限<input id="memberExpiry" type="date" value="${c.membershipExpiresAt?c.membershipExpiresAt.slice(0,10):''}"></label><label>调整原因<textarea id="memberReason" placeholder="必填：赠送原因或调整依据"></textarea></label><button type="button" id="adjustMembership">仅所有者可调整</button>${!c.membershipExpiresAt?'<button type="button" class="secondary-action" id="activateMembership">确认首次方案并启用会员</button>':''}</form>`);$('#saveAssignment').onclick=async()=>{await api(`/api/owner/customers/${encodeURIComponent(id)}/assignment`,{method:'PATCH',body:JSON.stringify({salesId:$('#assignSales').value})});toast('客户归属已保存');await loadCustomers()};$('#adjustMembership').onclick=async()=>{await api(`/api/owner/customers/${encodeURIComponent(id)}/membership`,{method:'POST',body:JSON.stringify({type:'owner_adjusted',expiresAt:$('#memberExpiry').value,reason:$('#memberReason').value})});toast('会员期限已调整并记录原因');closeDrawer();await loadCustomers()};if($('#activateMembership'))$('#activateMembership').onclick=async()=>{await api(`/api/owner/customers/${encodeURIComponent(id)}/membership`,{method:'POST',body:JSON.stringify({type:'plan_confirmed'})});toast('首年会员已启用');closeDrawer();await loadCustomers()}}

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

$('#loginForm').onsubmit=handleLogin;$('#logoutButton').onclick=logout;$('#refreshCurrent').onclick=()=>loadCurrent({refresh:true});$$('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));$('#customerSearch').oninput=()=>setTimeout(loadCustomers,180);$('#customersBody').onclick=e=>{const r=e.target.closest('[data-customer]');if(r)openCustomer(r.dataset.customer)};$('#knowledgeSearch').oninput=renderKnowledge;$('#knowledgeList').onclick=e=>{const c=e.target.closest('[data-knowledge]');if(c)knowledgeForm(state.knowledge.find(i=>i.id===c.dataset.knowledge))};$('#newKnowledge').onclick=()=>knowledgeForm();$('#configForm').onsubmit=saveConfig;$('#privateJournalToggle').onclick=togglePrivateJournal;$('#trafficPeriod').onchange=e=>{state.trafficPeriod=e.target.value;state.trafficPage=1;loadStats()};$('#trafficClassification').onchange=e=>{state.trafficClassification=e.target.value;state.trafficPage=1;loadStats()};$('#trafficPrev').onclick=()=>{if(state.trafficPage>1){state.trafficPage-=1;loadStats()}};$('#trafficNext').onclick=()=>{state.trafficPage+=1;loadStats()};$('#newStaff').onclick=newStaff;$('#staffList').onclick=async e=>{const status=e.target.closest('[data-staff-status]');const reset=e.target.closest('[data-staff-reset]');if(status){await api(`/api/owner/staff/${status.dataset.staffStatus}/status`,{method:'PATCH',body:JSON.stringify({active:status.dataset.active==='true'})});toast('账号状态已更新');await loadStaff()}if(reset){const password=prompt('输入新的临时密码（至少 10 位）');if(password){await api(`/api/owner/staff/${reset.dataset.staffReset}/reset-password`,{method:'POST',body:JSON.stringify({password})});toast('密码已重置，旧会话已失效')}}};$$('[data-close-drawer]').forEach((button) => button.onclick = () => closeDrawer());
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
