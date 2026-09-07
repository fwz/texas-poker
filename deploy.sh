#!/usr/bin/env bash
# deploy.sh — build and start the Texas Poker server
# Usage: bash deploy.sh [PORT]   (default port: 3000)
set -euo pipefail

# ── colours ───────────────────────────────────────────────────────────────────
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[1;34m'; N='\033[0m'
log()  { echo -e "${G}[deploy]${N} $*"; }
warn() { echo -e "${Y}[warn]${N}   $*"; }
die()  { echo -e "${R}[error]${N}  $*" >&2; exit 1; }
step() { echo -e "\n${B}▶ $*${N}"; }

# ── resolve project root (the directory this script lives in) ─────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ── config ────────────────────────────────────────────────────────────────────
export PORT="${1:-${PORT:-3000}}"
APP_NAME="texas-poker"
SERVER_ENTRY="$ROOT/server/dist/server/src/index.js"
CLIENT_DIST="$ROOT/client/dist"
LOG_FILE="$ROOT/server.log"
PID_FILE="$ROOT/server.pid"

# ── 1. check node ─────────────────────────────────────────────────────────────
step "Checking Node.js"
command -v node >/dev/null 2>&1 || die "Node.js not found. Install v18+ from https://nodejs.org"
NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js v18+ required (found $(node -v))"
log "Node.js $(node -v) ✓"

command -v npm >/dev/null 2>&1 || die "npm not found"
log "npm $(npm -v) ✓"

# ── 2. stop any previous instance ────────────────────────────────────────────
step "Stopping previous instance (if any)"
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete "$APP_NAME" 2>/dev/null && log "Stopped PM2 process '$APP_NAME'" || true
else
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      kill "$OLD_PID" && log "Stopped previous process (PID $OLD_PID)" || true
    fi
    rm -f "$PID_FILE"
  fi
fi

# ── 3. install dependencies ───────────────────────────────────────────────────
step "Installing dependencies"
npm install --prefer-offline 2>&1 | grep -v "^npm warn" || npm install

# ── 4. build ──────────────────────────────────────────────────────────────────
step "Building client"
# No VITE_SERVER_URL → client auto-connects to window.location.origin at runtime
npm run build --workspace=client
log "Client built → $CLIENT_DIST"

step "Building server"
npm run build --workspace=server
log "Server built → $SERVER_ENTRY"

# sanity check
[ -f "$SERVER_ENTRY" ] || die "Expected server entry not found: $SERVER_ENTRY"
[ -f "$CLIENT_DIST/index.html" ] || die "Expected client index not found: $CLIENT_DIST/index.html"

# ── 5. start ──────────────────────────────────────────────────────────────────
step "Starting server on port $PORT"

if command -v pm2 >/dev/null 2>&1; then
  pm2 start "$SERVER_ENTRY" \
    --name "$APP_NAME" \
    --interpreter node \
    --env "PORT=$PORT" \
    -- \
    2>&1
  pm2 save 2>/dev/null || true
  START_INFO="PM2  (logs: pm2 logs $APP_NAME  |  stop: pm2 stop $APP_NAME)"
else
  warn "PM2 not found — using nohup. For production, install PM2: npm install -g pm2"
  nohup env PORT="$PORT" node "$SERVER_ENTRY" >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  START_INFO="nohup  (PID $(cat "$PID_FILE")  |  logs: tail -f $LOG_FILE  |  stop: kill \$(cat $PID_FILE))"
fi

# ── 6. wait for server to be ready ───────────────────────────────────────────
printf "Waiting for server"
for i in $(seq 1 20); do
  if curl -s "http://127.0.0.1:$PORT" >/dev/null 2>&1; then
    echo " ready"
    break
  fi
  printf "."
  sleep 0.5
done
echo ""

# ── 7. print access info ─────────────────────────────────────────────────────
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' \
  || ipconfig getifaddr en0 2>/dev/null \
  || echo "127.0.0.1")

PUBLIC_IP=$(curl -s --max-time 4 https://ifconfig.me \
  || curl -s --max-time 4 https://api.ipify.org \
  || echo "<your-public-ip>")

echo ""
echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo -e "${G} Texas Poker is running!${N}"
echo -e "${G}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"
echo ""
echo -e "  Same network:  ${B}http://$LOCAL_IP:$PORT${N}"
echo -e "  Internet:      ${B}http://$PUBLIC_IP:$PORT${N}"
echo ""
echo -e "  Started via:   $START_INFO"
echo ""
warn "Firewall: make sure port $PORT/tcp is open"
warn "  Ubuntu/Debian:  sudo ufw allow $PORT/tcp"
warn "  CentOS/RHEL:    sudo firewall-cmd --permanent --add-port=$PORT/tcp && sudo firewall-cmd --reload"
echo ""
