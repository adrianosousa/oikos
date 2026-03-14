#!/bin/bash
# Oikos Relay Node — Quick Setup
#
# Run on the VPS host (not inside Docker):
#   curl -sSL https://raw.githubusercontent.com/adrianosousa/oikos/main/scripts/setup-relay.sh | bash
#
# Or manually:
#   bash scripts/setup-relay.sh

set -e

INSTALL_DIR="/opt/oikos-relay"
SERVICE_NAME="oikos-relay"

echo "[setup] Installing Oikos DHT Relay Node..."

# 1. Create install dir
mkdir -p "$INSTALL_DIR"

# 2. Check for Node.js
if ! command -v node &>/dev/null; then
  echo "[setup] Node.js not found. Installing via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "[setup] Node.js: $(node --version)"

# 3. Install hyperdht
cd "$INSTALL_DIR"
if [ ! -f package.json ]; then
  npm init -y --silent >/dev/null 2>&1
fi
npm install hyperdht --save-exact --silent 2>/dev/null
echo "[setup] hyperdht installed."

# 4. Copy relay script
cp "$(dirname "$0")/relay-node.mjs" "$INSTALL_DIR/relay-node.mjs" 2>/dev/null || {
  # If running via curl, download it
  curl -sSL https://raw.githubusercontent.com/adrianosousa/oikos/main/scripts/relay-node.mjs -o "$INSTALL_DIR/relay-node.mjs"
}

# 5. Install systemd service
cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=Oikos DHT Relay Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/node ${INSTALL_DIR}/relay-node.mjs
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

# 6. Start it
systemctl daemon-reload
systemctl enable --now ${SERVICE_NAME}

# 7. Wait for startup and grab pubkey
sleep 2
PUBKEY=$(journalctl -u ${SERVICE_NAME} --no-pager -n 20 | grep "Pubkey:" | tail -1 | awk '{print $NF}')

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  Oikos Relay Node is running!"
echo ""
if [ -n "$PUBKEY" ]; then
  echo "  SWARM_RELAY_PUBKEY=${PUBKEY}"
else
  echo "  Run: journalctl -u ${SERVICE_NAME} -f"
  echo "  to see the relay pubkey."
fi
echo ""
echo "  Status: systemctl status ${SERVICE_NAME}"
echo "  Logs:   journalctl -u ${SERVICE_NAME} -f"
echo "  Stop:   systemctl stop ${SERVICE_NAME}"
echo "════════════════════════════════════════════════════════════"
