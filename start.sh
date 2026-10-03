#!/usr/bin/env bash

# ==============================================================================
# Assistant — Startup Script
#
# Starts all necessary infrastructure (MongoDB Replica Set + Redis via Docker)
# verifies dependencies, builds shared packages, optionally seeds data,
# and boots the Express MCP server.
#
# Usage:
#   ./start.sh          # Start infra + server
#   ./start.sh --seed   # Start infra, seed fresh demo data, and start server
# ==============================================================================

set -eo pipefail

# ANSI Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Determine project root directory (directory where script is located)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo -e "\n${BOLD}${CYAN}======================================================${NC}"
echo -e "${BOLD}${CYAN}   🚀 Starting Assistant AI-Native Process Manager    ${NC}"
echo -e "${BOLD}${CYAN}======================================================${NC}\n"

# ------------------------------------------------------------------------------
# 1. Check Prerequisites
# ------------------------------------------------------------------------------
echo -e "${BLUE}[1/5] Checking environment & dependencies...${NC}"

if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}❌ Error: Node.js is not installed. Please install Node 20+.${NC}"
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo -e "${RED}❌ Error: pnpm is not installed. Run: npm install -g pnpm${NC}"
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo -e "${RED}❌ Error: Docker is not installed. Please install Docker Desktop.${NC}"
  exit 1
fi

# Ensure .env exists in apps/server/.env
if [ ! -f "apps/server/.env" ]; then
  echo -e "${YELLOW}⚠️  apps/server/.env not found. Creating from .env.example...${NC}"
  cp .env.example apps/server/.env
fi

# Ensure node_modules exist
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}📦 node_modules not found. Running pnpm install...${NC}"
  pnpm install
fi

echo -e "${GREEN}✓ Dependencies and environment ready.${NC}\n"

# ------------------------------------------------------------------------------
# 2. Check & Start Docker Daemon
# ------------------------------------------------------------------------------
echo -e "${BLUE}[2/5] Checking Docker daemon...${NC}"

if ! docker info >/dev/null 2>&1; then
  if [[ "$OSTYPE" == "darwin"* ]] && [ -d "/Applications/Docker.app" ]; then
    echo -e "${YELLOW}⏳ Docker is not running. Launching Docker Desktop on macOS...${NC}"
    open -a Docker
    
    # Wait for Docker to start (up to 45 seconds)
    WAIT_COUNT=0
    until docker info >/dev/null 2>&1 || [ $WAIT_COUNT -ge 45 ]; do
      sleep 2
      WAIT_COUNT=$((WAIT_COUNT + 2))
      echo -n "."
    done
    echo ""

    if ! docker info >/dev/null 2>&1; then
      echo -e "${RED}❌ Docker took too long to start. Please start Docker Desktop and re-run ./start.sh.${NC}"
      exit 1
    fi
  else
    echo -e "${RED}❌ Docker daemon is not running. Please start Docker and re-run ./start.sh.${NC}"
    exit 1
  fi
fi

echo -e "${GREEN}✓ Docker is running.${NC}\n"

# ------------------------------------------------------------------------------
# 3. Start Database Containers (MongoDB replica set + Redis)
# ------------------------------------------------------------------------------
echo -e "${BLUE}[3/5] Starting database services (MongoDB Replica Set & Redis)...${NC}"

docker compose up -d

# Wait for MongoDB to be healthy / responsive
echo -e "${CYAN}⏳ Waiting for MongoDB replica set to initialize...${NC}"
MONGO_READY=false
for i in {1..30}; do
  if docker compose exec -T mongodb mongosh --eval "rs.status().ok" --quiet 2>/dev/null | grep -q "1"; then
    MONGO_READY=true
    break
  fi
  sleep 1
done

if [ "$MONGO_READY" = false ]; then
  echo -e "${YELLOW}⚠️  Replica set still initializing. Triggering initiation check...${NC}"
  docker compose exec -T mongodb mongosh --eval "
    try {
      rs.status();
    } catch(e) {
      rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:27017'}]});
    }
  " --quiet || true
  sleep 2
fi

echo -e "${GREEN}✓ MongoDB Replica Set & Redis are healthy and running.${NC}\n"

# ------------------------------------------------------------------------------
# 4. Build Shared Package & Optional Seed
# ------------------------------------------------------------------------------
echo -e "${BLUE}[4/5] Building packages and preparing data...${NC}"

pnpm --filter @assistant/shared build

# Handle seeding
SEED_REQUIRED=false
if [[ "$*" == *"--seed"* ]]; then
  SEED_REQUIRED=true
else
  # Check if database has users; if 0, run seed automatically
  USER_COUNT=$(docker compose exec -T mongodb mongosh assistant --eval "db.users.countDocuments()" --quiet 2>/dev/null || echo "0")
  if [ "$USER_COUNT" = "0" ] || [ -z "$USER_COUNT" ]; then
    SEED_REQUIRED=true
    echo -e "${CYAN}ℹ️  First run detected: database is empty. Running initial seed...${NC}"
  fi
fi

if [ "$SEED_REQUIRED" = true ]; then
  echo -e "${CYAN}🌱 Seeding database...${NC}"
  pnpm --filter @assistant/server seed
fi

echo -e "${GREEN}✓ Build and data preparation complete.${NC}\n"

# ------------------------------------------------------------------------------
# 5. Start MCP Server & Web Portal UI
# ------------------------------------------------------------------------------
echo -e "${BLUE}[5/5] Launching Assistant MCP Server & Web Portal...${NC}"
echo -e "${CYAN}------------------------------------------------------${NC}"
echo -e "🌐 Web Portal (Shadcn UI):  ${BOLD}http://localhost:5173${NC}"
echo -e "🤖 MCP Base URL:            ${BOLD}http://localhost:3000/mcp/:slug${NC}"
echo -e "🩺 Health Check URL:        ${BOLD}http://localhost:3000/health${NC}"
echo -e "Press ${BOLD}Ctrl+C${NC} anytime to stop both services."
echo -e "${CYAN}------------------------------------------------------${NC}\n"

# Cleanup function on Ctrl+C
cleanup() {
  echo -e "\n${YELLOW}🛑 Shutting down Assistant services...${NC}"
  jobs -p | xargs kill 2>/dev/null || true
  # Note: Docker containers remain running in the background for quick restarts.
  echo -e "${CYAN}ℹ️  MongoDB and Redis containers are still active. To stop them run: docker compose down${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM

# Execute server and portal concurrently via Turborepo
pnpm dev
