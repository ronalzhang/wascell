const path = require('node:path');
module.exports = { apps: [{
    name: 'wascell-website',
    cwd: __dirname,
    script: path.join(__dirname, 'scripts/start-production.sh'),
    interpreter: '/bin/sh',
    max_memory_restart: '384M',
    restart_delay: 3000,
    kill_timeout: 12000,
    env: { NODE_ENV: 'production' },
}] };
