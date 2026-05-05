#!/bin/bash
# 斗地主部署脚本（在服务器上执行）
# 用法: bash deploy.sh [nginx配置文件路径]
# 首次部署: 先在项目根目录 npm run build，然后传 dist/ 到服务器

set -e

# ========== 修改这里 ==========
DOMAIN="你的域名.com"          # 改成你的域名
SERVER_DIR="/var/www/doudizhu" # 网站文件目录
NGINX_CONF="/etc/nginx/conf.d/doudizhu.conf"
# ==============================

echo "=== 部署斗地主 ==="

# 1. 复制文件
echo "[1/4] 复制网站文件..."
sudo mkdir -p $SERVER_DIR
sudo cp -r ./dist/* $SERVER_DIR/
sudo chown -R www-data:www-data $SERVER_DIR 2>/dev/null || sudo chown -R nginx:nginx $SERVER_DIR 2>/dev/null

# 2. 生成 Nginx 配置
if [ ! -f "$NGINX_CONF" ]; then
  echo "[2/4] 创建 Nginx 配置..."
  sudo tee $NGINX_CONF > /dev/null << 'NGINX_EOF'
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    root SERVER_DIR_PLACEHOLDER;
    index index.html;

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    gzip on;
    gzip_types text/css application/javascript text/html;
    gzip_min_length 256;
}
NGINX_EOF

  sudo sed -i "s|DOMAIN_PLACEHOLDER|$DOMAIN|g" $NGINX_CONF
  sudo sed -i "s|SERVER_DIR_PLACEHOLDER|$SERVER_DIR|g" $NGINX_CONF
  echo "  Nginx 配置已创建"
else
  echo "[2/4] Nginx 配置已存在，跳过"
fi

# 3. 测试并重载 Nginx
echo "[3/4] 重载 Nginx..."
sudo nginx -t && sudo systemctl reload nginx

# 4. HTTPS (可选)
if ! command -v certbot &> /dev/null; then
  echo "[4/4] 提示: 执行 'apt install certbot python3-certbot-nginx' 安装 certbot"
  echo "  然后执行 'sudo certbot --nginx -d $DOMAIN' 开启 HTTPS"
else
  echo "[4/4] certbot 已安装，如需 HTTPS 执行: sudo certbot --nginx -d $DOMAIN"
fi

echo "=== 部署完成 ==="
echo "访问 http://$DOMAIN 查看效果"
