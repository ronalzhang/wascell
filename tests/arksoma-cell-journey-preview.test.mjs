import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('cell journey preview preserves the approved copy and structure', async () => {
  const html = await readFile(new URL('prototype/arksoma-cell-journey-preview.html', root), 'utf8');
  assert.match(html, /一次方案 · 两次赴日/);
  assert.match(html, /<h1[^>]*id="journeyPreviewTitle"[^>]*class="journey-title"[^>]*>\s*一次方案 · 两次赴日\s*<\/h1>/);
  assert.equal((html.match(/class="journey-stage"/g) || []).length, 3);
  assert.equal((html.match(/class="stage-head"/g) || []).length, 3);
  assert.match(html, /class="stage-head"[^>]*>\s*<span class="stage-number">01<\/span>\s*<p>首次赴日 · 约 5 日<\/p>/);
  assert.match(html, /class="stage-head"[^>]*>\s*<span class="stage-number">02<\/span>\s*<p>专业制备 · 不少于 4 周<\/p>/);
  assert.match(html, /class="stage-head"[^>]*>\s*<span class="stage-number">03<\/span>\s*<p>第二次赴日 · 约 1 日<\/p>/);
  assert.match(html, /医学评估与自体采集/);
  assert.match(html, /医学周期与私人协调/);
  assert.match(html, /回输与医学观察/);
  assert.equal((html.match(/年度生命基线 · 首次完整方案已含/g) || []).length, 1);
  assert.match(html, /<p class="journey-baseline">\s*年度生命基线 · 首次完整方案已含\s*<\/p>/);
  assert.doesNotMatch(html, /journey-baseline(?:-note|__note)/);
  assert.doesNotMatch(html, /建立个人健康参照/);
});

test('cell journey preview defines equal desktop columns and a mobile rail', async () => {
  const css = await readFile(new URL('prototype/arksoma-cell-journey-preview.css', root), 'utf8');
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.preview-shell\[data-mode="mobile"\][\s\S]*grid-template-columns:\s*1fr/);
  for (const mode of ['desktop', 'tablet', 'mobile']) {
    assert.match(css, new RegExp(`\\.preview-shell\\[data-mode="${mode}"\\]\\s+\\.journey-title[\\s\\S]*?white-space:\\s*nowrap`));
  }
  assert.match(css, /\.stage-head\s*\{[\s\S]*?display:\s*flex[\s\S]*?align-items:\s*baseline/);
  assert.match(css, /\.journey-stage\s*\{[\s\S]*?display:\s*flex[\s\S]*?flex-direction:\s*column/);
  assert.match(css, /\.journey-stage\s+ul\s*\{[\s\S]*?margin-top:\s*auto/);
});

test('cell journey preview stays dependency-free and asset-free', async () => {
  const [html, css, script] = await Promise.all([
    readFile(new URL('prototype/arksoma-cell-journey-preview.html', root), 'utf8'),
    readFile(new URL('prototype/arksoma-cell-journey-preview.css', root), 'utf8'),
    readFile(new URL('prototype/arksoma-cell-journey-preview.mjs', root), 'utf8')
  ]);

  assert.doesNotMatch(html, /<(?:img|picture|svg|use)\b/i);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(css, /@(?:import|font-face)\b/i);
  assert.doesNotMatch(css, /https?:\/\//i);
  assert.doesNotMatch(css, /(?:backdrop-filter|\.glass\b|\.liquid\b)/i);
  assert.doesNotMatch(script, /(?:https?:\/\/|\bimport\s*(?:\(|[^;]*?\bfrom\b))/i);
});
