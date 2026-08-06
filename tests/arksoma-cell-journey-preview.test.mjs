import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('cell journey preview preserves the approved copy and structure', async () => {
  const html = await readFile(new URL('prototype/arksoma-cell-journey-preview.html', root), 'utf8');
  assert.match(html, /一次方案 · 两次赴日/);
  assert.equal((html.match(/class="journey-stage"/g) || []).length, 3);
  assert.match(html, /医学评估与自体采集/);
  assert.match(html, /医学周期与私人协调/);
  assert.match(html, /回输与医学观察/);
  assert.match(html, /年度生命基线 · 首次完整方案已含/);
  assert.doesNotMatch(html, /建立个人健康参照/);
});

test('cell journey preview defines equal desktop columns and a mobile rail', async () => {
  const css = await readFile(new URL('prototype/arksoma-cell-journey-preview.css', root), 'utf8');
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.preview-shell\[data-mode="mobile"\][\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /white-space:\s*nowrap/);
});
