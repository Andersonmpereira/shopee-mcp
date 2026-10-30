# EasyPanel / VPS
#   Port:   8080
#   Volume: /data          (the Shopee login survives redeploys)
#   Required env: VNC_PASSWORD (1-8 chars), UI_PASSWORD, MCP_AUTH_TOKEN
#   Optional: UI_USER (default shopee), SHOPEE_DOMAIN (default shopee.co.id)
#
# Open https://<domain>/ and use "Abrir o navegador" for the first manual login.
# Point the MCP client at https://<domain>/mcp with Authorization: Bearer <MCP_AUTH_TOKEN>.
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    HUSKY=0 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    DISPLAY=:99 \
    SHOPEE_HEADLESS=false \
    SHOPEE_ENSURE_VISIBLE=true \
    SHOPEE_PROFILE_DIR=/data/chrome-profile \
    CLOAKBROWSER_CACHE_DIR=/opt/cloakbrowser \
    MCP_TRANSPORT=http \
    MCP_PORT=8080 \
    NOVNC_WEB_ROOT=/usr/share/novnc \
    WEBSOCKIFY_PORT=6080 \
    LANG=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fluxbox \
    fonts-freefont-ttf \
    fonts-ipafont-gothic \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-tlwg-loma-otf \
    fonts-unifont \
    fonts-wqy-zenhei \
    gosu \
    novnc \
    python3-websockify \
    x11-utils \
    x11vnc \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY src ./src

RUN npm ci \
    && npx playwright install-deps chromium \
    && npx cloakbrowser install \
    && npm run build \
    && npm prune --omit=dev \
    && mkdir -p /data/chrome-profile /opt/cloakbrowser \
    && chown -R node:node /app /data /opt/cloakbrowser /home/node

COPY docker/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 8080
VOLUME /data

ENTRYPOINT ["/entrypoint.sh"]
