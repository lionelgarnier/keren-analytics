FROM node:22-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application source
COPY src/ ./src/
COPY public/ ./public/
COPY kql/ ./kql/

# Non-root user for security
RUN addgroup -S app && adduser -S app -G app
USER app

# Default environment
ENV NODE_ENV=production
ENV AZURE_MODE=mock
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:3000/auth/session || exit 1

CMD ["node", "src/server.js"]
