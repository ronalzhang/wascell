const { isIP } = require('node:net');

function normalizeAddress(value) {
    if (typeof value !== 'string') return null;
    const address = value.trim();
    const version = isIP(address);
    if (version === 4) return address;
    if (version !== 6 || address.includes('%')) return null;

    // The URL host parser canonicalizes compressed and dotted-tail IPv6 spellings.
    const ipv6 = new URL(`http://[${address}]/`).hostname.slice(1, -1);
    const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(ipv6);
    if (!mapped) return ipv6;

    const high = Number.parseInt(mapped[1], 16);
    const low = Number.parseInt(mapped[2], 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

function realIpHeader(req) {
    const distinct = req.headersDistinct;
    if (!distinct) return req.headers?.['x-real-ip'];
    const values = distinct['x-real-ip'];
    return values?.length === 1 ? values[0] : null;
}

function createClientAddress(req, { trustLoopbackProxy = false } = {}) {
    const remote = normalizeAddress(req.socket?.remoteAddress);
    const isLoopback = remote === '::1' || remote?.startsWith('127.');
    if (trustLoopbackProxy === true && isLoopback) {
        const client = normalizeAddress(realIpHeader(req));
        if (client) return client;
    }
    return remote ?? 'unknown';
}

function addressKey(value) {
    const address = normalizeAddress(value);
    if (!address?.includes(':')) return address ?? 'unknown';

    const [prefix, suffix] = address.split('::');
    const leading = prefix ? prefix.split(':') : [];
    const trailing = suffix ? suffix.split(':') : [];
    const zeroes = Array(8 - leading.length - trailing.length).fill('0');
    const network = [...leading, ...zeroes, ...trailing].slice(0, 4).join(':');
    return `${network}::/64`;
}

function createRateLimiter({ limit, windowMs, maxKeys, now = Date.now }) {
    if (![limit, windowMs, maxKeys].every(value => Number.isSafeInteger(value) && value > 0) || typeof now !== 'function') {
        throw new TypeError('Rate limiter requires positive integer limits and a clock function');
    }

    const counts = new Map();
    let windowStart;
    return key => {
        const time = now();
        const currentStart = Math.floor(time / windowMs) * windowMs;
        if (windowStart === undefined || currentStart > windowStart) {
            windowStart = currentStart;
            counts.clear();
        }

        const bucket = addressKey(key);
        const count = counts.get(bucket) ?? 0;
        if (count >= limit || (count === 0 && counts.size >= maxKeys)) {
            return { allowed: false, retryAfterMs: windowMs - (time - windowStart) };
        }

        counts.set(bucket, count + 1);
        return { allowed: true, retryAfterMs: 0 };
    };
}

module.exports = { createClientAddress, createRateLimiter };
