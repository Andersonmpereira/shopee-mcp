#!/bin/bash
# Virtual display + noVNC, then the MCP server. The Shopee window is the same
# browser the server uses, so the first login (and a later captcha) happens in
# the page served on MCP_PORT.
set -euo pipefail

if [[ -z "${VNC_PASSWORD:-}" ]]; then
  echo "Defina VNC_PASSWORD (no maximo 8 caracteres)." >&2
  exit 1
fi
if [[ "${#VNC_PASSWORD}" -gt 8 || "${VNC_PASSWORD}" == -* ]]; then
  echo "VNC_PASSWORD deve ter de 1 a 8 caracteres e nao pode comecar com '-'." >&2
  exit 1
fi
if [[ -z "${MCP_AUTH_TOKEN:-}" ]]; then
  echo "Defina MCP_AUTH_TOKEN para proteger o endpoint /mcp." >&2
  exit 1
fi
if [[ -z "${UI_PASSWORD:-}" ]]; then
  echo "Defina UI_PASSWORD para proteger a tela do navegador." >&2
  exit 1
fi

if ! command -v websockify >/dev/null 2>&1; then
  echo "websockify nao encontrado na imagem." >&2
  exit 1
fi

export DISPLAY="${DISPLAY:-:99}"
export SHOPEE_PROFILE_DIR="${SHOPEE_PROFILE_DIR:-/data/chrome-profile}"
export SHOPEE_HEADLESS=false
export SHOPEE_ENSURE_VISIBLE=true
export MCP_TRANSPORT=http

mkdir -p "$SHOPEE_PROFILE_DIR" /tmp/vnc
# The profile is on a volume. Chrome records the previous container hostname in
# these locks, so the next deploy refuses to open ("profile in use on another
# computer") and the noVNC screen stays empty.
rm -f \
  "$SHOPEE_PROFILE_DIR/SingletonLock" \
  "$SHOPEE_PROFILE_DIR/SingletonSocket" \
  "$SHOPEE_PROFILE_DIR/SingletonCookie"
chown -R node:node "$SHOPEE_PROFILE_DIR" /tmp/vnc

# fluxbox calls fbsetbg on an empty desktop and pops a dialog. Nothing to set.
printf '%s\n' '#!/bin/sh' 'exit 0' > /usr/bin/fbsetbg
chmod 755 /usr/bin/fbsetbg

gosu node Xvfb "$DISPLAY" -screen 0 1600x900x24 -ac +extension GLX +render -noreset \
  >/tmp/xvfb.log 2>&1 &

ready=0
for _ in $(seq 1 50); do
  if gosu node xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.1
done
if [[ "$ready" -ne 1 ]]; then
  echo "O display virtual nao subiu." >&2
  cat /tmp/xvfb.log >&2 || true
  exit 1
fi

gosu node fluxbox >/tmp/fluxbox.log 2>&1 &
gosu node x11vnc -storepasswd "$VNC_PASSWORD" /tmp/vnc/pass >/dev/null
chown node:node /tmp/vnc/pass
chmod 600 /tmp/vnc/pass
gosu node x11vnc -display "$DISPLAY" -forever -shared -localhost -rfbport 5900 \
  -rfbauth /tmp/vnc/pass -noxdamage >/tmp/x11vnc.log 2>&1 &
gosu node websockify "127.0.0.1:${WEBSOCKIFY_PORT:-6080}" 127.0.0.1:5900 >/tmp/websockify.log 2>&1 &

echo "Tela do navegador em /  |  MCP em /mcp  |  health em /health" >&2
exec gosu node node /app/build/index.js
