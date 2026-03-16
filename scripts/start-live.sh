#!/usr/bin/env bash
#
# Oikos Live Agent — One-command start for real P2P swarm.
#
# This is what agents (Ludwig, Baruch, etc.) should use.
# Real Hyperswarm, real P2P discovery, real room negotiation.
# Wallet stays in mock mode (no real blockchain) unless --real-wallet is passed.
#
# Usage:
#   ./scripts/start-live.sh                          # Default: mock wallet, real swarm
#   ./scripts/start-live.sh --port 3421              # Custom dashboard port
#   ./scripts/start-live.sh --name "Ludwig"          # Custom agent name
#   ./scripts/start-live.sh --real-wallet             # Real WDK wallet (needs seed + indexer)
#   ./scripts/start-live.sh --host 0.0.0.0           # Public dashboard (for gateway)
#
# Environment:
#   Reads .env from project root if it exists (for WALLET_SEED, INDEXER_API_KEY, etc.)
#   All CLI flags override .env values.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# ── Defaults ──
DASHBOARD_PORT="3420"
DASHBOARD_HOST="127.0.0.1"
AGENT_NAME="Oikos-Agent"
AGENT_CAPS="payment,swap,bridge,yield,analysis,price-feed"
REAL_WALLET="false"
WALLET_RUNTIME="node"

# ── Parse CLI args ──
while [[ $# -gt 0 ]]; do
  case $1 in
    --port)          DASHBOARD_PORT="$2"; shift 2 ;;
    --host)          DASHBOARD_HOST="$2"; shift 2 ;;
    --name)          AGENT_NAME="$2"; shift 2 ;;
    --caps)          AGENT_CAPS="$2"; shift 2 ;;
    --real-wallet)   REAL_WALLET="true"; shift ;;
    --bare)          WALLET_RUNTIME="bare"; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

# ── Load .env if present (doesn't override CLI args above) ──
if [[ -f "$PROJECT_DIR/.env" ]]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

# ── Build if needed ──
if [[ ! -f "$PROJECT_DIR/wallet-isolate/dist/src/main.js" ]] || [[ ! -f "$PROJECT_DIR/oikos-wallet/dist/src/main.js" ]]; then
  echo "[oikos] Building project..."
  npm run build 2>&1 | tail -5
  echo ""
fi

# ── Copy policy file if needed ──
if [[ ! -f "$PROJECT_DIR/policies.json" ]]; then
  cp "$PROJECT_DIR/policies.example.json" "$PROJECT_DIR/policies.json"
fi

# ── Resolve wallet mock ──
MOCK_WALLET="true"
if [[ "$REAL_WALLET" == "true" ]]; then
  MOCK_WALLET="false"
fi

# ── Banner ──
echo ""
echo -e "\033[0;36m"
echo "  ╔═══════════════════════════════════════════════════════════╗"
echo "  ║                                                           ║"
echo "  ║   Oikos — Live Agent Mode                                 ║"
echo "  ║                                                           ║"
echo "  ║   Agent:     ${AGENT_NAME}$(printf '%*s' $((38 - ${#AGENT_NAME})) '')║"
echo "  ║   Swarm:     REAL Hyperswarm (P2P discovery)              ║"
echo "  ║   Wallet:    ${MOCK_WALLET:+mock (no real blockchain)     }            ║"
echo "  ║   Dashboard: http://${DASHBOARD_HOST}:${DASHBOARD_PORT}$(printf '%*s' $((31 - ${#DASHBOARD_HOST} - ${#DASHBOARD_PORT})) '')║"
echo "  ║   MCP:       POST http://${DASHBOARD_HOST}:${DASHBOARD_PORT}/mcp$(printf '%*s' $((27 - ${#DASHBOARD_HOST} - ${#DASHBOARD_PORT})) '')║"
echo "  ║                                                           ║"
echo "  ║   Press Ctrl+C to stop                                    ║"
echo "  ║                                                           ║"
echo "  ╚═══════════════════════════════════════════════════════════╝"
echo -e "\033[0m"
echo ""

# ── Launch ──
# Key: OIKOS_MODE=testnet with explicit mock overrides.
# This gives us: real swarm + real events + mock wallet (safe default).
exec env \
  OIKOS_MODE=testnet \
  MOCK_WALLET="$MOCK_WALLET" \
  MOCK_SWARM=false \
  MOCK_EVENTS=true \
  SWARM_ENABLED=true \
  ERC8004_ENABLED=false \
  RGB_ENABLED=false \
  WALLET_RUNTIME="$WALLET_RUNTIME" \
  WALLET_ISOLATE_PATH="./wallet-isolate/dist/src/main.js" \
  DASHBOARD_PORT="$DASHBOARD_PORT" \
  DASHBOARD_HOST="$DASHBOARD_HOST" \
  AUDIT_LOG_PATH="./audit-live.jsonl" \
  AGENT_NAME="$AGENT_NAME" \
  AGENT_CAPABILITIES="$AGENT_CAPS" \
  node oikos-wallet/dist/src/main.js
