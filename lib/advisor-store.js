const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const STATUSES = new Set(['new', 'contacted', 'qualified', 'confirmed', 'closed']);
const ALLOWED_EXTENSIONS = new Map([
    ['.pdf', 'application/pdf'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.png', 'image/png'],
]);

function cleanText(value, maxLength = 500) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function cleanDisplayName(value) {
    return cleanText(path.basename(String(value || '附件')), 160) || '附件';
}

function createAdvisorStore({ dataDir, uploadDir, now = () => new Date() }) {
    if (!dataDir || !uploadDir) throw new Error('订单数据目录未配置');
    const dataFile = path.join(dataDir, 'applications.json');
    let writeQueue = Promise.resolve();

    async function ensureDirectories() {
        await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
        await fs.mkdir(uploadDir, { recursive: true, mode: 0o700 });
    }

    async function readOrders() {
        await ensureDirectories();
        try {
            const parsed = JSON.parse(await fs.readFile(dataFile, 'utf8'));
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            if (error.code === 'ENOENT') return [];
            throw new Error(`订单数据读取失败: ${error.message}`);
        }
    }

    async function writeOrders(orders) {
        await ensureDirectories();
        const tempFile = `${dataFile}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
        await fs.writeFile(tempFile, JSON.stringify(orders, null, 2), { mode: 0o600 });
        await fs.rename(tempFile, dataFile);
    }

    function queueWrite(operation) {
        const result = writeQueue.then(operation);
        writeQueue = result.catch(() => undefined);
        return result;
    }

    function normalizeInput(input) {
        const name = cleanText(input.name, 80);
        const contact = cleanText(input.contact, 120);
        const email = cleanText(input.email, 160);
        const submissionKey = cleanText(input.submissionKey, 160);
        if (!submissionKey) throw new Error('缺少提交标识');
        if (!name) throw new Error('请填写姓名');
        if (!contact && !email) throw new Error('请填写微信、手机或邮箱');
        return {
            submissionKey,
            periodId: cleanText(input.periodId, 40),
            periodLabel: cleanText(input.periodLabel, 80),
            name,
            contact,
            email,
            company: cleanText(input.company, 160),
            note: cleanText(input.note, 1200),
            source: {
                page: cleanText(input.source?.page, 200),
                device: cleanText(input.source?.device, 240),
            },
        };
    }

    function createOrderId(date) {
        const stamp = date.toISOString().slice(0, 10).replaceAll('-', '');
        return `ARK-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    }

    async function persistAttachments(orderId, files) {
        if (files.length > 3) throw new Error('附件最多 3 个');
        const totalSize = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
        if (totalSize > 20 * 1024 * 1024) throw new Error('附件总大小不能超过 20 MB');
        if (!files.length) return [];

        const orderDir = path.join(uploadDir, orderId);
        await fs.mkdir(orderDir, { recursive: true, mode: 0o700 });
        const stored = [];
        try {
            for (const file of files) {
                const displayName = cleanDisplayName(file.originalname);
                const extension = path.extname(displayName).toLowerCase();
                const expectedType = ALLOWED_EXTENSIONS.get(extension);
                if (!expectedType || file.mimetype !== expectedType) throw new Error(`${displayName} 的文件类型不受支持`);
                if (!file.size) throw new Error(`${displayName} 不能为空`);
                if (file.size > 10 * 1024 * 1024) throw new Error(`${displayName} 不能超过 10 MB`);
                const storageName = `${crypto.randomBytes(12).toString('hex')}${extension === '.jpeg' ? '.jpg' : extension}`;
                const destination = path.join(orderDir, storageName);
                await fs.rename(file.path, destination);
                stored.push({
                    id: crypto.randomBytes(8).toString('hex'),
                    displayName,
                    storageName,
                    size: Number(file.size),
                    type: expectedType,
                });
            }
            return stored;
        } catch (error) {
            await fs.rm(orderDir, { recursive: true, force: true });
            throw error;
        }
    }

    async function createApplication(rawInput, files = []) {
        const input = normalizeInput(rawInput);
        return queueWrite(async () => {
            const orders = await readOrders();
            const existing = orders.find((order) => order.submissionKey === input.submissionKey);
            if (existing) return { created: false, order: existing };
            const createdAtDate = now();
            const createdAt = createdAtDate.toISOString();
            const id = createOrderId(createdAtDate);
            const attachments = await persistAttachments(id, files);
            const order = {
                id,
                createdAt,
                updatedAt: createdAt,
                ...input,
                attachments,
                status: 'new',
                adminNote: '',
            };
            try {
                orders.push(order);
                await writeOrders(orders);
                return { created: true, order };
            } catch (error) {
                await fs.rm(path.join(uploadDir, id), { recursive: true, force: true });
                throw error;
            }
        });
    }

    async function listApplications({ status, periodId, query, page = 1, pageSize = 20 } = {}) {
        const normalizedQuery = cleanText(query, 160).toLowerCase();
        const allOrders = await readOrders();
        const summary = {
            all: allOrders.length,
            new: allOrders.filter((order) => order.status === 'new').length,
            contacted: allOrders.filter((order) => order.status === 'contacted').length,
            qualified: allOrders.filter((order) => order.status === 'qualified').length,
            confirmed: allOrders.filter((order) => order.status === 'confirmed').length,
            closed: allOrders.filter((order) => order.status === 'closed').length,
        };
        const periods = [...new Map(allOrders.filter((order) => order.periodId).map((order) => [order.periodId, order.periodLabel])).entries()]
            .map(([id, label]) => ({ id, label }));
        let items = allOrders;
        if (status && status !== 'all') items = items.filter((order) => order.status === status);
        if (periodId && periodId !== 'all') items = items.filter((order) => order.periodId === periodId);
        if (normalizedQuery) {
            items = items.filter((order) => [order.id, order.name, order.contact, order.email, order.company]
                .some((value) => String(value || '').toLowerCase().includes(normalizedQuery)));
        }
        items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const safePage = Math.max(1, Number(page) || 1);
        const total = items.length;
        const start = (safePage - 1) * safePageSize;
        return {
            items: items.slice(start, start + safePageSize),
            total,
            page: safePage,
            pageSize: safePageSize,
            totalPages: Math.max(1, Math.ceil(total / safePageSize)),
            summary,
            periods,
        };
    }

    async function getApplication(id) {
        const orders = await readOrders();
        return orders.find((order) => order.id === id) || null;
    }

    async function updateApplication(id, { status, adminNote }) {
        if (!STATUSES.has(status)) throw new Error('无效的订单状态');
        return queueWrite(async () => {
            const orders = await readOrders();
            const index = orders.findIndex((order) => order.id === id);
            if (index === -1) return null;
            orders[index] = {
                ...orders[index],
                status,
                adminNote: cleanText(adminNote, 2000),
                updatedAt: now().toISOString(),
            };
            await writeOrders(orders);
            return orders[index];
        });
    }

    async function getAttachment(orderId, attachmentId) {
        const order = await getApplication(orderId);
        if (!order) return null;
        const attachment = order.attachments.find((item) => item.id === attachmentId);
        if (!attachment) return null;
        const attachmentPath = path.join(uploadDir, order.id, attachment.storageName);
        const expectedRoot = `${path.resolve(uploadDir)}${path.sep}`;
        if (!path.resolve(attachmentPath).startsWith(expectedRoot)) throw new Error('附件路径无效');
        await fs.access(attachmentPath);
        return { ...attachment, path: attachmentPath };
    }

    return { createApplication, listApplications, getApplication, updateApplication, getAttachment };
}

module.exports = { createAdvisorStore, STATUSES };
