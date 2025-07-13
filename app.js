const express = require('express');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

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

// 中间件配置
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
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
    const ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
    const userAgent = req.get('User-Agent') || '';
    const referer = req.get('Referer') || '';
    
    const logEntry = {
        timestamp,
        ip,
        method: req.method,
        url: req.url,
        userAgent,
        referer
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

// 更新统计数据
function updateStats(logEntry) {
    let stats = getStats();
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
            firstVisit: logEntry.timestamp,
            lastVisit: logEntry.timestamp
        };
    }
    stats.ipStats[logEntry.ip].count++;
    stats.ipStats[logEntry.ip].lastVisit = logEntry.timestamp;
    
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
        daily: dailyStats
    };
    
    // 写入统计文件
    fs.writeFile(STATS_FILE, JSON.stringify(saveStats, null, 2), (err) => {
        if (err) console.error('保存统计数据失败:', err);
    });
}

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
                firstVisit: logEntry.timestamp,
                lastVisit: logEntry.timestamp
            };
        }
        stats.ipStats[logEntry.ip].count++;
        stats.ipStats[logEntry.ip].lastVisit = logEntry.timestamp;
        
        // 转Set为数组保存
        const dailyStats = {};
        Object.keys(stats.daily).forEach(date => {
            dailyStats[date] = {
                ...stats.daily[date],
                uniqueIPs: Array.from(stats.daily[date].uniqueIPs)
            };
        });
        
        const saveStats = {
            ...stats,
            daily: dailyStats
        };
        
        // 异步写入统计文件
        await writeFileAsync(STATS_FILE, JSON.stringify(saveStats, null, 2));
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
            const data = JSON.parse(await readFileAsync(STATS_FILE, 'utf8'));
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
    }
    
    return {
        totalVisits: 0,
        daily: {},
        ipStats: {}
    };
}

// 获取统计数据
function getStats() {
    try {
        if (fs.existsSync(STATS_FILE)) {
            const data = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
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
    }
    
    return {
        totalVisits: 0,
        daily: {},
        ipStats: {}
    };
}

// 静态文件服务
app.use(express.static('.', {
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
app.get('/api/admin/stats', async (req, res) => { // 标记为 async
    try {
        const { period = 'day' } = req.query;
        
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
            
            const dayData = stats.daily[dateStr] || { totalVisits: 0, uniqueIPs: [] };
            result.periodData.push({
                date: dateStr,
                visits: dayData.totalVisits,
                uniqueIPs: Array.isArray(dayData.uniqueIPs) ? dayData.uniqueIPs.length : 0
            });
        }
    } else if (period === 'week') {
        // 最近12周
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
                    if (Array.isArray(dayData.uniqueIPs)) {
                        dayData.uniqueIPs.forEach(ip => weekIPs.add(ip));
                    }
                }
            }
            
            result.periodData.push({
                date: `${weekStart.toISOString().split('T')[0]} ~ ${weekEnd.toISOString().split('T')[0]}`,
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
                    if (Array.isArray(dayData.uniqueIPs)) {
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
    
    // 热门IP统计
    result.topIPs = Object.entries(stats.ipStats)
        .map(([ip, data]) => ({ ip, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    
    res.json(result);
    } catch (error) {
        console.error('获取统计数据失败:', error);
        res.status(500).json({ message: '服务器内部错误' });
    }
});

// 新函数：从日志文件异步获取每小时统计
async function getHourlyStatsFromLog() {
    const hourlyStats = {};
    const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

    // 初始化最近72小时的骨架数据
    for (let i = 0; i < 72; i++) {
        const hour = new Date(seventyTwoHoursAgo);
        hour.setHours(hour.getHours() + i, 0, 0, 0); // 将分钟、秒和毫秒归零
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

                if (logDate >= seventyTwoHoursAgo) {
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
            todayUniqueIPs: Array.isArray(todayData.uniqueIPs) ? todayData.uniqueIPs.length : 0,
            totalVisits: stats.totalVisits,
            totalIPs: Object.keys(stats.ipStats).length
        });
    } catch (error) {
        console.error('获取实时数据失败:', error);
        res.status(500).json({ message: '服务器内部错误' });
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
    console.log(`WASCELL网站服务器运行在端口 ${PORT}`);
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