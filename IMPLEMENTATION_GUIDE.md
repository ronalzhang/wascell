# 防护功能实现说明

## 3. Rate Limiting 和恶意请求过滤实现方案

### 方案一：应用层 Rate Limiting（推荐）

**优点：**
- 完全控制，灵活配置
- 可以针对不同路径设置不同限制
- 可以记录和分析被限制的请求

**实现步骤：**

1. **安装依赖**
```bash
npm install express-rate-limit
```

2. **在 app.js 中添加配置**
```javascript
const rateLimit = require('express-rate-limit');

// 全局限流：每个 IP 每 15 分钟最多 100 个请求
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分钟
    max: 100, // 限制 100 个请求
    message: '请求过于频繁，请稍后再试',
    standardHeaders: true,
    legacyHeaders: false,
});

// 严格限流：针对可疑路径
const strictLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 分钟
    max: 5, // 限制 5 个请求
    message: '请求过于频繁',
});

// 应用限流
app.use(globalLimiter);

// 针对特定路径的严格限流
app.use(['/api/', '/admin-pro'], strictLimiter);
```

**预计效果：**
- 正常用户不受影响
- 自动化扫描工具被限制
- 减少 70-80% 的恶意请求

---

### 方案二：恶意请求过滤

**在 app.js 的统计中间件之前添加：**

```javascript
// 恶意请求模式列表
const maliciousPatterns = [
    /\.php$/i,
    /wp-admin/i,
    /wp-content/i,
    /wp-includes/i,
    /xmlrpc\.php/i,
    /\.env$/i,
    /\.git/i,
    /\.aws/i,
    /phpmyadmin/i,
    /admin\.php/i,
    /shell\.php/i,
];

// 恶意请求过滤中间件
app.use((req, res, next) => {
    const url = req.url.toLowerCase();
    
    // 检查是否匹配恶意模式
    const isMalicious = maliciousPatterns.some(pattern => pattern.test(url));
    
    if (isMalicious) {
        // 记录到黑名单（不记录到访问统计）
        const ip = req.headers['cf-connecting-ip'] || 
                   req.headers['x-real-ip'] || 
                   req.ip;
        
        // 可以选择：
        // 1. 直接返回 403
        return res.status(403).send('Forbidden');
        
        // 2. 或者返回 404 让攻击者以为文件不存在
        // return res.status(404).send('Not Found');
    }
    
    next();
});
```

**预计效果：**
- 恶意请求不再记录到统计
- 减少日志文件大小
- 减少 stats.json 的无用数据

---

### 方案三：Cloudflare 防火墙规则（最推荐）

**优点：**
- 在 CDN 层面拦截，不消耗服务器资源
- 免费版就有基本防护
- 配置简单，效果立竿见影

**实现步骤：**

1. **登录 Cloudflare Dashboard**
   - 访问 https://dash.cloudflare.com
   - 选择 wascell.com 域名

2. **配置防火墙规则（Security > WAF）**

   **规则 1：阻止 PHP 文件请求**
   ```
   条件：URI Path contains ".php"
   动作：Block
   ```

   **规则 2：阻止 WordPress 路径**
   ```
   条件：URI Path contains "wp-admin" OR "wp-content" OR "wp-includes"
   动作：Block
   ```

   **规则 3：阻止敏感文件**
   ```
   条件：URI Path contains ".env" OR ".git" OR ".aws"
   动作：Block
   ```

   **规则 4：Rate Limiting（需要付费版）**
   ```
   条件：所有请求
   限制：每个 IP 每分钟 60 个请求
   动作：Challenge（验证码）或 Block
   ```

3. **启用 Bot Fight Mode（免费）**
   - Security > Bots
   - 开启 "Bot Fight Mode"
   - 自动识别和阻止恶意机器人

4. **启用 Security Level（免费）**
   - Security > Settings
   - Security Level 设置为 "Medium" 或 "High"

**预计效果：**
- 阻止 90%+ 的恶意请求
- 恶意请求不会到达你的服务器
- 大幅减少服务器负载
- 日志更干净

---

## 推荐实施顺序

### 第一阶段（立即实施）：
1. ✅ **Cloudflare 防火墙规则** - 5分钟配置，立即生效
2. ✅ **恶意请求过滤** - 修改 app.js，不记录恶意请求

### 第二阶段（可选）：
3. **Rate Limiting** - 如果第一阶段效果不够好再添加

---

## 成本对比

| 方案 | 成本 | 效果 | 难度 |
|------|------|------|------|
| Cloudflare 防火墙（免费版） | 免费 | ⭐⭐⭐⭐⭐ | 简单 |
| 恶意请求过滤 | 免费 | ⭐⭐⭐⭐ | 简单 |
| Rate Limiting | 免费 | ⭐⭐⭐ | 中等 |
| Cloudflare Rate Limiting | $20/月 | ⭐⭐⭐⭐⭐ | 简单 |

---

## 预期效果

实施 Cloudflare 防火墙 + 恶意请求过滤后：

**当前状态：**
- 总请求：62,802 条
- 恶意请求：~30,000 条（48%）
- 有效请求：~32,000 条（52%）

**实施后：**
- 总请求：~32,000 条（恶意请求被 Cloudflare 拦截）
- 恶意请求：0 条（不会到达服务器）
- 有效请求：~32,000 条（100%）
- 日志文件大小：减少 50%
- 服务器负载：减少 40-50%

---

## 需要我帮你实施吗？

1. **Cloudflare 防火墙** - 需要你的 Cloudflare 账号权限
2. **恶意请求过滤** - 我可以修改 app.js 代码
3. **Rate Limiting** - 我可以添加到 app.js

请告诉我你想实施哪些方案。
