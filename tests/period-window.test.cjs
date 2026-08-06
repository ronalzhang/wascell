const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    buildPeriods,
    itineraryForPeriod,
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

    assert.match(html, /ARKSOMA 方舟计划｜2026·八月首期 · 日本细胞科技与生命资产管理/);
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

    assert.match(html, /^ARKSOMA 方舟计划｜2026·八月三期 · 日本细胞科技与生命资产管理/);
    assert.match(html, /敬亲礼遇期 · 3组家庭席位/);
    assert.match(html, /RMB 560,000/);
    assert.match(html, /敬亲礼遇/);
    assert.doesNotMatch(html, /限额 6 席|6人|6 人/);
});

test('reference itinerary separates medical preparation from the cultural image', () => {
    const itinerary = itineraryForPeriod({ type: 'standard', special: false });

    assert.match(itinerary[1].title, /医疗准备/);
    assert.equal(itinerary[1].image, 'imgs/geisha.jpg');
    assert.equal(itinerary[1].alt, '介绍制茶与舞文化接待');
    assert.match(itinerary[1].visualContext, /下午文化安排/);
});

test('reference itinerary closes with an incense gathering that is confirmed per period', () => {
    const itinerary = itineraryForPeriod({ type: 'standard', special: false });

    assert.equal(itinerary[4].image, 'imgs/incense.jpg');
    assert.match(itinerary[4].title, /香道/);
    assert.match(itinerary[4].copy, /当期确认/);
    assert.match(itinerary[4].visualContext, /香道/);
});

test('production template preserves the approved responsive ARKSOMA structure', () => {
    const template = fs.readFileSync(path.join(__dirname, '..', 'templates', 'arksoma-period.html'), 'utf8');
    const periods = buildPeriods({ year: 2026, month: 8 }, 5);
    const html = renderPeriodPage(template, periods[0], periods, periods[0].id);

    assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
    assert.match(html, /PRIVATE ACCESS · BY APPOINTMENT/);
    assert.equal((html.match(/三次起可制定连续方案 · 首年方舟席位已含/g) || []).length, 1);
    assert.doesNotMatch(html, /class="closing-price"[\s\S]{0,260}data-membership-copy/);
    assert.match(html, /未经提前沟通与专业评估[^<]*可能无法接收/);
    assert.match(html, /id="coordinateTrigger"[^>]*>\s*37°32′10″N<br>139°36′20″E/);
    assert.doesNotMatch(html, /id="coordinateTrigger"[\s\S]{0,180}ORIGIN · THE STONE OF LONGEVITY/);
    assert.match(html, /id="periodSheet"/);
    assert.equal((html.match(/class="journey-card/g) || []).length, 5);
    assert.equal((html.match(/data-journey-image/g) || []).length, 5);
    assert.equal((html.match(/decoding="async"/g) || []).length, 8);
    assert.match(html, /data-journey-image[^>]*width="2062"[^>]*height="1148"/);
    assert.doesNotMatch(html, /class="journey-card[^"]*" data-reveal/);
    assert.doesNotMatch(html, /class="itinerary-head safe-column" data-reveal/);
    assert.match(html, /id="advisorSuccess"/);
    assert.match(html, /id="fileList"/);
    assert.match(html, /class="advisor-context"/);
    assert.doesNotMatch(html, /资料与附件一次提交并直接生成私密申请订单/);
    assert.match(html, /data-service-period>单次细胞服务 · 2026·八月首期/);
    assert.match(html, /data-catalog-price>RMB 580,000/);
    assert.match(html, /class="closing-price"><span>单次细胞服务<\/span> · <span data-catalog-price>RMB 580,000<\/span> · 截止/);
    assert.doesNotMatch(html, /class="closing-price"[^>]*>[\s\S]{0,180}限额 5 席/);
    assert.doesNotMatch(html, /RMB 560,000\/次|折扣|立省|六次套餐/);
    assert.doesNotMatch(html, /id="advisorSuccess"[\s\S]*data-catalog-price/);
});

test('private advisory flow separates appointment intent from confirmed access', () => {
    const template = fs.readFileSync(path.join(__dirname, '..', 'templates', 'arksoma-period.html'), 'utf8');
    const periods = buildPeriods({ year: 2026, month: 8 }, 5);
    const html = renderPeriodPage(template, periods[0], periods, periods[0].id);

    assert.equal((html.match(/data-open-advisor>预约私人顾问<\/button>/g) || []).length, 2);
    assert.match(html, /<h2 id="advisorTitle">安排一次私人沟通<\/h2>/);
    assert.match(html, /<button class="submit-order wide" type="submit">提交预约意向<\/button>/);
    assert.match(html, /<h2>预约意向已收到<\/h2>/);
    assert.match(html, /确认沟通时间与后续安排/);
    assert.doesNotMatch(html, /申请私人顾问|提交申请|申请已记录/);
});

test('production template exposes dynamic SEO and the approved protocol-to-journal story', () => {
    const template = fs.readFileSync(path.join(__dirname, '..', 'templates', 'arksoma-period.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'arksoma.css'), 'utf8');
    const periods = buildPeriods({ year: 2026, month: 8 }, 5);
    const html = renderPeriodPage(template, periods[0], periods, periods[0].id);

    assert.match(html, /<link rel="canonical" href="https:\/\/arksoma\.com\/">/);
    assert.match(html, /<meta property="og:title" content="ARKSOMA 方舟计划｜2026·八月首期 · 日本细胞科技与生命资产管理">/);
    assert.match(html, /<meta property="og:url" content="https:\/\/arksoma\.com\/">/);
    assert.match(html, /<link rel="stylesheet" href="arksoma\.css\?v=20260806-3">/);
    assert.match(html, /"@type":"WebSite"/);
    assert.match(html, /"name":"ARKSOMA"/);
    assert.match(html, /"alternateName":"方舟计划"/);

    const access = html.indexOf('id="access"');
    const protocol = html.indexOf('id="journey-protocol"');
    const itinerary = html.indexOf('id="itinerary"');
    const journal = html.indexOf('id="private-journal"');
    const contact = html.indexOf('id="contact"');
    assert.ok(access < protocol && protocol < itinerary && itinerary < journal && journal < contact);

    assert.match(html, /一次方案 · 两次赴日/);
    assert.equal((html.match(/class="protocol-number">0[1-3]</g) || []).length, 3);
    assert.match(html, /class="protocol-number">01</);
    assert.match(html, /class="protocol-number">02</);
    assert.match(html, /class="protocol-number">03</);
    assert.match(html, /首次赴日[^<]*约 5 日/);
    assert.match(html, /专业制备[^<]*不少于 4 周/);
    assert.match(html, /第二次赴日[^<]*约 1 日/);
    assert.match(html, /医学评估与自体采集/);
    assert.match(html, /医学周期与私人协调/);
    assert.match(html, /回输与医学观察/);
    assert.match(html, /年度生命基线 · 首次完整方案已含/);
    assert.doesNotMatch(html, /年度综合基线评估|以一组关键指标建立长期健康管理的个人起点/);
    assert.doesNotMatch(html, /后续回输不自动重复包含/);
    assert.match(html, /序 · 启 · 行 · 观 · 境 · 遇 · 识 · 容 · 和 · 同 · 照 · 澄 · 守 · 臻 · 恒/);

    const journalSection = html.match(/<section class="private-journal"[\s\S]*?<\/section>/)?.[0] || '';
    assert.match(journalSection, /hidden data-private-journal/);
    assert.doesNotMatch(journalSection, /VOL\.|01–15|I{2,}|插卡|照片袋|可替换照片页/);
    assert.match(journalSection, /整本统一送印、锁线与上壳/);
    assert.match(css, /\.protocol-rail\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
    assert.match(css, /\.protocol-rail article\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
    assert.match(css, /\.protocol-rail ul\s*\{[^}]*margin-top:\s*auto/s);
    assert.match(css, /\.protocol-baseline\s*\{[^}]*white-space:\s*nowrap/s);
    assert.match(css, /@media\s*\(max-width:\s*899px\)[\s\S]*\.protocol-rail\s*\{[^}]*grid-template-columns:\s*1fr/s);
    assert.match(css, /@media\s*\(max-width:\s*899px\)[\s\S]*\.protocol-rail\s*\{[^}]*border-left:\s*1px solid var\(--hairline\)/s);
    assert.match(css, /\.journal-gallery/);
    assert.match(css, /\.private-journal\s*\{[^}]*background:[^}]*#07100f/s);
});

test('production hero preserves stone detail and serves compact modern artwork', () => {
    const template = fs.readFileSync(path.join(__dirname, '..', 'templates', 'arksoma-period.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'arksoma.css'), 'utf8');
    const heroWebp = path.join(__dirname, '..', 'imgs', 'arksoma', 'hero-longevity-stone.webp');
    const scienceWebp = path.join(__dirname, '..', 'imgs', 'arksoma', 'cellular-stone-field.webp');

    assert.match(template, /rel="preload" as="image" href="imgs\/arksoma\/hero-longevity-stone\.webp" type="image\/webp" fetchpriority="high"/);
    assert.match(css, /\.hero\s*\{[^}]*hero-longevity-stone\.webp/s);
    assert.match(css, /\.hero-shade\s*\{[^}]*rgba\(238,\s*228,\s*210,\s*\.07\)[^}]*mix-blend-mode:\s*screen/s);
    assert.match(css, /\.thesis-image\s*\{[^}]*cellular-stone-field\.webp[^}]*opacity:\s*1[^}]*brightness\(1\.08\)/s);
    assert.match(css, /\.closing-shade\s*\{[^}]*rgba\(1,\s*4,\s*5,\s*\.36\)/s);

    for (const asset of [heroWebp, scienceWebp]) {
        assert.equal(fs.existsSync(asset), true, `${path.basename(asset)} should exist`);
        assert.ok(fs.statSync(asset).size < 300 * 1024, `${path.basename(asset)} should stay below 300 KB`);
        const signature = fs.readFileSync(asset).subarray(0, 12);
        assert.equal(signature.subarray(0, 4).toString(), 'RIFF');
        assert.equal(signature.subarray(8, 12).toString(), 'WEBP');
    }
});

test('origin story uses translucent glass and balanced two-line copy', () => {
    const template = fs.readFileSync(path.join(__dirname, '..', 'templates', 'arksoma-period.html'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, '..', 'arksoma.css'), 'utf8');

    assert.match(template, /<blockquote><span>石头守住生命根基。<\/span><span>细胞之光重新点亮未来。<\/span><\/blockquote>/);
    assert.match(template, /class="origin-story">本坐标指向日本西会津山岳文化中的长寿意象/);
    assert.match(template, /如岩石般守护生命根基/);
    assert.doesNotMatch(template, /class="origin-story">坐标指向|如岩石般保存生命根基/);
    assert.match(css, /\.origin-menu\s+\.overlay-backdrop\s*\{[^}]*rgba\(1,\s*4,\s*5,\s*\.06\)[^}]*blur\(3px\)/s);
    assert.match(css, /\.origin-panel\s*\{[^}]*linear-gradient[^}]*rgba\(8,\s*15,\s*14,\s*\.46\)[^}]*rgba\(4,\s*8,\s*8,\s*\.34\)[^}]*blur\(18px\)/s);
    assert.match(css, /\.origin-panel blockquote span\s*\{[^}]*display:\s*block[^}]*white-space:\s*nowrap/s);
});

test('production styles keep native scrolling, one-shot image settling and glyph-only coordinate motion', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'arksoma.css'), 'utf8');

    assert.doesNotMatch(css, /scroll-snap-type|scroll-snap-align/);
    assert.doesNotMatch(css, /animation-timeline:\s*view\(\)/);
    assert.match(css, /\.closing h2\s*\{[^}]*white-space:\s*nowrap/s);
    assert.match(css, /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\),\s*\(max-width:\s*899px\)/);
    assert.doesNotMatch(css, /\.coordinate-trigger::before/);
    assert.doesNotMatch(css, /content:\s*["']ENTER["']/);
    assert.doesNotMatch(css, /coordinate-trace/);
    assert.match(css, /@keyframes\s+coordinate-glyph-sweep/);
    assert.match(css, /(?:-webkit-)?background-clip:\s*text/);
    assert.match(css, /animation:[^;]*coordinate-glyph-sweep\s+1\.02s[^;]*1\.1s\s+1\s+both/);
    assert.match(css, /\[data-reveal\]\s*\{[^}]*translateY\(12px\)/s);
    assert.match(css, /\.journey-card\.is-in-view\s+img\s*\{[^}]*scale\(1\)/s);
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.journey-card\s+img\s*\{[^}]*transform:\s*none/s);
    assert.doesNotMatch(css, /@media\s*\(max-width:\s*599px\)[\s\S]*\.closing h2\s*\{[^}]*font-size:\s*40px/);
});

test('period menu renders links inside the fixed sheet and keeps the active period', () => {
    const periods = buildPeriods({ year: 2026, month: 8 }, 5);
    const template = '<aside id="periodSheet">{{PERIOD_MENU}}</aside>';
    const html = renderPeriodPage(template, periods[3], periods, periods[0].id);

    assert.match(html, /<a href="20260901"[^>]*aria-current="page"/);
    assert.match(html, /敬亲礼遇期/);
    assert.doesNotMatch(html, /父母长辈特惠/);
});
