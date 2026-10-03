#!/usr/bin/env bash
# ==============================================================================
# Deploy to mcphub.apptiva.in
# ==============================================================================
set -e

HOSTINGER_USER="${HOSTINGER_SSH_USER:-u120985039}"
HOSTINGER_HOST="${HOSTINGER_SSH_HOST:-145.79.25.57}"
HOSTINGER_PORT="${HOSTINGER_SSH_PORT:-65002}"
REMOTE_PATH="/home/${HOSTINGER_USER}/domains/mcphub.apptiva.in/public_html"

echo "🚀 [1/5] Building packages & React portal..."
pnpm turbo build

echo "⚡ [2/5] Bundling Node.js Backend with esbuild..."
mkdir -p apps/server/dist
npx esbuild apps/server/src/index.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --outfile=apps/server/dist/bundle.mjs \
  --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
  --external:pino-pretty

npx esbuild apps/server/src/seed.ts \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --outfile=apps/server/dist/seed.bundle.mjs \
  --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
  --external:pino-pretty

echo "📦 [3/5] Assembling deployment package..."
rm -rf dist-mcphub deploy-mcphub.tar.gz
mkdir -p dist-mcphub/server

# Copy React Portal static build
cp -r apps/portal/dist/* dist-mcphub/

# Copy proxy and runner scripts
cp scripts/deploy/api.php dist-mcphub/
cp scripts/deploy/run.sh dist-mcphub/
cp scripts/deploy/.htaccess dist-mcphub/

# Copy server bundle
cp apps/server/dist/bundle.mjs dist-mcphub/server/
cp apps/server/dist/seed.bundle.mjs dist-mcphub/server/

TARGET_MONGO_URI="${MONGODB_URI:-mongodb+srv://jaikrishnaverma_db_user:vty3MtQZZLCgiy55@cluster0.bx5u6mf.mongodb.net/assistant?retryWrites=true&w=majority}"

cat << EOF > dist-mcphub/server/.env
PORT=5060
HOST=0.0.0.0
NODE_ENV=production
DEFAULT_TIMEZONE=Asia/Kolkata
LOG_LEVEL=info
MONGODB_URI="${TARGET_MONGO_URI}"
EOF

tar -czf deploy-mcphub.tar.gz -C dist-mcphub .
rm -rf dist-mcphub

echo "📤 [4/5] Uploading to Hostinger (domains/mcphub.apptiva.in)..."
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=15 -p ${HOSTINGER_PORT}"
scp -o StrictHostKeyChecking=no -P ${HOSTINGER_PORT} deploy-mcphub.tar.gz ${HOSTINGER_USER}@${HOSTINGER_HOST}:${REMOTE_PATH}/deploy-mcphub.tar.gz

echo "🔄 [5/5] Extracting & restarting mcphub background process..."
ssh ${SSH_OPTS} ${HOSTINGER_USER}@${HOSTINGER_HOST} bash -s << 'REMOTECMD'
  cd /home/u120985039/domains/mcphub.apptiva.in/public_html
  tar -xzf deploy-mcphub.tar.gz
  rm -f deploy-mcphub.tar.gz
  chmod +x run.sh
  
  # Restart port 5060 process
  fuser -k 5060/tcp 2>/dev/null || true
  nohup ./run.sh > /dev/null 2>&1 < /dev/null &
  sleep 2
REMOTECMD

rm -f deploy-mcphub.tar.gz

echo "✅ Verifying mcphub.apptiva.in deployment..."
sleep 2
curl -s -I https://mcphub.apptiva.in | head -n 8

echo "🎉 Deployment to https://mcphub.apptiva.in complete!"
