const $ = (selector, root = document) => root.querySelector(selector);
const viewTitles = { projects: '再生项目', assessment: '评估与预约', arrangements: '跨境安排' };
const pagePath = location.pathname.replace(/\/$/, '').split('/').at(-1);
const page = Object.hasOwn(viewTitles, pagePath) ? pagePath : 'home';
const params = new URLSearchParams(location.search);
const dialog = $('#advisorDialog');
const form = $('#programAdvisorForm');
const periodField = $('#consultPeriodField');
const newProgramStatus = '新项目 · 开放评估登记';

for (const view of document.querySelectorAll('[data-page]')) view.hidden = view.dataset.page !== page;
if (page !== 'home') {
    document.title = viewTitles[page] + ' · ARKSOMA';
    $('.site-nav [data-nav="' + page + '"]').setAttribute('aria-current', 'page');
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]));
}

async function requestJson(url, options) {
    const response = await fetch(url, options);
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) throw new Error(body?.message || '暂时无法连接，请稍后重试。');
    return body;
}

const catalogRequest = requestJson('/api/public/programs', { cache: 'no-store' }).catch(() => null);
let periodsRequest;
function getPeriods() {
    periodsRequest ??= requestJson('/api/public/program-periods', { cache: 'no-store' })
        .then(({ periods }) => periods)
        .catch(() => null);
    return periodsRequest;
}

function projectHref({ group, project } = {}) {
    const search = new URLSearchParams();
    if (group) search.set('group', group);
    if (project) search.set('project', project);
    return '/portfolio/projects' + (search.size ? '?' + search : '') + (project ? '#program' : '');
}

function showPeriodList(root, periods) {
    if (!root) return;
    if (!periods?.length) {
        root.innerHTML = '<p>暂无可读期次。顾问可以协助确认近期安排。</p>';
        return;
    }
    const intro = periods.some(({ closed }) => !closed)
        ? '以下为原站发布的期次。确定接诊方案后，由顾问再次确认档期。'
        : '当前目录内的期次可供参考。您可先登记，由顾问协调后续日期。';
    const items = periods.map(({ label, href, closed, special }) => {
        const note = [special ? '敬亲礼遇期' : '', closed ? '归档参考' : '可登记意向'].filter(Boolean).join(' · ');
        return '<li><div><span>' + escapeHtml(label) + '</span><small>' + note +
            '</small></div><a class="text-action" href="' + escapeHtml(href) + '">查看原期次</a></li>';
    }).join('');
    root.innerHTML = '<p>' + intro + '</p><ul class="period-items">' + items + '</ul>';
}

function quoteMarkup(program) {
    if (!program.quote) {
        return '<div class="price-block"><strong>预约后获取报价</strong><small>计费单位 · ' +
            escapeHtml(program.billing) + '</small></div>';
    }
    const { currency, min, max, tax } = program.quote;
    const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: currency === 'JPY' ? 0 : 2 });
    const range = max !== undefined && max !== min ? '–' + number.format(max) : '';
    const taxLabel = { inclusive: '含税参考', exclusive: '未税参考', unspecified: '税费待确认' }[tax];
    return '<div class="price-block"><strong>' + escapeHtml(currency) + ' ' + number.format(min) + range +
        '</strong><small>参考预算 / ' + escapeHtml(program.billing) + ' · ' + taxLabel +
        ' · 以接诊方案和书面报价为准</small></div>';
}

function renderDetail(program, group, regionName) {
    const target = $('#program');
    const status = program.early ? newProgramStatus : program.featured ? '旗舰方案' : '可咨询';
    const steps = program.steps.map((step) => '<li>' + escapeHtml(step) + '</li>').join('');
    const included = program.included
        ? '<h3>方案与包含项</h3><p>' + escapeHtml(program.included) + '</p>'
        : '';
    const schedule = program.featured
        ? '<details class="disclosure" open><summary>旗舰赴日期次</summary><div data-period-list><p>正在读取期次…</p></div></details>' +
            '<a class="text-action" href="/portfolio/arrangements#travelTitle">查看两次赴日与五日参考行程</a><br>'
        : '';
    target.hidden = false;
    target.innerHTML =
        '<a class="text-action mobile-back" href="' + projectHref({ group }) + '">返回项目列表</a>' +
        '<div class="program-status">' + status + ' · ' + escapeHtml(regionName) + '</div>' +
        '<h2>' + escapeHtml(program.title) + '</h2><p>' + escapeHtml(program.summary) + '</p>' +
        '<h3>适合咨询</h3><p>' + escapeHtml(program.fit) + '</p>' +
        '<h3>评估与服务流程</h3><ol>' + steps + '</ol>' + included + quoteMarkup(program) + schedule +
        '<button class="outline-gold" type="button" data-advisor="' + escapeHtml(program.id) +
        '" data-program-title="' + escapeHtml(program.title) + '">' +
        (program.early ? '登记评估意向' : '预约顾问') + '</button>';
    if (program.featured) getPeriods().then((periods) => showPeriodList($('[data-period-list]', target), periods));
    if (location.hash === '#program') requestAnimationFrame(() => {
        if (matchMedia('(max-width: 680px)').matches) target.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'start' });
    });
}

async function renderProjects() {
    const data = await catalogRequest;
    const content = $('#catalogContent');
    const list = $('#catalogList');
    content.setAttribute('aria-busy', 'false');
    if (!data) {
        list.innerHTML = '<p role="alert">暂时无法加载项目。</p><button type="button" class="outline-gold" id="retryCatalog">重新加载</button>';
        $('#retryCatalog').addEventListener('click', () => location.reload());
        return;
    }
    const { groups, programs, regions } = data;
    const selected = programs.find(({ id }) => id === params.get('project'));
    const requestedGroup = groups.find(({ id }) => id === params.get('group'))?.id;
    const group = requestedGroup || selected?.group || '';
    const allGroups = [{ id: '', label: '全部项目' }, ...groups];
    const filtered = programs.filter((program) => !group || program.group === group);
    $('#catalogFilters').innerHTML = allGroups.map(({ id, label }) =>
        '<a class="filter-link" href="' + projectHref({ group: id }) + '"' +
        (id === group ? ' aria-current="true"' : '') + '>' + escapeHtml(label) + '</a>'
    ).join('');
    list.innerHTML = filtered.map((program) => {
        const current = program.id === selected?.id;
        const status = program.early ? newProgramStatus : program.featured ? '旗舰方案 · 含 120 项血液检测' : program.summary;
        return '<a class="program-link" href="' + projectHref({ group, project: program.id }) + '"' +
            (current ? ' aria-current="true"' : '') + '><strong>' + escapeHtml(program.title) +
            '</strong><small>' + escapeHtml(status) + '</small><i class="chevron" aria-hidden="true"></i></a>';
    }).join('');
    const detail = filtered.find(({ id }) => id === selected?.id);
    if (detail) {
        content.classList.add('has-detail');
        $('#projectsView').classList.add('catalog-ready');
        renderDetail(detail, group, regions.find(({ id }) => id === detail.region)?.label || '');
    } else {
        const panel = $('#program');
        panel.hidden = false;
        panel.innerHTML = '<h2>' + escapeHtml(groups.find(({ id }) => id === group)?.label || '按需要了解项目') +
            '</h2><p>选择一个项目后，查看适合咨询的情况、服务步骤及费用。</p>';
    }
}

async function updateConsultPeriods() {
    const period = form.elements.periodId;
    const featured = form.elements.programId.value === 'autologous-stem-cells';
    periodField.hidden = !featured;
    period.disabled = !featured;
    if (!featured) {
        period.value = '';
        periodField.querySelector('select').replaceChildren();
        return;
    }
    if (!period.options.length) period.add(new Option('由顾问协助协调期次', ''));
    const options = await getPeriods();
    if (periodField.hidden) return;
    const current = period.value;
    period.replaceChildren(new Option('由顾问协助协调期次', ''),
        ...(options || []).filter(({ closed }) => !closed).map(({ id, label }) => new Option(label, id, false, id === current)));
}

let consultationAttempt;
let popupVersion = 0;
const reportStatus = $('#consultStatus');
function newConsultId() {
    return crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
}

function setAdvisorPrograms(programs, selectedId, selectedTitle) {
    const available = programs.slice();
    if (selectedId && !available.some(({ id }) => id === selectedId)) {
        available.push({ id: selectedId, title: selectedTitle });
    }
    const select = form.elements.programId;
    select.replaceChildren(new Option('请顾问协助梳理', ''),
        ...available.map(({ id, title }) => new Option(title, id, false, id === selectedId)));
}

async function showAdvisor(programId = '', programTitle = '') {
    const version = ++popupVersion;
    const success = $('#advisorReceived');
    if (!success.hidden) form.reset();
    success.hidden = true;
    $('#advisorFields').hidden = false;
    reportStatus.textContent = '';
    setAdvisorPrograms([], programId, programTitle);
    updateConsultPeriods();
    if (!dialog.open) dialog.showModal();
    const data = await catalogRequest;
    if (version !== popupVersion || !dialog.open || !data) return;
    const selectedId = form.elements.programId.value;
    setAdvisorPrograms(data.programs, selectedId, programTitle);
}

document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-advisor]');
    if (trigger) showAdvisor(trigger.dataset.advisor, trigger.dataset.programTitle);
});
form.elements.programId.addEventListener('change', updateConsultPeriods);
form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = $('button[type="submit"]', form);
    if (button.disabled) return;
    button.disabled = true;
    reportStatus.textContent = '正在提交…';
    const body = new FormData(form);
    body.set('portfolio', '1');
    const payload = JSON.stringify([...body]);
    const version = popupVersion;
    if (consultationAttempt?.payload !== payload) consultationAttempt = { payload, key: newConsultId() };
    body.set('submissionKey', consultationAttempt.key);
    try {
        const response = await requestJson('/api/advisor-applications', { method: 'POST', body });
        consultationAttempt = undefined;
        if (popupVersion !== version) return;
        $('#advisorFields').hidden = true;
        $('#advisorReference').textContent = '意向编号 ' + response.orderId;
        $('#advisorReceived').hidden = false;
        $('#advisorReceived button').focus();
    } catch (error) {
        if (popupVersion === version) reportStatus.textContent = error.message;
    } finally {
        button.disabled = false;
    }
});

if (page === 'projects') renderProjects();
if (page === 'assessment') {
    catalogRequest.then((data) => {
        const checkup = data?.support.find(({ id }) => id === 'basic-checkup');
        if (checkup?.quote) $('#checkupEstimate').innerHTML = quoteMarkup(checkup);
    });
}
if (page === 'arrangements') {
    getPeriods().then((periods) => showPeriodList($('[data-period-list]'), periods));
    catalogRequest.then((data) => {
        $('#destinationList').innerHTML = data?.regions.map(({ label, status }) =>
            '<div><strong>' + escapeHtml(label) + '</strong><small>' +
            (status === 'active' ? '可咨询' : '筹备中') + '</small></div>'
        ).join('') || '<p>可向顾问了解目前支持的地区。</p>';
    });
}
