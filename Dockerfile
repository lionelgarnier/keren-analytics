# Pin a specific minor for reproducibility. For a fully reproducible build,
# pin by digest (FROM node:22-alpine@sha256:...) once your registry mirror is
# known; a floating `22-alpine` tag can change under the same commit.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first (better layer caching). --ignore-scripts blocks
# arbitrary postinstall scripts from transitive deps; clean the cache so it
# doesn't bloat the layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy application source (scripts/ included so backup:sqlite / build:contract
# are runnable inside the container, not just via the in-process scheduler).
COPY src/ ./src/
COPY public/ ./public/
COPY kql/ ./kql/
COPY scripts/ ./scripts/

# Non-root user for security; pre-create the runtime-writable data dir
RUN addgroup -S app && adduser -S app -G app && \
    mkdir -p /app/data && \
    chown -R app:app /app/data
USER app

# Default environment. AZURE_MODE is intentionally NOT defaulted to mock: in
# production the app fails loud unless AZURE_MODE=real (or ALLOW_MOCK_IN_PROD=
# true for a deliberate demo). The Bicep deploy sets AZURE_MODE=real; local
# demos run via docker compose (NODE_ENV=development).
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Note: Container Apps uses the Bicep-defined probes, not this HEALTHCHECK —
# it applies to plain `docker run` / docker compose only.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:3000/healthz || exit 1

CMD ["node", "src/server.js"]
