# WASCELL 官方网站

WASCELL生命焕新之旅官方网站，包含静态页面展示和后台访问统计管理系统。

## 功能特性

### 🌟 前台功能
- **响应式页面展示** - 展示WASCELL生命焕新之旅服务
- **移动端适配** - 保持`width=1024`视窗设置，确保完整页面显示
- **高性能静态服务** - 使用Express.js提供高效的静态文件服务

### 📊 后台管理功能
- **密码保护访问** - 访问密码：`123abc74531`
- **实时访问统计** - 今日访问量、独立IP数统计
- **历史数据分析** - 支持按日/周/月查看访问趋势
- **访问日志记录** - 记录IP、时间、User-Agent等详细信息
- **可视化图表** - 使用Chart.js展示访问趋势图表
- **热门IP排行** - 显示访问频次最高的IP地址

## 技术栈

- **后端**: Node.js + Express.js
- **前端**: 原生HTML/CSS/JavaScript
- **图表**: Chart.js
- **部署**: PM2 进程管理
- **安全**: Helmet.js 安全头设置

## 快速开始

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 或直接启动
npm start
```

访问地址：
- 主页：https://wascell.com
- 后台管理：https://wascell.com/admin-pro
- 开发环境：http://localhost:3003

### 服务器部署

#### 📋 配置部署环境

```bash
# 复制部署配置示例
cp .env.deploy.example .env.deploy

# 编辑部署配置
nano .env.deploy
```

#### 🚀 自动部署

```bash
# 一键部署到服务器
chmod +x deploy.sh
./deploy.sh
```

#### 🔧 手动部署

```bash
# 在服务器上安装依赖
npm install --production

# 使用PM2启动服务
npm run pm2:start

# 查看运行状态
pm2 status

# 查看日志
pm2 logs wascell-website

# 停止服务
npm run pm2:stop

# 重启服务
npm run pm2:restart
```

#### 🔍 部署后检查

```bash
# 检查服务器状态
chmod +x server-test.sh
./server-test.sh
```

## 端口配置

默认运行在端口 **3003**，避免与其他应用冲突。可通过环境变量 `PORT` 自定义端口：

```bash
PORT=3004 npm start
```

## 文件结构

```
wascell/
├── app.js              # 主应用服务器
├── index.html          # 主页面
├── admin-pro.html      # 后台管理页面
├── package.json        # 项目配置
├── qrcode/            # 二维码图片资源
├── access.log         # 访问日志 (自动生成)
├── stats.json         # 统计数据 (自动生成)
└── README.md          # 项目说明
```

## API接口

### 后台管理API

- `POST /api/admin/login` - 管理员登录验证
- `GET /api/admin/stats?period={day|week|month}` - 获取统计数据
- `GET /api/admin/realtime` - 获取实时统计数据

## 访问统计功能

系统会自动记录所有访问请求的详细信息：

- **实时统计**: 今日访问量、独立IP
- **历史统计**: 累计访问量、总独立IP
- **趋势分析**: 按日/周/月的访问趋势图表
- **IP分析**: 热门访问IP排行榜
- **访问日志**: 完整的访问记录，包含时间、IP、页面、User-Agent等

## 安全考虑

- ✅ 使用 Helmet.js 设置安全HTTP头（已启用CSP）
- ✅ 后台管理需要密码验证（支持环境变量配置）
- ✅ 访问日志和统计数据自动保存到文件
- ✅ 日志文件自动轮转（超过50MB时备份）
- ✅ 异步文件操作，避免阻塞主线程
- ✅ 中国时区时间处理
- ✅ 完善的错误处理和输入验证
- 🔧 生产环境建议使用HTTPS

## 环境变量配置

创建 `.env` 文件来配置敏感信息：

```bash
# 复制示例文件
cp .env.example .env

# 编辑配置
nano .env
```

### 可配置的环境变量
- `PORT`: 服务器端口（默认3003）
- `ADMIN_PASSWORD`: 管理员密码（默认123abc74531，生产环境请修改）
- `NODE_ENV`: 运行环境（development/production）

## 维护说明

- ✅ 访问日志文件 `access.log` 自动轮转（超过50MB时备份）
- ✅ 统计数据 `stats.json` 包含完整的历史统计，请勿删除
- ✅ PM2 进程会自动重启，确保服务稳定性
- ✅ 系统使用中国时区处理时间统计
- ✅ 异步操作避免服务器阻塞

## 许可证

MIT License

## 联系方式

如有问题请联系技术支持团队。 # Test change
