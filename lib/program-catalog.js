const CURRENCIES = Object.freeze(['JPY', 'USD', 'CNY']);
const GROUPS = Object.freeze([
    { id: 'cell', label: '细胞与免疫' },
    { id: 'blood', label: '血液与健康评估' },
    { id: 'oncology', label: '肿瘤相关专项' },
    { id: 'oral-hair', label: '口腔与毛发' },
]);
const REGIONS = Object.freeze([
    { id: 'jp', label: '日本', status: 'active' },
    { id: 'tr', label: '土耳其', status: 'preparing' },
    { id: 'ua', label: '乌克兰', status: 'preparing' },
]);

const PROGRAMS = [
    {
        id: 'autologous-stem-cells', group: 'cell', title: '旗舰自体干细胞', featured: true, billing: '次',
        summary: '从详细健康评估开始，衔接自体采集、细胞制备和复诊。旗舰方案包含 120 项血液检测。',
        fit: '希望把自体细胞方案纳入长期健康管理，或希望就既有健康情况向专科医生了解选择的人士。',
        steps: ['健康资料预审', '详细体检与机构面诊', '自体组织采集', '细胞制备与质量检验', '第二次到院回输与观察', '回国随访'],
        included: '方案内含 120 项血液检测。所需赴日次数、时间及具体费用以机构方案为准。',
    },
    {
        id: 'spinal-factors-advanced', group: 'cell', title: '脊髓相关成长因子 · 进阶', billing: '次',
        summary: '围绕复杂脊髓损伤或神经康复需求的专项咨询。',
        fit: '已有明确脊髓损伤诊断或正在接受神经康复，希望由专科团队评估是否有适用路径的人士。',
        steps: ['整理病史、影像与康复记录', '专科评估', '确认材料、给药路径及风险', '按机构安排复评'],
        included: '进阶为资料中的项目规格名称。请随现有康复与诊疗团队持续评估。',
    },
    {
        id: 'spinal-factors-standard', group: 'cell', title: '脊髓相关成长因子 · 标准', billing: '次',
        summary: '基于已有诊断和康复状况，讨论脊髓相关的评估方案。',
        fit: '已有脊髓或神经功能方面的专科评估，希望进一步讨论专科选择的人士。',
        steps: ['资料预审', '专科面诊与风险评估', '确认项目规格及是否实施', '记录复查与康复计划'],
    },
    {
        id: 'stem-cell-growth-factors', group: 'cell', title: '干细胞成长因子', billing: '次',
        summary: '了解干细胞培养上清中的成分及其可讨论的使用场景。',
        fit: '关注皮肤或局部组织状态，愿意先了解材料来源、风险与适用条件的人士。',
        steps: ['梳理需求及现有报告', '机构面诊', '核对材料与应用范围', '确认服务及随访安排'],
        included: '按资料为培养上清类，含有分泌成分。实际材料及使用范围由机构确认。',
    },
    {
        id: 'autologous-nk', group: 'cell', title: '自体 NK 免疫细胞', billing: '次',
        summary: '自体免疫细胞方案的专业评估与协调。',
        fit: '已有检查或诊疗资料，希望了解其免疫细胞相关选择的人士。涉及肿瘤须进入专科评估。',
        steps: ['核对健康资料与既有治疗', '医师面诊', '确认采集及制备方案', '到院实施与后续复查'],
    },
    {
        id: 'blood-purification', group: 'blood', title: '血液净化', billing: '次',
        summary: '围绕已知血液或代谢指标，了解具体技术与评估条件。',
        fit: '已有明确诊疗问题或异常检验结果，愿由对应医生复核是否适用的人士。',
        steps: ['体检资料预审', '医师复核检验与用药', '确认具体方式和风险', '按情况安排观察与复查'],
    },
    {
        id: 'blood-panel-120', group: 'blood', title: '120 项血液检测', billing: '次',
        summary: '可独立安排的血液检测组合，结果用于建立评估基线。',
        fit: '希望补充健康评估资料，或已有方案要求完成该组合检测的人士。',
        steps: ['确认检测清单与准备事项', '预约采血', '实验室检测', '领取报告并由专业人员解读'],
        included: '可单独咨询与报价。作为包含项时仅适用于旗舰自体干细胞方案。',
    },
    {
        id: 'microrna-oncology', group: 'oncology', title: 'MicroRNA 相关治疗咨询', billing: '6 次参考方案',
        summary: '根据已有病历、治疗记录和专科资料，了解机构是否有适合讨论的路径。',
        fit: '已有肿瘤专科诊断并由原诊疗医生持续管理的人士。',
        steps: ['准备病理、影像与治疗记录', '肿瘤专科复核', '说明可选路径、证据和风险', '如适用，确认疗程与复评'],
        included: '来源资料为 4 种相关项目；具体项目名称及周期由专科复核。标准治疗由患者原诊疗团队持续管理。',
    },
    {
        id: 'microrna-check', group: 'oncology', title: 'MicroRNA 相关检测', billing: '次',
        summary: '结合已有筛查和检查记录，了解检测覆盖与结果解读。',
        fit: '希望了解检测覆盖、局限及后续复查路径，或受医生建议补充检查的人士。',
        steps: ['梳理既往筛查与风险信息', '确认检测项目及影像安排', '完成检查', '专科解读与必要复查'],
        included: '资料列 13 类相关检测及 DWIBS 影像；范围与适用性以机构书面说明为准。',
    },
    {
        id: 'periodontal-regeneration', group: 'oral-hair', title: '自体细胞牙周再生', early: true, billing: '次',
        summary: '围绕牙龈及牙周支持组织问题开放评估登记。',
        fit: '已有牙周病、牙龈退缩或牙槽骨缺损检查资料，希望讨论保留现有牙齿的人士。',
        steps: ['提交牙周检查与牙片资料', '牙周专科评估', '确认术式、访问次数与预算', '协调到院与术后复诊'],
        included: '按牙周组织的具体问题作评估。整颗牙再生与牙髓再生属于其他技术路径。',
    },
    {
        id: 'hair-follicle', group: 'oral-hair', title: '自体毛囊细胞方案', early: true, billing: '方案',
        summary: '面向头皮与脱发需求开放评估登记，先区分脱发类型和方案条件。',
        fit: '已有或拟进行皮肤科脱发评估，希望了解自体毛囊来源细胞路线的人士。',
        steps: ['准备脱发史、照片与既有方案', '皮肤科分型评估', '确认技术、批次及复诊次数', '协调到院与随访'],
        included: '参考预算以 S-DSC 类方案测算。毛发密度与白发复色分别评估；复色研究暂未作为可预约项目。',
    },
].map((program) => Object.freeze({ region: 'jp', state: program.early ? 'early' : 'inquiry', ...program }));

const SUPPORT = [{
    id: 'basic-checkup', group: 'blood', region: 'jp', title: '基础体检（申请支持）', billing: '次',
}];
const programIds = new Set([...PROGRAMS, ...SUPPORT].map(({ id }) => id));
const DEFAULT_PROGRAM_PRICING = Object.freeze({ revision: 0, show: false, currency: 'JPY', quotes: Object.freeze({}) });
const TAX_BASES = new Set(['inclusive', 'exclusive', 'unspecified']);

function isRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function validAmount(value, currency) {
    const scale = currency === 'JPY' ? 1 : 100;
    return typeof value === 'number' && Number.isFinite(value) && value >= 1 / scale && value <= 100_000_000
        && Math.abs(Math.round(value * scale) / scale - value) < 1e-9;
}

function validateProgramPricing(pricing) {
    if (!isRecord(pricing) || !Number.isSafeInteger(pricing.revision) || pricing.revision < 0
        || typeof pricing.show !== 'boolean' || !CURRENCIES.includes(pricing.currency) || !isRecord(pricing.quotes)) {
        throw new Error('项目价格配置无效');
    }
    const quotes = {};
    for (const [id, quote] of Object.entries(pricing.quotes)) {
        if (!programIds.has(id) || !isRecord(quote) || typeof quote.show !== 'boolean' || !isRecord(quote.amounts)) {
            throw new Error('项目报价无效');
        }
        const amounts = {};
        for (const [currency, amount] of Object.entries(quote.amounts)) {
            if (!CURRENCIES.includes(currency) || !isRecord(amount) || !validAmount(amount.min, currency)
                || !TAX_BASES.has(amount.tax)
                || (amount.max !== undefined && (!validAmount(amount.max, currency) || amount.max < amount.min))) {
                throw new Error('金额、币种或税费口径无效');
            }
            amounts[currency] = { min: amount.min, tax: amount.tax };
            if (amount.max !== undefined) amounts[currency].max = amount.max;
        }
        if (quote.show || Object.keys(amounts).length) quotes[id] = { show: quote.show, amounts };
    }
    return { revision: pricing.revision, show: pricing.show, currency: pricing.currency, quotes };
}

function projectPublicCatalog(pricing) {
    function visibleProgram(program) {
        const entry = pricing.quotes[program.id];
        const amount = pricing.show && entry?.show && entry.amounts[pricing.currency];
        if (!amount) return program;
        return { ...program, quote: { ...amount, currency: pricing.currency } };
    }
    return { groups: GROUPS, regions: REGIONS, programs: PROGRAMS.map(visibleProgram), support: SUPPORT.map(visibleProgram) };
}

function getPeriodLabel(periodId) {
    const match = typeof periodId === 'string' && /^(20\d{2})(0[1-9]|1[0-2])0([1-3])$/.exec(periodId);
    if (!match) return '';
    const [, year, month, slot] = match;
    const months = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
    const slots = ['首期', '二期', '三期'];
    return year + '·' + months[Number(month) - 1] + '月' + slots[Number(slot) - 1];
}

function isPastPeriodMonth(periodId, clock) {
    const beijingMonth = new Date(clock.getTime() + 8 * 3_600_000).toISOString().slice(0, 7).replace('-', '');
    return periodId.slice(0, 6) < beijingMonth;
}

function readPeriodOptions(source, today) {
    const legacyFirstId = source.match(/name="periodId" value="(\d{8})"/)?.[1];
    const menu = source.match(/<nav class="period-options">([\s\S]*?)<\/nav>/)?.[1] ?? '';
    const links = menu.matchAll(/<a href="(\/?\d{8}|\/)"[^>]*><span>([^<]+)<\/span><small>([^<]+)<\/small><\/a>/g);
    return Array.from(links, ([, href, label, actualStatus]) => {
        const id = href === '/' ? legacyFirstId : href.replace(/^\//, '');
        if (!/^\d{4}(0[1-9]|1[0-2])0[1-3]$/.test(id || '')) return null;
        const year = Number(id.slice(0, 4));
        const month = Number(id.slice(4, 6));
        const slot = Number(id.at(-1));
        const cutoff = new Date(Date.UTC(year, month - 2, [0, 5, 15, 25][slot])).toISOString().slice(0, 10);
        const closed = today > cutoff || actualStatus === '已满';
        return { id, label, href: `/${id}`, closed, special: slot === 3 };
    }).filter(Boolean);
}

module.exports = { CURRENCIES, PROGRAMS, SUPPORT, DEFAULT_PROGRAM_PRICING, validateProgramPricing, projectPublicCatalog, readPeriodOptions, getPeriodLabel, isPastPeriodMonth };
