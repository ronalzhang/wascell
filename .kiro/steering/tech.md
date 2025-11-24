# 技术栈

## 后端
- **运行时**：Node.js
- **框架**：Express.js 4.18.2
- **进程管理**：PM2（生产环境）
- **端口**：3003（避免与其他应用冲突）

## 前端
- **技术方案**：原生 HTML/CSS/JavaScript（无框架）
- **样式**：内联 CSS + CSS 自定义属性（`:root` 变量）
- **图表**：Chart.js（通过 CDN）
- **响应式**：移动端固定视窗宽度 1024px

## 核心依赖
```json
{
  "express": "^4.18.2",
  "cors": "^2.8.5",
  "helmet": "^7.1.0",
  "compression": "^1.7.4"
}
```

## 基础设施
- **反向代理**：Nginx（端口 8446）→ Node.js（端口 3003）
- **负载均衡**：HAProxy（基于 SNI 的 443 端口路由）
- **SSL 证书**：Let's Encrypt（已配置自动续期）
- **服务器**：Ubuntu 云服务器（43.134.38.231）

## 常用命令

### 开发环境
```bash
npm install          # 安装依赖
npm start            # 启动服务器（生产模式）
npm run dev          # 使用 nodemon 启动（开发模式）
```

### 生产部署
```bash
./deploy.sh          # 自动化部署脚本
npm run pm2:start    # 使用 PM2 启动
npm run pm2:restart  # 重启应用
npm run pm2:stop     # 停止应用
pm2 logs wascell-website  # 查看日志
pm2 status           # 查看状态
```

### 测试
```bash
curl https://wascell.com  # 测试网站访问
```

## 文件结构
- `app.js` - 主 Express 服务器（含统计中间件）
- `index.html` - 首页（20251001 期）
- `20251002.html`、`20251003.html`、`20251101.html` - 其他期数页面
- `admin-pro.html` - 管理后台
- `period-switcher.js` - 期数选择下拉菜单功能
- `access.log` - 访客日志（超过 50MB 自动轮转）
- `stats.json` - 聚合统计数据
- `imgs/` - 文化体验图片资源
- `qrcode/` - 二维码图片

## 环境变量
```bash
PORT=3003                    # 服务器端口
ADMIN_PASSWORD=123abc74531   # 管理后台密码
NODE_ENV=production          # 运行环境
```

## 安全特性
- Helmet.js 设置 HTTP 安全头
- 已配置 CSP（内容安全策略）
- 密码保护的管理后台访问
- 生产环境仅 HTTPS
- 基于 IP 的访问追踪
