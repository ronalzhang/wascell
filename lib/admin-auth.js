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
    password,
    secret = crypto.randomBytes(32).toString('hex'),
    ttlMs = 8 * 60 * 60 * 1000,
    secureCookie = process.env.NODE_ENV === 'production',
    now = Date.now,
} = {}) {
    if (!password) throw new Error('ADMIN_PASSWORD 未配置');
    if (!secret || secret.length < 8) throw new Error('ADMIN_SESSION_SECRET 长度不足');

    function createToken() {
        const payload = encode(JSON.stringify({ exp: now() + ttlMs, nonce: crypto.randomBytes(12).toString('hex') }));
        return `${payload}.${sign(payload, secret)}`;
    }

    function verifyToken(token) {
        if (!token || typeof token !== 'string') return false;
        const [payload, signature, extra] = token.split('.');
        if (!payload || !signature || extra) return false;
        if (!safeEqual(signature, sign(payload, secret))) return false;
        try {
            const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
            return Number.isFinite(parsed.exp) && parsed.exp > now();
        } catch {
            return false;
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

    function login(req, res) {
        const submitted = req.body?.password;
        if (typeof submitted !== 'string' || !safeEqual(submitted, password)) {
            return res.status(401).json({ success: false, message: '密码错误' });
        }
        res.setHeader('Set-Cookie', cookieValue(createToken(), Math.floor(ttlMs / 1000)));
        return res.json({ success: true, message: '登录成功' });
    }

    function logout(req, res) {
        res.setHeader('Set-Cookie', cookieValue('', 0));
        return res.json({ success: true });
    }

    function isAuthenticated(req) {
        const cookies = parseCookies(req.headers?.cookie || '');
        return verifyToken(cookies[COOKIE_NAME]);
    }

    function session(req, res) {
        if (!isAuthenticated(req)) return res.status(401).json({ authenticated: false });
        return res.json({ authenticated: true });
    }

    function requireAdmin(req, res, next) {
        if (!isAuthenticated(req)) return res.status(401).json({ message: '请先登录管理后台' });
        return next();
    }

    return { login, logout, session, requireAdmin, isAuthenticated };
}

module.exports = { createAdminAuth };
