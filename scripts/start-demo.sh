#!/usr/bin/env bash
#
# Oikos Demo — One-command start.
#
# Boots oikos-wallet in mock mode (agent-agnostic infrastructure):
# - Wallet Isolate with mock wallet (no blockchain)
# - Mock Swarm (2 simulated peer agents: AlphaBot, BetaBot)
# - Mock Events (3-min simulated event stream)
# - Dashboard at http://127.0.0.1:3420
# - ERC-8004 identity (mock mode)
# - MCP + REST + CLI for any agent to connect
#
# Zero API keys required. Zero blockchain access. Zero setup friction.
# Connect your own agent via MCP at POST http://127.0.0.1:3420/mcp
#
# Usage:
#   ./scripts/start-demo.sh              # Auto-detect runtime
#   ./scripts/start-demo.sh --node       # Force Node.js wallet
#   ./scripts/start-demo.sh --bare       # Force Bare Runtime wallet
#   ./scripts/start-demo.sh --port 3421  # Custom dashboard port
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Parse args
WALLET_RUNTIME=""
DASHBOARD_PORT="3420"
while [[ $# -gt 0 ]]; do
  case $1 in
    --node) WALLET_RUNTIME="node"; shift ;;
    --bare) WALLET_RUNTIME="bare"; shift ;;
    --port) DASHBOARD_PORT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# Auto-detect runtime
if [[ -z "$WALLET_RUNTIME" ]]; then
  if command -v bare &>/dev/null; then
    WALLET_RUNTIME="bare"
  else
    WALLET_RUNTIME="node"
  fi
fi

# Build if needed
if [[ ! -f "$PROJECT_DIR/wallet-isolate/dist/src/main.js" ]] || [[ ! -f "$PROJECT_DIR/oikos-wallet/dist/src/main.js" ]]; then
  echo "[oikos] Building project..."
  cd "$PROJECT_DIR"
  npm run build 2>&1 | tail -5
  echo ""
fi

# Copy policy file if needed
if [[ ! -f "$PROJECT_DIR/policies.json" ]]; then
  cp "$PROJECT_DIR/policies.example.json" "$PROJECT_DIR/policies.json"
fi

# Banner
echo ""
echo -e "\033[0;35m"
echo "  ╔═══════════════════════════════════════════════════════════╗"
echo "  ║                                                           ║"
echo "  ║   Oikos — Sovereign Agent Wallet Protocol                  ║"
echo "  ║                                                           ║"
echo "  ║   Wallet:    ${WALLET_RUNTIME} (mock, no real blockchain)            ║"
echo "  ║   Agent:     connect yours via MCP/REST/CLI               ║"
echo "  ║   Swarm:     mock (2 peers: AlphaBot, BetaBot)            ║"
echo "  ║   Events:    mock (3-min simulated stream)                ║"
echo "  ║   Identity:  ERC-8004 (mock mode)                         ║"
echo "  ║   RGB:       enabled (mock transport bridge)              ║"
echo "  ║                                                           ║"
echo "  ║   Dashboard: http://127.0.0.1:${DASHBOARD_PORT}                       ║"
echo "  ║   MCP:       POST http://127.0.0.1:${DASHBOARD_PORT}/mcp              ║"
echo "  ║   Agent Card: http://127.0.0.1:${DASHBOARD_PORT}/agent-card.json      ║"
echo "  ║                                                           ║"
echo "  ║   Press Ctrl+C to stop                                    ║"
echo "  ║                                                           ║"
echo "  ╚═══════════════════════════════════════════════════════════╝"
echo -e "\033[0m"
echo ""

cd "$PROJECT_DIR"

exec env \
  OIKOS_MODE=mock \
  SWARM_ENABLED=true \
  ERC8004_ENABLED=true \
  RGB_ENABLED=true \
  WALLET_RUNTIME="$WALLET_RUNTIME" \
  WALLET_ISOLATE_PATH="./wallet-isolate/dist/src/main.js" \
  DASHBOARD_PORT="$DASHBOARD_PORT" \
  AUDIT_LOG_PATH="./audit-demo.jsonl" \
  AGENT_NAME="oikos-demo-agent" \
  AGENT_CAPABILITIES="payment,swap,bridge,yield,analysis,price-feed" \
  node oikos-wallet/dist/src/main.js
