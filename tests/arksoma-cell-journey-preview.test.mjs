import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

function attributeValue(attributes, name) {
  return new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(attributes)?.[2];
}

function hasClass(attributes, className) {
  return (attributeValue(attributes, 'class') || '').split(/\s+/).includes(className);
}

function elements(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'gi'))]
    .map(([, attributes, content]) => ({ attributes, content }));
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

test('cell journey preview preserves the approved copy and structure', async () => {
  const html = await readFile(new URL('prototype/arksoma-cell-journey-preview.html', root), 'utf8');
  const titles = elements(html, 'h1').filter(({ attributes }) => (
    attributeValue(attributes, 'id') === 'journeyPreviewTitle' && hasClass(attributes, 'journey-title')
  ));
  assert.equal(titles.length, 1);
  assert.equal(titles[0].content.trim(), '一次方案 · 两次赴日');

  const stages = elementsWithClass(html, 'article', 'journey-stage');
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

  assert.match(html, /医学评估与自体采集/);
  assert.match(html, /医学周期与私人协调/);
  assert.match(html, /回输与医学观察/);
  const baselines = elementsWithClass(html, 'p', 'journey-baseline');
  assert.equal(baselines.length, 1);
  assert.equal(baselines[0].content.trim(), '年度生命基线 · 首次完整方案已含');
  assert.match(html, /<\/div>\s*<p\b[^>]*\bclass\s*=\s*(["'])[^"']*\bjourney-baseline\b[^"']*\1[^>]*>\s*年度生命基线 · 首次完整方案已含\s*<\/p>\s*<\/section>/);
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

test('cell journey preview stays dependency-free and asset-free', async () => {
  const [html, css, script] = await Promise.all([
    readFile(new URL('prototype/arksoma-cell-journey-preview.html', root), 'utf8'),
    readFile(new URL('prototype/arksoma-cell-journey-preview.css', root), 'utf8'),
    readFile(new URL('prototype/arksoma-cell-journey-preview.mjs', root), 'utf8')
  ]);

  assert.doesNotMatch(html, /<(?:img|picture|svg|use|object|embed|video)\b/i);
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
  assert.doesNotMatch(script, /(?:https?:\/\/|\bimport\s*(?:\(|[^;]*?\bfrom\b))/i);
});
