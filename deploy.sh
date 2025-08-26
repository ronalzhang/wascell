#!/bin/bash

# WASCELL 网站部署脚本
# 用于将本地更改部署到服务器

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 加载部署配置
if [ -f ".env.deploy" ]; then
    echo "📋 加载部署配置..."
    export $(cat .env.deploy | grep -v '^#' | xargs)
fi

echo "🚀 开始部署 WASCELL 网站..."

# 配置信息（从环境变量读取，如果没有则使用默认值）
SERVER_IP="${DEPLOY_SERVER_IP:-156.232.13.240}"
SERVER_USER="${DEPLOY_SERVER_USER:-root}"
SERVER_PASS="${DEPLOY_SERVER_PASS:-Pr971V3j}"
APP_DIR="${DEPLOY_APP_DIR:-/root/wascell}"
APP_NAME="${DEPLOY_APP_NAME:-wascell-website}"

# 网络超时设置
TIMEOUT=30

# 检查timeout命令（macOS兼容性）
if command -v gtimeout > /dev/null; then
    TIMEOUT_CMD="gtimeout $TIMEOUT"
elif command -v timeout > /dev/null; then
    TIMEOUT_CMD="timeout $TIMEOUT"
else
    TIMEOUT_CMD=""
    echo "⚠️  timeout命令不可用，将不使用超时限制"
fi

# Git推送函数（带重试机制）
push_to_github() {
    echo "📤 推送代码到 GitHub..."
    
    # 检查是否有待提交的更改
    if git diff-index --quiet HEAD --; then
        echo "ℹ️  没有需要提交的更改"
        return 0
    fi
    
    # 提交更改
    git add .
    git commit -m "更新: $(date '+%Y-%m-%d %H:%M:%S')" || echo "提交失败或无更改"
    
    # 尝试推送，最多重试3次
    for i in {1..3}; do
        echo "🔄 尝试推送 (第 $i 次)..."
        if [ -n "$TIMEOUT_CMD" ]; then
            $TIMEOUT_CMD git push origin main
        else
            git push origin main
        fi
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ GitHub推送成功${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️  推送失败，等待 5 秒后重试...${NC}"
            sleep 5
        fi
    done
    
    echo -e "${RED}❌ GitHub推送失败，但继续部署到服务器${NC}"
    echo -e "${YELLOW}💡 提示：请稍后手动推送到GitHub或检查网络连接${NC}"
    return 1
}

# 1. 尝试推送代码到 GitHub（如果失败不影响服务器部署）
push_to_github || echo "⚠️  跳过GitHub推送，直接部署到服务器"

# 2. 检查服务器连接
echo "🔍 检查服务器连接..."
if [ -n "$TIMEOUT_CMD" ]; then
    SSH_CMD="$TIMEOUT_CMD sshpass -p \"$SERVER_PASS\" ssh -o ConnectTimeout=10 \"$SERVER_USER@$SERVER_IP\" \"echo '✅ 服务器连接成功'\""
else
    SSH_CMD="sshpass -p \"$SERVER_PASS\" ssh -o ConnectTimeout=10 \"$SERVER_USER@$SERVER_IP\" \"echo '✅ 服务器连接成功'\""
fi

if ! eval $SSH_CMD; then
    echo -e "${RED}❌ 服务器连接失败，请检查IP、用户名和密码${NC}"
    exit 1
fi

# 3. 在服务器上拉取最新代码（如果GitHub推送失败则跳过）
echo "📥 同步代码到服务器..."

# 先检查服务器上Git仓库状态
SERVER_REPO_STATUS=$(sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "cd $APP_DIR && git status --porcelain" 2>/dev/null || echo "ERROR")

if [ "$SERVER_REPO_STATUS" != "ERROR" ]; then
    echo "🔧 清理服务器上的未跟踪文件..."
    sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "cd $APP_DIR && git clean -fd"
    echo "🔄 重置本地更改..."
    sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "cd $APP_DIR && git reset --hard HEAD"
    
    echo "📥 尝试从GitHub拉取最新代码..."
    if [ -n "$TIMEOUT_CMD" ]; then
        PULL_CMD="$TIMEOUT_CMD sshpass -p \"$SERVER_PASS\" ssh \"$SERVER_USER@$SERVER_IP\" \"cd $APP_DIR && git pull origin main\""
    else
        PULL_CMD="sshpass -p \"$SERVER_PASS\" ssh \"$SERVER_USER@$SERVER_IP\" \"cd $APP_DIR && git pull origin main\""
    fi
    
    if eval $PULL_CMD; then
        echo -e "${GREEN}✅ 代码同步成功${NC}"
    else
        echo -e "${YELLOW}⚠️  GitHub拉取失败，尝试其他方式同步代码...${NC}"
        
        # 备选方案：直接从本地rsync同步代码
        echo "🔄 使用rsync直接同步代码文件..."
        if which rsync > /dev/null; then
            # 排除不需要同步的文件
            rsync -avz --progress \
                --exclude='.git/' \
                --exclude='node_modules/' \
                --exclude='venv/' \
                --exclude='access.log' \
                --exclude='stats.json' \
                ./ "$SERVER_USER@$SERVER_IP:$APP_DIR/" \
                -e "sshpass -p '$SERVER_PASS' ssh -o StrictHostKeyChecking=no"
            echo -e "${GREEN}✅ 代码文件同步完成${NC}"
        else
            echo -e "${RED}❌ rsync不可用，请安装rsync或手动同步代码${NC}"
            exit 1
        fi
    fi
else
    echo -e "${YELLOW}⚠️  无法检查服务器Git状态，跳过Git操作${NC}"
fi

# 4. 安装依赖（如果有更新）
echo "📦 更新依赖包..."
if [ -n "$TIMEOUT_CMD" ]; then
    NPM_CMD="$TIMEOUT_CMD sshpass -p \"$SERVER_PASS\" ssh \"$SERVER_USER@$SERVER_IP\" \"cd $APP_DIR && npm install --production\""
else
    NPM_CMD="sshpass -p \"$SERVER_PASS\" ssh \"$SERVER_USER@$SERVER_IP\" \"cd $APP_DIR && npm install --production\""
fi

if ! eval $NPM_CMD; then
    echo -e "${YELLOW}⚠️  依赖安装失败，但继续部署...${NC}"
fi

# 5. 重启应用
echo "🔄 重启应用..."
if ! sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "cd $APP_DIR && pm2 restart $APP_NAME 2>/dev/null"; then
    echo -e "${YELLOW}⚠️  重启失败，尝试删除并重新创建应用...${NC}"
    sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "cd $APP_DIR && pm2 delete $APP_NAME 2>/dev/null || true"
    sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "cd $APP_DIR && pm2 start app.js --name $APP_NAME" || {
        echo -e "${RED}❌ 应用启动失败，请手动检查${NC}"
        exit 1
    }
    echo -e "${GREEN}✅ 应用重新创建成功${NC}"
fi

# 保存PM2配置
echo "💾 保存PM2配置..."
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "pm2 save"

# 6. 检查应用状态
echo "✅ 检查应用状态..."
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "pm2 status | grep $APP_NAME" || {
    echo -e "${YELLOW}⚠️  无法获取应用状态${NC}"
}

# 7. 显示应用日志
echo "📋 最新日志："
sshpass -p "$SERVER_PASS" ssh "$SERVER_USER@$SERVER_IP" "pm2 logs $APP_NAME --lines 5 --nostream" 2>/dev/null || echo -e "${YELLOW}⚠️  无法获取日志${NC}"

# 8. 测试网站访问
echo "🌐 测试网站访问..."
sleep 3
if curl -s -o /dev/null -w '%{http_code}' https://wascell.com | grep -q '200'; then
    echo -e "${GREEN}✅ 网站访问正常${NC}"
else
    echo -e "${YELLOW}⚠️  网站可能需要几秒钟才能响应${NC}"
fi

echo -e "${GREEN}🎉 部署完成！${NC}"
echo "📍 网站地址: https://wascell.com"
echo "🔧 管理后台: https://wascell.com/admin-pro"
echo "🔑 管理密码: 123abc74531"
echo "🔒 SSL证书: 已配置 (自动续期)"

# 网络问题提示
echo ""
echo -e "${YELLOW}💡 网络问题解决提示：${NC}"
echo "   如果遇到GitHub连接问题，脚本会自动："
echo "   1. 重试GitHub推送（最多3次）"
echo "   2. 如果推送失败，直接同步代码到服务器"
echo "   3. 使用rsync作为备选同步方案"
echo "   请确保稍后手动推送代码到GitHub" 