import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { applyPreviewMode } from '../prototype/arksoma-cell-journey-preview.mjs';

const root = new URL('../', import.meta.url);

function attributeValue(attributes, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(attributes)?.[2];
}

function hasClass(attributes, className) {
  return (attributeValue(attributes, 'class') || '').split(/\s+/).includes(className);
}

function elements(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'gi'))]
    .map(([markup, attributes, content]) => ({ markup, attributes, content }));
}

function elementsWithClass(html, tagName, className) {
  return elements(html, tagName).filter(({ attributes }) => hasClass(attributes, className));
}

function ruleBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|})\\s*${escaped}\\s*\\{([^{}]*)\\}`, 'm').exec(css);
  assert.ok(match, `missing local CSS rule for ${selector}`);
  return match[1];
}

function hasDeclaration(rule, property, value) {
  return new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*${value}\\s*(?:;|$)`, 'i').test(rule);
}

function hasForbiddenImport(script) {
  return /\bimport\b/i.test(script);
}

function nestedElementWithClass(html, tagName, className) {
  const openingTag = new RegExp(`<${tagName}\\b([^>]*)>`, 'gi');
  let opening;
  while ((opening = openingTag.exec(html))) {
    if (hasClass(opening[1], className)) break;
  }
  assert.ok(opening, `missing .${className} ${tagName}`);

  const tag = new RegExp(`</?${tagName}\\b[^>]*>`, 'gi');
  tag.lastIndex = opening.index;
  let depth = 0;
  let token;
  while ((token = tag.exec(html))) {
    depth += token[0].startsWith('</') ? -1 : 1;
    if (depth === 0) {
      return {
        markup: html.slice(opening.index, tag.lastIndex),
        content: html.slice(opening.index + opening[0].length, token.index)
      };
    }
  }
  assert.fail(`unclosed .${className} ${tagName}`);
}

test('applyPreviewMode updates sibling toolbar controls through their shared preview container', () => {
  const buttons = ['desktop', 'tablet', 'mobile'].map((mode) => ({
    dataset: { previewMode: mode },
    pressed: null,
    setAttribute(name, value) { if (name === 'aria-pressed') this.pressed = value; }
  }));
  const queriedSelectors = [];
  const previewContainer = {
    querySelectorAll(selector) {
      queriedSelectors.push(selector);
      return selector === '[data-preview-mode]' ? buttons : [];
    }
  };
  const root = {
    dataset: {},
    parentElement: previewContainer,
    querySelectorAll() { throw new Error('toolbar controls are not descendants of the shell'); }
  };

  assert.equal(applyPreviewMode(root, 'mobile'), 'mobile');
  assert.equal(root.dataset.mode, 'mobile');
  assert.deepEqual(queriedSelectors, ['[data-preview-mode]']);
  assert.deepEqual(buttons.map((button) => button.pressed), ['false', 'false', 'true']);
});

test('attribute guard requires real attributes while preserving order and multi-class support', () => {
  for (const name of ['class', 'href', 'src', 'type']) {
    assert.equal(attributeValue(` data-${name}="decoy"`, name), undefined, `data-${name} must not impersonate ${name}`);
  }
  assert.equal(attributeValue(' href="first.css" rel="stylesheet" class="alpha beta"', 'href'), 'first.css');
  assert.equal(attributeValue(' href="first.css" rel="stylesheet" class="alpha beta"', 'rel'), 'stylesheet');
  assert.ok(hasClass(' id="preview" data-class="decoy" class="alpha journey-title beta"', 'journey-title'));
  assert.equal(hasClass(' data-class="journey-title"', 'journey-title'), false);
});

test('import guard rejects side-effect, static, and dynamic imports', () => {
  for (const source of [
    "import './dependency.mjs';",
    "import dependency from './dependency.mjs';",
    "import { dependency } from './dependency.mjs';",
    "import('./dependency.mjs');"
  ]) {
    assert.ok(hasForbiddenImport(source), `must reject ${source}`);
  }
});

test('cell journey preview preserves the approved copy and structure', async () => {
  const html = await readFile(new URL('prototype/arksoma-cell-journey-preview.html', root), 'utf8');
  const journeys = elementsWithClass(html, 'section', 'cell-journey');
  assert.equal(journeys.length, 1);
  const journey = journeys[0].content;
  const titles = elements(html, 'h1').filter(({ attributes }) => (
    attributeValue(attributes, 'id') === 'journeyPreviewTitle' && hasClass(attributes, 'journey-title')
  ));
  assert.equal(titles.length, 1);
  assert.equal(titles[0].content.trim(), '一次方案 · 两次赴日');

  const stages = elementsWithClass(journey, 'article', 'journey-stage');
  assert.equal(stages.length, 3);
  const expectedMeta = [
    ['01', '首次赴日 · 约 5 日'],
    ['02', '专业制备 · 不少于 4 周'],
    ['03', '第二次赴日 · 约 1 日']
  ];
  for (const [stage, [number, timing]] of stages.map(({ content }, index) => [content, expectedMeta[index]])) {
    const heads = elementsWithClass(stage, 'div', 'stage-head');
    assert.equal(heads.length, 1, `stage ${number} must own one stage-head`);
    const numbers = elementsWithClass(heads[0].content, 'span', 'stage-number');
    assert.equal(numbers.length, 1, `stage ${number} must keep its number in the meta row`);
    assert.equal(numbers[0].content.trim(), number);
    assert.ok(elements(heads[0].content, 'p').some(({ content }) => content.trim() === timing), `stage ${number} must keep its timing in the meta row`);
  }

  assert.match(journey, /医学评估与自体采集/);
  assert.match(journey, /医学周期与私人协调/);
  assert.match(journey, /回输与医学观察/);
  assert.equal((journey.match(/年度生命基线 · 首次完整方案已含/g) || []).length, 1);
  const baselines = elementsWithClass(journey, 'p', 'journey-baseline');
  assert.equal(baselines.length, 1);
  assert.equal(baselines[0].content.trim(), '年度生命基线 · 首次完整方案已含');
  assert.doesNotMatch(baselines[0].content, /<[^>]+>/);
  const stageGrid = nestedElementWithClass(journey, 'div', 'journey-stage-grid');
  assert.equal((stageGrid.content.match(/年度生命基线 · 首次完整方案已含/g) || []).length, 0);
  assert.doesNotMatch(stageGrid.content, /journey-baseline/);
  const gridEnd = journey.indexOf(stageGrid.markup) + stageGrid.markup.length;
  assert.equal(journey.slice(gridEnd).trim(), baselines[0].markup, 'only the baseline element may follow the stage grid');
  assert.doesNotMatch(html, /建立个人健康参照/);
});

test('cell journey preview defines local layout rules for each mode', async () => {
  const css = await readFile(new URL('prototype/arksoma-cell-journey-preview.css', root), 'utf8');
  assert.ok(hasDeclaration(ruleBlock(css, '.journey-stage-grid'), 'grid-template-columns', 'repeat\\(3,\\s*minmax\\(0,\\s*1fr\\)\\)'));
  assert.ok(hasDeclaration(ruleBlock(css, '.preview-shell[data-mode="mobile"] .journey-stage-grid'), 'grid-template-columns', '1fr'));
  for (const mode of ['desktop', 'tablet', 'mobile']) {
    assert.ok(hasDeclaration(ruleBlock(css, `.preview-shell[data-mode="${mode}"] .journey-title`), 'white-space', 'nowrap'));
  }
  const stageHead = ruleBlock(css, '.stage-head');
  assert.ok(hasDeclaration(stageHead, 'display', 'flex'));
  assert.ok(hasDeclaration(stageHead, 'align-items', 'baseline'));
  const stage = ruleBlock(css, '.journey-stage');
  assert.ok(hasDeclaration(stage, 'display', 'flex'));
  assert.ok(hasDeclaration(stage, 'flex-direction', 'column'));
  assert.ok(hasDeclaration(ruleBlock(css, '.journey-stage ul'), 'margin-top', 'auto'));
});

test('cell journey preview consumes the production ARKSOMA tokens and typography', async () => {
  const css = await readFile(new URL('prototype/arksoma-cell-journey-preview.css', root), 'utf8');

  const rootRule = ruleBlock(css, ':root');
  const productionTokens = {
    '--ink': '#040606',
    '--ink-soft': '#09100f',
    '--ivory': '#eee4d2',
    '--ivory-bright': '#fff9ed',
    '--bronze': '#b99a70',
    '--bronze-line': 'rgba\\(185,\\s*154,\\s*112,\\s*0\\.42\\)',
    '--emerald': '#72ae9d',
    '--muted': 'rgba\\(238,\\s*228,\\s*210,\\s*0\\.64\\)',
    '--hairline': 'rgba\\(238,\\s*228,\\s*210,\\s*0\\.16\\)'
  };
  for (const [property, value] of Object.entries(productionTokens)) {
    assert.ok(hasDeclaration(rootRule, property, value), `preview must define production ${property}`);
  }

  assert.ok(hasDeclaration(ruleBlock(css, 'body'), 'font-family', '-apple-system,\\s*BlinkMacSystemFont,\\s*"Helvetica Neue",\\s*"PingFang SC",\\s*sans-serif'));
  assert.ok(hasDeclaration(ruleBlock(css, 'body'), 'background', 'var\\(--ink\\)'));
  assert.ok(hasDeclaration(ruleBlock(css, 'body'), 'color', 'var\\(--ivory\\)'));
  assert.ok(hasDeclaration(ruleBlock(css, '.cell-journey'), 'background', 'var\\(--ink-soft\\)'));
  assert.ok(hasDeclaration(ruleBlock(css, '.cell-journey'), 'background-image', 'radial-gradient\\(circle at 50% 36%,\\s*color-mix\\(in srgb,\\s*var\\(--emerald\\) 9%,\\s*transparent\\),\\s*transparent 54%\\)'));
  assert.ok(hasDeclaration(ruleBlock(css, '.cell-journey'), 'color', 'var\\(--ivory\\)'));
  assert.ok(hasDeclaration(ruleBlock(css, '.eyebrow'), 'color', 'var\\(--bronze\\)'));
  assert.ok(hasDeclaration(ruleBlock(css, '.journey-title'), 'color', 'var\\(--ivory-bright\\)'));
  assert.ok(hasDeclaration(ruleBlock(css, '.journey-title'), 'font-family', '"Songti SC",\\s*STSong,\\s*serif'));
  assert.ok(hasDeclaration(ruleBlock(css, '.journey-title'), 'width', 'min\\(var\\(--wide\\),\\s*100%\\)'));
  assert.ok(hasDeclaration(ruleBlock(css, '.journey-intro'), 'width', 'min\\(620px,\\s*var\\(--safe\\),\\s*100%\\)'));
  assert.ok(hasDeclaration(ruleBlock(css, '.journey-intro'), 'color', 'var\\(--muted\\)'));
  assert.ok(hasDeclaration(ruleBlock(css, '.journey-stage-grid::before'), 'background', 'var\\(--bronze-line\\)'));
  assert.ok(hasDeclaration(ruleBlock(css, '.journey-stage'), 'border-left', '1px\\s+solid\\s+var\\(--hairline\\)'));
  assert.ok(hasDeclaration(ruleBlock(css, '.stage-number'), 'font-family', '"Bodoni 72",\\s*Didot,\\s*"Times New Roman",\\s*serif'));
  assert.ok(hasDeclaration(ruleBlock(css, '.journey-stage h2'), 'font-family', '"Songti SC",\\s*STSong,\\s*serif'));
  assert.ok(hasDeclaration(ruleBlock(css, '.journey-stage li'), 'border', '1px\\s+solid\\s+var\\(--bronze-line\\)'));
  assert.ok(hasDeclaration(ruleBlock(css, '.journey-title'), 'text-align', 'center'));
  assert.ok(hasDeclaration(ruleBlock(css, '.journey-intro'), 'text-align', 'center'));
  assert.ok(hasDeclaration(ruleBlock(css, '.journey-baseline'), 'text-align', 'center'));
});

test('preview toolbar exposes the production focus-visible treatment', async () => {
  const css = await readFile(new URL('prototype/arksoma-cell-journey-preview.css', root), 'utf8');
  const focusRule = ruleBlock(css, '.preview-toolbar button:focus-visible');
  assert.ok(hasDeclaration(focusRule, 'outline', '1px\\s+solid\\s+var\\(--ivory-bright\\)'));
  assert.ok(hasDeclaration(focusRule, 'outline-offset', '4px'));
});

test('preview keeps each fixed canvas inside a scaled, scrollable viewport without clipping', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('prototype/arksoma-cell-journey-preview.html', root), 'utf8'),
    readFile(new URL('prototype/arksoma-cell-journey-preview.css', root), 'utf8')
  ]);
  const shells = elementsWithClass(html, 'main', 'preview-shell');
  assert.equal(shells.length, 1);
  assert.equal(elementsWithClass(shells[0].content, 'div', 'preview-canvas').length, 1);

  const viewport = ruleBlock(css, '.preview-shell');
  assert.ok(hasDeclaration(viewport, 'width', '100%'));
  assert.ok(hasDeclaration(viewport, 'container-type', 'inline-size'));
  assert.ok(hasDeclaration(viewport, 'overflow-x', 'auto'));
  assert.doesNotMatch(css, /overflow\s*:\s*hidden/i);

  const canvas = ruleBlock(css, '.preview-canvas');
  assert.ok(hasDeclaration(canvas, 'width', 'var\\(--preview-width\\)'));
  assert.ok(hasDeclaration(canvas, 'margin-inline', 'auto'));
  assert.ok(hasDeclaration(canvas, 'zoom', 'var\\(--preview-scale\\)'));
  assert.ok(hasDeclaration(canvas, '--preview-scale', 'min\\(1,\\s*calc\\(\\(100cqw - 32px\\)\\s*\\/\\s*var\\(--preview-width\\)\\)\\)'));

  for (const [mode, width] of [['desktop', '1440px'], ['tablet', '1024px'], ['mobile', '390px']]) {
    assert.ok(hasDeclaration(ruleBlock(css, `.preview-shell[data-mode="${mode}"]`), '--preview-width', width));
  }
});

test('preview fixes spacing and typography to each canvas without viewport-width units', async () => {
  const css = await readFile(new URL('prototype/arksoma-cell-journey-preview.css', root), 'utf8');
  assert.doesNotMatch(css, /(?:\d|\.)\s*(?:dvw|svw|lvw|vw)\b/i);

  const expectedModes = {
    desktop: {
      '--safe': '760px',
      '--wide': '980px',
      '--journey-padding': '86px\\s+110px\\s+72px',
      '--journey-title-size': '60px',
      '--stage-head-gap': '30px',
      '--stage-inline-padding': '54px',
      '--stage-title-size': '29px'
    },
    tablet: {
      '--safe': '720px',
      '--wide': '880px',
      '--journey-padding': '64px\\s+62px\\s+56px',
      '--journey-title-size': '48px',
      '--stage-head-gap': '12px',
      '--stage-inline-padding': '28px',
      '--stage-title-size': '25px'
    },
    mobile: {
      '--safe': '350px',
      '--wide': '358px',
      '--journey-padding': '38px\\s+22px\\s+34px\\s+36px',
      '--journey-title-size': '31px',
      '--stage-head-gap': '16px',
      '--stage-inline-padding': '0',
      '--stage-title-size': '21px'
    }
  };

  for (const [mode, variables] of Object.entries(expectedModes)) {
    const rule = ruleBlock(css, '.preview-shell[data-mode="' + mode + '"]');
    for (const [property, value] of Object.entries(variables)) {
      assert.ok(hasDeclaration(rule, property, value), mode + ' must define ' + property);
    }
  }
});

test('cell journey preview stays dependency-free and asset-free', async () => {
  const [html, css, script] = await Promise.all([
    readFile(new URL('prototype/arksoma-cell-journey-preview.html', root), 'utf8'),
    readFile(new URL('prototype/arksoma-cell-journey-preview.css', root), 'utf8'),
    readFile(new URL('prototype/arksoma-cell-journey-preview.mjs', root), 'utf8')
  ]);

  assert.doesNotMatch(html, /<(?:img|picture|svg|use|object|embed|video)\b/i);
  assert.doesNotMatch(html, /<base\b/i);
  assert.doesNotMatch(html, /<style\b/i);
  assert.doesNotMatch(html, /\bstyle\s*=/i);
  const links = [...html.matchAll(/<link\b([^>]*)>/gi)].map(([, attributes]) => attributes);
  assert.equal(links.length, 1, 'preview may load only its local stylesheet');
  assert.match(attributeValue(links[0], 'rel') || '', /\bstylesheet\b/i);
  assert.equal(attributeValue(links[0], 'href'), 'arksoma-cell-journey-preview.css');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(([, attributes, content]) => ({ attributes, content }));
  assert.equal(scripts.length, 1, 'preview may load only its local module script');
  assert.equal(attributeValue(scripts[0].attributes, 'type'), 'module');
  assert.equal(attributeValue(scripts[0].attributes, 'src'), 'arksoma-cell-journey-preview.mjs');
  assert.equal(scripts[0].content.trim(), '');
  assert.doesNotMatch(css, /@(?:import|font-face)\b/i);
  assert.doesNotMatch(css, /\burl\s*\(/i);
  assert.doesNotMatch(css, /(?:-webkit-)?backdrop-filter\s*:/i);
  assert.doesNotMatch(script, /https?:\/\//i);
  assert.equal(hasForbiddenImport(script), false, 'preview script must not import dependencies');
});
