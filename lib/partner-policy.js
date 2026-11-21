const { randomUUID } = require('node:crypto');

const MAX_MONEY_FEN = 10_000_000_000;
const DAY_MS = 86_400_000;
const draftPolicy = {
    id: 'draft',
    enabled: false,
    updatedAt: null,
    reason: '',
    tiers: [
        { name: '认证伙伴', rateBps: 3000, minCustomers: 0, minContributionFen: 0 },
        { name: '熟练伙伴', rateBps: 3500, minCustomers: 2, minContributionFen: 2_000_000 },
        { name: '资深伙伴', rateBps: 4000, minCustomers: 4, minContributionFen: 5_000_000 },
    ],
    lookbackDays: 90,
    minPlatformBps: 5500,
    projectShareBps: 2000,
    maturityDays: 7,
    mentorCapacity: 2,
    mentorMinCustomers: 1,
    mentorMinContributionFen: 0,
    maxForecastCustomers: 20,
    maxForecastProjects: 8,
    remediationDays: 14,
};

class ProgramError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

function shortText(value, label, limit = 120, required = true) {
    if (value === undefined && !required) return '';
    if (typeof value !== 'string') throw new ProgramError(`请填写${label}`);
    const text = value.trim();
    if ((required && !text) || text.length > limit) {
        throw new ProgramError(`${label}须${required ? '填写且' : ''}控制在 ${limit} 字内`);
    }
    return text;
}

function integer(value, label, min, max) {
    if (!Number.isSafeInteger(value) || value < min || value > max) {
        throw new ProgramError(`${label}须为 ${min} 至 ${max} 之间的整数`);
    }
    return value;
}

function choice(value, options, label) {
    if (!options.includes(value)) throw new ProgramError(`请选择有效的${label}`);
    return value;
}

function flag(value, label) {
    if (typeof value !== 'boolean') throw new ProgramError(`请选择${label}`);
    return value;
}

function policyFrom(input, now) {
    if (!Array.isArray(input.tiers) || input.tiers.length !== 3) throw new ProgramError('请填写三个佣金档位');
    const tiers = input.tiers.map((tier) => ({
        name: shortText(tier?.name, '档位名称', 25),
        rateBps: integer(tier?.rateBps, '佣金率（基点）', 0, 10000),
        minCustomers: integer(tier?.minCustomers, '独立客户门槛', 0, 10000),
        minContributionFen: integer(tier?.minContributionFen, '贡献门槛（分）', 0, MAX_MONEY_FEN),
    }));
    if (tiers[0].minCustomers || tiers[0].minContributionFen) {
        throw new ProgramError('首档的客户与贡献门槛须为零');
    }
    const minPlatformBps = integer(input.minPlatformBps, '平台最低留存率（基点）', 5001, 10000);
    if (tiers.some((tier, index) => {
        if (tier.rateBps > 10000 - minPlatformBps) return true;
        if (index === 0) return false;
        const previous = tiers[index - 1];
        return tier.rateBps < previous.rateBps || tier.minCustomers < previous.minCustomers ||
            tier.minContributionFen < previous.minContributionFen ||
            (tier.minCustomers === previous.minCustomers && tier.minContributionFen === previous.minContributionFen);
    })) {
        throw new ProgramError('档位门槛须递增，费率须依次上升或持平，并满足平台最低留存');
    }
    if (new Set(tiers.map(tier => tier.name)).size !== tiers.length) throw new ProgramError('档位名称须不同');

    return {
        id: randomUUID(),
        enabled: flag(input.enabled, '方案启用状态'),
        updatedAt: now,
        reason: shortText(input.reason, '变更原因', 300),
        tiers,
        lookbackDays: integer(input.lookbackDays, '业绩回看天数', 1, 3650),
        minPlatformBps,
        projectShareBps: integer(input.projectShareBps, '项目预算划拨率（基点）', 0, 10000),
        maturityDays: integer(input.maturityDays, '交付与收款后等待天数', 0, 3650),
        mentorCapacity: integer(input.mentorCapacity, '同时带教容量', 0, 1000),
        mentorMinCustomers: integer(input.mentorMinCustomers, '带教申请的客户门槛', 0, 10000),
        mentorMinContributionFen: integer(input.mentorMinContributionFen, '带教申请的贡献门槛（分）', 0, MAX_MONEY_FEN),
        maxForecastCustomers: integer(input.maxForecastCustomers, '试算客户上限', 1, 1000),
        maxForecastProjects: integer(input.maxForecastProjects, '试算项目上限', 1, 100),
        remediationDays: integer(input.remediationDays, '整改复审天数', 1, 365),
    };
}

function productFrom(input, previous, now) {
    const kind = choice(input.kind, ['non_medical', 'excluded'], '产品类别');
    const active = flag(input.active, '产品启用状态');
    return {
        id: previous?.id || randomUUID(),
        name: shortText(input.name, '产品名称', 100),
        kind,
        active,
        approvalRef: shortText(input.approvalRef, '合规确认依据', 180, active && kind === 'non_medical'),
        forecastContributionFen: integer(input.forecastContributionFen, '单客试算贡献（分）', 0, MAX_MONEY_FEN),
        maxRateBps: integer(input.maxRateBps, '产品最高费率（基点）', 0, 10000),
        maxCommissionFen: input.maxCommissionFen === null ? null :
            integer(input.maxCommissionFen, '产品佣金额上限（分）', 0, MAX_MONEY_FEN),
        minRetainedFen: integer(input.minRetainedFen, '产品最低留存（分）', 0, MAX_MONEY_FEN),
        updatedAt: now,
    };
}

function templateFrom(input, previous, now) {
    const category = choice(input.category, ['mentoring', 'quality', 'regional'], '项目类别');
    return {
        id: previous?.id || randomUUID(),
        name: shortText(input.name, '项目名称', 100),
        category,
        active: flag(input.active, '模板启用状态'),
        feeFen: integer(input.feeFen, '项目合同价（分）', 1, MAX_MONEY_FEN),
        deliverable: shortText(input.deliverable, '项目独立交付物', 1800),
        requiresMentor: category === 'mentoring' || flag(input.requiresMentor, '是否需带教资格'),
        updatedAt: now,
    };
}

function qualifies(performance, minCustomers, minContributionFen) {
    return performance.customers >= minCustomers && performance.contributionFen >= minContributionFen;
}

function nextQualification(policy, tierIndex, performance) {
    const tier = policy.tiers[tierIndex];
    const nextTier = policy.tiers[tierIndex + 1] || null;
    return {
        tierIndex,
        tierName: tier.name,
        rateBps: policy.enabled ? tier.rateBps : 0,
        nextTier,
        remainingCustomers: nextTier ? Math.max(0, nextTier.minCustomers - performance.customers) : 0,
        remainingContributionFen: nextTier ? Math.max(0, nextTier.minContributionFen - performance.contributionFen) : 0,
    };
}

module.exports = {
    DAY_MS, draftPolicy, ProgramError, shortText, integer, choice,
    policyFrom, productFrom, templateFrom, qualifies, nextQualification,
};
