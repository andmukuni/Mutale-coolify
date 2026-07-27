# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Mutale — single-container image
#   • Builds the Vite/React frontend (dist/)
#   • Runs the Express API which also serves dist/ and /uploads on one port
#   • Node 20 (matches local dev). `canvas` is a native dep → needs system libs.
#
# Single build stage (no parallel npm ci) — Coolify/small VPS builds were OOM-killed
# when deps + build stages ran `npm ci` concurrently (exit 255).
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-bookworm AS build
WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    NODE_ENV=development \
    npm_config_jobs=1

COPY package.json package-lock.json .npmrc ./
RUN npm ci --include=dev

COPY . .
RUN NODE_ENV=production NODE_OPTIONS="--max-old-space-size=1536" npm run build
RUN npm prune --omit=dev

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      libcairo2 \
      libpango-1.0-0 \
      libpangocairo-1.0-0 \
      libjpeg62-turbo \
      libgif7 \
      librsvg2-2 \
      libpixman-1-0 \
      fontconfig \
      fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=4000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY package.json package-lock.json .npmrc ./
COPY Logo-Website-Mutale-08.png ./

RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
VOLUME ["/app/uploads"]

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
