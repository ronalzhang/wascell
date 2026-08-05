const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const CHAPTERS = ['序', '启', '行', '观', '境', '遇', '识', '容', '和', '同', '照', '澄', '守', '臻', '恒'];
const CASE_STATUSES = new Set([
    'communicating', 'planning', 'awaiting_signature', 'signed_awaiting_payment', 'confirmed',
    'first_visit_pending', 'first_visit_active', 'cell_preparation', 'second_visit_pending',
    'second_visit_active', 'completed', 'exception',
]);
const SALES_PROGRESS = new Set([
    'first_visit_pending', 'first_visit_active', 'cell_preparation', 'second_visit_pending',
    'second_visit_active', 'completed',
]);
const JOURNAL_STATUSES = new Set([
    'awaiting_media', 'collecting', 'selecting', 'layout', 'review', 'printing', 'binding', 'delivered',
]);

function cleanText(value, maxLength = 200) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function canAccess(record, principal) {
    return principal?.role === 'owner' || (
        principal?.role === 'sales' && principal.userId && record.assignedSalesId === principal.userId
    );
}

function createServiceCaseStore({ dataDir, auditLog, now = () => new Date() } = {}) {
    if (!dataDir) throw new Error('服务案例目录未配置');
    const dataFile = path.join(dataDir, 'service-cases.json');
    let writeQueue = Promise.resolve();

    async function ensureDirectory() {
        await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
    }

    async function readAll() {
        await ensureDirectory();
        try {
            const parsed = JSON.parse(await fs.readFile(dataFile, 'utf8'));
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            if (error.code === 'ENOENT') return [];
            throw new Error(`服务案例读取失败: ${error.message}`);
        }
    }

    async function writeAll(records) {
        await ensureDirectory();
        const tempFile = `${dataFile}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
        await fs.writeFile(tempFile, JSON.stringify(records, null, 2), { mode: 0o600 });
        await fs.rename(tempFile, dataFile);
    }

    function queueWrite(operation) {
        const result = writeQueue.then(operation);
        writeQueue = result.catch(() => undefined);
        return result;
    }

    async function audit(principal, action, record, details = {}) {
        await auditLog?.append?.({
            actorId: principal.userId,
            action,
            targetType: 'service_case',
            targetId: record.id,
            ...details,
        });
    }

    async function createCase(input, principal) {
        if (principal?.role !== 'owner') throw new Error('仅所有者可以创建服务案例');
        const customerId = cleanText(input.customerId, 100);
        const periodId = cleanText(input.periodId, 40);
        const periodLabel = cleanText(input.periodLabel, 80);
        if (!customerId || !periodId || !periodLabel) throw new Error('客户与服务期次不能为空');
        return queueWrite(async () => {
            const records = await readAll();
            const volumeNumber = records.filter((record) => record.customerId === customerId).length + 1;
            if (volumeNumber > CHAPTERS.length) throw new Error('第一纪十五章已完成，请先定义下一纪');
            const createdAt = now().toISOString();
            const record = {
                id: `CASE-${createdAt.slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
                customerId,
                periodId,
                periodLabel,
                assignedSalesId: cleanText(input.assignedSalesId, 100) || null,
                caseStatus: 'planning',
                paymentStatus: 'unpaid',
                nonRefundableLocked: false,
                payment: null,
                journal: { volumeNumber, chapter: CHAPTERS[volumeNumber - 1], status: 'awaiting_media', photoCount: 0 },
                createdAt,
                updatedAt: createdAt,
            };
            records.push(record);
            await writeAll(records);
            await audit(principal, 'service_case_created', record);
            return record;
        });
    }

    async function mutate(id, principal, operation) {
        return queueWrite(async () => {
            const records = await readAll();
            const index = records.findIndex((record) => record.id === id);
            if (index === -1) throw new Error('服务案例不存在');
            if (!canAccess(records[index], principal)) throw new Error('无权访问该服务案例');
            const updated = operation(records[index]);
            updated.updatedAt = now().toISOString();
            records[index] = updated;
            await writeAll(records);
            return updated;
        });
    }

    async function updateProgress(id, status, principal) {
        if (!CASE_STATUSES.has(status)) throw new Error('不支持的服务进度');
        if (principal?.role === 'sales' && !SALES_PROGRESS.has(status)) throw new Error('销售不能更新该服务进度');
        const updated = await mutate(id, principal, (record) => ({ ...record, caseStatus: status }));
        await audit(principal, 'service_case_progress_updated', updated, { caseStatus: status });
        return updated;
    }

    async function updateJournal(id, patch, principal) {
        const status = patch.status === undefined ? undefined : cleanText(patch.status, 40);
        if (status !== undefined && !JOURNAL_STATUSES.has(status)) throw new Error('不支持的生命纪行状态');
        const photoCount = patch.photoCount === undefined ? undefined : Number(patch.photoCount);
        if (photoCount !== undefined && (!Number.isInteger(photoCount) || photoCount < 0 || photoCount > 500)) {
            throw new Error('影像数量无效');
        }
        const updated = await mutate(id, principal, (record) => ({
            ...record,
            journal: {
                ...record.journal,
                ...(status === undefined ? {} : { status }),
                ...(photoCount === undefined ? {} : { photoCount }),
            },
        }));
        await audit(principal, 'service_case_journal_updated', updated, { journal: updated.journal });
        return updated;
    }

    async function confirmPayment(id, input, principal) {
        if (principal?.role !== 'owner') throw new Error('仅所有者可以确认付款');
        const amount = Number(input.amount);
        const payerName = cleanText(input.payerName, 160);
        if (!Number.isFinite(amount) || amount <= 0 || !payerName) throw new Error('付款快照不完整');
        const confirmedAt = now().toISOString();
        const updated = await mutate(id, principal, (record) => ({
            ...record,
            caseStatus: 'confirmed',
            paymentStatus: 'paid',
            nonRefundableLocked: true,
            payment: {
                amount,
                payerName,
                reference: cleanText(input.reference, 160),
                confirmedAt,
                confirmedBy: principal.userId,
            },
        }));
        await audit(principal, 'service_case_payment_confirmed', updated, { amount });
        return updated;
    }

    async function listForPrincipal(principal) {
        const records = await readAll();
        if (principal?.role === 'owner') return records;
        if (principal?.role === 'sales') return records.filter((record) => record.assignedSalesId === principal.userId);
        throw new Error('无效的登录身份');
    }

    async function getForPrincipal(id, principal) {
        const record = (await readAll()).find((item) => item.id === id);
        return record && canAccess(record, principal) ? record : null;
    }

    return { createCase, updateProgress, updateJournal, confirmPayment, listForPrincipal, getForPrincipal };
}

module.exports = { createServiceCaseStore, CHAPTERS };
