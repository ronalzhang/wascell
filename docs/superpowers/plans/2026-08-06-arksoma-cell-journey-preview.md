# ARKSOMA CELL JOURNEY Interactive Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个不影响生产页面的本地可交互预览，用同一内容分别展示 ARKSOMA CELL JOURNEY 的电脑、iPad 和手机布局。

**Architecture:** 在现有 `prototype/` 下增加独立 HTML、CSS 和 ES module。HTML只承载已确认模块与预览尺寸切换器；CSS复用生产站黑金变量并针对三种预览模式定义等宽横向时间轴或手机纵向时间轴；脚本只负责切换模式与无障碍状态。生产模板、公开期次页面和后台逻辑保持不变。

**Tech Stack:** 静态 HTML、CSS、原生 ES modules、Node.js test runner、现有 Express 静态服务与内置浏览器。

## Global Constraints

- 仅创建本地预览，不修改或部署生产页面。
- 主标题固定为 `一次方案 · 两次赴日`，1440px、1024px、390px 均保持完整一行。
- 电脑与 iPad 为三列严格等宽；手机切换为单列纵向时间轴。
- 序号与阶段时间同一行，标签在共同底部基线。
- 底部只显示 `年度生命基线 · 首次完整方案已含`，不显示第二行说明。
- 不引入图片、图标、外部字体、液态玻璃卡片或新的运行时依赖。
- 不修改已有未跟踪的 `prototype/` 文件和 `tests/preview-state.test.mjs`。

---

### Task 1: 锁定预览内容和三档结构契约

**Files:**
- Create: `tests/arksoma-cell-journey-preview.test.mjs`
- Test: `tests/arksoma-cell-journey-preview.test.mjs`

**Interfaces:**
- Consumes: 设计规格中的固定标题、三阶段文案、标签和年度基线。
- Produces: 对 `prototype/arksoma-cell-journey-preview.html`、`.css`、`.mjs` 的静态结构与脚本接口约束。

- [ ] **Step 1: 写入失败的静态结构测试**

```js
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
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test tests/arksoma-cell-journey-preview.test.mjs`

Expected: FAIL，原因是预览 HTML 或 CSS 文件尚不存在。

- [ ] **Step 3: 提交测试契约**

```bash
git add tests/arksoma-cell-journey-preview.test.mjs
git commit -m "test: define cell journey preview contract"
```

### Task 2: 构建三档可交互预览

**Files:**
- Create: `prototype/arksoma-cell-journey-preview.html`
- Create: `prototype/arksoma-cell-journey-preview.css`
- Create: `prototype/arksoma-cell-journey-preview.mjs`
- Modify: `tests/arksoma-cell-journey-preview.test.mjs`
- Test: `tests/arksoma-cell-journey-preview.test.mjs`

**Interfaces:**
- Consumes: `data-preview-mode="desktop|tablet|mobile"` 按钮和 `.preview-shell` 容器。
- Produces: `applyPreviewMode(root: HTMLElement, mode: 'desktop' | 'tablet' | 'mobile'): string`，设置 `root.dataset.mode`、更新按钮 `aria-pressed` 并返回最终模式。

- [ ] **Step 1: 增加失败的模式切换测试**

```js
import { applyPreviewMode } from '../prototype/arksoma-cell-journey-preview.mjs';

test('applyPreviewMode updates the shell and pressed state', () => {
  const buttons = ['desktop', 'tablet', 'mobile'].map((mode) => ({
    dataset: { previewMode: mode },
    pressed: null,
    setAttribute(name, value) { if (name === 'aria-pressed') this.pressed = value; }
  }));
  const root = {
    dataset: {},
    querySelectorAll() { return buttons; }
  };

  assert.equal(applyPreviewMode(root, 'mobile'), 'mobile');
  assert.equal(root.dataset.mode, 'mobile');
  assert.deepEqual(buttons.map((button) => button.pressed), ['false', 'false', 'true']);
});
```

- [ ] **Step 2: 运行测试并确认脚本接口尚不存在**

Run: `node --test tests/arksoma-cell-journey-preview.test.mjs`

Expected: FAIL，错误包含 `Cannot find module` 或 `does not provide an export named 'applyPreviewMode'`。

- [ ] **Step 3: 实现最小模式切换函数**

```js
const VALID_MODES = new Set(['desktop', 'tablet', 'mobile']);

export function applyPreviewMode(root, requestedMode) {
  const mode = VALID_MODES.has(requestedMode) ? requestedMode : 'desktop';
  root.dataset.mode = mode;
  root.querySelectorAll('[data-preview-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.previewMode === mode));
  });
  return mode;
}
```

- [ ] **Step 4: 构建预览 HTML**

HTML必须包含：

```html
<nav class="preview-toolbar" aria-label="预览尺寸">
  <button type="button" data-preview-mode="desktop" aria-pressed="true">电脑</button>
  <button type="button" data-preview-mode="tablet" aria-pressed="false">iPad</button>
  <button type="button" data-preview-mode="mobile" aria-pressed="false">手机</button>
</nav>
<main class="preview-shell" data-mode="desktop">
  <section class="cell-journey" aria-labelledby="journeyPreviewTitle">
    <p class="eyebrow">ARKSOMA CELL JOURNEY</p>
    <h1 id="journeyPreviewTitle">一次方案 · 两次赴日</h1>
    <p class="journey-intro">首次赴日完成医学评估与自体采集；专业制备完成后，再赴日回输与观察。</p>
    <div class="journey-stage-grid">
      <article class="journey-stage">
        <div class="stage-head"><span class="stage-number">01</span><p>首次赴日 · 约 5 日</p></div>
        <h2>医学评估与自体采集</h2>
        <p>完成必要评估与自体组织采集，随后进入当期私人文化行程。</p>
        <ul><li>医学评估</li><li>自体采集</li><li>私享行程</li></ul>
      </article>
      <article class="journey-stage">
        <div class="stage-head"><span class="stage-number">02</span><p>专业制备 · 不少于 4 周</p></div>
        <h2>医学周期与私人协调</h2>
        <p>由日本专业机构完成细胞制备，私人医疗秘书同步衔接资料与回程档期。</p>
        <ul><li>专业制备</li><li>全程协调</li></ul>
      </article>
      <article class="journey-stage">
        <div class="stage-head"><span class="stage-number">03</span><p>第二次赴日 · 约 1 日</p></div>
        <h2>回输与医学观察</h2>
        <p>按机构确认时间完成回输与观察，并由私人医疗秘书安排当日在日服务。</p>
        <ul><li>回输观察</li><li>私人安排</li></ul>
      </article>
    </div>
    <p class="journey-baseline">年度生命基线 · 首次完整方案已含</p>
  </section>
</main>
```

预览工具栏只属于本地预览，不能放进最终生产模块。

- [ ] **Step 5: 实现桌面、iPad 与手机 CSS**

CSS必须使用以下核心结构：

```css
.journey-stage-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.stage-head {
  display: flex;
  align-items: baseline;
  gap: clamp(16px, 2vw, 30px);
}

.preview-shell[data-mode="mobile"] .journey-stage-grid {
  grid-template-columns: 1fr;
}

.journey-title {
  white-space: nowrap;
  text-wrap: nowrap;
}
```

桌面画布宽度为 `1440px`，iPad 为 `1024px`，手机为 `390px`；画布最大宽度受当前浏览器可用空间约束并允许内部缩放查看。手机模式隐藏横向贯穿线，改为左侧纵向节点线；所有模式不得出现水平页面溢出。

- [ ] **Step 6: 绑定预览按钮**

```js
if (typeof document !== 'undefined') {
  const shell = document.querySelector('.preview-shell');
  document.querySelectorAll('[data-preview-mode]').forEach((button) => {
    button.addEventListener('click', () => applyPreviewMode(shell, button.dataset.previewMode));
  });
}
```

- [ ] **Step 7: 运行目标测试**

Run: `node --test tests/arksoma-cell-journey-preview.test.mjs`

Expected: PASS。

- [ ] **Step 8: 运行完整回归测试**

Run: `npm test`

Expected: 所有测试通过，既有公开页面与后台测试无回归。

- [ ] **Step 9: 提交预览实现**

```bash
git add prototype/arksoma-cell-journey-preview.html prototype/arksoma-cell-journey-preview.css prototype/arksoma-cell-journey-preview.mjs tests/arksoma-cell-journey-preview.test.mjs
git commit -m "feat: add responsive cell journey preview"
```

### Task 3: 浏览器视觉验收与交付

**Files:**
- Modify: `design-qa.md`
- Create: `.codex-tmp/arksoma-cell-journey-preview-qa/01-desktop.png`
- Create: `.codex-tmp/arksoma-cell-journey-preview-qa/02-tablet.png`
- Create: `.codex-tmp/arksoma-cell-journey-preview-qa/03-mobile.png`

**Interfaces:**
- Consumes: 本地预览 URL、三档切换按钮、已确认效果稿。
- Produces: 三张同状态截图与根目录 `design-qa.md` 中的 ARKSOMA CELL JOURNEY 对照结论。

- [ ] **Step 1: 启动现有静态服务**

Run: `npm start`

Expected: 服务监听项目配置端口，`/prototype/arksoma-cell-journey-preview.html` 返回 200。

- [ ] **Step 2: 验收电脑模式**

在内置浏览器打开预览，点击“电脑”，确认：

```text
三列宽度相等
标题“一次方案 · 两次赴日”只有一行
01/02/03 与阶段时间同排
三组标签位于共同底部基线
底部只有一行年度生命基线
document.documentElement.scrollWidth === window.innerWidth
```

保存截图到 `.codex-tmp/arksoma-cell-journey-preview-qa/01-desktop.png`。

- [ ] **Step 3: 验收 iPad 模式**

点击“iPad”，重复检查等宽三栏、标题单行、可读字号、无孤立标点和无水平溢出，保存 `.codex-tmp/arksoma-cell-journey-preview-qa/02-tablet.png`。

- [ ] **Step 4: 验收手机模式**

点击“手机”，确认单列纵向时间轴、紧凑阶段头、正文自然断句、标签不越界、年度基线单行和无水平溢出，保存 `.codex-tmp/arksoma-cell-journey-preview-qa/03-mobile.png`。

- [ ] **Step 5: 检查交互和错误日志**

依次点击三种模式，确认按钮 `aria-pressed` 正确更新；浏览器错误日志必须为空。

- [ ] **Step 6: 更新设计 QA**

在 `design-qa.md` 末尾追加独立的 `ARKSOMA CELL JOURNEY Preview QA` 章节，列出参考效果稿、三张验收截图、三档尺寸、视觉差异、剩余 P3 项，并以以下结果结束：

```text
final result: passed
```

- [ ] **Step 7: 提交验收记录**

```bash
git add design-qa.md
git commit -m "docs: verify cell journey preview"
```

- [ ] **Step 8: 保持本地预览打开并交付**

将内置浏览器保留在可交付的预览标签页，不执行 VPS 上传、主分支合并或生产部署。
