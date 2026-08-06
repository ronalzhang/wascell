# ARKSOMA CELL JOURNEY Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已确认的 ARKSOMA CELL JOURNEY 三阶段视觉与文案同步到正式期次模板，生成当前公开页面，并安全部署到现有 VPS。

**Architecture:** 继续使用 `templates/arksoma-period.html` 作为所有期次页面的唯一结构源，使用 `arksoma.css` 承载正式响应式样式，不把 `prototype/` 的预览工具栏带入生产。先以 `tests/period-window.test.cjs` 固化正式模板的标题、序号结构、等宽三栏、移动纵向时间轴和单行基线，再做最小模板/CSS修改；随后生成当前期次静态页，通过本地与浏览器验收后再合并到 `main`、推送并运行现有 `deploy.sh`。

**Tech Stack:** Node.js、Express、静态 HTML/CSS、Node test runner、Git worktree、PM2、SSH 部署脚本。

## Global Constraints

- 正式标题必须是 `一次方案 · 两次赴日`，电脑与 iPad 保持一行。
- 三阶段必须使用 `01 / 02 / 03 + 时间标签` 的紧凑标题行；桌面和 iPad 三栏严格等宽。
- 手机端必须改为单列纵向时间轴，不能产生横向溢出。
- 底部只保留一行 `年度生命基线 · 首次完整方案已含`，不得保留旧的解释段落。
- 复用正式 ARKSOMA 的 `--ink`、`--ink-soft`、`--ivory`、`--ivory-bright`、`--bronze`、`--bronze-line`、`--muted`、`--hairline` 与现有字体体系。
- 不引入图片、图标、外部字体、液态玻璃卡片或新的运行时依赖。
- 不修改后台、申请订单、会员、期次业务数据、域名、HAProxy 或 Nginx 配置。
- 只有本地测试、响应式浏览器验收、Git 同步与远端健康检查全部通过才报告部署成功。

---

### Task 1: 固化生产模板契约并同步模块

**Files:**
- Modify: `tests/period-window.test.cjs`
- Modify: `templates/arksoma-period.html`
- Modify: `arksoma.css`

**Interfaces:**
- Consumes: `renderPeriodPage(template, period, periods, rootTargetId)` 与正式 ARKSOMA CSS tokens。
- Produces: 由 `#journey-protocol` 标识的正式三阶段模块，以及生成脚本可复用的唯一模板结构。

- [ ] **Step 1: 写失败测试**

在 `production template exposes dynamic SEO and the approved protocol-to-journal story` 用例中断言：

```js
assert.match(html, /一次方案 · 两次赴日/);
assert.match(html, /class="protocol-number">01</);
assert.match(html, /class="protocol-number">02</);
assert.match(html, /class="protocol-number">03</);
assert.match(html, /年度生命基线 · 首次完整方案已含/);
assert.doesNotMatch(html, /年度综合基线评估/);
assert.match(css, /\.protocol-rail\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
assert.match(css, /@media\s*\(max-width:\s*899px\)[\s\S]*\.protocol-rail\s*\{[^}]*grid-template-columns:\s*1fr/s);
assert.match(css, /\.protocol-baseline\s*\{[^}]*white-space:\s*nowrap/s);
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node --test tests/period-window.test.cjs`

Expected: FAIL，原因是正式模板仍使用旧标题、无 `01/02/03` 序号，且旧基线说明仍存在。

- [ ] **Step 3: 最小实现正式结构与样式**

将模板中的 protocol header、三个 article 与 protocol note 替换为批准内容；每个 article 使用：

```html
<div class="protocol-stage-head">
  <span class="protocol-number">01</span>
  <p class="protocol-stage">首次赴日 · 约 5 日</p>
</div>
```

CSS 使用 `repeat(3,minmax(0,1fr))`，阶段 article 为纵向 flex 以统一标签底线；`max-width:899px` 改为单列纵向时间轴；基线为独立单行元素。

- [ ] **Step 4: 运行聚焦与全量测试**

Run: `node --test tests/period-window.test.cjs`

Expected: PASS。

Run: `npm test`

Expected: 全部 PASS，0 failures。

- [ ] **Step 5: 提交模板实现**

```bash
git add tests/period-window.test.cjs templates/arksoma-period.html arksoma.css
git commit -m "feat: publish ARKSOMA cell journey timeline"
```

### Task 2: 生成当前期次页面并做本地验收

**Files:**
- Modify: `index.html`
- Modify: 由 `npm run periods:update` 输出的五个当前期次 HTML 文件

**Interfaces:**
- Consumes: `templates/arksoma-period.html` 与 `scripts/update-period-window.js`。
- Produces: 与正式模板一致的首页和五个公开期次页面。

- [ ] **Step 1: 预演生成窗口**

Run: `npm run periods:dry-run`

Expected: 输出本次将更新的五个期次文件和 `index.html`，不写文件。

- [ ] **Step 2: 生成正式页面**

Run: `npm run periods:update`

Expected: 只更新 `index.html` 和当前五个期次页面。

- [ ] **Step 3: 验证生成结果**

Run: `npm test && git diff --check`

Expected: 全部 PASS，且无空白错误。

- [ ] **Step 4: 浏览器验收三档布局**

启动 `npm start`，在内置浏览器检查正式首页的 `#journey-protocol`：1440px、1024px、390px；确认标题和基线单行、桌面/iPad三栏等宽、手机纵向时间轴、无横向溢出、控制台无错误。

- [ ] **Step 5: 提交生成页面**

```bash
git add index.html 20*.html
git commit -m "chore: regenerate ARKSOMA period pages"
```

### Task 3: 合并、部署与线上验证

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: 通过全部本地验收的 feature branch。
- Produces: `origin/main`、VPS `/ubuntu/wascell` 与 PM2 `wascell-website` 的同一提交版本。

- [ ] **Step 1: 建立干净的 main 部署 worktree**

```bash
git worktree add .worktrees/cell-journey-deploy-main main
```

Expected: 不触碰当前含用户未跟踪文件的主工作目录。

- [ ] **Step 2: 合并功能分支并再次验证**

```bash
git merge --no-ff codex/arksoma-cell-journey-preview
npm test
git diff --check origin/main..HEAD
```

Expected: 合并成功，测试全部通过。

- [ ] **Step 3: 推送 main 并执行部署脚本**

Run: `git push origin main`

Run: `./deploy.sh`

Expected: 远端 Git 状态检查、同步、依赖安装、PM2 重启和健康检查全部成功；任何硬失败立即停止。

- [ ] **Step 4: 远端与线上最终验证**

检查远端 `git rev-parse HEAD`、PM2 状态、VPS 回环 HTTP、`https://arksoma.com/`、`https://wascell.com/` 与管理员入口可达性；浏览器确认线上 CELL JOURNEY 三档布局和控制台状态。

- [ ] **Step 5: 记录最终证据**

报告本地提交、远端提交、PM2 状态、HTTP 状态、测试数量、线上浏览器结果和任何未解决风险。
