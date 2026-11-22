const endpoint = '/api/owner/program-prices';
const currencies = [
    { code: 'JPY', label: '日元', pattern: /^\d+$/, inputMode: 'numeric' },
    { code: 'USD', label: '美元', pattern: /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/, inputMode: 'decimal' },
    { code: 'CNY', label: '人民币', pattern: /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/, inputMode: 'decimal' }
];
const taxes = [
    ['unspecified', '未注明'],
    ['inclusive', '含税'],
    ['exclusive', '未税']
];

function priceInputError(programId, currency, field, message) {
    return Object.assign(new Error(message), { programId, currency, field });
}

function readAmount(raw, programId, currency, field) {
    const amount = Number(raw);
    if (!currency.pattern.test(raw) || amount <= 0 || amount > 100_000_000) {
        const name = field === 'min' ? '最低金额' : '最高金额';
        const precision = currency.code === 'JPY' ? '填写整数' : '最多两位小数';
        throw priceInputError(programId, currency.code, field, `${currency.code} ${name}须大于 0 且不超过 100,000,000，${precision}。`);
    }
    return amount;
}

export function buildProgramPriceUpdate({ revision, show, currency, quotes }, rawReason) {
    const reason = rawReason.trim();
    if (!reason) throw Object.assign(new Error('请填写修改原因。'), { field: 'reason' });

    const updatedQuotes = Object.fromEntries(Object.entries(quotes).map(([id, quote]) => {
        const amounts = {};
        for (const unit of currencies) {
            const entry = quote.amounts[unit.code];
            const rawMin = String(entry?.min ?? '').trim();
            const rawMax = String(entry?.max ?? '').trim();
            if (!rawMin && !rawMax) continue;
            const min = readAmount(rawMin, id, unit, 'min');
            const max = rawMax ? readAmount(rawMax, id, unit, 'max') : undefined;
            if (max !== undefined && max < min) {
                throw priceInputError(id, unit.code, 'max', `${unit.code} 最高金额须大于或等于最低金额。`);
            }
            const { tax } = entry;
            amounts[unit.code] = max === undefined ? { min, tax } : { min, max, tax };
        }
        return [id, { show: quote.show, amounts }];
    }));

    return { pricing: { revision, show, currency, quotes: updatedQuotes }, reason };
}

function renderProgramOptions(programs, groups, esc) {
    const groupLabels = new Map(groups.map(({ id, label }) => [id, label]));
    const programsByGroup = new Map();
    for (const program of programs) {
        const grouped = programsByGroup.get(program.group) ?? [];
        grouped.push(program);
        programsByGroup.set(program.group, grouped);
    }
    return Array.from(programsByGroup, ([group, entries]) => `
        <optgroup label="${esc(groupLabels.get(group) ?? group)}">
            ${entries.map(({ id, title }) => `<option value="${esc(id)}">${esc(title)}</option>`).join('')}
        </optgroup>`).join('');
}

function renderQuoteTerms(currency, quote, esc) {
    const { code, label, inputMode } = currency;
    return `<fieldset class="price-terms" data-price-currency="${code}">
        <legend><span>${code}</span> ${label}</legend>
        <div class="price-amounts">
            <label class="price-field">最低金额
                <input data-price-field="min" type="text" inputmode="${inputMode}" maxlength="16" value="${esc(quote?.min ?? '')}">
            </label>
            <label class="price-field">最高金额（可选）
                <input data-price-field="max" type="text" inputmode="${inputMode}" maxlength="16" value="${esc(quote?.max ?? '')}">
            </label>
            <label class="price-field">税费口径
                <select data-price-field="tax">
                    ${taxes.map(([value, title]) => `<option value="${value}"${quote?.tax === value ? ' selected' : ''}>${title}</option>`).join('')}
                </select>
            </label>
        </div>
    </fieldset>`;
}

function renderQuoteEditor(program, quote, region, esc) {
    const metadata = [region, program.billing && `计价单位 ${program.billing}`].filter(Boolean).join(' · ');
    return `<section class="price-program" data-program-price-editor="${esc(program.id)}" hidden>
        <header class="price-project-heading">
            <div class="price-heading"><h3>${esc(program.title)}</h3>${metadata ? `<p>${esc(metadata)}</p>` : ''}</div>
            <label class="price-check"><input data-price-show type="checkbox"${quote?.show ? ' checked' : ''}> <span>启用此项目报价</span></label>
        </header>
        ${currencies.map(unit => renderQuoteTerms(unit, quote?.amounts?.[unit.code], esc)).join('')}
    </section>`;
}

export function createProgramPricesView(root, { api, esc, onSaved }) {
    const select = selector => root.querySelector(selector);
    const form = select('#programPricesForm');
    const controls = select('#programPriceControls');
    const picker = select('#programPricePicker');
    const editors = select('#programPriceEditors');
    const master = select('#programPriceMaster');
    const currency = select('#programPriceCurrency');
    const reason = select('#programPriceReason');
    const save = select('#programPriceSave');
    const discard = select('#programPriceDiscard');
    const status = select('#programPriceStatus');
    const alert = select('#programPriceError');

    let catalog = null;
    let busy = false;
    let dirty = false;
    let stale = false;
    let session = 0;

    const panels = () => Array.from(editors.querySelectorAll('[data-program-price-editor]'));

    function updateControls() {
        controls.disabled = busy;
        save.disabled = busy || !dirty || stale;
        discard.hidden = !dirty;
        form.setAttribute('aria-busy', String(busy));
    }

    function selectProject() {
        for (const panel of panels()) panel.hidden = panel.dataset.programPriceEditor !== picker.value;
    }

    function showCatalog() {
        const { programs, groups = [], regions = [], pricing } = catalog;
        const selectedId = picker.value;
        const regionLabels = new Map(regions.map(({ id, label }) => [id, label]));
        master.checked = pricing.show;
        currency.value = pricing.currency;
        reason.value = '';
        reason.removeAttribute('aria-invalid');
        picker.innerHTML = renderProgramOptions(programs, groups, esc);
        editors.innerHTML = programs.map(program => renderQuoteEditor(
            program, pricing.quotes[program.id], regionLabels.get(program.region), esc
        )).join('');
        if (programs.some(program => program.id === selectedId)) picker.value = selectedId;
        selectProject();
        dirty = false;
        stale = false;
        form.hidden = false;
    }

    async function load({ refresh = false, discardDraft = false } = {}) {
        if (busy) return false;
        if (dirty && !discardDraft) {
            if (refresh && !stale) status.textContent = '草稿已保留。保存后可刷新，或选择放弃草稿并读取最新。';
            return false;
        }
        const currentSession = session;
        busy = true;
        updateControls();
        status.textContent = '正在读取项目价格…';
        alert.textContent = '';
        try {
            const response = await api(endpoint);
            if (currentSession !== session) return false;
            catalog = response;
            showCatalog();
            status.textContent = discardDraft ? '已读取最新项目价格。' : '';
            return true;
        } catch (error) {
            if (currentSession !== session) return false;
            status.textContent = dirty ? '草稿已保留。' : '';
            const retry = dirty ? '请通过「放弃草稿并读取最新」重试。' : '请通过「刷新数据」重试。';
            alert.textContent = `读取项目价格失败。${error.message}。${retry}`;
            return false;
        } finally {
            if (currentSession === session) {
                busy = false;
                updateControls();
            }
        }
    }

    function readDraft() {
        const quotes = Object.fromEntries(panels().map(panel => {
            const amounts = Object.fromEntries(Array.from(panel.querySelectorAll('[data-price-currency]'), row => [
                row.dataset.priceCurrency,
                Object.fromEntries(Array.from(row.querySelectorAll('[data-price-field]'), field => [field.dataset.priceField, field.value]))
            ]));
            return [panel.dataset.programPriceEditor, { show: panel.querySelector('[data-price-show]').checked, amounts }];
        }));
        return { revision: catalog.pricing.revision, show: master.checked, currency: currency.value, quotes };
    }

    function focusInvalid(error) {
        let input = reason;
        if (error.programId) {
            picker.value = error.programId;
            selectProject();
            const panel = panels().find(item => item.dataset.programPriceEditor === error.programId);
            input = panel.querySelector(`[data-price-currency="${error.currency}"] [data-price-field="${error.field}"]`);
        }
        input.setAttribute('aria-invalid', 'true');
        input.focus();
    }

    async function savePricing(event) {
        event.preventDefault();
        if (busy || stale || !dirty) return;

        let update;
        try {
            update = buildProgramPriceUpdate(readDraft(), reason.value);
        } catch (error) {
            alert.textContent = error.message;
            focusInvalid(error);
            return;
        }

        const currentSession = session;
        busy = true;
        updateControls();
        status.textContent = '正在保存项目价格…';
        alert.textContent = '';
        try {
            const result = await api(endpoint, { method: 'PATCH', body: JSON.stringify(update) });
            if (currentSession !== session) return;
            catalog.pricing = result.pricing;
            showCatalog();
            status.textContent = '已保存项目价格。';
            onSaved();
        } catch (error) {
            if (currentSession !== session) return;
            stale = error.status === 409;
            status.textContent = '草稿已保留。';
            alert.textContent = stale
                ? '其他会话已保存更新。请选择「放弃草稿并读取最新」，核对后重新应用所需的调整。'
                : `保存项目价格失败。${error.message}。`;
        } finally {
            if (currentSession === session) {
                busy = false;
                updateControls();
            }
        }
    }

    form.addEventListener('input', event => {
        if (event.target === picker) return;
        event.target.removeAttribute('aria-invalid');
        if (!stale) {
            if (status.textContent !== '有未保存的修改。') status.textContent = '有未保存的修改。';
            alert.textContent = '';
        }
        if (!dirty) {
            dirty = true;
            updateControls();
        }
    });
    form.addEventListener('submit', savePricing);
    picker.addEventListener('change', selectProject);
    discard.addEventListener('click', async () => {
        if (await load({ discardDraft: true })) onSaved();
    });

    function clear() {
        session += 1;
        catalog = null;
        busy = false;
        dirty = false;
        stale = false;
        form.hidden = true;
        picker.replaceChildren();
        editors.replaceChildren();
        reason.value = '';
        reason.removeAttribute('aria-invalid');
        status.textContent = '';
        alert.textContent = '';
        updateControls();
    }

    return { load, clear };
}
