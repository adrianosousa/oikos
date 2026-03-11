#!/usr/bin/env bash
#
# Oikos Protocol — Interactive Install & Setup
#
# One-command install:
#   curl -sSL https://raw.githubusercontent.com/adrianosousa/oikos/main/scripts/install.sh | bash
#
# Or clone first:
#   git clone https://github.com/adrianosousa/oikos.git && cd oikos && ./scripts/install.sh
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

print_header() {
  echo ""
  echo -e "${PURPLE}${BOLD}"
  echo "  ╔══════════════════════════════════════════════════════╗"
  echo "  ║                                                      ║"
  echo "  ║   Oikos — Sovereign Agent Wallet Protocol             ║"
  echo "  ║                                                      ║"
  echo "  ║   Process-isolated, multi-chain, multi-asset          ║"
  echo "  ║   wallet for autonomous AI agents                     ║"
  echo "  ║                                                      ║"
  echo "  ╚══════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

info()    { echo -e "  ${BLUE}[info]${NC} $1"; }
success() { echo -e "  ${GREEN}[done]${NC} $1"; }
warn()    { echo -e "  ${YELLOW}[warn]${NC} $1"; }
error()   { echo -e "  ${RED}[error]${NC} $1"; }
ask()     { echo -en "  ${CYAN}[?]${NC} $1"; }

# ────────────────────────────────────────────────────
# Step 0: Check prerequisites
# ────────────────────────────────────────────────────

check_prerequisites() {
  info "Checking prerequisites..."

  # Node.js >= 22
  if ! command -v node &>/dev/null; then
    error "Node.js not found. Install Node.js >= 22: https://nodejs.org"
    exit 1
  fi
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -lt 22 ]; then
    error "Node.js >= 22 required (found v$(node -v))"
    exit 1
  fi
  success "Node.js $(node -v)"

  # npm
  if ! command -v npm &>/dev/null; then
    error "npm not found"
    exit 1
  fi
  success "npm $(npm -v)"

  # Bare Runtime (optional)
  if command -v bare &>/dev/null; then
    success "Bare Runtime $(bare --version 2>/dev/null || echo 'installed')"
    HAS_BARE=true
  else
    warn "Bare Runtime not found (will use Node.js for wallet isolate)"
    HAS_BARE=false
  fi

  # Git
  if ! command -v git &>/dev/null; then
    error "git not found"
    exit 1
  fi
  success "git $(git --version | cut -d' ' -f3)"
}

# ────────────────────────────────────────────────────
# Step 1: Clone or detect project
# ────────────────────────────────────────────────────

setup_project() {
  if [ -f "package.json" ] && grep -q '"oikos"' package.json 2>/dev/null; then
    info "Oikos project detected in current directory"
    PROJECT_DIR="$(pwd)"
  elif [ -d "oikos" ]; then
    info "Oikos directory found"
    PROJECT_DIR="$(pwd)/oikos"
    cd "$PROJECT_DIR"
  else
    info "Cloning Oikos Protocol..."
    git clone https://github.com/adrianosousa/oikos.git
    PROJECT_DIR="$(pwd)/oikos"
    cd "$PROJECT_DIR"
    success "Cloned to $PROJECT_DIR"
  fi
}

# ────────────────────────────────────────────────────
# Step 2: Install dependencies
# ────────────────────────────────────────────────────

install_deps() {
  info "Installing dependencies..."
  npm install --silent 2>&1 | tail -1
  success "Dependencies installed"
}

# ────────────────────────────────────────────────────
# Step 3: Build
# ────────────────────────────────────────────────────

build_project() {
  info "Building TypeScript..."
  npm run build 2>&1 | tail -1
  success "Build complete"
}

# ────────────────────────────────────────────────────
# Step 4: Interactive configuration
# ────────────────────────────────────────────────────

configure() {
  echo ""
  echo -e "  ${BOLD}Configuration${NC}"
  echo -e "  ${PURPLE}────────────────────────────────────${NC}"
  echo ""

  # --- LLM Mode ---
  echo -e "  ${BOLD}LLM Mode${NC}"
  echo "    1) mock  — Deterministic demo (no LLM needed, recommended for evaluation)"
  echo "    2) local — Ollama + Qwen 3 8B (sovereign, zero cloud deps)"
  echo "    3) cloud — Remote API (OpenAI-compatible endpoint)"
  echo ""
  ask "Select LLM mode [1]: "
  read -r LLM_CHOICE
  LLM_CHOICE=${LLM_CHOICE:-1}

  case $LLM_CHOICE in
    1)
      LLM_MODE="local"
      MOCK_LLM="true"
      OLLAMA_URL="http://localhost:11434/v1"
      OLLAMA_MODEL="qwen3:8b"
      LLM_API_KEY=""
      LLM_BASE_URL=""
      LLM_MODEL=""
      success "Mock LLM mode (deterministic demo)"
      ;;
    2)
      LLM_MODE="local"
      MOCK_LLM="false"
      ask "Ollama URL [http://localhost:11434/v1]: "
      read -r OLLAMA_URL
      OLLAMA_URL=${OLLAMA_URL:-http://localhost:11434/v1}
      ask "Model name [qwen3:8b]: "
      read -r OLLAMA_MODEL
      OLLAMA_MODEL=${OLLAMA_MODEL:-qwen3:8b}
      LLM_API_KEY=""
      LLM_BASE_URL=""
      LLM_MODEL=""
      success "Local LLM: $OLLAMA_MODEL at $OLLAMA_URL"

      # Check Ollama
      if command -v ollama &>/dev/null; then
        if ! ollama list 2>/dev/null | grep -q "$OLLAMA_MODEL"; then
          warn "Model $OLLAMA_MODEL not found. Run: ollama pull $OLLAMA_MODEL"
        fi
      else
        warn "Ollama not found. Install: https://ollama.com"
      fi
      ;;
    3)
      LLM_MODE="cloud"
      MOCK_LLM="false"
      OLLAMA_URL=""
      OLLAMA_MODEL=""
      ask "API endpoint URL: "
      read -r LLM_BASE_URL
      ask "API key: "
      read -rs LLM_API_KEY
      echo ""
      ask "Model name [claude-sonnet-4-20250514]: "
      read -r LLM_MODEL
      LLM_MODEL=${LLM_MODEL:-claude-sonnet-4-20250514}
      success "Cloud LLM: $LLM_MODEL"
      ;;
    *)
      LLM_MODE="local"
      MOCK_LLM="true"
      OLLAMA_URL="http://localhost:11434/v1"
      OLLAMA_MODEL="qwen3:8b"
      LLM_API_KEY=""
      LLM_BASE_URL=""
      LLM_MODEL=""
      success "Defaulting to mock LLM"
      ;;
  esac

  # --- Wallet Mode ---
  echo ""
  echo -e "  ${BOLD}Wallet Mode${NC}"
  echo "    1) mock — Demo wallet (no blockchain, recommended for evaluation)"
  echo "    2) real — Testnet wallet (connects to Sepolia + BTC testnet)"
  echo ""
  ask "Select wallet mode [1]: "
  read -r WALLET_CHOICE
  WALLET_CHOICE=${WALLET_CHOICE:-1}

  MOCK_WALLET="true"
  WALLET_SEED=""
  SEED_PASSPHRASE=""

  case $WALLET_CHOICE in
    1)
      MOCK_WALLET="true"
      success "Mock wallet mode (no blockchain access)"
      ;;
    2)
      MOCK_WALLET="false"
      echo ""
      echo "    Seed phrase options:"
      echo "      a) Generate new 24-word seed"
      echo "      b) Enter existing seed phrase"
      echo "      c) Use encrypted seed file (if exists)"
      ask "Select [a]: "
      read -r SEED_CHOICE
      SEED_CHOICE=${SEED_CHOICE:-a}

      case $SEED_CHOICE in
        a)
          info "A new seed will be generated at startup"
          ask "Encryption passphrase (min 12 chars): "
          read -rs SEED_PASSPHRASE
          echo ""
          ;;
        b)
          ask "Enter 24-word seed phrase: "
          read -rs WALLET_SEED
          echo ""
          ;;
        c)
          info "Will use .oikos-seed.enc.json if present"
          ask "Decryption passphrase: "
          read -rs SEED_PASSPHRASE
          echo ""
          ;;
      esac
      success "Real wallet mode (testnet)"
      ;;
  esac

  # --- Swarm ---
  echo ""
  ask "Enable swarm (P2P agent marketplace)? [Y/n]: "
  read -r SWARM_CHOICE
  SWARM_ENABLED="true"
  MOCK_SWARM="true"
  if [[ "${SWARM_CHOICE,,}" == "n" ]]; then
    SWARM_ENABLED="false"
    MOCK_SWARM="false"
  fi

  # --- ERC-8004 ---
  echo ""
  ask "Enable ERC-8004 on-chain identity? [y/N]: "
  read -r ERC_CHOICE
  ERC8004_ENABLED="false"
  if [[ "${ERC_CHOICE,,}" == "y" ]]; then
    ERC8004_ENABLED="true"
  fi

  # --- Companion ---
  echo ""
  ask "Enable companion channel (P2P human-agent)? [y/N]: "
  read -r COMP_CHOICE
  COMPANION_ENABLED="false"
  COMPANION_OWNER_PUBKEY=""
  if [[ "${COMP_CHOICE,,}" == "y" ]]; then
    COMPANION_ENABLED="true"
    ask "Owner Ed25519 pubkey (hex, 64 chars, or leave blank): "
    read -r COMPANION_OWNER_PUBKEY
  fi

  # --- Dashboard ---
  ask "Dashboard port [3420]: "
  read -r DASHBOARD_PORT
  DASHBOARD_PORT=${DASHBOARD_PORT:-3420}
}

# ────────────────────────────────────────────────────
# Step 5: Generate .env
# ────────────────────────────────────────────────────

generate_env() {
  info "Generating .env..."

  cat > .env << ENVEOF
# Oikos Protocol — Generated by install.sh
# $(date -u +"%Y-%m-%d %H:%M UTC")

# === WALLET ===
WALLET_SEED="${WALLET_SEED}"
SEED_PASSPHRASE="${SEED_PASSPHRASE}"
MOCK_WALLET="${MOCK_WALLET}"
POLICY_FILE="policies.json"
AUDIT_LOG_PATH="audit.jsonl"

# === CHAINS ===
BTC_NETWORK="testnet"
ETH_RPC_URL="https://rpc.sepolia.org"

# === LLM ===
LLM_MODE="${LLM_MODE}"
MOCK_LLM="${MOCK_LLM}"
OLLAMA_URL="${OLLAMA_URL}"
OLLAMA_MODEL="${OLLAMA_MODEL}"
LLM_API_KEY="${LLM_API_KEY}"
LLM_BASE_URL="${LLM_BASE_URL}"
LLM_MODEL="${LLM_MODEL}"

# === EVENTS ===
MOCK_EVENTS="true"

# === SWARM ===
SWARM_ENABLED="${SWARM_ENABLED}"
MOCK_SWARM="${MOCK_SWARM}"
AGENT_NAME="oikos-agent"
AGENT_CAPABILITIES="payment,swap,bridge,yield,analysis"

# === DASHBOARD ===
DASHBOARD_PORT="${DASHBOARD_PORT}"

# === ERC-8004 ===
ERC8004_ENABLED="${ERC8004_ENABLED}"

# === COMPANION ===
COMPANION_ENABLED="${COMPANION_ENABLED}"
COMPANION_OWNER_PUBKEY="${COMPANION_OWNER_PUBKEY}"
COMPANION_TOPIC_SEED="oikos-companion-default"
COMPANION_UPDATE_INTERVAL_MS="5000"

# === WALLET RUNTIME ===
WALLET_RUNTIME="$([ "$HAS_BARE" = true ] && echo 'bare' || echo 'node')"
WALLET_ISOLATE_PATH="./wallet-isolate/dist/src/main.js"
ENVEOF

  # Copy example policy if not exists
  if [ ! -f "policies.json" ]; then
    cp policies.example.json policies.json
    success "Created policies.json from example"
  fi

  success "Generated .env"
}

# ────────────────────────────────────────────────────
# Step 6: OpenClaw integration
# ────────────────────────────────────────────────────

check_openclaw() {
  if command -v openclaw &>/dev/null; then
    info "OpenClaw detected — installing wallet skill..."
    # OpenClaw loads personal skills from ~/.agents/skills/
    # (symlinks outside root are blocked by security policy)
    AGENTS_SKILLS="${HOME}/.agents/skills"
    mkdir -p "$AGENTS_SKILLS"
    if cp -R "$(pwd)/skills/wdk-wallet" "$AGENTS_SKILLS/wdk-wallet" 2>/dev/null; then
      success "Installed skills/wdk-wallet to ~/.agents/skills/"
    else
      warn "Could not install skill (non-critical)"
    fi
  fi
}

# ────────────────────────────────────────────────────
# Step 7: CLI symlink
# ────────────────────────────────────────────────────

install_cli() {
  CLI_PATH="$(pwd)/wallet-gateway/dist/src/cli.js"
  if [ -f "$CLI_PATH" ]; then
    # Try to symlink into a PATH directory
    LOCAL_BIN="${HOME}/.local/bin"
    mkdir -p "$LOCAL_BIN"
    if ln -sf "$CLI_PATH" "$LOCAL_BIN/oikos" 2>/dev/null; then
      chmod +x "$CLI_PATH"
      success "Installed 'oikos' CLI to $LOCAL_BIN/oikos"
      if ! echo "$PATH" | grep -q "$LOCAL_BIN"; then
        warn "Add $LOCAL_BIN to your PATH: export PATH=\"\$HOME/.local/bin:\$PATH\""
      fi
    else
      warn "Could not install CLI globally. Use: npm run oikos -- balance"
    fi
  fi
}

# ────────────────────────────────────────────────────
# Done!
# ────────────────────────────────────────────────────

print_done() {
  echo ""
  echo -e "  ${GREEN}${BOLD}Oikos installed successfully!${NC}"
  echo ""
  echo -e "  ${BOLD}Start the agent:${NC}"
  echo -e "    ${CYAN}npm start${NC}          # Use .env config"
  echo -e "    ${CYAN}npm run demo${NC}       # Mock mode (zero deps)"
  echo ""
  echo -e "  ${BOLD}Dashboard:${NC}"
  echo -e "    ${CYAN}http://127.0.0.1:${DASHBOARD_PORT}${NC}"
  echo ""
  echo -e "  ${BOLD}CLI:${NC}"
  echo -e "    ${CYAN}oikos balance${NC}       # Check balances"
  echo -e "    ${CYAN}oikos health${NC}        # Gateway status"
  echo -e "    ${CYAN}oikos help${NC}          # All commands"
  echo ""
  echo -e "  ${BOLD}MCP endpoint:${NC}"
  echo -e "    ${CYAN}POST http://127.0.0.1:${DASHBOARD_PORT}/mcp${NC}"
  echo ""
  echo -e "  ${BOLD}Agent Card:${NC}"
  echo -e "    ${CYAN}http://127.0.0.1:${DASHBOARD_PORT}/agent-card.json${NC}"
  echo ""
}

# ────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────

print_header
check_prerequisites
setup_project
install_deps
build_project
configure
generate_env
check_openclaw
install_cli
print_done
