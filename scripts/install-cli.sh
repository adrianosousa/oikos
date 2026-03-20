#!/usr/bin/env bash
set -e

# Oikos CLI installer — non-interactive, agent-friendly
# Usage: curl -fsSL https://raw.githubusercontent.com/adrianosousa/oikos/main/scripts/install-cli.sh | bash

OIKOS_DIR="${OIKOS_DIR:-$HOME/.oikos}"
BIN_DIR="$OIKOS_DIR/bin"
REPO_DIR="$OIKOS_DIR/repo"
REPO_URL="https://github.com/adrianosousa/oikos.git"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}info${NC}: $1"; }
warn() { echo -e "${YELLOW}warn${NC}: $1"; }

main() {
  echo ""
  echo "Installing Oikos CLI..."
  echo ""

  # Check Node.js >= 22
  if ! command -v node >/dev/null 2>&1; then
    echo "error: Node.js not found. Install Node.js >= 22: https://nodejs.org"
    exit 1
  fi
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -lt 22 ]; then
    echo "error: Node.js >= 22 required (found $(node -v))"
    exit 1
  fi
  info "Node.js $(node -v)"

  # Create directories
  mkdir -p "$OIKOS_DIR"
  mkdir -p "$BIN_DIR"

  # Clone or update repo
  if [ -d "$REPO_DIR/.git" ]; then
    info "Updating existing installation..."
    cd "$REPO_DIR" && git pull --quiet 2>/dev/null || true
  else
    info "Cloning Oikos Protocol..."
    git clone --quiet --depth 1 "$REPO_URL" "$REPO_DIR"
  fi

  # Install dependencies and build
  cd "$REPO_DIR"
  info "Installing dependencies..."
  npm install --silent 2>&1 | tail -1
  info "Building..."
  npm run build 2>&1 | tail -1

  # Create wrapper script (handles absolute path)
  cat > "$BIN_DIR/oikos" << 'WRAPPER'
#!/usr/bin/env bash
OIKOS_DIR="${OIKOS_DIR:-$HOME/.oikos}"
exec node "$OIKOS_DIR/repo/bin/oikos.mjs" "$@"
WRAPPER
  chmod +x "$BIN_DIR/oikos"

  # Create env file for shell sourcing
  cat > "$OIKOS_DIR/env" << 'ENVEOF'
# oikos shell setup
export PATH="$HOME/.oikos/bin:$PATH"
ENVEOF

  # Try to add to shell config
  local source_line='. "$HOME/.oikos/env"'
  for cfg in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile"; do
    if [ -f "$cfg" ] && ! grep -qF ".oikos/env" "$cfg" 2>/dev/null; then
      echo "" >> "$cfg"
      echo "# Added by Oikos installer" >> "$cfg"
      echo "$source_line" >> "$cfg"
      info "Added oikos to PATH in $cfg"
    fi
  done

  echo ""
  info "Oikos CLI installed to $BIN_DIR/oikos"
  info "Version: $(cd "$REPO_DIR" && node -e "console.log(require('./package.json').version)" 2>/dev/null || echo '0.2.0')"
  echo ""
  info "To get started, either restart your shell or run:"
  echo ""
  echo "  source $OIKOS_DIR/env"
  echo ""

  # Quick connectivity test
  if curl -s http://127.0.0.1:3420/api/health >/dev/null 2>&1; then
    info "Wallet detected at http://127.0.0.1:3420 — ready to use!"
    echo ""
    echo '  "$HOME/.oikos/bin/oikos" health'
    echo '  "$HOME/.oikos/bin/oikos" balance'
  else
    info "No wallet running. Start one with:"
    echo ""
    echo "  cd $REPO_DIR && npm start"
    echo ""
    echo "  Or in mock mode (no real funds):"
    echo "  cd $REPO_DIR && OIKOS_MODE=mock npm start"
  fi
  echo ""
}

main
