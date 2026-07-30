# WASCELL Admin V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改动客户前端页面的前提下，保持隐藏入口 `/admin-pro` 并上线具备服务端鉴权、访问统计、顾问申请订单和附件管理能力的黑金后台。

**Architecture:** Express 保持单进程部署，新增独立的管理员会话模块与 JSON 订单存储模块。申请元数据通过原子写入保存到私有目录，附件按订单分目录存储且仅通过鉴权下载；后台页面沿用已确认的 ARKSOMA 黑金原型并接入真实 API。

**Tech Stack:** Node.js 18+、Express 4、Node `crypto`、`multer`、原生 HTML/CSS/ES Modules、Node Test Runner。

## Global Constraints

- 不修改 `index.html`、期次页面、`arksoma.css` 或任何客户前端交互。
- `/admin` 保持 404；仅 `/admin-pro` 进入新版后台。
- 所有 `/api/admin/*` 数据接口必须经过服务端会话鉴权。
- 订单 JSON 与附件目录不得通过 `express.static` 暴露。
- 附件最多 3 个，单文件 10 MB，总计 20 MB，仅 PDF/JPG/JPEG/PNG。
- 生产数据目录通过 `ADVISOR_DATA_DIR`、`ADVISOR_UPLOAD_DIR` 配置。

---

### Task 1: 管理员会话与兼容入口

**Files:**
- Create: `lib/admin-auth.js`
- Create: `tests/admin-auth.test.cjs`
- Modify: `app.js`

**Interfaces:**
- Produces: `createAdminAuth({ password, secret, ttlMs, secureCookie })`
- Produces: `{ login, logout, session, requireAdmin }` Express handlers

- [ ] 写失败测试：错误密码返回 401；正确密码设置 `HttpOnly; SameSite=Strict` Cookie；无 Cookie 访问受保护接口返回 401。
- [ ] 运行 `node --test tests/admin-auth.test.cjs`，确认因模块缺失失败。
- [ ] 用 HMAC 签名的短期 Cookie 实现最小服务端会话，不保存明文密码或前端登录标记。
- [ ] 在 `app.js` 接入 `/api/admin/login`、`/api/admin/logout`、`/api/admin/session` 和统一 `requireAdmin`。
- [ ] 保持 `/admin` 为 404，并验证 `/admin-pro` 正常返回新版后台。

### Task 2: 顾问申请订单与附件存储

**Files:**
- Create: `lib/advisor-store.js`
- Create: `tests/advisor-store.test.cjs`
- Modify: `app.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `createAdvisorStore({ dataDir, uploadDir })`
- Produces: `createApplication`, `listApplications`, `getApplication`, `updateApplication`, `getAttachment`

- [ ] 写失败测试：创建订单、重复提交幂等、搜索筛选、状态备注更新、附件路径不可穿越。
- [ ] 运行 `node --test tests/advisor-store.test.cjs`，确认因模块缺失失败。
- [ ] 实现 JSON 原子写入、不可预测订单号、随机附件名和清理逻辑。
- [ ] 安装并配置 `multer`，实现 `POST /api/advisor-applications` 的文件数、类型、单文件及总大小校验。
- [ ] 实现鉴权的列表、详情、更新与附件下载接口，并运行测试至通过。

### Task 3: ARKSOMA 黑金后台真实接入

**Files:**
- Replace: `admin-pro.html`
- Create: `admin-pro.css`
- Create: `admin-pro.mjs`
- Create: `tests/admin-contract.test.cjs`

**Interfaces:**
- Consumes: `/api/admin/session`, `/api/admin/login`, `/api/admin/logout`
- Consumes: `/api/admin/realtime`, `/api/admin/stats`, `/api/admin/applications`

- [ ] 写失败契约测试：页面必须包含访问统计/顾问申请导航、订单表格、详情抽屉、登录区，并引用外部 CSS/JS。
- [ ] 运行测试确认旧后台未满足契约。
- [ ] 按已确认原型实现黑金布局，保留统计图表并增加订单模块。
- [ ] 接入真实登录、统计、筛选、详情、附件下载、状态和备注更新；所有错误显示为明确中文状态。
- [ ] 运行契约测试和完整测试。

### Task 4: 本地与生产验证

**Files:**
- Create: `design-qa-admin-v2.md`
- Modify: `deploy.sh`（仅在需要补充后台运行目录配置时）

**Interfaces:**
- Produces: 本地浏览器 QA 证据和生产健康检查记录

- [ ] 启动本地 3003 服务，验证 `/admin` 为 404，并验证 `/admin-pro`、登录、统计、订单筛选、详情、状态更新与附件下载。
- [ ] 在 1366×1024 与 1024×1366 视口对照已确认原型，修复 P0/P1/P2 后写入 `final result: passed`。
- [ ] 运行完整 Node 测试、既有风险检查、语法检查和 `git diff --check`。
- [ ] 仅提交并推送后台相关文件，不包含客户前端改动。
- [ ] VPS 配置私有数据目录，fast-forward 拉取并只重启 `wascell-website`。
- [ ] 线上核验 `/admin` 404、`/admin-pro` 200、会话保护 401/200、PM2 online、3003 监听和错误日志。
