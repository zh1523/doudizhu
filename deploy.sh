#!/bin/bash
# 斗地主一键部署脚本（在服务器项目根目录执行）
set -e

# ========== 配置区 ==========
DOMAIN="${DOMAIN:-你的域名或IP}"         # 环境变量覆盖，或直接改这里
NGINX_CONF_DIR="/etc/nginx/conf.d"
# ==============================

cd "$(dirname "$0")"

echo "=== [1/5] 拉取最新代码 ==="
git pull

echo "=== [2/5] 构建前端 ==="
cd client
npm install --production=false
npm run build
cd ..

echo "=== [3/5] 构建服务端 ==="
cd server
npm install --production=false
npm run build
cd ..

echo "=== [4/5] 启动/重启服务 ==="
export PM2_HOME="$HOME/.pm2"
if ! command -v pm2 &>/dev/null; then
  echo "安装 PM2..."
  npm install -g pm2
fi
if pm2 describe doudizhu >/dev/null 2>&1; then
  pm2 reload server/ecosystem.config.cjs --update-env
else
  pm2 start server/ecosystem.config.cjs
fi
pm2 save
# 首次部署需执行: pm2 startup
# 如果没安装过: sudo env PATH=$PATH pm2 startup

echo "=== [5/5] 配置 Nginx ==="
if [ -d "$NGINX_CONF_DIR" ]; then
  sudo cp nginx-doudizhu.conf "$NGINX_CONF_DIR/doudizhu.conf"
  sudo sed -i "s/doudizhu.example.com/$DOMAIN/g" "$NGINX_CONF_DIR/doudizhu.conf"
  sudo nginx -t && sudo systemctl reload nginx
  echo "Nginx 已重载"
else
  echo "未检测到 Nginx，跳过。直接访问 http://$DOMAIN:3000"
fi

echo ""
echo "=== 部署完成 ==="
echo "访问 http://$DOMAIN"
echo ""
echo "常用命令:"
echo "  pm2 status         查看进程状态"
echo "  pm2 logs doudizhu  查看日志"
echo "  pm2 restart doudizhu  重启服务"
