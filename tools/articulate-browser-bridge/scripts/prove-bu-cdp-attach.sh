#!/usr/bin/env bash
# Prove Browser Use open-source can attach to the Bridge's EXISTING browser via CDP.
# Does NOT start a second Chrome. Does NOT use Browser Use Cloud.
#
# Usage:
#   1. Start Bridge + create a session from /dev/local-browser
#   2. BRIDGE_TOKEN=... SESSION_ID=... ./scripts/prove-bu-cdp-attach.sh
set -euo pipefail

BRIDGE_URL="${BRIDGE_URL:-http://127.0.0.1:17321}"
TOKEN="${BRIDGE_TOKEN:?Set BRIDGE_TOKEN}"
SESSION_ID="${SESSION_ID:?Set SESSION_ID}"

CDP_JSON=$(curl -sS -H "Authorization: Bearer ${TOKEN}" "${BRIDGE_URL}/v1/sessions/${SESSION_ID}/cdp")
CDP_URL=$(CDP_JSON="$CDP_JSON" python3 - <<'PY'
import json, os
print(json.loads(os.environ["CDP_JSON"])["cdpUrl"])
PY
)

echo "Bridge session CDP: ${CDP_URL}"
echo "Fetching /json/version from the SAME browser…"
curl -sS "${CDP_URL}/json/version" | python3 -m json.tool

if command -v browser-use >/dev/null 2>&1; then
  echo "Running browser-use page_info() against BU_CDP_URL (no Cloud, no new browser)…"
  BU_CDP_URL="${CDP_URL}" browser-use <<'PY'
print(page_info())
PY
elif command -v uvx >/dev/null 2>&1; then
  echo "Running uvx browser-use page_info() against BU_CDP_URL…"
  BU_CDP_URL="${CDP_URL}" uvx browser-use <<'PY'
print(page_info())
PY
else
  echo "browser-use CLI not installed — CDP endpoint verified via /json/version."
  echo "Install later with: uv tool install browser-use"
  echo "Then: BU_CDP_URL=${CDP_URL} browser-use <<'PY'"
  echo "print(page_info())"
  echo "PY"
fi
