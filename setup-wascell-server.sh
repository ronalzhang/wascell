#!/bin/bash

# WASCELL 服务器设置脚本 - 启动应用并配置Nginx

SERVER_IP="156.236.74.200"
SERVER_PASS="Pr971V3j"
APP_NAME="wascell-website"
DOMAIN="wascell.com"

echo "🚀 设置 WASCELL 应用和 Nginx 配置..."

sshpass -p "$SERVER_PASS" ssh root@$SERVER_IP "
    cd /root/wascell
    
    echo '� 安装  Node.js（如果未安装）...'
    if ! command -v node &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
    fi
    
    echo '📦 在应用目录下安装依赖...'
    npm install --production
    
    echo '🔧 检查并安装 PM2...'
    if ! command -v pm2 &> /dev/null; then
        npm install -g pm2
    fi
    
    echo '🛑 停止现有应用（如果存在）...'
    pm2 stop $APP_NAME 2>/dev/null || true
    pm2 delete $APP_NAME 2>/dev/null || true
    
    echo '🚀 启动应用...'
    pm2 start app.js --name $APP_NAME --env production --cwd /root/wascell
    
    echo '💾 保存 PM2 配置...'
    pm2 save
    pm2 startup
    
    echo '📊 检查应用状态...'
    pm2 status $APP_NAME
    
    echo '🌐 检查应用是否在端口3003运行...'
    sleep 3
    if curl -s http://localhost:3003 | head -n 1; then
        echo '✅ 应用运行正常'
    else
        echo '⚠️ 应用可能需要更多时间启动'
    fi
    
    echo '🔧 检查并安装 Nginx...'
    if ! command -v nginx &> /dev/null; then
        apt update
        apt install -y nginx
        systemctl enable nginx
    fi
    
    echo '📝 创建 Nginx 配置文件（先使用HTTP）...'
    cat > /etc/nginx/sites-available/$DOMAIN << 'EOF'
server {
    listen 80;
    server_name wascell.com www.wascell.com;
    
    # 日志配置
    access_log /var/log/nginx/wascell.com.access.log;
    error_log /var/log/nginx/wascell.com.error.log;
    
    # 反向代理到 Node.js 应用
    location / {
        proxy_pass http://127.0.0.1:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # 静态文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        expires 1y;
        add_header Cache-Control \"public, immutable\";
    }
    
    # 健康检查
    location /health {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host \$host;
        access_log off;
    }
}
EOF
    
    echo '🔗 启用站点配置...'
    ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    
    echo '🧪 测试 Nginx 配置...'
    nginx -t
    
    if [ \$? -eq 0 ]; then
        echo '🔄 重载 Nginx 配置...'
        systemctl reload nginx
        systemctl enable nginx
        echo '✅ Nginx 配置完成'
    else
        echo '❌ Nginx 配置测试失败'
        exit 1
    fi
    
    echo '📊 显示服务状态...'
    echo '--- PM2 状态 ---'
    pm2 status
    echo '--- Nginx 状态 ---'
    systemctl status nginx --no-pager -l
    
    echo '🎉 设置完成！'
    echo '📍 应用地址: http://wascell.com (或 http://$SERVER_IP)'
    echo '🔧 管理后台: http://wascell.com/admin-pro'
    echo '🔑 管理密码: 123abc74531'
    echo '💡 如需HTTPS，请运行SSL配置脚本'
"