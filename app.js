const express = require('express');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');

// 异步文件操作
const writeFileAsync = promisify(fs.writeFile);
const appendFileAsync = promisify(fs.appendFile);
const readFileAsync = promisify(fs.readFile);
const existsAsync = promisify(fs.exists);
const statAsync = promisify(fs.stat);
const renameAsync = promisify(fs.rename);

const app = express();
const PORT = process.env.PORT || 3003; // 使用3003端口避免与其他应用冲突
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123abc74531'; // 从环境变量读取管理员密码

// 访问日志文件路径
const LOG_FILE = path.join(__dirname, 'access.log');
const STATS_FILE = path.join(__dirname, 'stats.json');

// IP地理位置缓存
const ipLocationCache = new Map();

// 恶意请求模式列表（用于黑名单检测）
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
    /shell\.php/i,
    /admin\.php/i,
    /config\.php/i,
];

// 检测IP是否为恶意IP（基于访问模式）
function isBlacklistedIP(ip, ipStats) {
    if (!ipStats || !ipStats[ip]) return false;
    
    const stats = ipStats[ip];
    const count = stats.count || 0;
    const maliciousCount = stats.maliciousCount || 0;
    
    // 规则1: 访问次数超过50次且恶意请求超过5次
    if (count > 50 && maliciousCount > 5) {
        return true;
    }
    
    // 规则2: 恶意请求占比超过80%（总访问>10次）
    if (count > 10 && maliciousCount > 0) {
        const maliciousRatio = maliciousCount / count;
        if (maliciousRatio > 0.8) {
            return true;
        }
    }
    
    return false;
}

// 从日志文件重新计算恶意请求次数（用于修复旧数据）
async function recalculateMaliciousCount() {
    console.log('开始重新计算恶意请求次数...');
    
    const stats = await getStatsAsync();
    const maliciousCounts = {};
    
    // 读取日志文件
    if (fs.existsSync(LOG_FILE)) {
        const readline = require('readline');
        const logStream = fs.createReadStream(LOG_FILE, { encoding: 'utf8' });
        const rl = readline.createInterface({
            input: logStream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            try {
                if (line.trim() === '') continue;
                const logEntry = JSON.parse(line);
                const ip = logEntry.ip;
                const url = logEntry.url ? logEntry.url.toLowerCase() : '';
                
                // 检测是否为恶意请求
                const isMalicious = maliciousPatterns.some(pattern => pattern.test(url));
                
                if (isMalicious) {
                    maliciousCounts[ip] = (maliciousCounts[ip] || 0) + 1;
                }
            } catch (e) {
                // 忽略无法解析的行
            }
        }
    }
    
    // 更新 stats.json 中的 maliciousCount
    let updated = false;
    for (const ip in stats.ipStats) {
        const maliciousCount = maliciousCounts[ip] || 0;
        if (stats.ipStats[ip].maliciousCount !== maliciousCount) {
            stats.ipStats[ip].maliciousCount = maliciousCount;
            updated = true;
        }
    }
    
    if (updated) {
        await safeWriteStats(stats);
        console.log(`重新计算完成，更新了 ${Object.keys(maliciousCounts).length} 个IP的恶意请求次数`);
    } else {
        console.log('无需更新');
    }
    
    return maliciousCounts;
}

// 获取IP地理位置（使用多个数据源，优先中文）
async function getIPLocation(ip) {
    // 清理IP格式（移除 ::ffff: 前缀）
    const cleanIP = ip.replace(/^::ffff:/, '');
    
    // 跳过本地IP
    if (cleanIP === '127.0.0.1' || cleanIP === '::1' || cleanIP.startsWith('192.168.') || cleanIP.startsWith('10.')) {
        return '本地网络';
    }
    
    // 检查缓存
    if (ipLocationCache.has(cleanIP)) {
        return ipLocationCache.get(cleanIP);
    }
    
    // IPv6地址特殊处理
    if (cleanIP.includes(':')) {
        ipLocationCache.set(cleanIP, 'IPv6地址');
        return 'IPv6地址';
    }
    
    // 尝试多个数据源（优先中文）
    const sources = [
        // 数据源1: ip-api.com (中文支持，优先使用)
        async () => {
            return new Promise((resolve) => {
                const req = http.get(`http://ip-api.com/json/${cleanIP}?fields=status,country,city&lang=zh-CN`, {
                    timeout: 2000
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(data);
                            if (json.status === 'success') {
                                const loc = json.city ? `${json.country} ${json.city}` : json.country;
                                resolve(loc || null);
                            } else {
                                resolve(null);
                            }
                        } catch (e) {
                            resolve(null);
                        }
                    });
                });
                req.on('error', () => resolve(null));
                req.on('timeout', () => {
                    req.destroy();
                    resolve(null);
                });
            });
        },
        // 数据源2: ipapi.co (备用，英文)
        async () => {
            return new Promise((resolve) => {
                const https = require('https');
                const req = https.get(`https://ipapi.co/${cleanIP}/json/`, {
                    timeout: 2000,
                    headers: { 'User-Agent': 'node.js' }
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(data);
                            if (json.country_name && json.city) {
                                // 简单的英文到中文映射
                                const countryMap = {
                                    'China': '中国',
                                    'United States': '美国',
                                    'Japan': '日本',
                                    'South Korea': '韩国',
                                    'Singapore': '新加坡',
                                    'India': '印度',
                                    'Germany': '德国',
                                    'France': '法国',
                                    'United Kingdom': '英国',
                                    'Canada': '加拿大',
                                    'Australia': '澳大利亚',
                                    'Russia': '俄罗斯',
                                    'Brazil': '巴西',
                                    'Netherlands': '荷兰',
                                    'Ireland': '爱尔兰'
                                };
                                const country = countryMap[json.country_name] || json.country_name;
                                resolve(`${country} ${json.city}`);
                            } else if (json.country_name) {
                                const countryMap = {
                                    'China': '中国',
                                    'United States': '美国',
                                    'Japan': '日本',
                                    'South Korea': '韩国',
                                    'Singapore': '新加坡',
                                    'India': '印度',
                                    'Germany': '德国',
                                    'France': '法国',
                                    'United Kingdom': '英国',
                                    'Canada': '加拿大',
                                    'Australia': '澳大利亚',
                                    'Russia': '俄罗斯',
                                    'Brazil': '巴西',
                                    'Netherlands': '荷兰',
                                    'Ireland': '爱尔兰'
                                };
                                resolve(countryMap[json.country_name] || json.country_name);
                            } else {
                                resolve(null);
                            }
                        } catch (e) {
                            resolve(null);
                        }
                    });
                });
                req.on('error', () => resolve(null));
                req.on('timeout', () => {
                    req.destroy();
                    resolve(null);
                });
            });
        }
    ];
    
    // 依次尝试数据源
    for (const source of sources) {
        try {
            const location = await source();
            if (location) {
                ipLocationCache.set(cleanIP, location);
                return location;
            }
        } catch (error) {
            continue;
        }
    }
    
    // 所有数据源都失败
    const fallback = '未知';
    ipLocationCache.set(cleanIP, fallback);
    return fallback;
}

// 文件锁机制
let isWritingStats = false;
const writeQueue = [];

// 安全写入统计文件
async function safeWriteStats(stats) {
    return new Promise((resolve, reject) => {
        writeQueue.push({ stats, resolve, reject });
        processWriteQueue();
    });
}

async function processWriteQueue() {
    if (isWritingStats || writeQueue.length === 0) {
        return;
    }

    isWritingStats = true;
    const { stats, resolve, reject } = writeQueue.shift();

    try {
        // 转换Set为数组保存
        const dailyStats = {};
        Object.keys(stats.daily).forEach(date => {
            dailyStats[date] = {
                ...stats.daily[date],
                uniqueIPs: Array.from(stats.daily[date].uniqueIPs)
            };
        });

        const saveStats = {
            ...stats,
            daily: dailyStats,
            lastUpdated: new Date().toISOString()
        };

        // 写入临时文件，然后原子性重命名
        const tempFile = STATS_FILE + '.tmp';
        await writeFileAsync(tempFile, JSON.stringify(saveStats, null, 2));
        await renameAsync(tempFile, STATS_FILE);

        resolve();
    } catch (error) {
        console.error('安全写入统计文件失败:', error);
        reject(error);
    } finally {
        isWritingStats = false;
        // 处理队列中的下一个写入操作
        setImmediate(processWriteQueue);
    }
}

// 信任反向代理，正确获取客户端真实IP
app.set('trust proxy', true);

// 中间件配置
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"]
        }
    }
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 访问统计中间件
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    // 优先从 Cloudflare 头获取真实客户端IP，然后是其他代理头
    // CF-Connecting-IP: Cloudflare 提供的真实用户 IP
    // X-Real-IP: Nginx 代理头
    // X-Forwarded-For: 标准代理头（取第一个IP）
    const ip = req.headers['cf-connecting-ip'] ||
               req.headers['x-real-ip'] || 
               (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 
               req.ip || 
               req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || '';
    const referer = req.get('Referer') || '';
    
    // 检测是否为恶意请求
    const url = req.url.toLowerCase();
    const isMalicious = maliciousPatterns.some(pattern => pattern.test(url));

    const logEntry = {
        timestamp,
        ip,
        method: req.method,
        url: req.url,
        userAgent,
        referer,
        isMalicious // 标记是否为恶意请求
    };

    // 异步写入访问日志和更新统计
    setImmediate(async () => {
        try {
            await appendFileAsync(LOG_FILE, JSON.stringify(logEntry) + '\n');
            await rotateLogIfNeeded();
            await updateStatsAsync(logEntry);
        } catch (error) {
            console.error('写入日志或更新统计失败:', error);
        }
    });

    next();
});

// 日志轮转功能
async function rotateLogIfNeeded() {
    try {
        if (fs.existsSync(LOG_FILE)) {
            const stats = await statAsync(LOG_FILE);
            const fileSizeMB = stats.size / (1024 * 1024);

            // 如果日志文件超过50MB，进行轮转
            if (fileSizeMB > 50) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupFile = path.join(__dirname, `access-${timestamp}.log`);
                await renameAsync(LOG_FILE, backupFile);
                console.log(`日志文件已轮转: ${backupFile}`);
            }
        }
    } catch (error) {
        console.error('日志轮转失败:', error);
    }
}

// 异步更新统计数据
async function updateStatsAsync(logEntry) {
    try {
        let stats = await getStatsAsync();
        const today = getToday();

        // 初始化今日数据
        if (!stats.daily[today]) {
            stats.daily[today] = {
                totalVisits: 0,
                uniqueIPs: new Set(),
                pages: {}
            };
        }

        // 更新统计
        stats.totalVisits++;
        stats.daily[today].totalVisits++;
        stats.daily[today].uniqueIPs.add(logEntry.ip);

        // 页面访问统计
        if (!stats.daily[today].pages[logEntry.url]) {
            stats.daily[today].pages[logEntry.url] = 0;
        }
        stats.daily[today].pages[logEntry.url]++;

        // IP统计
        if (!stats.ipStats[logEntry.ip]) {
            stats.ipStats[logEntry.ip] = {
                count: 0,
                maliciousCount: 0,
                firstVisit: logEntry.timestamp,
                lastVisit: logEntry.timestamp
            };
        }
        stats.ipStats[logEntry.ip].count++;
        stats.ipStats[logEntry.ip].lastVisit = logEntry.timestamp;
        
        // 记录恶意请求次数
        if (logEntry.isMalicious) {
            stats.ipStats[logEntry.ip].maliciousCount = (stats.ipStats[logEntry.ip].maliciousCount || 0) + 1;
        }

        // 使用安全写入机制
        await safeWriteStats(stats);
    } catch (error) {
        console.error('更新统计数据失败:', error);
    }
}

// 获取当前日期(中国时区)
function getToday() {
    const now = new Date();
    const chinaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000)); // UTC+8
    return chinaTime.toISOString().split('T')[0];
}

// 异步获取统计数据
async function getStatsAsync() {
    try {
        if (fs.existsSync(STATS_FILE)) {
            const fileContent = await readFileAsync(STATS_FILE, 'utf8');
            const data = JSON.parse(fileContent);
            // 恢复Set对象
            if (data.daily) {
                Object.keys(data.daily).forEach(date => {
                    data.daily[date].uniqueIPs = new Set(data.daily[date].uniqueIPs || []);
                });
            }
            return data;
        }
    } catch (error) {
        console.error('读取统计数据失败:', error);
        // JSON解析失败时，重置统计文件
        const defaultStats = {
            totalVisits: 0,
            daily: {},
            ipStats: {},
            createdAt: new Date().toISOString()
        };
        try {
            await safeWriteStats(defaultStats);
            console.log('已重置统计数据文件');
        } catch (writeError) {
            console.error('重置统计数据文件失败:', writeError);
        }
        return defaultStats;
    }

    return {
        totalVisits: 0,
        daily: {},
        ipStats: {},
        createdAt: new Date().toISOString()
    };
}

// 获取统计数据（同步版本，为兼容性保留）
function getStats() {
    try {
        if (fs.existsSync(STATS_FILE)) {
            const fileContent = fs.readFileSync(STATS_FILE, 'utf8');
            const data = JSON.parse(fileContent);
            // 恢复Set对象
            if (data.daily) {
                Object.keys(data.daily).forEach(date => {
                    data.daily[date].uniqueIPs = new Set(data.daily[date].uniqueIPs || []);
                });
            }
            return data;
        }
    } catch (error) {
        console.error('读取统计数据失败:', error);
        // JSON解析失败时，返回默认数据
        return {
            totalVisits: 0,
            daily: {},
            ipStats: {},
            createdAt: new Date().toISOString()
        };
    }

    return {
        totalVisits: 0,
        daily: {},
        ipStats: {},
        createdAt: new Date().toISOString()
    };
}

// 静态文件服务
app.use(express.static('.', {
    extensions: ['html'],
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.set('Cache-Control', 'no-cache');
        }
    }
}));

// 后台管理API - 验证密码
app.post('/api/admin/login', (req, res) => {
    try {
        const { password } = req.body;

        // 输入验证
        if (!password || typeof password !== 'string') {
            return res.status(400).json({ success: false, message: '密码格式无效' });
        }

        if (password === ADMIN_PASSWORD) {
            res.json({ success: true, message: '登录成功' });
        } else {
            res.status(401).json({ success: false, message: '密码错误' });
        }
    } catch (error) {
        console.error('登录验证失败:', error);
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

// 获取统计数据API
app.get('/api/admin/stats', async (req, res) => {
    try {
        const { period = 'day', filter = 'all' } = req.query;

        // 输入验证
        const validPeriods = ['day', 'week', 'month', 'last3days'];
        if (!validPeriods.includes(period)) {
            return res.status(400).json({ message: '无效的时间周期参数' });
        }

        // 对于last3days，我们需要从原始日志计算，因为stats.json是按天聚合的
        if (period === 'last3days') {
            try {
                const data = await getHourlyStatsFromLog();
                return res.json(data);
            } catch (error) {
                console.error('获取最近3日统计失败:', error);
                return res.status(500).json({ message: '服务器内部错误' });
            }
        }

        // 对于 day, week, month，继续使用现有的同步逻辑
        const stats = getStats();

        // 处理统计数据
        const now = new Date();
        const result = {
            totalVisits: stats.totalVisits,
            totalIPs: Object.keys(stats.ipStats).length,
            periodData: []
        };

        // 根据周期生成数据
        if (period === 'day') {
            // 最近30天
            for (let i = 29; i >= 0; i--) {
                const date = new Date(now);
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];

                const dayData = stats.daily[dateStr] || { totalVisits: 0, uniqueIPs: new Set() };
                result.periodData.push({
                    date: dateStr,
                    visits: dayData.totalVisits,
                    uniqueIPs: dayData.uniqueIPs instanceof Set ? dayData.uniqueIPs.size : (Array.isArray(dayData.uniqueIPs) ? dayData.uniqueIPs.length : 0)
                });
            }
        } else if (period === 'week') {
            // 最近12周，修复横坐标显示问题
            for (let i = 11; i >= 0; i--) {
                const weekStart = new Date(now);
                weekStart.setDate(weekStart.getDate() - (weekStart.getDay() + i * 7));
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 6);

                let weekVisits = 0;
                const weekIPs = new Set();

                for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
                    const dateStr = d.toISOString().split('T')[0];
                    const dayData = stats.daily[dateStr];
                    if (dayData) {
                        weekVisits += dayData.totalVisits;
                        // 支持 Set 和 Array 两种格式
                        if (dayData.uniqueIPs instanceof Set) {
                            dayData.uniqueIPs.forEach(ip => weekIPs.add(ip));
                        } else if (Array.isArray(dayData.uniqueIPs)) {
                            dayData.uniqueIPs.forEach(ip => weekIPs.add(ip));
                        }
                    }
                }

                // 修复：使用周开始日期作为横坐标，格式化为易读格式
                const weekLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;

                result.periodData.push({
                    date: weekStart.toISOString().split('T')[0], // 保持ISO格式用于图表解析
                    label: weekLabel, // 添加显示标签
                    visits: weekVisits,
                    uniqueIPs: weekIPs.size
                });
            }
        } else if (period === 'month') {
            // 最近12个月
            for (let i = 11; i >= 0; i--) {
                const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);

                let monthVisits = 0;
                const monthIPs = new Set();

                for (let d = new Date(month); d <= monthEnd; d.setDate(d.getDate() + 1)) {
                    const dateStr = d.toISOString().split('T')[0];
                    const dayData = stats.daily[dateStr];
                    if (dayData) {
                        monthVisits += dayData.totalVisits;
                        // 支持 Set 和 Array 两种格式
                        if (dayData.uniqueIPs instanceof Set) {
                            dayData.uniqueIPs.forEach(ip => monthIPs.add(ip));
                        } else if (Array.isArray(dayData.uniqueIPs)) {
                            dayData.uniqueIPs.forEach(ip => monthIPs.add(ip));
                        }
                    }
                }

                result.periodData.push({
                    date: `${month.getFullYear()}-${(month.getMonth() + 1).toString().padStart(2, '0')}`,
                    visits: monthVisits,
                    uniqueIPs: monthIPs.size
                });
            }
        }

        // 热门IP统计 - 支持分页和过滤
        const page = parseInt(req.query.page) || 1;
        const pageSize = 20;
        
        let allIPs = Object.entries(stats.ipStats)
            .map(([ip, data]) => ({ 
                ip, 
                ...data,
                isBlacklisted: isBlacklistedIP(ip, stats.ipStats)
            }))
            .sort((a, b) => b.count - a.count);
        
        // 根据filter参数过滤
        if (filter === 'blacklist') {
            // 黑名单：只显示黑名单IP
            allIPs = allIPs.filter(ip => ip.isBlacklisted);
        } else {
            // 访问IP：只显示非黑名单IP
            allIPs = allIPs.filter(ip => !ip.isBlacklisted);
        }
        
        const totalIPs = allIPs.length;
        const totalPages = Math.ceil(totalIPs / pageSize);
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedIPs = allIPs.slice(startIndex, endIndex);

        // 获取IP地理位置
        result.topIPs = await Promise.all(paginatedIPs.map(async (item) => {
            const location = await getIPLocation(item.ip);
            return { ...item, location };
        }));
        
        // 添加分页信息
        result.pagination = {
            currentPage: page,
            pageSize: pageSize,
            totalIPs: totalIPs,
            totalPages: totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
        };
        
        // 添加黑名单总数（用于标签页显示）
        const blacklistTotal = Object.entries(stats.ipStats)
            .filter(([ip, data]) => isBlacklistedIP(ip, stats.ipStats))
            .length;
        result.blacklistCount = blacklistTotal;

        res.json(result);
    } catch (error) {
        console.error('获取统计数据失败:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// 新函数：从日志文件异步获取每小时统计（修复数据统计逻辑）
async function getHourlyStatsFromLog() {
    const hourlyStats = {};
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000); // 改为24小时

    // 初始化最近24小时的骨架数据
    for (let i = 0; i < 24; i++) {
        const hour = new Date(twentyFourHoursAgo);
        hour.setHours(hour.getHours() + i, 0, 0, 0);
        const hourKey = hour.toISOString();
        hourlyStats[hourKey] = {
            date: hourKey,
            visits: 0,
            uniqueIPs: new Set(),
        };
    }

    if (fs.existsSync(LOG_FILE)) {
        const readline = require('readline');
        const logStream = fs.createReadStream(LOG_FILE, { encoding: 'utf8' });
        const rl = readline.createInterface({
            input: logStream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            try {
                if (line.trim() === '') continue;
                const logEntry = JSON.parse(line);
                const logDate = new Date(logEntry.timestamp);

                if (logDate >= twentyFourHoursAgo) {
                    const hourKey = new Date(logDate.getFullYear(), logDate.getMonth(), logDate.getDate(), logDate.getHours()).toISOString();
                    if (hourlyStats[hourKey]) {
                        hourlyStats[hourKey].visits++;
                        hourlyStats[hourKey].uniqueIPs.add(logEntry.ip);
                    }
                }
            } catch (e) {
                // 忽略无法解析的行
            }
        }
    }

    const periodData = Object.values(hourlyStats).map(hourData => ({
        date: hourData.date,
        visits: hourData.visits,
        uniqueIPs: hourData.uniqueIPs.size,
    }));

    // 由于是独立接口，这里也返回 topIPs
    const stats = getStats();
    const topIPs = Object.entries(stats.ipStats)
        .map(([ip, data]) => ({ ip, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return { periodData, topIPs };
}

// 获取实时数据
app.get('/api/admin/realtime', (req, res) => {
    try {
        const stats = getStats();
        const today = getToday();
        const todayData = stats.daily[today] || { totalVisits: 0, uniqueIPs: [] };

        res.json({
            todayVisits: todayData.totalVisits,
            todayUniqueIPs: todayData.uniqueIPs instanceof Set ? todayData.uniqueIPs.size : (Array.isArray(todayData.uniqueIPs) ? todayData.uniqueIPs.length : 0),
            totalVisits: stats.totalVisits,
            totalIPs: Object.keys(stats.ipStats).length
        });
    } catch (error) {
        console.error('获取实时数据失败:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// 重新计算恶意请求次数（管理员工具）
app.post('/api/admin/recalculate', async (req, res) => {
    try {
        const maliciousCounts = await recalculateMaliciousCount();
        res.json({ 
            success: true, 
            message: '重新计算完成',
            updatedIPs: Object.keys(maliciousCounts).length
        });
    } catch (error) {
        console.error('重新计算失败:', error);
        res.status(500).json({ success: false, message: '重新计算失败' });
    }
});

// 管理后台路由
app.get('/admin-pro', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-pro.html'));
});

// 默认路由 - 返回首页
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`方舟计划网站服务器运行在端口 ${PORT}`);
    console.log(`访问地址: http://localhost:${PORT}`);
    console.log(`管理后台: http://localhost:${PORT}/admin-pro`);
});

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('收到SIGTERM信号，正在关闭服务器...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('收到SIGINT信号，正在关闭服务器...');
    process.exit(0);
}); 