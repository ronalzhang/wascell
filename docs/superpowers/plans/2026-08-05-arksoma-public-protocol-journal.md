# ARKSOMA 公开网站路径与生命纪行实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 ARKSOMA 正式前端中加入准确的双赴日服务解释、动态 SEO 与方舟生命纪行展示，并为后台服务案例和纪行生产状态提供最小数据基础。

**Architecture:** 继续以 `templates/arksoma-period.html` 为单一期次页面源模板，由 `scripts/arksoma-periods.cjs` 生成首页和五个期次页；视觉只扩展现有 `arksoma.css`。后台沿用私有 JSON、原子写入、服务端权限校验和追加式审计，不引入数据库或第三方付费接口。

**Tech Stack:** Node.js 22、Express 4、原生 ES Modules、Node test runner、静态 HTML/CSS、私有 JSON 数据目录。

## Global Constraints

- 不部署、不重启服务器，不修改生产数据。
- 保留现有动态期次、价格、申请表和后台权限行为。
- 首页新增顺序固定为：年度席位 → 两次赴日完整路径 → 五日私享行程 → 方舟生命纪行 → 申请入口。
- 书脊只使用 `序 启 行 观 境 遇 识 容 和 同 照 澄 守 臻 恒`，不出现 `01–15`、罗马数字或 `VOL`。
- 客户影像必须描述为最终统一印刷和装订，不描述为插卡、相片袋或可替换照片页。
- “见天地、见众生、见自己”是 ARKSOMA 自有旅程解释，不宣称为影视原句。
- 医疗行为由实际接诊的日本医疗机构和医生决定，ARKSOMA 负责统一设计、统筹与交付。

---

### Task 1: 公开页面契约测试

**Files:**
- Modify: `tests/period-window.test.cjs`
- Modify: `tests/arksoma-ui.test.mjs`

**Interfaces:**
- Consumes: `renderPeriodPage(template, period, periods, options)`。
- Produces: 生成页面必须满足的 SEO、模块顺序、文案和响应式契约。

- [ ] **Step 1: 写入失败测试**

  断言页面含 canonical、Open Graph、WebSite/Organization JSON-LD；`journey-protocol` 位于 `itinerary` 前；`private-journal` 位于 `itinerary` 后；十五字完整且不存在编号体系。

- [ ] **Step 2: 运行测试确认红灯**

  Run: `node --test tests/period-window.test.cjs tests/arksoma-ui.test.mjs`
  Expected: FAIL，缺少 `journey-protocol`、`private-journal` 或 SEO 标记。

### Task 2: 动态 SEO 与公开模块

**Files:**
- Modify: `templates/arksoma-period.html`
- Modify: `scripts/arksoma-periods.cjs`
- Modify: `arksoma.css`
- Create: `imgs/arksoma/journal-collection.png`
- Create: `imgs/arksoma/journal-single.png`
- Create: `imgs/arksoma/journal-pages.png`

**Interfaces:**
- Consumes: 每期期次 `id`、`label`、`route`、`title`。
- Produces: 每一期自引用 canonical、动态 title/OG 信息，以及两个新页面区块。

- [ ] **Step 1: 实现最小模板和样式**

  新增双赴日三幕主轴，公开说明首次约五日、制备不少于四周、第二次约一日；年度检测仅写成首次完整方案的一次年度综合基线评估礼遇。

- [ ] **Step 2: 加入生命纪行模块**

  展示单册、十五册和一体印刷内页；说明实际产品需待行程影像完成后整本统一送印、锁线与上壳。

- [ ] **Step 3: 生成当前期次窗口**

  Run: `npm run periods:update`
  Expected: 只更新 `index.html` 与当前五个期次页面。

- [ ] **Step 4: 运行局部测试确认绿灯**

  Run: `node --test tests/period-window.test.cjs tests/arksoma-ui.test.mjs`
  Expected: PASS。

### Task 3: 服务案例与生命纪行数据基础

**Files:**
- Create: `lib/service-case-store.js`
- Create: `tests/service-case-store.test.cjs`
- Modify: `app.js`

**Interfaces:**
- Produces: `createServiceCaseStore({ dataDir, auditLog })`；服务案例包含 `membershipStatus` 之外独立的 `caseStatus`、付款标签和 `journal` 任务状态。

- [ ] **Step 1: 写入失败测试**

  验证创建案例默认状态、合法进度流转、财务字段权限边界、十五章自动分配和纪行任务追加式更新。

- [ ] **Step 2: 运行测试确认红灯**

  Run: `node --test tests/service-case-store.test.cjs`
  Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现最小存储与所有者/销售 API**

  所有者可创建案例和确认付款；销售只能更新非财务进度与纪行任务。每次变更写审计日志。

- [ ] **Step 4: 运行服务案例与集成测试**

  Run: `node --test tests/service-case-store.test.cjs tests/admin-integration.test.cjs`
  Expected: PASS。

### Task 4: 完整验证与本地视觉验收

**Files:**
- Modify: `design-qa.md`

- [ ] **Step 1: 运行完整测试**

  Run: `npm test`
  Expected: 0 failures。

- [ ] **Step 2: 启动临时私有数据环境**

  Run: `PRIVATE_ROOT=$(mktemp -d) PORT=3003 npm start`
  Expected: 本地 HTTP 服务监听成功，且不读取生产私有目录。

- [ ] **Step 3: 浏览器验收**

  检查桌面、390px 手机和 834px 平板：新模块顺序正确、三幕主轴不横向溢出、十五字无错字、申请弹窗仍可打开、控制台无错误。

- [ ] **Step 4: 写入 QA 结果**

  `design-qa.md` 只记录本轮公开模块；如浏览器不可用则写 `final result: blocked`，不得用 HTTP 200 代替视觉验收。
