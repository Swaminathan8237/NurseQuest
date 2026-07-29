# Complete AWS EC2 & Nginx Deployment Guide for SkillQuest

This step-by-step guide will walk you through hosting **SkillQuest** on an **AWS EC2** instance using **Nginx**, **PM2**, and **Certbot (Let's Encrypt SSL)**.

---

## 🏗️ Architecture Overview

- **Frontend**: Built with React + Vite into static files served directly by **Nginx** for maximum speed.
- **Backend**: Express + Socket.IO server running on port `3001` managed by **PM2**.
- **Nginx Reverse Proxy**:
  - Directs static web traffic to built React app.
  - Proxies `/api/` endpoints to Node.js backend (`http://127.0.0.1:3001`).
  - Proxies `/socket.io/` WebSockets to Node.js backend with `Upgrade` headers for live multiplayer games.
  - Handles media file uploads (`/uploads/`) up to 50MB.

---

## Step 1: Launch your AWS EC2 Instance

1. Log into your [AWS Management Console](https://console.aws.amazon.com/) and navigate to **EC2**.
2. Click **Launch Instance**.
3. **Name**: `SkillQuest-Production`
4. **Application and OS Image (AMI)**: Choose **Ubuntu Server 22.04 LTS** (or 24.04 LTS).
5. **Instance Type**: 
   - Recommended: `t3.small` (2 vCPU, 2 GB RAM) for smooth production performance.
   - Minimum: `t3.micro` (1 vCPU, 1 GB RAM).
6. **Key Pair**: Select an existing SSH key pair or create a new one (e.g., `skillquest-key.pem`) and download it.
7. **Network Settings (Security Group)**:
   Create a Security Group with the following **Inbound Security Group Rules**:
   
   | Type | Protocol | Port Range | Source | Description |
   | :--- | :--- | :--- | :--- | :--- |
   | SSH | TCP | `22` | My IP (or `0.0.0.0/0`) | SSH Terminal Access |
   | HTTP | TCP | `80` | `0.0.0.0/0` | Web traffic (Nginx) |
   | HTTPS | TCP | `443` | `0.0.0.0/0` | Secure SSL traffic |

8. Click **Launch Instance**.

---

## Step 2: Connect to your EC2 Instance

Open your terminal (PowerShell / Git Bash on Windows or Mac Terminal) and connect to your EC2 instance using SSH:

```bash
chmod 400 skillquest-key.pem
ssh -i "skillquest-key.pem" ubuntu@<YOUR_EC2_PUBLIC_IP_OR_DNS>
```

---

## Step 3: Install Node.js 20, Nginx & PM2

Once inside your EC2 terminal, update package lists and install Node.js 20 LTS, Nginx, and Git:

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Git, Curl, and Nginx
sudo apt install -y git curl nginx

# Install Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installations
node -v   # Should output v20.x.x
npm -v    # Should output 10.x.x
nginx -v  # Should output nginx/1.x.x

# Install PM2 globally for process management
sudo npm install -g pm2
```

---

## Step 4: Clone Repository & Configure Environment

Create the web root directory `/var/www/skillquest`, grant permissions, and clone your project repository:

```bash
# Create directory and assign ownership to current user (ubuntu)
sudo mkdir -p /var/www/skillquest
sudo chown -R ubuntu:ubuntu /var/www/skillquest

# Clone repository into /var/www/skillquest
git clone <YOUR_GIT_REPOSITORY_URL> /var/www/skillquest
cd /var/www/skillquest
```

Create the production environment file for the backend:

```bash
nano backend/.env
```

Paste your production environment secrets into `backend/.env`:

```env
PORT=3001
NODE_ENV=production
DATABASE_URL=postgres://postgres:[PASSWORD]@[HOST]:[PORT]/[DATABASE]
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
```

*(Press `Ctrl + O` then `Enter` to save, and `Ctrl + X` to exit `nano`)*

---

## Step 5: Install Dependencies & Build Frontend

Run the automated build script or commands:

```bash
cd /var/www/skillquest

# Install dependencies for all components
npm run install:all

# Build frontend production dist
cd frontend
npm run build
cd ..
```

---

## Step 6: Configure Nginx

Copy the repository's Nginx configuration file to Nginx's `sites-available` directory:

```bash
sudo cp /var/www/skillquest/nginx/skillquest.conf /etc/nginx/sites-available/skillquest

# (Optional) Edit server_name if you have a custom domain name
sudo nano /etc/nginx/sites-available/skillquest
# Change `server_name _;` to `server_name app.yourdomain.com;`
```

Enable the configuration by creating a symbolic link to `sites-enabled`:

```bash
# Enable SkillQuest Nginx config
sudo ln -s /etc/nginx/sites-available/skillquest /etc/nginx/sites-enabled/

# Remove the default Nginx placeholder site
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx syntax
sudo nginx -t

# If output says "syntax is ok", reload Nginx:
sudo systemctl reload nginx
```

---

## Step 7: Start Backend Service with PM2

Start the Express + Socket.IO backend service with PM2 and configure auto-restart on system reboot:

```bash
cd /var/www/skillquest

# Create PM2 log directory
sudo mkdir -p /var/log/pm2
sudo chown -R ubuntu:ubuntu /var/log/pm2

# Start process using ecosystem config
pm2 start ecosystem.config.js --env production

# Save process list
pm2 save

# Configure PM2 to auto-start on EC2 system reboot
pm2 startup
# Follow the terminal prompt instructions to run the generated command!
```

---

## Step 8: Setup Free SSL (HTTPS) with Certbot

*(Requires your domain name's A-record to be pointed to your EC2 Public IP address)*

```bash
# Install Snapd & Certbot
sudo snap install core; sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Obtain SSL Certificate and automatically configure Nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Certbot will automatically modify your `/etc/nginx/sites-available/skillquest` file to enable SSL, force HTTP to HTTPS redirection, and setup auto-renewal!

---

## 🔄 How to Deploy Updates in the Future

Whenever you push new code to your repository, simply run the automated deployment script on EC2:

```bash
cd /var/www/skillquest
./scripts/deploy.sh
```

---

## 🛠️ Useful Troubleshooting Commands

### 1. View PM2 Logs (Backend Errors)
```bash
pm2 logs skillquest-backend
pm2 status
```

### 2. View Nginx Logs
```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### 3. Restart Services
```bash
# Restart Nginx
sudo systemctl restart nginx

# Restart Backend Process
pm2 restart skillquest-backend
```

### 4. Check Open Ports
```bash
sudo netstat -tulpn | grep 3001
```

---

## ✅ Deployment Checklist

- [x] Security Group ports 80, 443, and 22 open.
- [x] `DATABASE_URL` configured in `backend/.env`.
- [x] Node.js backend listening on `127.0.0.1:3001`.
- [x] React SPA index fallback configured (`try_files $uri $uri/ /index.html`).
- [x] Socket.IO WebSockets proxied with `Upgrade` and `Connection` headers.
- [x] `client_max_body_size 50M;` set in Nginx for media uploads.
- [x] PM2 startup service configured for server reboot persistence.
