#!/bin/bash
export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$PATH
export PORT=${PORT:-5060}
export HOST=0.0.0.0
export NODE_ENV=${NODE_ENV:-production}

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$BASE_DIR/server"

if [ ! -d "$SERVER_DIR" ]; then
  SERVER_DIR="$BASE_DIR"
fi

cd "$SERVER_DIR"

NODE_BIN="/opt/alt/alt-nodejs20/root/usr/bin/node"
if [ ! -x "$NODE_BIN" ]; then
  NODE_BIN=$(which node 2>/dev/null || echo "node")
fi

# Load .env if present
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Rotate server.log if it exceeds 5MB
if [ -f "server.log" ] && [ $(wc -c < "server.log" 2>/dev/null || echo 0) -gt 5242880 ]; then
  tail -n 2000 server.log > server.log.tmp 2>/dev/null && mv server.log.tmp server.log 2>/dev/null
fi

# Limit heap memory to 384MB for cgroup limits
exec "$NODE_BIN" --max-old-space-size=384 bundle.mjs >> server.log 2>&1
