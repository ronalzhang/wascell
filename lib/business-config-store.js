const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_CONFIG = Object.freeze({
    fullPlanPrice: 580000,
    membershipFee: 19800,
    membershipMonths: 12,
    standardCapacity: 5,
    filialPrice: 560000,
    filialFamilyGroups: 3,
    filialMaxGuests: 6,
    reminderDays: [60, 30, 7],
    showPrice: true,
    publicMembershipCopy: '已包含首个 12 个月方舟年度席位',
    filialPublicCopy: '敬亲礼遇期为父母与长辈预留三组家庭席位。以两位同行为建议，亦接受单人申请。',
});

const ALLOWED_KEYS = new Set(Object.keys(DEFAULT_CONFIG));

function cleanText(value, maxLength = 600) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function positiveInteger(value, label, { min = 1, max = 10_000_000 } = {}) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${label}无效`);
    return number;
}

function validateConfig(input) {
    const config = {
        ...input,
        fullPlanPrice: positiveInteger(input.fullPlanPrice, '完整方案价格'),
        membershipFee: positiveInteger(input.membershipFee, '年度服务费'),
        membershipMonths: positiveInteger(input.membershipMonths, '会员期限', { max: 120 }),
        standardCapacity: positiveInteger(input.standardCapacity, '普通期次人数', { max: 100 }),
        filialPrice: positiveInteger(input.filialPrice, '敬亲期价格'),
        filialFamilyGroups: positiveInteger(input.filialFamilyGroups, '家庭组数', { max: 50 }),
        filialMaxGuests: positiveInteger(input.filialMaxGuests, '最大人数', { max: 100 }),
        reminderDays: [...new Set((input.reminderDays || []).map((day) => positiveInteger(day, '提醒天数', { max: 3650 })))]
            .sort((left, right) => right - left),
        showPrice: Boolean(input.showPrice),
        publicMembershipCopy: cleanText(input.publicMembershipCopy),
        filialPublicCopy: cleanText(input.filialPublicCopy),
    };
    if (config.filialMaxGuests < config.filialFamilyGroups) throw new Error('敬亲期最大人数不能少于家庭组数');
    if (!config.publicMembershipCopy || !config.filialPublicCopy) throw new Error('公开文案不能为空');
    return config;
}

function createBusinessConfigStore({ dataDir, now = () => new Date(), auditLog } = {}) {
    if (!dataDir) throw new Error('商业配置目录未配置');
    const configFile = path.join(dataDir, 'business-config.json');
    let writeQueue = Promise.resolve();

    async function ensureDirectory() {
        await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
    }

    async function readConfig() {
        await ensureDirectory();
        try {
            const parsed = JSON.parse(await fs.readFile(configFile, 'utf8'));
            return validateConfig({ ...DEFAULT_CONFIG, ...parsed });
        } catch (error) {
            if (error.code === 'ENOENT') return { ...DEFAULT_CONFIG, reminderDays: [...DEFAULT_CONFIG.reminderDays] };
            throw error;
        }
    }

    async function writeConfig(config) {
        await ensureDirectory();
        const tempFile = `${configFile}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
        await fs.writeFile(tempFile, JSON.stringify(config, null, 2), { mode: 0o600 });
        await fs.rename(tempFile, configFile);
    }

    function queueWrite(operation) {
        const result = writeQueue.then(operation);
        writeQueue = result.catch(() => undefined);
        return result;
    }

    async function getPrivate() {
        return readConfig();
    }

    async function getPublic() {
        const config = await readConfig();
        return {
            fullPlanPrice: config.fullPlanPrice,
            membershipFee: config.membershipFee,
            membershipMonths: config.membershipMonths,
            showPrice: config.showPrice,
            publicMembershipCopy: config.publicMembershipCopy,
            filialPeriod: {
                price: config.filialPrice,
                familyGroups: config.filialFamilyGroups,
                publicCopy: config.filialPublicCopy,
            },
        };
    }

    async function update(patch, { actorId, reason } = {}) {
        const cleanReason = cleanText(reason, 300);
        if (!cleanReason) throw new Error('请填写修改原因');
        if (!actorId) throw new Error('缺少操作者');
        for (const key of Object.keys(patch || {})) {
            if (!ALLOWED_KEYS.has(key)) throw new Error(`不支持的配置项: ${key}`);
        }
        return queueWrite(async () => {
            const before = await readConfig();
            const after = validateConfig({ ...before, ...patch });
            const changes = Object.fromEntries(Object.keys(patch).map((key) => [key, { before: before[key], after: after[key] }]));
            await writeConfig(after);
            try {
                await auditLog?.append({
                    actorId,
                    action: 'business_config_updated',
                    targetType: 'business_config',
                    targetId: 'default',
                    reason: cleanReason,
                    changes,
                    effectiveAt: now().toISOString(),
                });
            } catch (error) {
                await writeConfig(before);
                throw new Error(`审计写入失败，配置未生效: ${error.message}`);
            }
            return after;
        });
    }

    return { getPrivate, getPublic, update };
}

module.exports = { createBusinessConfigStore, DEFAULT_CONFIG };
