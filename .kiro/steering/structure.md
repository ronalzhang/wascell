# 项目结构

## 根目录组织

```
wascell/
├── app.js                    # 主 Express 服务器（含统计功能）
├── index.html                # 首页（20251001 期 - 已满员）
├── 20251002.html             # 第 2 期页面（可预约）
├── 20251003.html             # 第 3 期页面（可预约）
├── 20251101.html             # 第 4 期页面（可预约）
├── admin-pro.html            # 管理后台
├── period-switcher.js        # 期数下拉菜单逻辑
├── package.json              # Node.js 依赖配置
├── package-lock.json         # 依赖锁定文件
├── README.md                 # 项目文档
├── deploy.sh                 # 自动化部署脚本
├── .env.example              # 环境变量模板
├── .env.deploy.example       # 部署配置模板
├── access.log                # 访客访问日志（自动生成）
├── stats.json                # 统计数据（自动生成）
├── favicon.png               # 网站图标
├── chart.umd.js              # Chart.js 库（本地副本）
├── imgs/                     # 文化体验图片
│   ├── kaiseki.jpg           # 屋形船怀石料理
│   ├── geisha.jpg            # 艺伎茶道
│   ├── longtemple.jpg        # 龙安寺
│   ├── home.jpg              # 茶人私宅
│   └── ...                   # 其他场所图片
├── qrcode/                   # 二维码图片
│   ├── ff.jpg                # 二维码 1
│   └── xz.jpg                # 二维码 2
└── node_modules/             # 依赖包（不在 git 中）
```

## 配置文件

```
├── nginx-wascell.conf        # Nginx 反向代理配置
├── haproxy-updated.cfg       # HAProxy SNI 路由配置
├── .gitignore                # Git 忽略规则
└── .kiro/                    # Kiro AI 助手配置
    └── steering/             # AI 指导文档
```

## 核心架构模式

### 多期数页面
- 每个期数有独立的 HTML 文件（如 `20251001.html`）
- 所有期数页面共享 CSS 和 JavaScript 模式
- 期数切换下拉菜单允许在期数间导航
- 状态指示器："已满员"（full）、"可预约"（available）、"即将开放"（coming soon）

### 统计系统
- **中间件**：在 `app.js` 中捕获所有请求
- **日志记录**：追加到 `access.log`（JSON 行格式）
- **数据聚合**：更新 `stats.json` 的每日/IP 统计
- **日志轮转**：超过 50MB 时自动轮转
- **时区**：使用中国时区（UTC+8）计算日期

### 管理后台
- 密码保护访问（`/admin-pro`）
- 实时统计 API（`/api/admin/realtime`）
- 历史数据 API（`/api/admin/stats?period={day|week|month|last3days}`）
- Chart.js 趋势可视化
- 热门 IP 排行

### 静态资源
- 所有图片存储在 `imgs/` 目录
- 二维码存储在 `qrcode/` 目录
- 无构建过程 - 通过 Express 静态中间件直接提供文件

## 部署架构

```
用户请求 (wascell.com:443)
    ↓
HAProxy（443 端口 SNI 路由）
    ↓
Nginx（8446 端口反向代理）
    ↓
Node.js/Express（3003 端口应用）
```

## 文件命名规范
- 期数页面：`YYYYMMDD.html` 格式（如 `20251001.html`）
- 图片：描述性小写名称（如 `kaiseki.jpg`、`geisha.jpg`）
- 配置文件：服务名前缀（如 `nginx-wascell.conf`）
- 脚本：基于动作的名称（如 `deploy.sh`、`period-switcher.js`）
