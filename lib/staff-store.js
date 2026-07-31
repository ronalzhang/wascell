const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');

const scryptAsync = promisify(crypto.scrypt);
const USERNAME_PATTERN = /^[a-z0-9._-]{3,40}$/;

function cleanText(value, maxLength) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function normalizeUsername(value) {
    return cleanText(value, 40).toLowerCase();
}

function validatePassword(password) {
    const value = String(password || '');
    if (value.length < 10 || value.length > 128) throw new Error('密码长度必须为 10 到 128 位');
    return value;
}

async function passwordDigest(password, salt) {
    const derived = await scryptAsync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    return Buffer.from(derived).toString('hex');
}

function createStaffStore({ dataDir, now = () => new Date() } = {}) {
    if (!dataDir) throw new Error('销售账号数据目录未配置');
    const dataFile = path.join(dataDir, 'staff.json');
    let writeQueue = Promise.resolve();

    async function ensureDirectory() {
        await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
    }

    async function readAccounts() {
        await ensureDirectory();
        try {
            const parsed = JSON.parse(await fs.readFile(dataFile, 'utf8'));
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            if (error.code === 'ENOENT') return [];
            throw new Error(`销售账号读取失败: ${error.message}`);
        }
    }

    async function writeAccounts(accounts) {
        await ensureDirectory();
        const tempFile = `${dataFile}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
        await fs.writeFile(tempFile, JSON.stringify(accounts, null, 2), { mode: 0o600 });
        await fs.rename(tempFile, dataFile);
    }

    function queueWrite(operation) {
        const result = writeQueue.then(operation);
        writeQueue = result.catch(() => undefined);
        return result;
    }

    async function hashPassword(password) {
        const normalized = validatePassword(password);
        const passwordSalt = crypto.randomBytes(16).toString('hex');
        const passwordHash = await passwordDigest(normalized, passwordSalt);
        return { passwordSalt, passwordHash };
    }

    function publicAccount(account) {
        return {
            id: account.id,
            username: account.username,
            displayName: account.displayName,
            active: account.active,
            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
        };
    }

    async function createSales({ username, displayName, password }) {
        const normalizedUsername = normalizeUsername(username);
        const normalizedDisplayName = cleanText(displayName, 80);
        if (!USERNAME_PATTERN.test(normalizedUsername)) throw new Error('用户名格式无效');
        if (!normalizedDisplayName) throw new Error('请填写销售姓名');
        const credentials = await hashPassword(password);
        return queueWrite(async () => {
            const accounts = await readAccounts();
            if (accounts.some((item) => item.username === normalizedUsername)) throw new Error('用户名已存在');
            const timestamp = now().toISOString();
            const account = {
                id: `sales_${crypto.randomBytes(8).toString('hex')}`,
                username: normalizedUsername,
                displayName: normalizedDisplayName,
                ...credentials,
                active: true,
                sessionVersion: 1,
                createdAt: timestamp,
                updatedAt: timestamp,
            };
            accounts.push(account);
            await writeAccounts(accounts);
            return publicAccount(account);
        });
    }

    async function verifySales(username, password) {
        const normalizedUsername = normalizeUsername(username);
        const accounts = await readAccounts();
        const account = accounts.find((item) => item.username === normalizedUsername && item.active);
        if (!account || typeof password !== 'string') return null;
        const submittedHash = await passwordDigest(password, account.passwordSalt);
        const valid = crypto.timingSafeEqual(Buffer.from(submittedHash, 'hex'), Buffer.from(account.passwordHash, 'hex'));
        if (!valid) return null;
        return {
            role: 'sales',
            userId: account.id,
            username: account.username,
            displayName: account.displayName,
            sessionVersion: account.sessionVersion,
        };
    }

    async function listSales() {
        const accounts = await readAccounts();
        return accounts.map(publicAccount).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    }

    async function getSessionVersion(id) {
        const accounts = await readAccounts();
        const account = accounts.find((item) => item.id === id && item.active);
        return account ? account.sessionVersion : null;
    }

    async function setActive(id, active) {
        return queueWrite(async () => {
            const accounts = await readAccounts();
            const index = accounts.findIndex((item) => item.id === id);
            if (index === -1) return null;
            accounts[index] = {
                ...accounts[index],
                active: Boolean(active),
                sessionVersion: accounts[index].sessionVersion + 1,
                updatedAt: now().toISOString(),
            };
            await writeAccounts(accounts);
            return publicAccount(accounts[index]);
        });
    }

    async function resetPassword(id, nextPassword) {
        const credentials = await hashPassword(nextPassword);
        return queueWrite(async () => {
            const accounts = await readAccounts();
            const index = accounts.findIndex((item) => item.id === id);
            if (index === -1) return null;
            accounts[index] = {
                ...accounts[index],
                ...credentials,
                sessionVersion: accounts[index].sessionVersion + 1,
                updatedAt: now().toISOString(),
            };
            await writeAccounts(accounts);
            return publicAccount(accounts[index]);
        });
    }

    async function changeOwnPassword(id, currentPassword, nextPassword) {
        const accounts = await readAccounts();
        const account = accounts.find((item) => item.id === id && item.active);
        if (!account) throw new Error('账号不可用');
        const currentHash = await passwordDigest(String(currentPassword || ''), account.passwordSalt);
        if (!crypto.timingSafeEqual(Buffer.from(currentHash, 'hex'), Buffer.from(account.passwordHash, 'hex'))) {
            throw new Error('当前密码错误');
        }
        const next = validatePassword(nextPassword);
        const nextWithOldSalt = await passwordDigest(next, account.passwordSalt);
        if (crypto.timingSafeEqual(Buffer.from(nextWithOldSalt, 'hex'), Buffer.from(account.passwordHash, 'hex'))) {
            throw new Error('新密码不能与当前密码相同');
        }
        return resetPassword(id, next);
    }

    return {
        createSales,
        verifySales,
        listSales,
        getSessionVersion,
        setActive,
        resetPassword,
        changeOwnPassword,
    };
}

module.exports = { createStaffStore, normalizeUsername };
