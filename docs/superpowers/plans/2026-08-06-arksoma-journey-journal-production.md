# ARKSOMA Journey and Journal Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成五日行程图片加载、细胞旅程版式、生命纪行深色启用态和管理员展示开关，并安全部署到生产。

**Architecture:** 既有商业配置存储新增 `showPrivateJournal` 布尔字段，公开目录只传递展示状态，静态 HTML 默认隐藏并由浏览器在读取成功后启用。行程图片保留原生懒加载，以明确尺寸稳定布局，并由独立前端函数在首屏完成后顺序预热与控制显现状态。

**Tech Stack:** Node.js、Express、原生 ES modules、HTML/CSS、Node test runner、PM2。

## Global Constraints

- 方舟生命纪行默认关闭，接口失败时保持隐藏。
- 销售端无配置权限，只有 `/admin-pro` 管理员可修改开关并写入审计原因。
- 不新增依赖，不增加首屏图片竞争，不修改 HAProxy、Nginx 或其他应用。
- 现有纪行图片本次保留，后续任务再升级首张合集图。
- 桌面、iPad、手机三档必须无横向溢出并维持深色品牌体系。

---

### Task 1: 商业配置展示开关

**Files:**
- Modify: `tests/business-config.test.cjs`
- Modify: `tests/admin-integration.test.cjs`
- Modify: `tests/admin-pages.test.cjs`
- Modify: `lib/business-config-store.js`
- Modify: `admin-pro.mjs`

**Interfaces:**
- Produces: `showPrivateJournal: boolean` in owner and public catalog responses.

- [ ] **Step 1: Write the failing tests**

验证默认值为 `false`、公开目录包含该字段、管理员更新会记录审计前后值，并且管理页渲染布尔开关而非数字输入。

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/business-config.test.cjs tests/admin-pages.test.cjs tests/admin-integration.test.cjs`

- [ ] **Step 3: Write minimal implementation**

在默认配置、校验、公开序列化和管理员表单中加入 `showPrivateJournal`，保存时读取复选框状态。

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/business-config.test.cjs tests/admin-pages.test.cjs tests/admin-integration.test.cjs`

### Task 2: 前台显示与内容版式

**Files:**
- Modify: `tests/arksoma-ui.test.mjs`
- Modify: `tests/period-window.test.cjs`
- Modify: `arksoma-ui.mjs`
- Modify: `templates/arksoma-period.html`
- Modify: `arksoma.css`

**Interfaces:**
- Consumes: `catalog.showPrivateJournal`.
- Produces: fail-closed `[data-private-journal][hidden]` and aligned protocol layout.

- [ ] **Step 1: Write the failing tests**

验证公开目录标准化保留布尔值、应用目录时切换 `hidden`、模板默认隐藏、年度文案更新且协议卡片采用底部标签结构。

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/arksoma-ui.test.mjs tests/period-window.test.cjs`

- [ ] **Step 3: Write minimal implementation**

更新模板、公开目录应用逻辑和深色视觉；桌面卡片使用网格行，移动端恢复自然布局。

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/arksoma-ui.test.mjs tests/period-window.test.cjs`

### Task 3: 五日行程图片加载

**Files:**
- Modify: `tests/arksoma-ui.test.mjs`
- Modify: `tests/period-window.test.cjs`
- Modify: `scripts/arksoma-periods.cjs`
- Modify: `arksoma-ui.mjs`
- Modify: `arksoma.css`

**Interfaces:**
- Produces: `initJourneyImages(options)` and image attributes `width`, `height`, `decoding`, `data-journey-image`.

- [ ] **Step 1: Write the failing tests**

验证生成图片包含尺寸和异步解码属性，加载函数控制 pending/ready/error 状态，并在非省流量环境按顺序预热。

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/arksoma-ui.test.mjs tests/period-window.test.cjs`

- [ ] **Step 3: Write minimal implementation**

补充图片尺寸元数据、稳定暗色占位和低优先级顺序预热；失败状态保持暗色画面且不显示破图内容。

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/arksoma-ui.test.mjs tests/period-window.test.cjs`

### Task 4: 生成、视觉验收与生产部署

**Files:**
- Modify: `index.html`
- Modify: `20260901.html`
- Modify: `20260902.html`
- Modify: `20260903.html`
- Modify: `20261001.html`
- Modify: `20261002.html`
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: period template and production deployment workflow.
- Produces: tested static pages and healthy `wascell-website` production process.

- [ ] **Step 1: Regenerate and verify pages**

Run: `npm run periods:dry-run && npm run periods:update`

- [ ] **Step 2: Run complete automated verification**

Run: `npm test && git diff --check`

- [ ] **Step 3: Perform visual QA**

在 1440px、834px、390px 检查协议、行程、纪行隐藏/启用态与横向溢出，并记录到 `design-qa.md`。

- [ ] **Step 4: Deploy only the application**

提交相关文件、推送当前分支合入的生产提交；远端快速前进拉取、运行测试并只重启 PM2 的 `wascell-website`。

- [ ] **Step 5: Verify production**

检查 `arksoma.com`、`www.arksoma.com`、`wascell.com`、公开目录开关、管理员配置接口、PM2 状态与远端工作树。
