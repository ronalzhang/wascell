const MONTH_NAMES = [
    '一月', '二月', '三月', '四月', '五月', '六月',
    '七月', '八月', '九月', '十月', '十一月', '十二月',
];

const SLOT_NAMES = { 1: '首期', 2: '二期', 3: '三期' };

const REFERENCE_EXPERIENCES = Object.freeze({
    tokyoBay: { image: 'imgs/kaiseki.jpg', width: 2062, height: 1148, alt: '白木匠造屋形船与东京湾夜景', visualContext: '图片呈现东京湾私席场景' },
    geisha: { image: 'imgs/geisha.jpg', width: 2164, height: 1338, alt: '介绍制茶与舞文化接待', visualContext: '图片呈现当日下午文化安排' },
    teaHome: { image: 'imgs/home.jpg', width: 2096, height: 1206, alt: '茶道大师私人宅邸', visualContext: '图片呈现茶室接待场景' },
    dryGarden: { image: 'imgs/longtemple.jpg', width: 2050, height: 788, alt: '京都枯山水庭园', visualContext: '图片呈现庭园安静参访' },
    incense: { image: 'imgs/incense.jpg', width: 2022, height: 1350, alt: '和室香道雅集', visualContext: '图片呈现香道接待场景' },
});

const DEFAULT_ITINERARY = [
    { day: 'DAY 01', city: 'TOKYO', ...REFERENCE_EXPERIENCES.tokyoBay, title: '东京湾私席，开启一段安静的同行。', copy: '登上仅接待少数宾客的白木匠造屋形船，由料理人现场准备怀石料理。东京湾夜景、私密会面与克制的席位安排，让旅程从彼此信任开始。', tags: ['船上怀石', '东京湾夜景', '私人会面'] },
    { day: 'DAY 02', city: 'TOKYO', ...REFERENCE_EXPERIENCES.geisha, title: '医疗准备之后，进入介绍制的茶与舞。', copy: '上午依个人方案完成医疗准备与必要确认；充分休息后，由顾问安排当日下午文化接待。最终节奏依当期状态确认。', tags: ['医疗准备', '介绍制接待', '茶与舞'] },
    { day: 'DAY 03', city: 'TOKYO', ...REFERENCE_EXPERIENCES.teaHome, title: '一盏茶的时间，重新理解长期主义。', copy: '探访里千家茶道大师私人宅邸，在茶室完成一期一会。三十余年研习，浓缩于器物、动作与留白。', tags: ['大师私宅', '三十载研习', '一期一会'] },
    { day: 'DAY 04', city: 'KYOTO', ...REFERENCE_EXPERIENCES.dryGarden, title: '在枯山水中，让复杂重新变得清晰。', copy: '走入庭园，在石、苔与留白的秩序中完成安静参访。具体寺院依季节、开放条件与当期状态确认。', tags: ['庭园参访', '枯山水', '安静参访'] },
    { day: 'DAY 05', city: 'KYOTO', ...REFERENCE_EXPERIENCES.incense, title: '以香道雅集，为首阶段留下一次安静收束。', copy: '在和室完成闻香与器物交流；随后由顾问整理医学与在日安排。具体项目依季节、预约和当期确认。', tags: ['香道雅集', '安静收束', '持续协调'] },
];

const FILIAL_ITINERARY = DEFAULT_ITINERARY.map((item, index) => {
    if (index === 0) return { ...item, title: '以更从容的节奏，在东京安静会合。', copy: '专车接送与充分休息优先于密集安排。晚间以少席怀石料理完成首次会面，让父母与同行家人安心进入旅程。', tags: ['专车接送', '从容节奏', '家庭同行'] };
    if (index === 3) return { ...item, title: '在庭园与留白之间，保留舒缓的一日。', copy: '依据长辈体力与天气选择平缓、安静的寺院或庭园路径，减少不必要的步行与等候，具体安排以当期状态确认。', tags: ['舒缓参访', '减少步行', '弹性安排'] };
    return item;
});

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
                type: slot === 3 ? 'filial' : 'standard',
            });
        }
    }
    return periods;
}

function periodMenu(periods, activeId, rootTargetId) {
    return periods.map((period, index) => {
        const href = period.id === rootTargetId ? '/' : period.id;
        const availability = period.special ? '敬亲礼遇期' : index < 2 ? '已满' : '可申请';
        const current = period.id === activeId ? ' selected" aria-current="page' : '';
        return `<a href="${href}" class="period-option${current}"><span>${period.label}</span><small>${availability}</small></a>`;
    }).join('');
}

function itineraryForPeriod(period) {
    return period.special ? FILIAL_ITINERARY : DEFAULT_ITINERARY;
}

function renderJourneyCards(period) {
    return itineraryForPeriod(period).map((item, index) => {
        const reverse = index % 2 ? ' reverse' : '';
        const position = String(index + 1).padStart(2, '0');
        const tags = item.tags.map((tag) => `<li>${tag}</li>`).join('');
        return `<article class="journey-card${reverse}"><figure><img src="${item.image}" alt="${item.alt}" loading="lazy" decoding="async" data-journey-image width="${item.width}" height="${item.height}"><figcaption class="journey-caption">${item.visualContext}</figcaption></figure><div class="journey-copy"><p class="journey-index">${item.day} · ${item.city}<span>${position}/05</span></p><h3>${item.title}</h3><p>${item.copy}</p><ul>${tags}</ul></div></article>`;
    }).join('');
}

function valuesForPeriod(period) {
    const capacity = period.special ? 3 : 5;
    const capacityLabel = period.special ? '敬亲礼遇期 · 3组家庭席位' : '限额 5 席';
    const price = period.special ? 'RMB 560,000' : 'RMB 580,000';
    const applyNote = period.special
        ? `敬亲礼遇 · 以家庭陪伴为主题 · 可单人申请 · 截止 ${period.cutoff}`
        : `邀请制审核 · 需提供个人信息及半年内体检报告 · 截止 ${period.cutoff}`;
    const publicCopy = period.special
        ? '敬亲礼遇期为父母与长辈预留三组家庭席位。行程减少不必要的奔波，以两位同行为建议，亦接受单人申请。'
        : '完整方案确认后即包含首个 12 个月方舟年度席位，在有效期内由私人医疗秘书延续协调。';
    return { capacity, capacityLabel, price, applyNote, publicCopy };
}

function renderPeriodPage(template, period, periods, rootTargetId) {
    const { capacity, capacityLabel, price, applyNote, publicCopy } = valuesForPeriod(period);
    const pagePath = period.id === rootTargetId ? '/' : `/${period.id}`;
    const pageUrl = `https://arksoma.com${pagePath}`;
    const pageTitle = `ARKSOMA 方舟计划｜${period.label} · 日本细胞科技与生命资产管理`;
    const values = {
        PAGE_TITLE: pageTitle,
        META_DESCRIPTION: `ARKSOMA 方舟计划｜生命资产管理｜${period.label}｜${capacityLabel}`,
        PAGE_URL: pageUrl,
        OG_TITLE: pageTitle,
        PERIOD_ID: period.id,
        PERIOD_LABEL: period.label,
        PERIOD_MENU: periodMenu(periods, period.id, rootTargetId),
        CAPACITY: capacityLabel,
        CAPACITY_NUMBER: String(capacity),
        PRICE: price,
        CUTOFF: period.cutoff,
        APPLY_NOTE: applyNote,
        PERIOD_PUBLIC_COPY: publicCopy,
        PERIOD_TYPE: period.type,
        JOURNEY_CARDS: renderJourneyCards(period),
        SPECIAL_CLASS: period.special ? ' period-special' : '',
    };

    return Object.entries(values).reduce(
        (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
        template,
    );
}

module.exports = {
    buildPeriods,
    itineraryForPeriod,
    renderPeriodPage,
    renderJourneyCards,
    valuesForPeriod,
};
