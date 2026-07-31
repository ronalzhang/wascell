const crypto = require('node:crypto');

const COOKIE_NAME = 'wascell_admin_session';

function encode(value) {
    return Buffer.from(value).toString('base64url');
}

function sign(value, secret) {
    return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(left, right) {
    const leftHash = crypto.createHash('sha256').update(String(left)).digest();
    const rightHash = crypto.createHash('sha256').update(String(right)).digest();
    return crypto.timingSafeEqual(leftHash, rightHash);
}

function parseCookies(header = '') {
    return header.split(';').reduce((cookies, part) => {
        const separator = part.indexOf('=');
        if (separator === -1) return cookies;
        const name = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        if (name) cookies[name] = value;
        return cookies;
    }, {});
}

function createAdminAuth({
    ownerPassword,
    password,
    staffStore,
    secret = crypto.randomBytes(32).toString('hex'),
    ttlMs = 8 * 60 * 60 * 1000,
    secureCookie = process.env.NODE_ENV === 'production',
    now = Date.now,
} = {}) {
    const configuredOwnerPassword = ownerPassword || password;
    if (!configuredOwnerPassword) throw new Error('ADMIN_PASSWORD 未配置');
    if (!secret || secret.length < 8) throw new Error('ADMIN_SESSION_SECRET 长度不足');

    function createToken(principal) {
        const payload = encode(JSON.stringify({
            exp: now() + ttlMs,
            nonce: crypto.randomBytes(12).toString('hex'),
            principal,
        }));
        return `${payload}.${sign(payload, secret)}`;
    }

    function verifyToken(token) {
        if (!token || typeof token !== 'string') return null;
        const [payload, signature, extra] = token.split('.');
        if (!payload || !signature || extra) return null;
        if (!safeEqual(signature, sign(payload, secret))) return null;
        try {
            const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
            if (!Number.isFinite(parsed.exp) || parsed.exp <= now()) return null;
            if (!parsed.principal || !['owner', 'sales'].includes(parsed.principal.role)) return null;
            return parsed.principal;
        } catch {
            return null;
        }
    }

    function cookieValue(token, maxAgeSeconds) {
        const parts = [
            `${COOKIE_NAME}=${token}`,
            'Path=/',
            'HttpOnly',
            'SameSite=Strict',
            `Max-Age=${maxAgeSeconds}`,
        ];
        if (secureCookie) parts.push('Secure');
        return parts.join('; ');
    }

    function setSessionCookie(res, principal) {
        res.setHeader('Set-Cookie', cookieValue(createToken(principal), Math.floor(ttlMs / 1000)));
    }

    async function ownerLogin(req, res) {
        const submitted = req.body?.password;
        if (typeof submitted !== 'string' || !safeEqual(submitted, configuredOwnerPassword)) {
            return res.status(401).json({ success: false, message: '密码错误' });
        }
        setSessionCookie(res, { role: 'owner', userId: 'owner', displayName: '所有者', sessionVersion: 1 });
        return res.json({ success: true, message: '登录成功' });
    }

    async function salesLogin(req, res) {
        const principal = staffStore
            ? await staffStore.verifySales(req.body?.username, req.body?.password)
            : null;
        if (!principal) return res.status(401).json({ success: false, message: '账号或密码错误' });
        setSessionCookie(res, principal);
        return res.json({ success: true, message: '登录成功' });
    }

    function logout(req, res) {
        res.setHeader('Set-Cookie', cookieValue('', 0));
        return res.json({ success: true });
    }

    async function getPrincipal(req) {
        const cookies = parseCookies(req.headers?.cookie || '');
        const principal = verifyToken(cookies[COOKIE_NAME]);
        if (!principal) return null;
        if (principal.role === 'sales') {
            if (!staffStore) return null;
            const currentVersion = await staffStore.getSessionVersion(principal.userId);
            if (currentVersion === null || currentVersion !== principal.sessionVersion) return null;
        }
        return principal;
    }

    async function session(req, res) {
        const principal = await getPrincipal(req);
        if (!principal) return res.status(401).json({ authenticated: false });
        return res.json({ authenticated: true, principal });
    }

    async function requireAuthenticated(req, res, next) {
        const principal = await getPrincipal(req);
        if (!principal) return res.status(401).json({ message: '请先登录管理后台' });
        req.auth = principal;
        return next();
    }

    async function requireOwner(req, res, next) {
        const principal = await getPrincipal(req);
        if (!principal) return res.status(401).json({ message: '请先登录管理后台' });
        if (principal.role !== 'owner') return res.status(403).json({ message: '无权访问该模块' });
        req.auth = principal;
        return next();
    }

    async function requireSalesOrOwner(req, res, next) {
        return requireAuthenticated(req, res, next);
    }

    async function isAuthenticated(req) {
        return Boolean(await getPrincipal(req));
    }

    return {
        ownerLogin,
        salesLogin,
        logout,
        session,
        requireAuthenticated,
        requireOwner,
        requireSalesOrOwner,
        getPrincipal,
        isAuthenticated,
        login: ownerLogin,
        requireAdmin: requireOwner,
    };
}

module.exports = { createAdminAuth };
