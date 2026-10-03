#!/usr/bin/env bash
set -e

echo "📦 Packaging Assistant for Hostinger Deployment..."

# 1. Clean previous build artifact
rm -rf dist-hostinger hostinger-build.zip
mkdir -p dist-hostinger

# 2. Build everything first
echo "🔨 Running turbo build..."
pnpm turbo build

# 3. Create folder structure
mkdir -p dist-hostinger/packages/shared
mkdir -p dist-hostinger/apps/server
mkdir -p dist-hostinger/apps/portal
mkdir -p dist-hostinger/public_html

# 4. Copy compiled packages/shared
cp -r packages/shared/dist dist-hostinger/packages/shared/
cp packages/shared/package.json dist-hostinger/packages/shared/

# 5. Copy compiled apps/server
cp -r apps/server/dist dist-hostinger/apps/server/
cp apps/server/package.json dist-hostinger/apps/server/

# 6. Copy compiled apps/portal
cp -r apps/portal/dist dist-hostinger/apps/portal/
cp apps/portal/package.json dist-hostinger/apps/portal/

# 7. Copy public_html for direct shared hosting upload
cp -r apps/portal/dist/* dist-hostinger/public_html/
if [ -f apps/portal/dist/.htaccess ]; then
  cp apps/portal/dist/.htaccess dist-hostinger/public_html/.htaccess
fi

# 8. Copy root entrypoint, PM2 config, package.json and environment template
cp ecosystem.config.cjs dist-hostinger/

cat << 'EOF' > dist-hostinger/index.js
/**
 * Root Entrypoint for Hostinger Node.js Application Manager & PM2
 */
import './apps/server/dist/index.js';
EOF

cat << 'EOF' > dist-hostinger/package.json
{
  "name": "assistant-hostinger",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "seed": "node apps/server/dist/seed.js"
  },
  "dependencies": {
    "@assistant/shared": "file:./packages/shared",
    "@modelcontextprotocol/sdk": "^1.12.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^5.1.0",
    "helmet": "^8.0.0",
    "mongoose": "^8.9.0",
    "nanoid": "^5.1.0",
    "pino": "^9.6.0",
    "pino-pretty": "^13.0.0",
    "zod": "^3.24.0",
    "zod-to-json-schema": "^3.24.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
EOF

cat << 'EOF' > dist-hostinger/.env.example
# ─── Production Environment Variables ───

# Server Port & Host (Hostinger assigns PORT automatically or defaults to 3000)
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# MongoDB Connection String (MongoDB Atlas or Hostinger VPS MongoDB)
# For transactions (replica set), MongoDB Atlas free tier (M0) works out of the box!
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/assistant?retryWrites=true&w=majority

# Logging Level (debug, info, warn, error)
LOG_LEVEL=info

# Default Timezone for Daily Briefing & Scheduled Tasks
DEFAULT_TIMEZONE=Asia/Kolkata
EOF

cat << 'EOF' > dist-hostinger/HOSTINGER_DEPLOYMENT.md
# Hostinger Deployment Guide

This zip package contains everything needed to run **Assistant (MCP Server + REST API + Web Portal)** on Hostinger.

---

## Architecture Overview

- **Backend + MCP**: Express server running on Node.js 20+ (`apps/server/dist/index.js`)
- **Frontend Portal**: Production Vite SPA (`apps/portal/dist`), automatically served by the Node.js server on the same domain/port, or uploaded separately to `public_html/`.
- **Database**: MongoDB (e.g. MongoDB Atlas cluster with replica set support).

---

## Option 1: Hostinger hPanel Node.js Application Manager (Recommended)

1. **Upload Archive**:
   - Log in to **Hostinger hPanel**.
   - Navigate to **Websites** → **Manage** → **Files** → **File Manager**.
   - Upload `hostinger-build.zip` to your application folder (e.g. `/home/u123456789/assistant` or `/domains/yourdomain.com`).
   - Right-click and **Extract** the zip file.

2. **Configure Node.js in hPanel**:
   - Go to **Advanced** → **Node.js** in hPanel.
   - Click **Create Application**:
     - **Node.js version**: Choose `20.x` or latest LTS.
     - **Application mode**: `Production`.
     - **Application root**: Path where files were extracted (e.g. `assistant` or `public_html`).
     - **Application startup file**: `index.js`.
   - Click **Create**.

3. **Install Dependencies**:
   - Click the **Run NPM Install** button in the Node.js application dashboard.

4. **Set Environment Variables**:
   - In the Node.js app settings, add environment variables or create a `.env` file in the root directory:
     ```
     NODE_ENV=production
     MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/assistant?retryWrites=true&w=majority
     DEFAULT_TIMEZONE=Asia/Kolkata
     ```

5. **Start Application**:
   - Click **Start / Restart Application**.
   - Your Web Portal is now live at `https://yourdomain.com/`!
   - Your MCP endpoints are live at `https://yourdomain.com/mcp/:slug`!

---

## Option 2: Hostinger VPS / Cloud (PM2 / Docker)

1. **Upload & Extract**:
   ```bash
   scp hostinger-build.zip root@your-vps-ip:/var/www/assistant/
   ssh root@your-vps-ip
   cd /var/www/assistant
   unzip hostinger-build.zip
   ```

2. **Install & Run via PM2**:
   ```bash
   npm install --omit=dev
   cp .env.example .env
   # Edit .env with your MongoDB credentials
   nano .env

   npm install -g pm2
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup
   ```

3. **Nginx Reverse Proxy Config**:
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

---

## Option 3: Hostinger Shared Hosting (Static Portal in `public_html`)

If you host the Node.js backend on a subdomain or external server and only want to host the Web Portal on Hostinger Shared Hosting:

1. In Hostinger File Manager, open `public_html/`.
2. Upload and extract the contents of the `public_html/` folder from this archive directly into your domain's `public_html/`.
3. The included `.htaccess` file ensures client-side routing works for `/tools`, `/brief`, `/explorer`, `/endpoints` without 404 errors.
EOF

# 9. Create the ZIP archive
echo "🗜️ Creating hostinger-build.zip..."
cd dist-hostinger
zip -r ../hostinger-build.zip . -x ".*" -x "__MACOSX"
cd ..

echo "✅ Successfully created hostinger-build.zip!"
ls -lh hostinger-build.zip
