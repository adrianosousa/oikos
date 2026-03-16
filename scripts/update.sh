#!/usr/bin/env bash
#
# Oikos Update — Pull latest code, install deps, build everything, restart.
#
# Usage:
#   ./scripts/update.sh              # Pull, build, done
#   ./scripts/update.sh --restart    # Also restart the running oikos process
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

BOLD='\033[1m'
GREEN='\033[32m'
DIM='\033[2m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}oikos update${RESET}"
echo ""

# 1. Pull latest
echo -e "${DIM}[1/3] git pull...${RESET}"
git pull --ff-only 2>&1 | tail -3
echo ""

# 2. Install deps (in case new packages were added)
echo -e "${DIM}[2/3] npm install...${RESET}"
npm install --workspaces 2>&1 | tail -3
echo ""

# 3. Build both workspaces (wallet-isolate + oikos-app)
echo -e "${DIM}[3/3] npm run build...${RESET}"
npm run build 2>&1
echo ""

# Verify critical outputs exist
if [[ ! -f "$PROJECT_DIR/wallet-isolate/dist/src/main.js" ]]; then
  echo -e "\033[31mERROR: wallet-isolate/dist/src/main.js not found after build\033[0m"
  exit 1
fi
if [[ ! -f "$PROJECT_DIR/oikos-app/dist/src/main.js" ]]; then
  echo -e "\033[31mERROR: oikos-app/dist/src/main.js not found after build\033[0m"
  exit 1
fi

echo -e "${GREEN}Build OK.${RESET} Both workspaces compiled."
echo ""
echo -e "  wallet-isolate: ${DIM}$(wc -l < wallet-isolate/dist/src/main.js) lines${RESET}"
echo -e "  oikos-app:      ${DIM}$(wc -l < oikos-app/dist/src/main.js) lines${RESET}"
echo ""

# Optional restart
if [[ "${1:-}" == "--restart" ]]; then
  echo -e "${DIM}Restarting oikos...${RESET}"
  # Kill existing node process running main.js
  pkill -f "node.*oikos-app/dist/src/main.js" 2>/dev/null || true
  sleep 1
  echo -e "${GREEN}Stopped. Start again with: npm start${RESET}"
fi

echo -e "${GREEN}Done.${RESET} Run ${BOLD}npm start${RESET} to launch."
echo ""
