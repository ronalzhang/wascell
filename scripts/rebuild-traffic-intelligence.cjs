#!/usr/bin/env node
const path = require('node:path');
const { listAccessLogs, rebuildTrafficIntelligence } = require('../lib/traffic-intelligence');

function option(name, fallback) {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
    if (process.argv.includes('--help')) {
        console.log('Usage: node scripts/rebuild-traffic-intelligence.cjs [--log-dir <dir>] [--stats-file <file>]');
        return;
    }
    const logDir = path.resolve(option('--log-dir', process.cwd()));
    const statsFile = path.resolve(option('--stats-file', path.join(process.cwd(), 'stats.json')));
    const result = await rebuildTrafficIntelligence({ logFiles: await listAccessLogs(logDir), statsFile });
    console.log(JSON.stringify(result));
}

main().catch((error) => {
    console.error(`traffic intelligence rebuild failed: ${error.message}`);
    process.exitCode = 1;
});
