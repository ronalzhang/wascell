const MONTH_NAMES = [
    '一月', '二月', '三月', '四月', '五月', '六月',
    '七月', '八月', '九月', '十月', '十一月', '十二月',
];

const SLOT_NAMES = { 1: '首期', 2: '二期', 3: '三期' };

function normalizeYearMonth({ year, month }) {
    let normalizedYear = year;
    let normalizedMonth = month;
    while (normalizedMonth > 12) {
        normalizedYear += 1;
        normalizedMonth -= 12;
    }
    while (normalizedMonth < 1) {
        normalizedYear -= 1;
        normalizedMonth += 12;
    }
    return { year: normalizedYear, month: normalizedMonth };
}

function pad2(value) {
    return String(value).padStart(2, '0');
}

function cutoffLabel(year, month, slot) {
    const cutoff = normalizeYearMonth({ year, month: month - 1 });
    const day = slot === 1 ? 5 : slot === 2 ? 15 : 25;
    return `${cutoff.year}年${cutoff.month}月${day}日`;
}

function buildPeriods(start, count) {
    const periods = [];
    for (let monthOffset = 0; periods.length < count; monthOffset += 1) {
        const current = normalizeYearMonth({ year: start.year, month: start.month + monthOffset });
        for (let slot = 1; slot <= 3 && periods.length < count; slot += 1) {
            periods.push({
                year: current.year,
                month: current.month,
                slot,
                id: `${current.year}${pad2(current.month)}0${slot}`,
                label: `${current.year}·${MONTH_NAMES[current.month - 1]}${SLOT_NAMES[slot]}`,
                cutoff: cutoffLabel(current.year, current.month, slot),
                special: slot === 3,
            });
        }
    }
    return periods;
}

function periodMenu(periods, activeId, rootTargetId) {
    return periods.map((period, index) => {
        const href = period.id === rootTargetId ? '/' : period.id;
        const availability = index < 2 ? '已满' : '可申请';
        const current = period.id === activeId ? ' aria-current="page"' : '';
        return `<a href="${href}" class="period-option"${current}><span>${period.label}</span><small>${availability}</small></a>`;
    }).join('');
}

function valuesForPeriod(period) {
    const capacity = period.special ? 6 : 5;
    const price = period.special ? 'RMB 560,000' : 'RMB 580,000';
    const applyNote = period.special
        ? `父母长辈特惠 · 需提供家人信息及半年内体检报告 · 截止 ${period.cutoff}`
        : `邀请制审核 · 需提供个人信息及半年内体检报告 · 截止 ${period.cutoff}`;
    return { capacity, price, applyNote };
}

function renderPeriodPage(template, period, periods, rootTargetId) {
    const { capacity, price, applyNote } = valuesForPeriod(period);
    const values = {
        PAGE_TITLE: `ARKSOMA · 方舟计划 · ${period.label}`,
        META_DESCRIPTION: `ARKSOMA 方舟计划｜生命资产管理｜${period.label}｜限额 ${capacity} 席`,
        PERIOD_ID: period.id,
        PERIOD_LABEL: period.label,
        PERIOD_MENU: periodMenu(periods, period.id, rootTargetId),
        CAPACITY: `限额 ${capacity} 席`,
        CAPACITY_NUMBER: String(capacity),
        PRICE: price,
        CUTOFF: period.cutoff,
        APPLY_NOTE: applyNote,
        SPECIAL_CLASS: period.special ? ' period-special' : '',
    };

    return Object.entries(values).reduce(
        (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
        template,
    );
}

module.exports = {
    buildPeriods,
    renderPeriodPage,
    valuesForPeriod,
};
