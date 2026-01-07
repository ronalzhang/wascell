#!/usr/bin/env node
/**
 * 修复 stats.json 中的 uniqueIPs 数据
 * 从 access.log 重新计算每日独立 IP
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'access.log');
const STATS_FILE = path.join(__dirname, 'stats.json');

async function fixStats() {
    console.log('开始修复统计数据...');
    
    // 读取现有 stats.json
    let stats;
    try {
        stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    } catch (e) {
        console.error('无法读取 stats.json:', e.message);
        return;
    }

    // 从日志重新计算每日独立 IP
    const dailyIPs = {}; // { '2025-10-29': Set(['ip1', 'ip2']) }
    const allIPs = {};   // { 'ip': { count, firstVisit, lastVisit } }

    if (!fs.existsSync(LOG_FILE)) {
        console.error('access.log 不存在');
        return;
    }

    const fileStream = fs.createReadStream(LOG_FILE, { encoding: 'utf8' });
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let lineCount = 0;
    let validCount = 0;

    for await (const line of rl) {
        lineCount++;
        if (!line.trim()) continue;

        try {
            const entry = JSON.parse(line);
            const ip = entry.ip;
            const timestamp = entry.timestamp;
            
            // 跳过本地 IP
            if (ip === '127.0.0.1' || ip === '::ffff:127.0.0.1' || ip === '::1') {
                continue;
            }

            validCount++;
            const date = timestamp.split('T')[0];

            // 更新每日独立 IP
            if (!dailyIPs[date]) {
                dailyIPs[date] = new Set();
            }
            dailyIPs[date].add(ip);

            // 更新 IP 统计
            if (!allIPs[ip]) {
                allIPs[ip] = {
                    count: 0,
                    firstVisit: timestamp,
                    lastVisit: timestamp
                };
            }
            allIPs[ip].count++;
            allIPs[ip].lastVisit = timestamp;

        } catch (e) {
            // 忽略无法解析的行
        }
    }

    console.log(`处理了 ${lineCount} 行日志，${validCount} 条有效记录（排除本地IP）`);

    // 更新 stats.json 中的 uniqueIPs
    let updatedDays = 0;
    for (const date of Object.keys(stats.daily)) {
        if (dailyIPs[date]) {
            stats.daily[date].uniqueIPs = Array.from(dailyIPs[date]);
            updatedDays++;
            console.log(`  ${date}: ${dailyIPs[date].size} 个独立IP`);
        }
    }

    // 合并 IP 统计（保留原有数据，添加新数据）
    let newIPs = 0;
    for (const [ip, data] of Object.entries(allIPs)) {
        if (!stats.ipStats[ip]) {
            stats.ipStats[ip] = data;
            newIPs++;
        } else {
            // 更新访问次数和时间
            stats.ipStats[ip].count = Math.max(stats.ipStats[ip].count, data.count);
            if (data.firstVisit < stats.ipStats[ip].firstVisit) {
                stats.ipStats[ip].firstVisit = data.firstVisit;
            }
            if (data.lastVisit > stats.ipStats[ip].lastVisit) {
                stats.ipStats[ip].lastVisit = data.lastVisit;
            }
        }
    }

    // 删除本地 IP 记录
    delete stats.ipStats['127.0.0.1'];
    delete stats.ipStats['::ffff:127.0.0.1'];
    delete stats.ipStats['::1'];

    stats.lastUpdated = new Date().toISOString();

    // 保存修复后的数据
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    
    console.log(`\n修复完成！`);
    console.log(`  更新了 ${updatedDays} 天的数据`);
    console.log(`  新增 ${newIPs} 个独立IP记录`);
    console.log(`  总独立IP数: ${Object.keys(stats.ipStats).length}`);
}

fixStats().catch(console.error);
