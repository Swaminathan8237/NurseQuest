#!/bin/bash

# SkillQuest Automated Deployment Script for AWS EC2
# Usage: ./scripts/deploy.sh

set -e # Exit immediately if a command exits with a non-zero status

APP_DIR="/var/www/skillquest"

echo "🚀 Starting SkillQuest deployment process..."

# 1. Navigate to application root
cd "$APP_DIR"

# 2. Pull latest code from git repository
echo "📥 Fetching latest changes from git..."
git pull origin main || echo "⚠️ Git pull skipped or not on main branch."

# 3. Install dependencies for root, backend, and frontend
echo "📦 Installing root, backend, and frontend dependencies..."
npm run install:all

# 4. Build Vite React frontend
echo "🏗️ Building frontend production bundle..."
cd "$APP_DIR/frontend"
npm run build

# 5. Return to app root
cd "$APP_DIR"

# 6. Ensure PM2 log directory exists
sudo mkdir -p /var/log/pm2
sudo chown -R $USER:$USER /var/log/pm2

# 7. Restart or start backend with PM2
echo "🔄 Reloading PM2 backend process..."
if pm2 describe skillquest-backend > /dev/null 2>&1; then
    pm2 reload ecosystem.config.js --env production
else
    pm2 start ecosystem.config.js --env production
fi

# Save PM2 state for automatic server reboot recovery
pm2 save

# 8. Reload Nginx to ensure latest static assets & reverse proxy settings are active
echo "🌐 Testing and reloading Nginx..."
sudo nginx -t
sudo systemctl reload nginx

echo "✅ SkillQuest successfully deployed and running on AWS EC2!"
