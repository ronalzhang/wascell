const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    buildPeriods,
    renderPeriodPage,
} = require('../scripts/arksoma-periods.cjs');

test('buildPeriods creates the five-period August window with stable ids and labels', () => {
    const periods = buildPeriods({ year: 2026, month: 8 }, 5);

    assert.deepEqual(
        periods.map(({ id, label }) => ({ id, label })),
        [
            { id: '20260801', label: '2026·八月首期' },
            { id: '20260802', label: '2026·八月二期' },
            { id: '20260803', label: '2026·八月三期' },
            { id: '20260901', label: '2026·九月首期' },
            { id: '20260902', label: '2026·九月二期' },
        ],
    );
});

test('renderPeriodPage preserves ARKSOMA content and fills first-period commercial data', () => {
    const periods = buildPeriods({ year: 2026, month: 8 }, 5);
    const template = [
        '<title>{{PAGE_TITLE}}</title>',
        '<meta content="{{META_DESCRIPTION}}">',
        '<button data-period>{{PERIOD_LABEL}}</button>',
        '<div>{{PERIOD_MENU}}</div>',
        '<b>{{CAPACITY}}</b><b>{{PRICE}}</b><b>{{CUTOFF}}</b>',
        '<span>{{APPLY_NOTE}}</span>',
        '<span>ARKSOMA</span><span>方舟计划</span>',
        '<button id="originTrigger">37°32′10″N 139°36′20″E</button>',
    ].join('');

    const html = renderPeriodPage(template, periods[0], periods, periods[0].id);

    assert.match(html, /ARKSOMA · 方舟计划 · 2026·八月首期/);
    assert.match(html, /2026·八月首期/);
    assert.match(html, /限额 5 席/);
    assert.match(html, /RMB 580,000/);
    assert.match(html, /2026年7月5日/);
    assert.match(html, /href="\/"[^>]*aria-current="page"/);
    assert.match(html, /37°32′10″N 139°36′20″E/);
    assert.doesNotMatch(html, /\{\{[A-Z_]+\}\}/);
});

test('renderPeriodPage applies the third-period family edition without changing the brand', () => {
    const periods = buildPeriods({ year: 2026, month: 8 }, 5);
    const template = '{{PAGE_TITLE}}|{{PERIOD_LABEL}}|{{CAPACITY}}|{{PRICE}}|{{APPLY_NOTE}}|{{PERIOD_MENU}}';
    const html = renderPeriodPage(template, periods[2], periods, periods[0].id);

    assert.match(html, /^ARKSOMA · 方舟计划 · 2026·八月三期/);
    assert.match(html, /敬亲礼遇期 · 3组家庭席位/);
    assert.match(html, /RMB 560,000/);
    assert.match(html, /敬亲礼遇/);
    assert.doesNotMatch(html, /限额 6 席|6人|6 人/);
});

test('production template preserves the approved responsive ARKSOMA structure', () => {
    const template = fs.readFileSync(path.join(__dirname, '..', 'templates', 'arksoma-period.html'), 'utf8');
    const periods = buildPeriods({ year: 2026, month: 8 }, 5);
    const html = renderPeriodPage(template, periods[0], periods, periods[0].id);

    assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
    assert.match(html, /PRIVATE ACCESS · BY APPOINTMENT/);
    assert.match(html, /已包含首个 12 个月方舟年度席位/);
    assert.match(html, /未经提前沟通与专业评估[^<]*可能无法接收/);
    assert.match(html, /id="coordinateTrigger"[^>]*>\s*37°32′10″N<br>139°36′20″E/);
    assert.doesNotMatch(html, /id="coordinateTrigger"[\s\S]{0,180}ORIGIN · THE STONE OF LONGEVITY/);
    assert.match(html, /id="periodSheet"/);
    assert.equal((html.match(/class="journey-card/g) || []).length, 5);
    assert.doesNotMatch(html, /class="journey-card[^"]*" data-reveal/);
    assert.doesNotMatch(html, /class="itinerary-head safe-column" data-reveal/);
    assert.match(html, /id="advisorSuccess"/);
    assert.match(html, /id="fileList"/);
});

test('period menu renders links inside the fixed sheet and keeps the active period', () => {
    const periods = buildPeriods({ year: 2026, month: 8 }, 5);
    const template = '<aside id="periodSheet">{{PERIOD_MENU}}</aside>';
    const html = renderPeriodPage(template, periods[3], periods, periods[0].id);

    assert.match(html, /<a href="20260901"[^>]*aria-current="page"/);
    assert.match(html, /敬亲礼遇期/);
    assert.doesNotMatch(html, /父母长辈特惠/);
});
