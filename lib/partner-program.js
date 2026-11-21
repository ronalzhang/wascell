const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const finance = require('./partner-finance');
const {
    DAY_MS, draftPolicy, ProgramError, shortText, integer, choice,
    policyFrom, productFrom, templateFrom, qualifies, nextQualification,
} = require('./partner-policy');

const collections = ['policies', 'products', 'profiles', 'referrals', 'mentorships', 'templates',
    'projects', 'orders', 'settlements', 'payments', 'disputes', 'audit'];
const projectStagesWithBudget = new Set(['applied', 'assigned', 'submitted', 'accepted']);
const ownerActions = new Set(['policy', 'product', 'partner', 'referral', 'mentorship', 'quality',
    'template', 'project', 'order', 'order-status', 'movement', 'settlement', 'payment', 'dispute']);
const salesActions = new Set(['preview', 'referral', 'mentor-request', 'mentorship-progress', 'project-apply',
    'project-submit', 'order', 'dispute']);
const openActions = new Set(['referral', 'mentor-request', 'project-apply', 'order']);

function activePolicy(state) {
    return state.policies.at(-1) || draftPolicy;
}

function emptyState() {
    return { version: 1, ...Object.fromEntries(collections.map(key => [key, []])) };
}

function createRecordStore(dataDir) {
    const filename = path.join(dataDir, 'partner-program.json');
    let writes = Promise.resolve();

    async function read() {
        try {
            const state = JSON.parse(await fs.readFile(filename, 'utf8'));
            if (state.version !== 1 || !collections.every(key => Array.isArray(state[key]))) {
                throw new Error('伙伴台账结构无法识别');
            }
            return state;
        } catch (error) {
            if (error.code === 'ENOENT') return emptyState();
            throw error;
        }
    }

    function write(operation) {
        // The website has one writer process. Each command reloads the last
        // snapshot and publishes state and audit together by atomic rename.
        const transaction = writes.then(async () => {
            const state = await read();
            const result = await operation(state);
            await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
            const temporary = `${filename}.${randomUUID()}.tmp`;
            let handle;
            try {
                handle = await fs.open(temporary, 'wx', 0o600);
                await handle.writeFile(JSON.stringify(state));
                await handle.sync();
                await handle.close();
                handle = undefined;
                await fs.rename(temporary, filename);
            } finally {
                if (handle) await handle.close().catch(() => {});
                await fs.rm(temporary, { force: true }).catch(() => {});
            }
            return result;
        });
        writes = transaction.catch(() => {});
        return transaction;
    }

    return { read, write };
}

function findRecord(items, id, label) {
    const item = items.find(record => record.id === id);
    if (!item) throw new ProgramError(`${label}不存在`, 404);
    return item;
}

function replaceRecord(items, record) {
    const index = items.findIndex(item => item.id === record.id);
    if (index < 0) items.push(record);
    else items[index] = record;
    return record;
}

function getProfile(state, id) {
    return state.profiles.find(profile => profile.id === id) || {
        id, status: 'unverified', contractRef: '', mentorStatus: 'none', mentorEvidence: '',
        qualityStatus: 'clear', qualityReason: '', reviewAt: null, tierIndex: 0,
    };
}

function assertRole(actor, role) {
    if (actor?.role !== role || !actor.userId) throw new ProgramError('当前账号无权使用此功能', 403);
}

function assertOpen(state, profile) {
    if (!activePolicy(state).enabled) throw new ProgramError('伙伴计划尚未启用', 403);
    if (profile.status !== 'certified') throw new ProgramError('请先完成合作认证', 403);
    if (profile.qualityStatus === 'paused') throw new ProgramError('新增业务暂缓，请查看整改与复审说明', 403);
}

function eligibleProduct(product) {
    return product.active && product.kind === 'non_medical' && Boolean(product.approvalRef);
}

function reviewTier(policy, profile, performance) {
    for (let index = profile.tierIndex; index > 0; index--) {
        const tier = policy.tiers[index];
        if (qualifies(performance, tier.minCustomers, tier.minContributionFen)) return index;
    }
    return 0;
}

function profileView(state, account, policy, now) {
    const profile = getProfile(state, account.id);
    const performance = finance.performance(state, account.id, policy, now);
    const tierIndex = reviewTier(policy, profile, performance);
    return { ...profile, displayName: account.displayName, tierIndex, performance };
}

function ownerAccount(accounts, id, mustBeActive = false) {
    const account = findRecord(accounts, id, '销售账号');
    if (mustBeActive && !account.active) throw new ProgramError('请先启用销售账号', 409);
    return account;
}

function reasonFrom(input) {
    return shortText(input.reason, '处理原因', 400);
}

function applyProfile(state, accounts, input, now) {
    const account = ownerAccount(accounts, input.id);
    const old = getProfile(state, account.id);
    const policy = activePolicy(state);
    const status = input.status === undefined ? old.status :
        choice(input.status, ['unverified', 'certified', 'suspended'], '合作状态');
    const mentorStatus = input.mentorStatus === undefined ? old.mentorStatus :
        choice(input.mentorStatus, ['none', 'requested', 'approved'], '带教资格');
    const contractRef = input.contractRef === undefined ? old.contractRef :
        shortText(input.contractRef, '签约凭据', 160, status === 'certified');
    if (status === 'certified' && (!account.active || !contractRef)) {
        throw new ProgramError('认证需要启用账号与合作签约凭据', 409);
    }
    const performance = finance.performance(state, account.id, policy, now);
    if (mentorStatus === 'approved' && old.mentorStatus !== mentorStatus && (
        status !== 'certified' || old.qualityStatus === 'paused' ||
        !qualifies(performance, policy.mentorMinCustomers, policy.mentorMinContributionFen)
    )) throw new ProgramError('该伙伴暂未达到带教资格', 409);

    const tierIndex = input.tierIndex === undefined ? old.tierIndex :
        integer(input.tierIndex, '复核档位', 0, policy.tiers.length - 1);
    const target = policy.tiers[tierIndex];
    if (input.tierIndex !== undefined && tierIndex > 0 &&
        (status !== 'certified' || !qualifies(performance, target.minCustomers, target.minContributionFen))) {
        throw new ProgramError('真实成交客户数或贡献尚未达到该档要求', 409);
    }
    return replaceRecord(state.profiles, { ...old, status, mentorStatus, contractRef, tierIndex, updatedAt: now });
}

function applyQuality(state, accounts, input, now) {
    ownerAccount(accounts, input.id);
    const profile = getProfile(state, input.id);
    const qualityStatus = choice(input.qualityStatus, ['clear', 'review', 'paused'], '整改状态');
    return replaceRecord(state.profiles, {
        ...profile,
        qualityStatus,
        qualityReason: reasonFrom(input),
        reviewAt: qualityStatus === 'clear' ? null :
            new Date(Date.parse(now) + activePolicy(state).remediationDays * DAY_MS).toISOString(),
        updatedAt: now,
    });
}

function saveReferral(state, partnerId, input, now) {
    if (input.consent !== true) throw new ProgramError('请先取得候选人同意');
    const name = shortText(input.name, '候选人称呼', 80);
    const contact = shortText(input.contact, '联系方式', 120);
    const note = shortText(input.note, '推荐说明', 600, false);
    const contactKey = value => value.normalize('NFKC').replace(/\s/g, '').toLowerCase();
    const existing = state.referrals.find(candidate => candidate.status !== 'closed' &&
        contactKey(candidate.contact) === contactKey(contact));
    if (existing) {
        if (existing.partnerId === partnerId) return existing;
        throw new ProgramError('该推荐暂无法登记，请联系管理端复核', 409);
    }
    return replaceRecord(state.referrals, {
        id: randomUUID(), createdAt: now, partnerId, name, contact, note, status: 'pending',
        reviewNote: '', candidateId: null,
    });
}

function reviewReferral(state, accounts, input) {
    const referral = findRecord(state.referrals, input.id, '候选记录');
    const status = choice(input.status, ['pending', 'reviewing', 'approved', 'closed'], '候选状态');
    let candidateId = referral.candidateId;
    if (status === 'approved') {
        candidateId = ownerAccount(accounts, input.candidateId || candidateId, true).id;
        if (candidateId === referral.partnerId || state.referrals.some(item =>
            item.id !== referral.id && item.candidateId === candidateId && item.status === 'approved')) {
            throw new ProgramError('请选择尚未关联的独立候选账号', 409);
        }
    }
    return replaceRecord(state.referrals, { ...referral, status, candidateId, reviewNote: reasonFrom(input) });
}

function activeMentorships(state, mentorId) {
    return state.mentorships.filter(task => task.mentorId === mentorId && task.status === 'active');
}

function mentorship(state, accounts, input, now) {
    if (input.id) {
        const task = findRecord(state.mentorships, input.id, '带教任务');
        const status = choice(input.status, ['completed', 'closed'], '带教结案状态');
        if (task.status !== 'active' || (status === 'completed' && task.progress !== 'ready')) {
            throw new ProgramError('完成带教前需提交成果供复核', 409);
        }
        return replaceRecord(state.mentorships, { ...task, status, reason: reasonFrom(input), updatedAt: now });
    }

    const mentor = ownerAccount(accounts, input.mentorId, true);
    const trainee = ownerAccount(accounts, input.traineeId, true);
    const profile = getProfile(state, mentor.id);
    assertOpen(state, profile);
    if (profile.mentorStatus !== 'approved') throw new ProgramError('该伙伴尚未获准带教', 409);
    if (activeMentorships(state, mentor.id).length >= activePolicy(state).mentorCapacity) {
        throw new ProgramError('该带教伙伴已达到同时指导容量', 409);
    }
    const parents = new Map(state.mentorships.filter(item => item.status === 'active').map(item => [item.traineeId, item.mentorId]));
    if (parents.has(trainee.id)) throw new ProgramError('候选账号已有进行中的带教任务', 409);
    let ancestor = mentor.id;
    while (ancestor) {
        if (ancestor === trainee.id) throw new ProgramError('带教不能循环指定', 409);
        ancestor = parents.get(ancestor);
    }
    return replaceRecord(state.mentorships, {
        id: randomUUID(), mentorId: mentor.id, traineeId: trainee.id, createdAt: now, status: 'active',
        progress: 'assigned', scope: shortText(input.scope, '带教任务内容', 1000),
        evidence: '', reason: reasonFrom(input),
    });
}

function requestMentor(state, profile, input, now) {
    const policy = activePolicy(state);
    const performance = finance.performance(state, profile.id, policy, now);
    if (!qualifies(performance, policy.mentorMinCustomers, policy.mentorMinContributionFen)) {
        throw new ProgramError('本人已成熟客户或贡献暂未达到带教申请门槛', 409);
    }
    if (profile.mentorStatus === 'approved') throw new ProgramError('你已具备带教资格', 409);
    return replaceRecord(state.profiles, {
        ...profile, mentorStatus: 'requested', mentorEvidence: shortText(input.evidence, '实操与带教能力说明', 1800), updatedAt: now,
    });
}

function progressMentorship(state, profile, input, now) {
    const task = findRecord(state.mentorships, input.id, '带教任务');
    if (task.mentorId !== profile.id) throw new ProgramError('带教任务不存在', 404);
    if (task.status !== 'active') throw new ProgramError('该带教任务已经结案', 409);
    const progress = choice(input.progress, ['in_training', 'ready'], '带教进度');
    const evidence = shortText(input.evidence, '脱敏成果说明', 1800, progress === 'ready');
    return replaceRecord(state.mentorships, { ...task, progress, evidence, updatedAt: now });
}

function ensureProjectAbility(state, profile, project) {
    assertOpen(state, profile);
    if (project.requiresMentor && profile.mentorStatus !== 'approved') {
        throw new ProgramError('该项目需要已认证的带教资格', 403);
    }
}

function ensureBudget(state, feeFen, now, reservedFen = 0) {
    const view = finance.dashboard(state, now);
    if (feeFen > view.projectBudgetFen - view.projectCommittedFen + reservedFen) {
        throw new ProgramError('超出可分配项目预算，请先核对平台最低留存与已承诺金额', 409);
    }
}

function manageProject(state, accounts, input, now) {
    const reason = reasonFrom(input);
    if (!input.id) {
        const template = findRecord(state.templates, input.templateId, '项目模板');
        if (!template.active) throw new ProgramError('商业项目模板已停用', 409);
        const partner = input.partnerId ? ownerAccount(accounts, input.partnerId, true) : null;
        if (partner) {
            ensureProjectAbility(state, getProfile(state, partner.id), template);
            ensureBudget(state, template.feeFen, now);
        }
        return replaceRecord(state.projects, {
            id: randomUUID(), templateId: template.id, name: template.name, category: template.category,
            feeFen: template.feeFen, deliverable: template.deliverable, requiresMentor: template.requiresMentor,
            scope: shortText(input.scope, '项目范围', 1800), partnerId: partner?.id || null,
            status: partner ? 'assigned' : 'open', submission: '', reason, createdAt: now, acceptedAt: null,
        });
    }

    const project = findRecord(state.projects, input.id, '运营项目');
    const action = choice(input.action, ['assign', 'accept', 'return', 'close'], '项目操作');
    if (project.status === 'accepted' || project.status === 'closed') throw new ProgramError('该项目已验收或已结案', 409);

    if (action === 'assign') {
        if (!['open', 'applied'].includes(project.status)) throw new ProgramError('项目当前不可委派', 409);
        const partner = ownerAccount(accounts, input.partnerId || project.partnerId, true);
        ensureProjectAbility(state, getProfile(state, partner.id), project);
        ensureBudget(state, project.feeFen, now, project.status === 'applied' ? project.feeFen : 0);
        return replaceRecord(state.projects, { ...project, status: 'assigned', partnerId: partner.id, reason, updatedAt: now });
    }
    if (action === 'accept') {
        if (project.status !== 'submitted') throw new ProgramError('请先收齐已提交的交付物', 409);
        return replaceRecord(state.projects, { ...project, status: 'accepted', reason, acceptedAt: now, updatedAt: now });
    }
    if (action === 'return') {
        if (!['applied', 'submitted'].includes(project.status)) throw new ProgramError('该项目当前无法退回', 409);
        const returnedApplication = project.status === 'applied';
        return replaceRecord(state.projects, {
            ...project, status: returnedApplication ? 'open' : 'assigned',
            partnerId: returnedApplication ? null : project.partnerId, reason, updatedAt: now,
        });
    }
    return replaceRecord(state.projects, { ...project, status: 'closed', reason, updatedAt: now });
}

function applyProject(state, profile, input, now) {
    const project = findRecord(state.projects, input.id, '运营项目');
    if (project.status === 'applied' && project.partnerId === profile.id) return project;
    if (project.status !== 'open') throw new ProgramError('项目当前不可申请', 409);
    ensureProjectAbility(state, profile, project);
    ensureBudget(state, project.feeFen, now);
    return replaceRecord(state.projects, {
        ...project, partnerId: profile.id, status: 'applied', reason: '', submission: '',
        applicationNote: shortText(input.note, '项目申请说明', 800, false), updatedAt: now,
    });
}

function submitProject(state, profile, input, now) {
    const project = findRecord(state.projects, input.id, '运营项目');
    if (project.partnerId !== profile.id) throw new ProgramError('运营项目不存在', 404);
    if (project.status !== 'assigned') throw new ProgramError('该项目当前不可提交', 409);
    return replaceRecord(state.projects, {
        ...project, status: 'submitted', submission: shortText(input.submission, '项目交付成果', 2400), updatedAt: now,
    });
}

function openDispute(state, partnerId, input, now) {
    const referenceType = choice(input.referenceType, ['order', 'settlement', 'project'], '对账记录类型');
    const referenceId = shortText(input.referenceId, '对账记录', 120);
    const allowed = {
        order: () => state.orders.some(item => item.id === referenceId && item.partnerId === partnerId),
        project: () => state.projects.some(item => item.id === referenceId && item.partnerId === partnerId),
        settlement: () => state.settlements.some(item => item.id === referenceId && item.entries.some(entry => entry.partnerId === partnerId)),
    };
    if (!allowed[referenceType]()) throw new ProgramError('对账记录不存在', 404);
    const existing = state.disputes.find(item => item.partnerId === partnerId && item.referenceId === referenceId && item.status === 'open');
    if (existing) throw new ProgramError('该记录已有待处理异议', 409);
    return replaceRecord(state.disputes, {
        id: randomUUID(), partnerId, referenceType, referenceId, createdAt: now,
        reason: reasonFrom(input), status: 'open', response: '',
    });
}

function resolveDispute(state, input, now) {
    const dispute = findRecord(state.disputes, input.id, '对账异议');
    if (dispute.status !== 'open') throw new ProgramError('对账异议已处理', 409);
    return replaceRecord(state.disputes, { ...dispute, status: 'resolved', response: shortText(input.response, '答复', 1600), updatedAt: now });
}

function salesReferral(referral) {
    const { id, name, status, reviewNote, createdAt } = referral;
    return { id, name, status, reviewNote, createdAt };
}

function salesProject(project, partnerId) {
    const { id, templateId, name, category, feeFen, deliverable, scope, status, submission, reason, requiresMentor } = project;
    const owned = project.partnerId === partnerId;
    return { id, templateId, name, category, feeFen, deliverable, scope, status, requiresMentor, owned,
        ...(owned ? { submission, reason } : {}) };
}

function salesOrder(order, stillAssigned) {
    const { id, state, createdAt, signedAt, deliveredAt, note, summary } = order;
    return {
        id, state, createdAt, signedAt, deliveredAt,
        customerId: stillAssigned ? order.customerId : null,
        customerName: stillAssigned ? order.customerName : '已交接客户',
        note: stillAssigned ? note : '',
        lines: order.lines.map(({ id: lineId, productId, productName, quotedFen, eligible, snapshot }) => ({
            id: lineId, productId, productName, quotedFen, eligible,
            ...(snapshot ? { rateBps: snapshot.rateBps } : {}),
        })),
        summary: {
            receiptFen: summary.receiptFen, refundFen: summary.refundFen, earnedFen: summary.earnedFen, pendingFen: summary.pendingFen,
        },
    };
}

function salesProfile(profile) {
    const { id, displayName, status, mentorStatus, qualityStatus, qualityReason, reviewAt, tierIndex, performance } = profile;
    return { id, displayName, status, mentorStatus, qualityStatus, qualityReason, reviewAt, tierIndex, performance };
}

function availableProjects(state, profile, eligible) {
    return state.projects.filter(project => project.partnerId === profile.id || (
        project.status === 'open' && eligible && (!project.requiresMentor || profile.mentorStatus === 'approved')
    ));
}

function calculatePreview(state, account, input, now) {
    const policy = activePolicy(state);
    const profile = profileView(state, account, policy, now);
    const customers = integer(input.customers ?? 0, '新增成熟客户数', 0, policy.maxForecastCustomers);
    const referrals = integer(input.referrals ?? 0, '候选伙伴数', 0, policy.maxForecastCustomers);
    const ids = input.projectIds ?? [];
    if (!Array.isArray(ids) || ids.length > policy.maxForecastProjects ||
        !ids.every(id => typeof id === 'string') || new Set(ids).size !== ids.length) {
        throw new ProgramError('请选择不重复且在试算上限内的项目');
    }
    const eligible = policy.enabled && profile.status === 'certified' && profile.qualityStatus !== 'paused';
    if (customers > 0 || ids.length > 0) assertOpen(state, profile);

    let forecastContributionFen = 0;
    let salesFen = 0;
    if (customers > 0) {
        const product = findRecord(state.products, input.productId, '试算产品');
        if (!eligibleProduct(product)) throw new ProgramError('该产品未纳入有效试算范围');
        forecastContributionFen = product.forecastContributionFen;
        salesFen = customers * finance.previewCommission(forecastContributionFen, policy, product, profile.tierIndex);
    }

    const opportunities = availableProjects(state, profile, eligible);
    const projects = ids.map(id => findRecord(opportunities, id, '可试算项目'));
    if (projects.some(project => !['open', 'applied', 'assigned', 'submitted'].includes(project.status))) {
        throw new ProgramError('请选择尚待交付的项目', 409);
    }
    const openFees = projects.filter(project => !projectStagesWithBudget.has(project.status))
        .reduce((sum, project) => sum + project.feeFen, 0);
    if (openFees > 0) ensureBudget(state, openFees, now);
    const projectFen = projects.reduce((sum, project) => sum + project.feeFen, 0);
    const future = {
        customers: profile.performance.customers + customers,
        contributionFen: profile.performance.contributionFen + customers * forecastContributionFen,
    };
    const { nextTier, remainingCustomers, remainingContributionFen, rateBps } = nextQualification(policy, profile.tierIndex, future);
    const slotsRemaining = eligible && profile.mentorStatus === 'approved' ?
        Math.max(0, policy.mentorCapacity - activeMentorships(state, profile.id).length) : 0;
    return {
        customers, referrals, salesFen, projectFen, totalFen: salesFen + projectFen, forecastContributionFen, rateBps,
        nextTierReached: Boolean(nextTier && !remainingCustomers && !remainingContributionFen),
        remainingCustomers, remainingContributionFen, slotsRemaining,
        notes: [
            '新增客户按真实成交、合格履约和结算条件测算，审批后的档位适用于后续新签订单。',
            '项目按实际获派和验收计费，候选推荐只影响带教容量安排。',
        ],
    };
}

function createPartnerProgram({
    dataDir, listAccounts, getCustomer, getCustomers, getCustomerIdentityId = async id => id, now = () => new Date(),
}) {
    const store = createRecordStore(dataDir);

    function accountsById(accounts) {
        return new Map(accounts.map(account => [account.id, account.displayName]));
    }

    async function ownerView(actor) {
        assertRole(actor, 'owner');
        const [state, accounts] = await Promise.all([store.read(), listAccounts()]);
        const at = now().toISOString();
        const policy = activePolicy(state);
        const names = accountsById(accounts);
        const namedPartner = record => ({ ...record, partnerName: names.get(record.partnerId) || record.partnerName || '' });
        const dashboard = finance.dashboard(state, at);
        return {
            policy, policies: state.policies, products: state.products, templates: state.templates, accounts,
            partners: accounts.map(account => profileView(state, account, policy, at)),
            referrals: state.referrals.map(namedPartner),
            mentorships: state.mentorships.map(task => ({
                ...task, mentorName: names.get(task.mentorId) || '', traineeName: names.get(task.traineeId) || '',
            })),
            projects: state.projects.map(namedPartner),
            orders: state.orders.map(order => namedPartner(finance.orderView(order, at))),
            settlements: state.settlements,
            payments: state.payments.map(namedPartner),
            disputes: state.disputes.map(namedPartner),
            audit: state.audit.slice(-200).reverse(),
            dashboard: {
                ...dashboard,
                candidateCount: state.referrals.filter(item => ['pending', 'reviewing'].includes(item.status)).length,
                activeMentorships: state.mentorships.filter(item => item.status === 'active').length,
                openDisputes: state.disputes.filter(item => item.status === 'open').length,
                paymentQueue: dashboard.paymentQueue.map(namedPartner),
            },
        };
    }

    async function salesView(actor) {
        assertRole(actor, 'sales');
        const [state, accounts] = await Promise.all([store.read(), listAccounts()]);
        const at = now().toISOString();
        const policy = activePolicy(state);
        const account = ownerAccount(accounts, actor.userId, true);
        const partnerId = account.id;
        const profile = profileView(state, account, policy, at);
        const names = accountsById(accounts);
        const ownedOrders = state.orders.filter(order => order.partnerId === partnerId);
        const customers = await getCustomers([...new Set(ownedOrders.map(order => order.customerId))]);
        const hasCurrentAccess = id => customers.get(id)?.assignedSalesId === partnerId;
        const eligible = profile.status === 'certified' && policy.enabled;
        const statements = state.settlements.map(({ id, period, lockedAt, entries }) => ({
            id, period, lockedAt,
            entries: entries.filter(entry => entry.partnerId === partnerId),
            payments: state.payments.filter(payment => payment.partnerId === partnerId && payment.period === period).map(payment => ({
                id: payment.id, status: payment.status, grossFen: payment.grossFen, taxFen: payment.taxFen,
                paidFen: payment.paidFen, createdAt: payment.createdAt,
            })),
        })).filter(statement => statement.entries.length || statement.payments.length);
        return {
            profile: salesProfile(profile),
            policy: {
                enabled: policy.enabled, tiers: policy.tiers, lookbackDays: policy.lookbackDays,
                mentorCapacity: policy.mentorCapacity, mentorMinCustomers: policy.mentorMinCustomers,
                mentorMinContributionFen: policy.mentorMinContributionFen,
                maxForecastCustomers: policy.maxForecastCustomers, maxForecastProjects: policy.maxForecastProjects,
            },
            qualification: nextQualification(policy, profile.tierIndex, profile.performance),
            income: finance.income(state, partnerId, at),
            products: state.products.filter(eligibleProduct).map(({ id, name, forecastContributionFen }) => ({ id, name, forecastContributionFen })),
            templates: state.templates.filter(template => eligible && template.active &&
                (!template.requiresMentor || profile.mentorStatus === 'approved'))
                .map(({ id, name, category, feeFen, deliverable, requiresMentor }) => ({ id, name, category, feeFen, deliverable, requiresMentor })),
            referrals: state.referrals.filter(item => item.partnerId === partnerId).map(salesReferral),
            mentorships: state.mentorships.filter(task => task.mentorId === partnerId || task.traineeId === partnerId)
                .map(({ id, mentorId, traineeId, scope, progress, evidence, status }) => ({
                    id, scope, progress, evidence, status,
                    mentorName: names.get(mentorId) || '', traineeName: names.get(traineeId) || '',
                    viewerRole: mentorId === partnerId ? 'mentor' : 'trainee',
                })),
            projects: availableProjects(state, profile, eligible).map(project => salesProject(project, partnerId)),
            orders: ownedOrders.map(order => salesOrder(finance.orderView(order, at), hasCurrentAccess(order.customerId))),
            statements,
            disputes: state.disputes.filter(item => item.partnerId === partnerId),
        };
    }

    async function createOrder(state, actor, accounts, input, at) {
        const isSales = actor.role === 'sales';
        const customerId = shortText(input.customerId, '客户编号', 120);
        const customer = await getCustomer(customerId);
        if (!customer || (isSales && customer.assignedSalesId !== actor.userId)) {
            throw new ProgramError('当前客户不存在或未分配给你', 404);
        }
        const partnerId = isSales ? actor.userId : (input.partnerId || customer.assignedSalesId);
        const account = ownerAccount(accounts, partnerId, true);
        if (customer.assignedSalesId !== partnerId) throw new ProgramError('请先在客户管理中确认服务归属', 409);
        assertOpen(state, getProfile(state, partnerId));
        const products = isSales ? state.products.filter(eligibleProduct) : state.products.filter(product => product.active);
        const order = finance.createOrder(state, input, {
            customerId, customerName: customer.name, partnerId, partnerName: account.displayName, products,
        }, at);
        return isSales ? salesOrder(order, true) : order;
    }

    async function orderStatus(state, accounts, input, at) {
        const order = finance.getOrder(state, input.id);
        const policy = activePolicy(state);
        let tierIndex = 0;
        let customerIdentityId;
        if (input.state === 'signed') {
            const customer = await getCustomer(order.customerId);
            if (!customer || customer.assignedSalesId !== order.partnerId) {
                throw new ProgramError('签约时客户已改派，请核对并建立新草稿', 409);
            }
            const account = ownerAccount(accounts, order.partnerId, true);
            const profile = profileView(state, account, policy, at);
            assertOpen(state, profile);
            tierIndex = profile.tierIndex;
            customerIdentityId = await getCustomerIdentityId(order.customerId);
        }
        return finance.changeOrderStatus(state, input, { policy, productList: state.products, tierIndex, customerIdentityId }, at);
    }

    async function ownerCommand(state, actor, accounts, action, input, at) {
        if (action !== 'order' && action !== 'dispute') reasonFrom(input);
        switch (action) {
        case 'policy': {
            const policy = policyFrom(input, at);
            state.policies.push(policy);
            return policy;
        }
        case 'product': {
            const previous = input.id ? findRecord(state.products, input.id, '产品') : null;
            return replaceRecord(state.products, productFrom(input, previous, at));
        }
        case 'template': {
            const previous = input.id ? findRecord(state.templates, input.id, '项目模板') : null;
            return replaceRecord(state.templates, templateFrom(input, previous, at));
        }
        case 'partner': return applyProfile(state, accounts, input, at);
        case 'quality': return applyQuality(state, accounts, input, at);
        case 'referral': return reviewReferral(state, accounts, input);
        case 'mentorship': return mentorship(state, accounts, input, at);
        case 'project': return manageProject(state, accounts, input, at);
        case 'order': return createOrder(state, actor, accounts, input, at);
        case 'order-status': return orderStatus(state, accounts, input, at);
        case 'movement': return finance.recordMovement(state, input, at);
        case 'settlement': return finance.closeSettlement(state, input, at);
        case 'payment': return finance.handlePayment(state, input, at);
        case 'dispute': return resolveDispute(state, input, at);
        }
    }

    async function salesCommand(state, actor, accounts, action, input, at) {
        const account = ownerAccount(accounts, actor.userId, true);
        const profile = getProfile(state, account.id);
        if (openActions.has(action)) assertOpen(state, profile);
        switch (action) {
        case 'referral': return salesReferral(saveReferral(state, account.id, input, at));
        case 'mentor-request': return salesProfile({ ...requestMentor(state, profile, input, at), displayName: account.displayName });
        case 'mentorship-progress': return progressMentorship(state, profile, input, at);
        case 'project-apply': return salesProject(applyProject(state, profile, input, at), account.id);
        case 'project-submit': return salesProject(submitProject(state, profile, input, at), account.id);
        case 'order': return createOrder(state, actor, accounts, input, at);
        case 'dispute': return openDispute(state, account.id, input, at);
        }
    }

    async function command(actor, action, input = {}) {
        const isOwner = actor?.role === 'owner';
        assertRole(actor, isOwner ? 'owner' : 'sales');
        if (!(isOwner ? ownerActions : salesActions).has(action)) throw new ProgramError('当前账号无权执行此操作', 403);
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ProgramError('请提供所需数据');
        if (action === 'preview') {
            const [state, accounts] = await Promise.all([store.read(), listAccounts()]);
            return calculatePreview(state, ownerAccount(accounts, actor.userId, true), input, now().toISOString());
        }

        return store.write(async state => {
            const accounts = await listAccounts();
            const at = now().toISOString();
            const handler = isOwner ? ownerCommand : salesCommand;
            const result = await handler(state, actor, accounts, action, input, at);
            state.audit.push({
                id: randomUUID(), action, actorId: actor.userId, targetId: result?.id || actor.userId,
                reason: typeof input.reason === 'string' ? input.reason.trim().slice(0, 400) : '',
                createdAt: at,
            });
            return result;
        });
    }

    async function assertSalesLeadAllowed(actor) {
        assertRole(actor, 'sales');
        const profile = getProfile(await store.read(), actor.userId);
        if (profile.qualityStatus === 'paused' || profile.status === 'suspended') {
            throw new ProgramError('新增线索暂缓，请查看伙伴整改说明', 403);
        }
    }

    return { ownerView, salesView, command, assertSalesLeadAllowed };
}

module.exports = { createPartnerProgram };
