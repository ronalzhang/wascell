function parseDate(value, label) {
    const date = value instanceof Date ? new Date(value) : new Date(String(value || ''));
    if (Number.isNaN(date.getTime())) throw new Error(`${label}无效`);
    return date;
}

function addUtcMonths(value, months) {
    const date = parseDate(value, '会员日期');
    const count = Number(months);
    if (!Number.isInteger(count) || count < 1 || count > 120) throw new Error('会员延续月数无效');
    const day = date.getUTCDate();
    const target = new Date(date);
    target.setUTCDate(1);
    target.setUTCMonth(target.getUTCMonth() + count);
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return target;
}

function membershipStatus(expiresAt, now = new Date(), reminderDays = [60, 30, 7]) {
    if (!expiresAt) return 'inactive';
    const expiry = parseDate(expiresAt, '会员到期日');
    const clock = parseDate(now, '当前时间');
    if (expiry.getTime() <= clock.getTime()) return 'expired';
    const remainingDays = Math.ceil((expiry.getTime() - clock.getTime()) / 86_400_000);
    const thresholds = [...new Set(reminderDays.map(Number).filter((day) => Number.isInteger(day) && day > 0))]
        .sort((left, right) => left - right);
    const threshold = thresholds.find((day) => remainingDays <= day);
    return threshold ? `expiring_${threshold}` : 'active';
}

function applyMembershipEvent(customer, event, now = new Date()) {
    const clock = parseDate(now, '当前时间');
    const beforeExpiresAt = customer.membershipExpiresAt || null;
    const existingEvents = Array.isArray(customer.membershipEvents) ? customer.membershipEvents : [];
    let after;

    if (event.type === 'plan_confirmed') {
        const existingExpiry = beforeExpiresAt ? parseDate(beforeExpiresAt, '会员到期日') : null;
        const base = existingExpiry && existingExpiry > clock ? existingExpiry : clock;
        after = addUtcMonths(base, event.months || 12);
    } else if (event.type === 'fee_renewed') {
        if (!beforeExpiresAt || parseDate(beforeExpiresAt, '会员到期日') <= clock) throw new Error('会员已到期，不能只用年度服务费续展');
        after = addUtcMonths(beforeExpiresAt, event.months || 12);
    } else if (event.type === 'owner_adjusted') {
        if (event.actorId !== 'owner') throw new Error('只有管理员可以调整会员期限');
        if (!String(event.reason || '').trim()) throw new Error('请填写赠送或调整原因');
        after = parseDate(event.expiresAt, '调整后的会员到期日');
    } else {
        throw new Error('不支持的会员事件');
    }

    if (!event.actorId) throw new Error('缺少会员操作人');
    if (['plan_confirmed', 'fee_renewed'].includes(event.type)) {
        const price = Number(event.priceSnapshot);
        if (!Number.isInteger(price) || price < 0) throw new Error('价格快照无效');
    }

    const afterExpiresAt = after.toISOString();
    const membershipEvent = {
        type: event.type,
        actorId: event.actorId,
        createdAt: clock.toISOString(),
        beforeExpiresAt,
        afterExpiresAt,
        priceSnapshot: event.priceSnapshot ?? null,
        months: event.months ?? null,
        reason: String(event.reason || '').trim(),
        bookingId: event.bookingId || null,
    };

    return {
        ...customer,
        membershipExpiresAt: afterExpiresAt,
        membershipEvents: [...existingEvents, membershipEvent],
    };
}

module.exports = { addUtcMonths, applyMembershipEvent, membershipStatus };
