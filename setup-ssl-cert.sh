#!/bin/bash

# SSL 证书配置脚本 - 使用 Let's Encrypt

SERVER_IP="156.236.74.200"
SERVER_PASS="Pr971V3j"
DOMAIN="wascell.com"

echo "🔒 配置 SSL 证书..."

sshpass -p "$SERVER_PASS" ssh root@$SERVER_IP "
    echo '📦 安装 Certbot...'
    apt update
    apt install -y certbot python3-certbot-nginx
    
    echo '🛑 临时停止 Nginx...'
    systemctl stop nginx
    
    echo '🔒 获取 SSL 证书...'
    certbot certonly --standalone -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN
    
    if [ \$? -eq 0 ]; then
        echo '✅ SSL 证书获取成功'
        
        echo '📝 更新 Nginx 配置使用 Let\'s Encrypt 证书...'
        sed -i 's|ssl_certificate /etc/ssl/certs/wascell.com.crt;|ssl_certificate /etc/letsencrypt/live/wascell.com/fullchain.pem;|' /etc/nginx/sites-available/$DOMAIN
        sed -i 's|ssl_certificate_key /etc/ssl/private/wascell.com.key;|ssl_certificate_key /etc/letsencrypt/live/wascell.com/privkey.pem;|' /etc/nginx/sites-available/$DOMAIN
        
        echo '🧪 测试 Nginx 配置...'
        nginx -t
        
        if [ \$? -eq 0 ]; then
            echo '🚀 启动 Nginx...'
            systemctl start nginx
            
            echo '⏰ 设置证书自动续期...'
            (crontab -l 2>/dev/null; echo '0 12 * * * /usr/bin/certbot renew --quiet --post-hook \"systemctl reload nginx\"') | crontab -
            
            echo '✅ SSL 配置完成'
        else
            echo '❌ Nginx 配置错误'
            exit 1
        fi
    else
        echo '❌ SSL 证书获取失败'
        echo '🔄 启动 Nginx（使用HTTP）...'
        systemctl start nginx
        exit 1
    fi
    
    echo '🌐 测试网站访问...'
    sleep 5
    curl -I https://$DOMAIN || curl -I http://$DOMAIN
"