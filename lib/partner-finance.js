const { randomUUID } = require('node:crypto');

const DAY_MS = 86_400_000;
const BEIJING_OFFSET_MS = 8 * 3_600_000;
const BANK_MOVEMENTS = new Set(['receipt', 'refund']);
const MOVEMENT_TYPES = new Set([...BANK_MOVEMENTS, 'cost', 'cost_recovery']);
const COMMITTED_PROJECTS = new Set(['applied', 'assigned', 'submitted', 'accepted']);
const PENDING_PROJECTS = new Set(['assigned', 'submitted']);

class PartnerError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = 'PartnerError';
        this.statusCode = statusCode;
    }
}

function addMoney(left, right) {
    const total = left + right;
    if (!Number.isSafeInteger(total)) throw new PartnerError('金额超出可核算范围');
    return total;
}

function money(value, name, min = 0) {
    if (!Number.isSafeInteger(value) || value < min) throw new PartnerError(`${name}须为不少于 ${min} 的整数分`);
    return value;
}

function clean(value, limit) {
    return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function required(value, limit, name) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > limit) {
        throw new PartnerError(`${name}必填，且最多 ${limit} 个字`);
    }
    return value.trim();
}

function timestamp(value) {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) throw new PartnerError('记录时间无效');
    return time;
}

function didHappen(value, asOf) {
    return value !== null && value !== undefined && Date.parse(value) <= asOf;
}

function eligibleProduct(product) {
    return product?.active === true && product.kind === 'non_medical' && Boolean(product.approvalRef?.trim());
}

function portion(amountFen, rateBps, roundUp = false) {
    const adjustment = roundUp ? 9999n : 0n;
    return Number((BigInt(amountFen) * BigInt(rateBps) + adjustment) / 10000n);
}

function snapshotFor(policy, product, tierIndex) {
    return {
        policyId: policy.id,
        productId: product.id,
        productName: product.name,
        productKind: product.kind,
        approvalRef: product.approvalRef,
        enabled: policy.enabled === true,
        tierIndex,
        rateBps: policy.tiers[tierIndex]?.rateBps ?? 0,
        minPlatformBps: policy.minPlatformBps,
        maxRateBps: product.maxRateBps,
        maxCommissionFen: product.maxCommissionFen ?? null,
        minRetainedFen: product.minRetainedFen,
        maturityDays: policy.maturityDays,
        forecastContributionFen: product.forecastContributionFen,
    };
}

function orderRetention(contributionFen, snapshot) {
    return Math.min(contributionFen, Math.max(
        portion(contributionFen, snapshot.minPlatformBps, true), snapshot.minRetainedFen,
    ));
}

function commissionFor(contributionFen, snapshot) {
    if (contributionFen <= 0) return 0;
    const retainedFen = orderRetention(contributionFen, snapshot);
    return Math.max(0, Math.min(
        portion(contributionFen, Math.min(snapshot.rateBps, snapshot.maxRateBps)),
        snapshot.maxCommissionFen ?? contributionFen,
        contributionFen - retainedFen,
    ));
}

function previewCommission(contributionFen, policy, product, tierIndex) {
    if (!policy?.enabled || !eligibleProduct(product)) return 0;
    if (!Number.isSafeInteger(contributionFen)) throw new PartnerError('测算贡献须为整数分');
    return commissionFor(contributionFen, snapshotFor(policy, product, tierIndex));
}

function getOrder(state, id) {
    const order = state.orders.find(item => item.id === id);
    if (!order) throw new PartnerError('订单不存在', 404);
    return order;
}

function createOrder(state, input, context, now) {
    if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 50) {
        throw new PartnerError('订单须有 1 至 50 个明细');
    }
    const lines = input.lines.map(item => {
        const product = context.products.find(record => record.id === item?.productId);
        if (!product?.active) throw new PartnerError('请选择在用的产品');
        return {
            id: randomUUID(),
            productId: product.id,
            productName: product.name,
            quotedFen: money(item.quotedFen, '报价', 1),
            eligible: false,
            snapshot: null,
        };
    });
    const order = {
        id: randomUUID(),
        customerId: context.customerId,
        customerName: context.customerName,
        partnerId: context.partnerId,
        partnerName: context.partnerName,
        state: 'draft',
        contractRef: '',
        signedAt: null,
        deliveredAt: null,
        lines,
        movements: [],
        note: clean(input.note, 1200),
        createdAt: now,
    };
    state.orders.push(order);
    return orderView(order, now);
}

function changeOrderStatus(state, input, context, now) {
    const order = getOrder(state, input.id);
    if (input.state === 'signed' && order.state === 'draft') {
        const contractRef = required(input.contractRef, 160, '合同编号');
        const duplicate = state.orders.some(record => record.signedAt && record.contractRef &&
            referenceKey(record.contractRef) === referenceKey(contractRef));
        if (duplicate) throw new PartnerError('该合同编号已有签约订单，请核对原订单', 409);
        const { policy, tierIndex, productList, customerIdentityId } = context;
        const lines = order.lines.map(line => {
            const product = productList.find(record => record.id === line.productId);
            if (!product?.active) throw new PartnerError('订单包含已停用产品，请先核对报价', 409);
            return {
                ...line,
                productName: product.name,
                eligible: policy.enabled === true && eligibleProduct(product),
                snapshot: snapshotFor(policy, product, tierIndex),
            };
        });
        Object.assign(order, {
            state: 'signed', contractRef, signedAt: now, lines, customerIdentityId: customerIdentityId || null,
        });
    } else if (input.state === 'delivered' && order.state === 'signed') {
        Object.assign(order, {
            state: 'delivered', deliveredAt: now, deliveryMovementCount: order.movements.length,
        });
    } else if (input.state === 'cancelled' && ['draft', 'signed'].includes(order.state)) {
        Object.assign(order, { state: 'cancelled', cancelledAt: now });
    } else {
        throw new PartnerError('当前订单状态不允许该变更', 409);
    }
    return orderView(order, now);
}

function maturityTime(total, deliveredAt) {
    const { line, paidAt, costAt } = total;
    if (!line.eligible || !line.snapshot || deliveredAt === null || paidAt === null || costAt === null) return null;
    return Math.max(Math.max(paidAt, deliveredAt) + line.snapshot.maturityDays * DAY_MS, costAt);
}

function advanceMaturity(total, deliveredAt, at) {
    if (total.maturedAt !== null) return;
    const candidate = maturityTime(total, deliveredAt);
    if (candidate !== null && candidate <= at) total.maturedAt = candidate;
}

function lineTotals(order, asOf) {
    const lines = new Map(order.lines.map(line => [line.id, {
        line,
        receiptFen: 0, refundFen: 0, costFen: 0, taxFen: 0, passThroughFen: 0,
        paidAt: null, costAt: null, maturedAt: null,
    }]));
    const deliveredAt = didHappen(order.deliveredAt, asOf) ? timestamp(order.deliveredAt) : null;
    for (const [index, movement] of order.movements.entries()) {
        if (!didHappen(movement.createdAt, asOf)) continue;
        const when = timestamp(movement.createdAt);
        const afterDelivery = deliveredAt !== null && (order.deliveryMovementCount === undefined
            ? when > deliveredAt
            : index >= order.deliveryMovementCount);
        for (const allocation of movement.allocations) {
            const total = lines.get(allocation.lineId);
            // Preserve maturity already reached. A prior refund interrupts the paid-in-full window.
            advanceMaturity(total, afterDelivery ? deliveredAt : null, when);
            const { amountFen, taxFen, passThroughFen } = allocation;
            if (movement.type === 'receipt') {
                total.receiptFen = addMoney(total.receiptFen, amountFen);
                total.taxFen = addMoney(total.taxFen, taxFen);
                total.passThroughFen = addMoney(total.passThroughFen, passThroughFen);
                if (total.paidAt === null && total.receiptFen - total.refundFen >= total.line.quotedFen) {
                    total.paidAt = when;
                }
            } else if (movement.type === 'refund') {
                total.refundFen = addMoney(total.refundFen, amountFen);
                total.taxFen -= taxFen;
                total.passThroughFen -= passThroughFen;
                if (total.receiptFen - total.refundFen < total.line.quotedFen) total.paidAt = null;
            } else if (movement.type === 'cost') {
                total.costFen = addMoney(total.costFen, amountFen);
                total.costAt ??= when;
            } else {
                total.costFen -= amountFen;
            }
        }
    }
    for (const total of lines.values()) advanceMaturity(total, deliveredAt, asOf);
    return lines;
}

function orderAmounts(order, asOf) {
    const summary = {
        receiptFen: 0, refundFen: 0, costFen: 0, netFen: 0,
        contributionFen: 0, earnedFen: 0, pendingFen: 0,
    };
    const lines = [];
    const deliveredAt = didHappen(order.deliveredAt, asOf) ? timestamp(order.deliveredAt) : null;
    for (const total of lineTotals(order, asOf).values()) {
        const { line, receiptFen, refundFen, costFen, taxFen, passThroughFen, costAt, maturedAt } = total;
        const netFen = receiptFen - refundFen - taxFen - passThroughFen;
        const contributionFen = netFen - costFen;
        const eligible = line.eligible && line.snapshot && !didHappen(order.cancelledAt, asOf);
        const maturity = eligible ? maturedAt ?? maturityTime(total, deliveredAt) : null;
        const matured = Boolean(eligible && maturedAt !== null);
        const estimated = eligible && costAt !== null ? commissionFor(contributionFen, line.snapshot) : 0;
        const earnedFen = matured ? estimated : 0;
        const pendingFen = matured ? 0 : estimated;
        const values = { receiptFen, refundFen, costFen, netFen, contributionFen, earnedFen, pendingFen };
        for (const field of Object.keys(summary)) summary[field] = addMoney(summary[field], values[field]);
        const retainedFen = matured && contributionFen > 0 ? orderRetention(contributionFen, line.snapshot) : 0;
        lines.push({ ...values, lineId: line.id, maturity, matured, retainedFen });
    }
    return { lines, summary };
}

function orderView(order, now) {
    const { lines, summary } = orderAmounts(order, timestamp(now));
    const amountsById = new Map(lines.map(line => [line.lineId, line]));
    return { ...order, lines: order.lines.map(line => ({ ...line, ...amountsById.get(line.id) })), summary };
}

function normalizedAllocations(order, input) {
    if (!Array.isArray(input.allocations) || !input.allocations.length || input.allocations.length > order.lines.length) {
        throw new PartnerError('须按合同填写流水的明细分摊');
    }
    const validLines = new Set(order.lines.map(line => line.id));
    const seen = new Set();
    const isCost = !BANK_MOVEMENTS.has(input.type);
    const allocations = input.allocations.map(allocation => {
        if (!validLines.has(allocation?.lineId) || seen.has(allocation.lineId)) {
            throw new PartnerError('分摊明细不存在或重复');
        }
        seen.add(allocation.lineId);
        const amountFen = money(allocation.amountFen, '分摊金额', input.type === 'cost' ? 0 : 1);
        const taxFen = money(allocation.taxFen ?? 0, '税额');
        const passThroughFen = money(allocation.passThroughFen ?? 0, '代收代付金额');
        if (taxFen > amountFen - passThroughFen || (isCost && (taxFen || passThroughFen))) {
            throw new PartnerError('税额、代收代付金额与本笔分摊不符');
        }
        return { lineId: allocation.lineId, amountFen, taxFen, passThroughFen };
    });
    if (allocations.reduce((total, item) => addMoney(total, item.amountFen), 0) !== input.amountFen) {
        throw new PartnerError('分摊合计须等于流水金额');
    }
    return allocations.sort((left, right) => left.lineId.localeCompare(right.lineId));
}

function referenceKey(value) {
    return value.normalize('NFKC').toUpperCase();
}

function findMovementByReference(state, reference, bank) {
    const key = referenceKey(reference);
    for (const order of state.orders) {
        const entry = order.movements.find(movement =>
            BANK_MOVEMENTS.has(movement.type) === bank && referenceKey(movement.reference) === key
        );
        if (entry) return { orderId: order.id, entry };
    }
    return null;
}

function hasPaidReference(state, reference) {
    const key = referenceKey(reference);
    return state.payments.some(payment => payment.status === 'paid' && referenceKey(payment.reference) === key);
}

function validateMovementBalance(type, allocation, total) {
    const { amountFen, taxFen, passThroughFen } = allocation;
    const grossFen = total.receiptFen - total.refundFen;
    if (type === 'receipt' && amountFen > total.line.quotedFen - grossFen) {
        throw new PartnerError('收款分摊不得超过明细合同应收余额');
    }
    if (type === 'refund') {
        const ownFen = amountFen - taxFen - passThroughFen;
        if (taxFen > total.taxFen || passThroughFen > total.passThroughFen ||
            ownFen > grossFen - total.taxFen - total.passThroughFen) {
            throw new PartnerError('退款分摊超过对应款项余额');
        }
    }
    if (type === 'cost_recovery' && amountFen > total.costFen) {
        throw new PartnerError('成本回收超过已核验的成本余额');
    }
}

function recordMovement(state, input, now) {
    const order = getOrder(state, input.id);
    if (!MOVEMENT_TYPES.has(input.type)) throw new PartnerError('不支持的流水类型');
    const reference = required(input.reference, 160, '流水凭证号');
    const amountFen = money(input.amountFen, '流水金额', input.type === 'cost' ? 0 : 1);
    const allocations = normalizedAllocations(order, input);
    const bank = BANK_MOVEMENTS.has(input.type);
    const previous = findMovementByReference(state, reference, bank);
    if (previous) {
        const { orderId, entry } = previous;
        if (orderId === order.id && entry.type === input.type && entry.amountFen === amountFen &&
            JSON.stringify(entry.allocations) === JSON.stringify(allocations)) return orderView(order, now);
        throw new PartnerError('流水凭证号已用在另一笔入账', 409);
    }
    if (bank && hasPaidReference(state, reference)) {
        throw new PartnerError('该银行流水已登记为实付回执', 409);
    }
    if (!order.signedAt || (order.state === 'cancelled' && input.type === 'receipt')) {
        throw new PartnerError('当前订单状态不允许录入这类流水', 409);
    }
    const totals = lineTotals(order, timestamp(now));
    for (const allocation of allocations) validateMovementBalance(input.type, allocation, totals.get(allocation.lineId));
    const movement = {
        id: randomUUID(), type: input.type, reference, amountFen, allocations, createdAt: now,
        reason: clean(input.reason, 600),
    };
    const updated = { ...order, movements: [...order.movements, movement] };
    const view = orderView(updated, now);
    order.movements.push(movement);
    return view;
}

function performance(state, partnerId, policy, now) {
    const time = timestamp(now);
    const cutoff = time - policy.lookbackDays * DAY_MS;
    const byCustomer = new Map();
    let contributionFen = 0;
    for (const order of state.orders) {
        if (order.partnerId !== partnerId) continue;
        const customerId = order.customerIdentityId || order.customerId;
        for (const line of orderAmounts(order, time).lines) {
            if (!line.matured || line.maturity < cutoff) continue;
            const current = byCustomer.get(customerId) ?? 0;
            byCustomer.set(customerId, addMoney(current, line.contributionFen));
            contributionFen = addMoney(contributionFen, line.contributionFen);
        }
    }
    const customers = [...byCustomer.values()].filter(amount => amount > 0).length;
    return { customers, contributionFen };
}

function accepted(project, asOf) {
    return Boolean(project.partnerId) && didHappen(project.acceptedAt, asOf);
}

function keyFor(entry) {
    return JSON.stringify([entry.partnerId, entry.sourceType, entry.sourceId, entry.lineId ?? null]);
}

function sourceKey(entry) {
    return JSON.stringify([entry.partnerId, entry.sourceType, entry.sourceId]);
}

function disputedSources(state) {
    const sources = new Set();
    for (const dispute of state.disputes ?? []) {
        if (dispute.status !== 'open') continue;
        if (dispute.referenceType === 'settlement') {
            const settlement = state.settlements.find(item => item.id === dispute.referenceId);
            for (const entry of settlement?.entries ?? []) {
                if (entry.partnerId === dispute.partnerId) sources.add(sourceKey(entry));
            }
        } else {
            sources.add(sourceKey({
                partnerId: dispute.partnerId, sourceType: dispute.referenceType, sourceId: dispute.referenceId,
            }));
        }
    }
    return sources;
}

function financialSnapshot(state, asOf) {
    const awards = new Map();
    const pending = new Map();
    let eligibleNetFen = 0;
    let contributionFen = 0;
    let commissionsFen = 0;
    let projectAcceptedFen = 0;
    let orderRetentionFen = 0;
    for (const order of state.orders) {
        const { lines, summary } = orderAmounts(order, asOf);
        pending.set(order.partnerId, addMoney(pending.get(order.partnerId) ?? 0, summary.pendingFen));
        for (const line of lines) {
            if (!line.matured) continue;
            eligibleNetFen = addMoney(eligibleNetFen, line.netFen);
            contributionFen = addMoney(contributionFen, line.contributionFen);
            commissionsFen = addMoney(commissionsFen, line.earnedFen);
            orderRetentionFen = addMoney(orderRetentionFen, line.retainedFen);
            const entry = {
                partnerId: order.partnerId, sourceType: 'order', sourceId: order.id,
                lineId: line.lineId, amountFen: line.earnedFen,
            };
            awards.set(keyFor(entry), entry);
        }
    }
    for (const project of state.projects) {
        if (accepted(project, asOf)) {
            const entry = {
                partnerId: project.partnerId, sourceType: 'project', sourceId: project.id,
                lineId: null, amountFen: project.feeFen,
            };
            awards.set(keyFor(entry), entry);
            projectAcceptedFen = addMoney(projectAcceptedFen, project.feeFen);
        } else if (project.partnerId && PENDING_PROJECTS.has(project.status)) {
            pending.set(project.partnerId, addMoney(pending.get(project.partnerId) ?? 0, project.feeFen));
        }
    }
    return { awards, pending, eligibleNetFen, contributionFen, commissionsFen, projectAcceptedFen, orderRetentionFen };
}

function recordedSources(state) {
    const records = new Map();
    for (const settlement of state.settlements) {
        for (const entry of settlement.entries) {
            const key = keyFor(entry);
            const record = records.get(key) ?? { entry, amountFen: 0, credits: [] };
            record.amountFen = addMoney(record.amountFen, entry.amountFen);
            if (entry.amountFen > 0) {
                record.credits.push({ settlementId: settlement.id, period: settlement.period, amountFen: entry.amountFen });
            } else {
                // Reverse the latest credits first and leave actual payouts and locked entries intact.
                let correctionFen = -entry.amountFen;
                while (correctionFen > 0 && record.credits.length) {
                    const credit = record.credits.at(-1);
                    const offsetFen = Math.min(correctionFen, credit.amountFen);
                    correctionFen -= offsetFen;
                    credit.amountFen -= offsetFen;
                    if (credit.amountFen === 0) record.credits.pop();
                }
            }
            records.set(key, record);
        }
    }
    return records;
}

function periodEnd(period) {
    const match = /^([2-9]\d{3})-(0[1-9]|1[0-2])$/.exec(period);
    if (!match) throw new PartnerError('结算月须为 YYYY-MM');
    return Date.UTC(Number(match[1]), Number(match[2]), 1) - BEIJING_OFFSET_MS;
}

function closeSettlement(state, input, now) {
    const end = periodEnd(input.period);
    const previous = state.settlements.find(item => item.period === input.period);
    if (previous) return previous;
    if (timestamp(now) < end) throw new PartnerError('该结算月尚未结束', 409);
    if (state.settlements.some(item => item.period > input.period)) {
        throw new PartnerError('已有更晚的关账，后续调整请在新一期结算', 409);
    }
    const { awards } = financialSnapshot(state, end - 1);
    const recorded = recordedSources(state);
    for (const [key, record] of recorded) {
        if (!awards.has(key)) awards.set(key, { ...record.entry, amountFen: 0 });
    }
    const entries = [];
    const disputed = disputedSources(state);
    for (const [key, award] of awards) {
        if (disputed.has(sourceKey(award))) continue;
        const old = recorded.get(key);
        const amountFen = addMoney(award.amountFen, -(old?.amountFen ?? 0));
        if (amountFen) entries.push({ ...award, amountFen, adjustment: Boolean(old) });
    }
    const settlement = {
        id: randomUUID(), period: input.period, lockedAt: now,
        entries, reason: clean(input.reason, 600),
    };
    state.settlements.push(settlement);
    return settlement;
}

function sumAwards(awards, partnerId) {
    let total = 0;
    for (const { partnerId: beneficiary, amountFen } of awards.values()) {
        if (beneficiary === partnerId) total = addMoney(total, amountFen);
    }
    return total;
}

function income(state, partnerId, now) {
    const { awards, pending } = financialSnapshot(state, timestamp(now));
    const payments = state.payments.filter(payment => payment.partnerId === partnerId && payment.status === 'paid');
    const grossPaidFen = payments.reduce((total, payment) => addMoney(total, payment.grossFen), 0);
    const earnedFen = sumAwards(awards, partnerId);
    let adjustmentFen = 0;
    for (const settlement of state.settlements) {
        for (const entry of settlement.entries) {
            if (entry.partnerId === partnerId && (entry.adjustment || entry.amountFen < 0)) {
                adjustmentFen = addMoney(adjustmentFen, entry.amountFen);
            }
        }
    }
    return {
        paidFen: payments.reduce((total, payment) => addMoney(total, payment.paidFen), 0),
        withheldFen: payments.reduce((total, payment) => addMoney(total, payment.taxFen), 0),
        payableFen: Math.max(0, earnedFen - grossPaidFen),
        pendingFen: pending.get(partnerId) ?? 0,
        adjustmentFen,
        refundableBalanceFen: Math.max(0, grossPaidFen - earnedFen),
    };
}

function allocationKey(credit) {
    return JSON.stringify([credit.settlementId, credit.sourceType, credit.sourceId, credit.lineId ?? null]);
}

function payableCredits(state, awards) {
    const partners = new Map();
    const disputed = disputedSources(state);
    for (const [key, source] of recordedSources(state)) {
        // Unlocked increases require a new close. A known decrease limits payouts immediately.
        let availableFen = Math.min(source.amountFen, awards.get(key)?.amountFen ?? 0);
        if (availableFen <= 0) continue;
        const { partnerId, sourceType, sourceId, lineId } = source.entry;
        const partner = partners.get(partnerId) ?? { totalFen: 0, months: new Map() };
        partner.totalFen = addMoney(partner.totalFen, availableFen);
        if (!disputed.has(sourceKey(source.entry))) {
            for (const credit of source.credits) {
                const amountFen = Math.min(availableFen, credit.amountFen);
                const entries = partner.months.get(credit.period) ?? [];
                entries.push({ settlementId: credit.settlementId, sourceType, sourceId, lineId: lineId ?? null, amountFen });
                partner.months.set(credit.period, entries);
                availableFen -= amountFen;
                if (availableFen <= 0) break;
            }
        }
        partners.set(partnerId, partner);
    }
    return partners;
}

function committedPayments(state, partnerId, excludedPaymentId) {
    const paidByCredit = new Map();
    const legacyByPeriod = new Map();
    const activePeriods = new Set();
    let totalFen = 0;
    for (const payment of state.payments) {
        if (payment.id === excludedPaymentId || payment.partnerId !== partnerId ||
            (payment.status !== 'paid' && payment.status !== 'reconciling')) continue;
        totalFen = addMoney(totalFen, payment.grossFen);
        if (payment.status === 'reconciling') activePeriods.add(payment.period);
        if (!payment.allocations?.length) {
            legacyByPeriod.set(payment.period, addMoney(legacyByPeriod.get(payment.period) ?? 0, payment.grossFen));
            continue;
        }
        for (const allocation of payment.allocations) {
            const key = allocationKey(allocation);
            paidByCredit.set(key, addMoney(paidByCredit.get(key) ?? 0, allocation.amountFen));
        }
    }
    return { paidByCredit, legacyByPeriod, activePeriods, totalFen };
}

function paymentQueue(state, awards, excludedPaymentId) {
    const queue = [];
    for (const [partnerId, partner] of payableCredits(state, awards)) {
        const committed = committedPayments(state, partnerId, excludedPaymentId);
        // A paid source whose award fell below its payout reduces the partner's overall balance.
        let balanceFen = partner.totalFen - committed.totalFen;
        for (const period of [...partner.months.keys()].sort()) {
            if (balanceFen <= 0) break;
            if (committed.activePeriods.has(period)) continue;
            let legacyFen = committed.legacyByPeriod.get(period) ?? 0;
            let dueFen = 0;
            const allocations = [];
            for (const credit of partner.months.get(period)) {
                const reservedFen = committed.paidByCredit.get(allocationKey(credit)) ?? 0;
                const outstandingFen = Math.max(0, credit.amountFen - reservedFen);
                // Historic instructions held only a month and a total, so they stay charged against that month.
                const legacyCoveredFen = Math.min(outstandingFen, legacyFen);
                legacyFen -= legacyCoveredFen;
                const amountFen = Math.min(balanceFen, outstandingFen - legacyCoveredFen);
                if (amountFen <= 0) continue;
                allocations.push({ ...credit, amountFen });
                dueFen = addMoney(dueFen, amountFen);
                balanceFen -= amountFen;
                if (balanceFen <= 0) break;
            }
            if (dueFen > 0) queue.push({ partnerId, period, dueFen, allocations });
        }
    }
    return queue;
}

function currentPaymentDue(state, awards, payment) {
    const available = paymentQueue(state, awards, payment.id).find(item =>
        item.partnerId === payment.partnerId && item.period === payment.period
    );
    if (!available) return 0;
    if (!payment.allocations?.length) return available.dueFen;
    const credits = new Map(available.allocations.map(credit => [allocationKey(credit), credit.amountFen]));
    return payment.allocations.reduce((total, allocation) =>
        addMoney(total, Math.min(allocation.amountFen, credits.get(allocationKey(allocation)) ?? 0)), 0);
}

function dashboard(state, now) {
    const asOf = timestamp(now);
    const { awards, eligibleNetFen, contributionFen, commissionsFen, projectAcceptedFen, orderRetentionFen } =
        financialSnapshot(state, asOf);
    const policy = state.policy ?? state.policies?.at(-1);
    let projectCommittedFen = 0;
    for (const project of state.projects) {
        if (COMMITTED_PROJECTS.has(project.status) || accepted(project, asOf)) {
            projectCommittedFen = addMoney(projectCommittedFen, project.feeFen);
        }
    }

    const committedPayouts = new Map();
    for (const payment of state.payments) {
        if (payment.status !== 'paid' && payment.status !== 'reconciling') continue;
        committedPayouts.set(payment.partnerId, addMoney(committedPayouts.get(payment.partnerId) ?? 0, payment.grossFen));
    }
    let exposureFen = 0;
    for (const [partnerId, committedFen] of committedPayouts) {
        exposureFen = addMoney(exposureFen, Math.max(0, committedFen - sumAwards(awards, partnerId)));
    }
    const availableRetentionFen = addMoney(addMoney(contributionFen, -commissionsFen), -exposureFen);
    const policyFloorFen = policy ? portion(Math.max(0, contributionFen), policy.minPlatformBps, true) : 0;
    const floorFen = Math.max(policyFloorFen, orderRetentionFen);
    const projectBudgetFen = policy?.enabled ? Math.max(0, Math.min(
        portion(Math.max(0, availableRetentionFen), policy.projectShareBps),
        availableRetentionFen - floorFen,
    )) : 0;
    const paymentRechecks = state.payments.filter(item => item.status === 'reconciling')
        .map(item => ({ id: item.id, currentDueFen: currentPaymentDue(state, awards, item), grossFen: item.grossFen }))
        .filter(item => item.currentDueFen < item.grossFen)
        .map(({ id, currentDueFen }) => ({ id, currentDueFen }));
    return {
        eligibleNetFen, contributionFen, commissionsFen, projectCommittedFen, projectAcceptedFen,
        projectBudgetFen,
        projectAvailableFen: Math.max(0, projectBudgetFen - projectCommittedFen),
        platformRetainedFen: addMoney(availableRetentionFen, -projectCommittedFen),
        paymentQueue: paymentQueue(state, awards).map(({ partnerId, period, dueFen }) => ({ partnerId, period, dueFen })),
        paymentRechecks,
    };
}

function handlePayment(state, input, now) {
    if (input.action === 'begin') {
        periodEnd(input.period);
        if (!state.settlements.some(item => item.period === input.period)) {
            throw new PartnerError('请先锁定该月结算', 409);
        }
        const existing = state.payments.find(item => item.partnerId === input.partnerId &&
            item.period === input.period && item.status === 'reconciling');
        const { awards } = financialSnapshot(state, timestamp(now));
        if (existing) {
            const currentDueFen = currentPaymentDue(state, awards, existing);
            if (currentDueFen < existing.grossFen) return { ...existing, currentDueFen };
            return existing;
        }
        const due = paymentQueue(state, awards).find(item => item.partnerId === input.partnerId && item.period === input.period);
        if (!due) throw new PartnerError('该月当前没有可发起核对的应付款', 409);
        const payment = {
            id: randomUUID(), partnerId: input.partnerId, period: input.period, status: 'reconciling',
            grossFen: due.dueFen, allocations: due.allocations, taxFen: 0, paidFen: 0, reference: '', createdAt: now,
            reason: clean(input.reason, 600),
        };
        state.payments.push(payment);
        return payment;
    }

    if (!['confirm', 'fail'].includes(input.action)) throw new PartnerError('不支持的付款操作');
    const payment = state.payments.find(item => item.id === input.id);
    if (!payment) throw new PartnerError('付款核对记录不存在', 404);
    if (input.action === 'fail') {
        if (payment.status === 'failed') return payment;
        if (payment.status !== 'reconciling') throw new PartnerError('已确认付款不可标记失败', 409);
        const reason = required(input.reason, 600, '银行已确认未付款的依据');
        Object.assign(payment, { status: 'failed', reason, completedAt: now });
        return payment;
    }

    const reference = required(input.reference, 160, '付款凭证号');
    const taxFen = money(input.taxFen ?? 0, '代扣税额');
    if (taxFen > payment.grossFen) throw new PartnerError('代扣税额不得超过付款总额');
    if (payment.status === 'paid' && payment.taxFen === taxFen &&
        referenceKey(payment.reference) === referenceKey(reference)) return payment;
    if (payment.status !== 'reconciling') throw new PartnerError('该付款核对记录已结束', 409);
    if (hasPaidReference(state, reference) || findMovementByReference(state, reference, true)) {
        throw new PartnerError('该银行流水已登记，无需重复入账', 409);
    }
    Object.assign(payment, {
        status: 'paid', taxFen, paidFen: payment.grossFen - taxFen, reference,
        reason: clean(input.reason, 600) || payment.reason, completedAt: now,
    });
    return payment;
}

module.exports = {
    PartnerError, createOrder, changeOrderStatus, recordMovement, getOrder, orderView,
    performance, previewCommission, dashboard, income, closeSettlement, handlePayment,
};
