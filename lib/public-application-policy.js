const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

function loadPublishedPeriods(root) {
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const navigation = index.match(/<nav class="period-options">([\s\S]*?)<\/nav>/)?.[1] || '';
    const ids = new Set([...navigation.matchAll(/href="\/?(\d{8})(?:\.html)?"/g)].map(match => match[1]));
    const initial = index.match(/data-period-id="(\d{8})"/)?.[1];
    if (initial && /href="\/"/.test(navigation)) ids.add(initial);
    const periods = new Map();
    for (const id of ids) {
        const page = id === initial ? index : fs.readFileSync(path.join(root, id + '.html'), 'utf8');
        const match = page.match(/data-period="([^"]+)"\s+data-period-id="(\d{8})"/);
        if (!match || match[2] !== id) throw new Error('公开期次目录与页面不一致');
        periods.set(id, match[1]);
    }
    if (periods.size === 0) throw new Error('公开期次目录为空');
    return periods;
}

function field(input, key, limit) {
    if (input[key] === undefined) return '';
    if (typeof input[key] !== 'string' || input[key].length > limit) throw new Error('请填写有效的申请信息');
    return input[key].trim();
}

function validatedApplication(input, periods, userAgent) {
    const periodId = field(input, 'periodId', 8);
    const periodLabel = periods.get(periodId);
    if (!periodLabel) throw new Error('申请期次不在当前公开窗口，请从首页选择');
    const submissionKey = field(input, 'submissionKey', 160);
    if (!/^[A-Za-z0-9_-]{8,160}$/.test(submissionKey)) throw new Error('提交标识无效，请刷新页面后重试');
    const name = field(input, 'name', 80);
    const contact = field(input, 'contact', 120);
    const email = field(input, 'email', 160);
    const company = field(input, 'company', 160);
    const note = field(input, 'note', 1200);
    if (!/[\p{L}\p{N}]/u.test(name) || /[<>\u0000-\u001f]/u.test(name) || (!contact && !email)) {
        throw new Error('请填写有效姓名及联系方式');
    }
    if ((email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) ||
        (contact && (!/[\p{L}\p{N}]/u.test(contact) || /[<>\r\n]/.test(contact)))) {
        throw new Error('请填写有效微信、手机或邮箱');
    }
    return { periodId, periodLabel, submissionKey, name, contact, email, company, note,
        source: { page: '/' + periodId, device: userAgent } };
}

async function verifyAdvisorAttachment(file) {
    const handle = await fsp.open(file.path, 'r');
    try {
        const header = Buffer.alloc(24);
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        const tail = Buffer.alloc(Math.min(file.size, 1024));
        await handle.read(tail, 0, tail.length, file.size - tail.length);
        const pdf = file.mimetype === 'application/pdf' && bytesRead >= 8 &&
            /^%PDF-[12]\.\d/.test(header.toString('ascii', 0, 8)) && /%%EOF\s*$/.test(tail.toString('latin1'));
        const png = file.mimetype === 'image/png' && file.size >= 45 &&
            header.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
            header.readUInt32BE(8) === 13 && header.toString('ascii', 12, 16) === 'IHDR' &&
            tail.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'));
        const jpeg = file.mimetype === 'image/jpeg' && file.size >= 16 &&
            header.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')) &&
            tail.subarray(-2).equals(Buffer.from('ffd9', 'hex'));
        if (!(pdf || png || jpeg)) throw new Error('附件内容与文件类型不符');
    } finally {
        await handle.close();
    }
}

module.exports = { loadPublishedPeriods, validatedApplication, verifyAdvisorAttachment };
