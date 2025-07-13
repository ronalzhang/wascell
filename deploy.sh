#!/bin/bash

# WASCELL 网站部署脚本
# 用于将本地更改部署到服务器

set -e

# 加载部署配置
if [ -f ".env.deploy" ]; then
    echo "📋 加载部署配置..."
    export $(cat .env.deploy | grep -v '^#' | xargs)
fi

echo "🚀 开始部署 WASCELL 网站..."

# 配置信息（从环境变量读取，如果没有则使用默认值）
SERVER_IP="${DEPLOY_SERVER_IP:-156.236.74.200}"
SERVER_USER="${DEPLOY_SERVER_USER:-root}"
SERVER_PASS="${DEPLOY_SERVER_PASS:-Pr971V3j}"
APP_DIR="${DEPLOY_APP_DIR:-/root/wascell}"
APP_NAME="${DEPLOY_APP_NAME:-wascell-website}"

# 1. 推送代码到 GitHub
echo "📤 推送代码到 GitHub..."
git add .
git commit -m "更新: $(date '+%Y-%m-%d %H:%M:%S')" || echo "没有需要提交的更改"
git push origin main

# 2. 检查服务器连接
echo "🔍 检查服务器连接..."
if ! sshpass -p "$SERVER_PASS" ssh -o ConnectTimeout=10 "$SERVER_USER@$SERVER_IP" "echo '✅ 服务器连接成功'"; then
    echo "❌ 服务器连接失败，请检查IP、用户名和密码"
    exit 1
fi

# 3. 在服务器上拉取最新代码
echo "📥 在服务器上拉取最新代码..."
echo "🔧 清理服务器上的未跟踪文件..."
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "cd $APP_DIR && git clean -fd"
echo "🔄 重置本地更改..."
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "cd $APP_DIR && git reset --hard HEAD"
echo "📥 拉取最新代码..."
if ! sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "cd $APP_DIR && git pull origin main"; then
    echo "❌ Git拉取失败，尝试强制更新..."
    sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "cd $APP_DIR && git fetch origin && git reset --hard origin/main" || {
        echo "❌ 强制更新也失败，请手动检查Git仓库状态"
        echo "🔧 手动操作: ssh $SERVER_USER@$SERVER_IP 'cd $APP_DIR && git status'"
        exit 1
    }
fi

# 4. 安装依赖（如果有更新）
echo "📦 更新依赖包..."
if ! sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "cd $APP_DIR && npm install --production"; then
    echo "⚠️  依赖安装失败，但继续部署..."
fi

# 5. 重启应用
echo "🔄 重启应用..."
if ! sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "pm2 restart $APP_NAME 2>/dev/null || pm2 start $APP_DIR/app.js --name $APP_NAME"; then
    echo "❌ PM2重启失败，尝试直接启动..."
    sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "cd $APP_DIR && pm2 start app.js --name $APP_NAME" || {
        echo "❌ 应用启动失败，请手动检查"
        exit 1
    }
fi

# 6. 检查应用状态
echo "✅ 检查应用状态..."
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "pm2 status | grep $APP_NAME" || {
    echo "⚠️  无法获取应用状态"
}

# 7. 显示应用日志
echo "📋 最新日志："
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "pm2 logs $APP_NAME --lines 5 --nostream" 2>/dev/null || echo "⚠️  无法获取日志"

# 8. 测试网站访问
echo "🌐 测试网站访问..."
sleep 3
if curl -s -o /dev/null -w '%{http_code}' https://wascell.com | grep -q '200'; then
    echo "✅ 网站访问正常"
else
    echo "⚠️  网站可能需要几秒钟才能响应"
fi

echo "🎉 部署完成！"
echo "📍 网站地址: https://wascell.com"
echo "🔧 管理后台: https://wascell.com/admin-pro"
echo "🔑 管理密码: 123abc74531"
echo "🔒 SSL证书: 已配置 (自动续期)" 