#!/bin/bash

# 新服务器环境检查脚本
# 在运行deploy-n.sh前使用此脚本验证环境

SERVER_IP="43.134.38.231"
SERVER_USER="ubuntu"
SERVER_PASS="Pr971V3j"
APP_DIR="/ubuntu/wascell"

echo "🔍 检查新服务器环境..."

# 检查基本连接
echo "1. 测试SSH连接..."
if sshpass -p "$SERVER_PASS" ssh -o ConnectTimeout=10 "$SERVER_USER@$SERVER_IP" "echo '连接成功'"; then
    echo "✅ SSH连接正常"
else
    echo "❌ SSH连接失败"
    exit 1
fi

# 检查必要的软件
echo "2. 检查必要软件..."
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "
    echo 'Node.js版本：' && node --version
    echo 'NPM版本：' && npm --version
    echo 'Git版本：' && git --version
    echo 'PM2状态：' && pm2 --version
"

# 检查目录和权限
echo "3. 检查应用目录..."
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "
    if [ -d '$APP_DIR' ]; then
        echo '✅ 应用目录存在：$APP_DIR'
        ls -la $APP_DIR
    else
        echo '❌ 应用目录不存在：$APP_DIR'
        echo '建议执行：sudo mkdir -p $APP_DIR && sudo chown -R ubuntu:ubuntu $APP_DIR'
    fi
"

echo "检查完成！"