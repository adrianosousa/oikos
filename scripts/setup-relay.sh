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

# 4. Install relay script
# If this is a git clone, use the repo copy directly (git pull updates it).
# Otherwise, download or copy to the flat install dir.
if [ -f "$INSTALL_DIR/scripts/relay-node.mjs" ]; then
  # Git clone detected — point systemd at the repo path
  RELAY_SCRIPT="$INSTALL_DIR/scripts/relay-node.mjs"
  echo "[setup] Using repo script at $RELAY_SCRIPT"
else
  RELAY_SCRIPT="$INSTALL_DIR/relay-node.mjs"
  cp "$(dirname "$0")/relay-node.mjs" "$RELAY_SCRIPT" 2>/dev/null || {
    # If running via curl, download it
    curl -sSL https://raw.githubusercontent.com/adrianosousa/oikos/main/scripts/relay-node.mjs -o "$RELAY_SCRIPT"
  }
  echo "[setup] Copied relay script to $RELAY_SCRIPT"
fi

# 5. Install systemd service
cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=Oikos DHT Relay Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/node ${RELAY_SCRIPT}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

# 6. Open firewall for DHT (UDP) if UFW is active
if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
  # HyperDHT uses a random high port; allow the range
  ufw allow 49152:65535/udp >/dev/null 2>&1
  echo "[setup] UFW: opened UDP 49152-65535 for DHT."
fi

# 7. Start it
systemctl daemon-reload
systemctl enable --now ${SERVICE_NAME}

# 8. Wait for startup and grab pubkey
sleep 3
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
