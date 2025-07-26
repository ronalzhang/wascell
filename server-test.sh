#!/bin/bash

# WASCELL 服务器重启后自动启动验证脚本

set -e

# 加载部署配置
if [ -f ".env.deploy" ]; then
    echo "📋 加载部署配置..."
    export $(cat .env.deploy | grep -v '^#' | xargs)
fi

echo "🔄 服务器重启后状态检查..."

# 配置信息（与deploy.sh保持一致）
SERVER_IP="${DEPLOY_SERVER_IP:-156.236.74.200}"
SERVER_USER="${DEPLOY_SERVER_USER:-root}"
SERVER_PASS="${DEPLOY_SERVER_PASS:-Pr971V3j}"

echo "📡 检查服务器连接..."
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "echo '✅ 服务器连接正常'"

echo "🔍 检查PM2服务状态..."
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "pm2 status | grep -E '(online|stopped)'"

echo "🌐 检查Nginx状态..."
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "systemctl is-active nginx && echo '✅ Nginx运行正常'"

echo "🔒 检查SSL证书..."
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "ls -la /etc/letsencrypt/live/wascell.com/ | head -3"

echo "📱 测试网站访问..."
curl -s -o /dev/null -w 'WASCELL主页: %{http_code}\n' https://wascell.com
curl -s -o /dev/null -w 'WASCELL后台: %{http_code}\n' https://wascell.com/admin-pro

echo "🔑 测试密码验证..."
response=$(curl -s -X POST -H 'Content-Type: application/json' -d '{"password":"123abc74531"}' https://wascell.com/api/admin/login)
if echo "$response" | grep -q '"success":true'; then
    echo "✅ 密码验证正常"
else
    echo "❌ 密码验证失败"
fi

echo "🎉 所有服务检查完成！"
echo "📍 网站地址: https://wascell.com"
echo "🔧 管理后台: https://wascell.com/admin-pro"
echo "�� 管理密码: 123abc74531" 