# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Mutale — single-container image
#   • Builds the Vite/React frontend (dist/)
#   • Runs the Express API which also serves dist/ and /uploads on one port
#   • Node 20 (matches local dev). `canvas` is a native dep → needs system libs.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: production dependencies ────────────────────────────────────────
# Full Debian image so `canvas` can fetch/compile its native binary against the
# same glibc/ABI as the bookworm-slim runtime stage.
FROM node:20-bookworm AS deps
WORKDIR /app
# Skip Chromium download — puppeteer is an optionalDependency and receipt PDFs
# default to jsPDF in production (RECEIPT_PDF_LEGACY). Saves ~300MB + libs.
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev

# ── Stage 2: build frontend ─────────────────────────────────────────────────
FROM node:20-bookworm AS build
WORKDIR /app
# Force a full install (incl. devDependencies: vite, tailwind, the react plugin).
# Coolify sets NODE_ENV=production in the build env, which would otherwise make
# `npm ci` silently skip devDependencies and break `vite build`.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    NODE_ENV=development
COPY package.json package-lock.json .npmrc ./
RUN npm ci --include=dev
COPY . .
# Same-origin API in production — leave VITE_API_URL unset so the SPA calls /api
# on whatever origin Coolify serves it from.
RUN npm run build

# ── Stage 3: runtime ────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

# Runtime shared libraries required by the prebuilt `canvas` binary, plus fonts
# for certificate/seal rasterization.
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

# Production node_modules (incl. compiled canvas) and built assets.
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# Server runtime code. dist/ above + these are everything the API touches.
COPY server ./server
COPY shared ./shared
COPY package.json package-lock.json .npmrc ./

# Persisted user uploads — mount a Coolify volume here.
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
VOLUME ["/app/uploads"]

USER node
EXPOSE 4000

# DB-free liveness probe (Node 20 has global fetch; slim has no curl/wget).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
