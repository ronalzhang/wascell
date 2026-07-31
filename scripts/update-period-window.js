#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { buildPeriods, renderPeriodPage } = require('./arksoma-periods.cjs');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE = path.join(ROOT, 'templates', 'arksoma-period.html');

function parseArgs(argv) {
    const args = { count: 5, dryRun: false, start: null };
    for (const arg of argv) {
        if (arg === '--dry-run') args.dryRun = true;
        else if (arg.startsWith('--count=')) args.count = Number(arg.slice(8));
        else if (arg.startsWith('--start=')) args.start = arg.slice(8);
        else if (/^\d{4}-\d{2}$/.test(arg)) args.start = arg;
        else throw new Error(`未知参数: ${arg}`);
    }
    if (!Number.isInteger(args.count) || args.count < 1 || args.count > 12) {
        throw new Error('--count 必须是 1 到 12 之间的整数');
    }
    return args;
}

function normalizeYearMonth({ year, month }) {
    while (month > 12) { year += 1; month -= 12; }
    while (month < 1) { year -= 1; month += 12; }
    return { year, month };
}

function startMonth(value) {
    if (!value) {
        const now = new Date();
        return normalizeYearMonth({ year: now.getFullYear(), month: now.getMonth() + 2 });
    }
    const match = value.match(/^(\d{4})-(\d{2})$/);
    if (!match) throw new Error('--start 格式必须是 YYYY-MM，例如 --start=2026-08');
    return normalizeYearMonth({ year: Number(match[1]), month: Number(match[2]) });
}

function writePage(filePath, content, dryRun) {
    const relative = path.relative(ROOT, filePath);
    if (dryRun) console.log(`[dry-run] ${relative}`);
    else {
        fs.writeFileSync(filePath, content);
        console.log(`updated ${relative}`);
    }
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const periods = buildPeriods(startMonth(args.start), args.count);
    const rootTargetId = periods[0].id;
    const template = fs.readFileSync(TEMPLATE, 'utf8');

    for (const period of periods) {
        const html = renderPeriodPage(template, period, periods, rootTargetId);
        writePage(path.join(ROOT, `${period.id}.html`), html, args.dryRun);
        if (period.id === rootTargetId) writePage(path.join(ROOT, 'index.html'), html, args.dryRun);
    }
    console.log(`period window: ${periods[0].label} - ${periods.at(-1).label}`);
}

try {
    main();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
