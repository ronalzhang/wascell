#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATES = {
    1: path.join(ROOT, '20260501.html'),
    2: path.join(ROOT, '20260502.html'),
    3: path.join(ROOT, '20260503.html'),
};

const MONTH_NAMES = [
    '一月',
    '二月',
    '三月',
    '四月',
    '五月',
    '六月',
    '七月',
    '八月',
    '九月',
    '十月',
    '十一月',
    '十二月',
];

const SLOT_NAMES = {
    1: '首期',
    2: '二期',
    3: '三期',
};

function parseArgs(argv) {
    const args = {
        count: 5,
        dryRun: false,
        start: null,
    };

    for (const arg of argv) {
        if (arg === '--dry-run') {
            args.dryRun = true;
        } else if (arg.startsWith('--count=')) {
            args.count = Number(arg.slice('--count='.length));
        } else if (arg.startsWith('--start=')) {
            args.start = arg.slice('--start='.length);
        } else if (/^\d{4}-\d{2}$/.test(arg)) {
            args.start = arg;
        } else {
            throw new Error(`未知参数: ${arg}`);
        }
    }

    if (!Number.isInteger(args.count) || args.count < 1 || args.count > 12) {
        throw new Error('--count 必须是 1 到 12 之间的整数');
    }

    return args;
}

function defaultStartMonth() {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 2 };
}

function parseStartMonth(start) {
    if (!start) return normalizeYearMonth(defaultStartMonth());

    const match = start.match(/^(\d{4})-(\d{2})$/);
    if (!match) throw new Error('--start 格式必须是 YYYY-MM，例如 --start=2026-07');

    return normalizeYearMonth({
        year: Number(match[1]),
        month: Number(match[2]),
    });
}

function normalizeYearMonth(value) {
    let { year, month } = value;
    while (month > 12) {
        year += 1;
        month -= 12;
    }
    while (month < 1) {
        year -= 1;
        month += 12;
    }
    return { year, month };
}

function addMonths(value, offset) {
    return normalizeYearMonth({ year: value.year, month: value.month + offset });
}

function pad2(number) {
    return String(number).padStart(2, '0');
}

function periodId(year, month, slot) {
    return `${year}${pad2(month)}0${slot}`;
}

function periodLabel(year, month, slot) {
    return `${year}·${MONTH_NAMES[month - 1]}${SLOT_NAMES[slot]}`;
}

function cutoffLabel(year, month, slot) {
    const cutoff = normalizeYearMonth({ year, month: month - 1 });
    const day = slot === 1 ? 5 : slot === 2 ? 15 : 25;
    return `${cutoff.year}年${cutoff.month}月${day}日`;
}

function buildPeriods(start, count) {
    const periods = [];
    for (let monthOffset = 0; periods.length < count; monthOffset += 1) {
        const current = addMonths(start, monthOffset);
        for (let slot = 1; slot <= 3; slot += 1) {
            periods.push({
                year: current.year,
                month: current.month,
                slot,
                id: periodId(current.year, current.month, slot),
                label: periodLabel(current.year, current.month, slot),
                cutoff: cutoffLabel(current.year, current.month, slot),
                special: slot === 3,
            });
            if (periods.length >= count) break;
        }
    }
    return periods;
}

function buildMenu(periods, activeId, rootTargetId) {
    return periods.map((period, index) => {
        const href = period.id === rootTargetId ? '/' : period.id;
        const status = index < 2 ? 'full' : 'available';
        const classes = ['period-option', period.id === activeId ? 'active' : '', status]
            .filter(Boolean)
            .join(' ');

        return [
            `                    <a href="${href}" class="${classes}">`,
            `                        <span>${period.label}</span>`,
            '                        <span class="status-indicator"></span>',
            '                    </a>',
        ].join('\n');
    }).join('\n');
}

function normalizeStatusStyles(html) {
    html = replaceBlock(
        html,
        /\.period-option \.status-indicator \{[\s\S]*?\}\s*\.period-option\.available \.status-indicator \{[\s\S]*?\}\s*\.period-option\.full \.status-indicator \{[\s\S]*?\}/,
        `.period-option .status-indicator {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            flex-shrink: 0;
            box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 0 10px currentColor;
        }

        .period-option.available .status-indicator {
            background: #9adbc8;
            color: rgba(154, 219, 200, 0.75);
        }

        .period-option.full .status-indicator {
            background: var(--gold-light);
            color: rgba(223, 192, 122, 0.85);
        }`,
        'status indicator styles'
    );

    return html;
}

function replaceBlock(html, pattern, replacement, label) {
    if (!pattern.test(html)) {
        throw new Error(`无法定位 ${label}`);
    }
    return html.replace(pattern, replacement);
}

function updateHtml(template, period, periods, rootTargetId) {
    const title = `WASCELL · 方舟计划 ${period.label}`;
    const description = period.special
        ? '方舟计划 | 生命资产管理 · 仅限6席 · 父母长辈特惠期'
        : '方舟计划 | 生命资产管理 · 仅限5席 · 日本厚生省认证';
    const badge = period.special ? '父母长辈特惠期 · 仅限 6 席' : '仅限 5 席 · 预约邀请制';
    const price = period.special ? 'RMB 560,000' : 'RMB 580,000';
    const priceNote = period.special
        ? '含在日全部吃住行费用，不含往返机票 · 父母长辈特惠'
        : '含在日全部吃住行费用，不含往返机票';
    const applySubject = `预定参加WASCELL方舟计划${period.label}${period.special ? '（父母长辈特惠）' : ''}`;
    const applyNote = period.special
        ? `预定需提供家人信息及半年内体检报告 · 本期截止 ${period.cutoff}`
        : `预定需提供企业家信息及半年内体检报告 · 本期截止 ${period.cutoff}`;

    let html = template;
    html = replaceBlock(html, /<title>.*?<\/title>/s, `<title>${title}</title>`, 'title');
    html = replaceBlock(html, /<meta name="description" content=".*?">/s, `<meta name="description" content="${description}">`, 'description');
    html = replaceBlock(
        html,
        /<button class="period-trigger" id="periodTrigger">[\s\S]*?<\/button>/,
        `<button class="period-trigger" id="periodTrigger">\n                    ${period.label} <span class="dropdown-icon">▼</span>\n                </button>`,
        'period trigger'
    );
    html = replaceBlock(
        html,
        /<div class="period-dropdown" id="periodDropdown">[\s\S]*?<\/div>\s*<\/div>\s*<div class="period-overlay"/,
        `<div class="period-dropdown" id="periodDropdown">\n${buildMenu(periods, period.id, rootTargetId)}\n                </div>\n            </div>\n            <div class="period-overlay"`,
        'period dropdown'
    );
    html = normalizeStatusStyles(html);
    html = replaceBlock(html, /<div class="hero-badge">.*?<\/div>/s, `<div class="hero-badge">${badge}</div>`, 'hero badge');
    html = replaceBlock(html, /<p class="hero-period">.*?<\/p>/s, `<p class="hero-period">${period.label} 生命资产管理</p>`, 'hero period');
    html = replaceBlock(html, /<span class="amount">.*?<\/span>/s, `<span class="amount">${price}</span>`, 'hero price');
    html = replaceBlock(html, /<p class="hero-price-note">.*?<\/p>/s, `<p class="hero-price-note">${priceNote}</p>`, 'price note');
    html = replaceBlock(
        html,
        /<a href="mailto:vip@wascell\.com\?subject=[^"]*"\s+class="apply-btn">/s,
        `<a href="mailto:vip@wascell.com?subject=${encodeURIComponent(applySubject)}"\n                class="apply-btn">`,
        'apply mailto'
    );
    html = replaceBlock(html, /<p class="apply-note">.*?<\/p>/s, `<p class="apply-note">${applyNote}</p>`, 'apply note');

    if (period.special) {
        html = html.replace(
            '五日四晚封闭式行程，第一阶段完成细胞采集与文化体验，<br>',
            '五日四晚封闭式行程，本期特别设计适合父母长辈同行的舒适节奏，<br>'
        );
        html = html.replace(
            '五日四晚封闭式行程，本期特别设计适合长辈同行的舒适节奏，<br>',
            '五日四晚封闭式行程，本期特别设计适合父母长辈同行的舒适节奏，<br>'
        );
    }

    return html.endsWith('\n') ? html : `${html}\n`;
}

function writeFile(filePath, content, dryRun) {
    if (dryRun) {
        console.log(`[dry-run] ${path.relative(ROOT, filePath)}`);
        return;
    }
    fs.writeFileSync(filePath, content);
    console.log(`updated ${path.relative(ROOT, filePath)}`);
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const start = parseStartMonth(args.start);
    const periods = buildPeriods(start, args.count);
    const rootTargetId = periods[0].id;

    for (const period of periods) {
        const templatePath = TEMPLATES[period.slot];
        if (!fs.existsSync(templatePath)) {
            throw new Error(`模板不存在: ${path.relative(ROOT, templatePath)}`);
        }

        const template = fs.readFileSync(templatePath, 'utf8');
        const html = updateHtml(template, period, periods, rootTargetId);
        writeFile(path.join(ROOT, `${period.id}.html`), html, args.dryRun);

        if (period.id === rootTargetId) {
            writeFile(path.join(ROOT, 'index.html'), html, args.dryRun);
        }
    }

    console.log(`period window: ${periods[0].label} - ${periods[periods.length - 1].label}`);
}

try {
    main();
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
