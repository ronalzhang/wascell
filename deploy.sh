#!/bin/bash

# WASCELL 网站部署脚本
# 用于将本地更改部署到服务器

set -e

echo "🚀 开始部署 WASCELL 网站..."

# 配置信息
SERVER_IP="156.227.235.254"
SERVER_USER="root"
SERVER_PASS="Pr971V3j"
APP_DIR="/root/wascell"
APP_NAME="wascell-website"

# 1. 推送代码到 GitHub
echo "📤 推送代码到 GitHub..."
git add .
git commit -m "更新: $(date '+%Y-%m-%d %H:%M:%S')" || echo "没有需要提交的更改"
git push origin main

# 2. 在服务器上拉取最新代码
echo "📥 在服务器上拉取最新代码..."
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "cd $APP_DIR && git pull origin main"

# 3. 安装依赖（如果有更新）
echo "📦 更新依赖包..."
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "cd $APP_DIR && npm install --production"

# 4. 重启应用
echo "🔄 重启应用..."
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "pm2 restart $APP_NAME"

# 5. 检查应用状态
echo "✅ 检查应用状态..."
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "pm2 status | grep $APP_NAME"

# 6. 显示应用日志
echo "📋 最新日志："
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "pm2 logs $APP_NAME --lines 5 --nostream"

echo "🎉 部署完成！"
echo "📍 网站地址: https://wascell.com"
echo "🔧 管理后台: https://wascell.com/admin-pro"
echo "🔑 管理密码: 123abc74531"
echo "🔒 SSL证书: 已配置 (自动续期)" 