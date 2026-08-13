#!/usr/bin/env bash
# Install Articulate Browser Helper as a macOS LaunchAgent (no terminal required after this once).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.articulate.browser-helper"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/Library/Logs/Articulate"
mkdir -p "$LOG_DIR"

NODE_BIN="$(command -v node)"
TSX_BIN="$ROOT/node_modules/.bin/tsx"
if [[ ! -x "$TSX_BIN" ]]; then
  (cd "$ROOT" && npm install)
fi

cat >"$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${TSX_BIN}</string>
    <string>${ROOT}/src/server.ts</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ARTICULATE_APP_ORIGIN</key>
    <string>http://127.0.0.1:3000</string>
    <key>ARTICULATE_BRIDGE_ORIGINS</key>
    <string>http://localhost:3000,http://127.0.0.1:3000,https://app.articulate.pt,https://staging.articulate.pt</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/browser-helper.out.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/browser-helper.err.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Installed ${LABEL}"
echo "Helper listens on http://127.0.0.1:17321"
echo "Open Articulate → Connect when prompted. No token copy required."
