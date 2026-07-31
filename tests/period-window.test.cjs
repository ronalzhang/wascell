const test = require('node:test');
const assert = require('node:assert/strict');

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
