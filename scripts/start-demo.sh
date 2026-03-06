#!/usr/bin/env bash
#
# Oikos Demo — One-command start.
#
# Boots the full dual-process system in mock mode:
# - Wallet Isolate (Bare Runtime) with mock wallet
# - Agent Brain (Node.js) with mock LLM + mock events
# - Dashboard at http://127.0.0.1:3420
#
# Zero API keys required. Zero blockchain access needed.
#
# Usage:
#   ./scripts/start-demo.sh          # Bare Runtime wallet (production mode)
#   ./scripts/start-demo.sh --node   # Node.js wallet (development mode)
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Detect runtime mode
WALLET_RUNTIME="bare"
if [[ "${1:-}" == "--node" ]]; then
  WALLET_RUNTIME="node"
  echo "[demo] Using Node.js for wallet isolate (development mode)"
else
  # Check if bare is installed
  if ! command -v bare &>/dev/null; then
    echo "[demo] Bare Runtime not found, falling back to Node.js"
    WALLET_RUNTIME="node"
  else
    echo "[demo] Using Bare Runtime for wallet isolate (production mode)"
  fi
fi

# Build if needed
if [[ ! -f "$PROJECT_DIR/wallet-isolate/dist/src/main.js" ]] || [[ ! -f "$PROJECT_DIR/agent-brain/dist/src/main.js" ]]; then
  echo "[demo] Building project..."
  cd "$PROJECT_DIR"
  npm run build
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                                                          ║"
echo "║   Oikos — Sovereign Agent Wallet Protocol                 ║"
echo "║                                                          ║"
echo "║   Wallet: ${WALLET_RUNTIME} (mock, no real blockchain)           ║"
echo "║   LLM: mock (deterministic demo sequence)               ║"
echo "║   Events: mock (3-min simulated stream)                  ║"
echo "║   Dashboard: http://127.0.0.1:3420                       ║"
echo "║                                                          ║"
echo "║   Press Ctrl+C to stop                                   ║"
echo "║                                                          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

cd "$PROJECT_DIR"

exec env \
  MOCK_LLM=true \
  MOCK_EVENTS=true \
  MOCK_WALLET=true \
  WALLET_RUNTIME="$WALLET_RUNTIME" \
  WALLET_ISOLATE_PATH="./wallet-isolate/dist/src/main.js" \
  DASHBOARD_PORT=3420 \
  AUDIT_LOG_PATH="./audit-demo.jsonl" \
  node agent-brain/dist/src/main.js
