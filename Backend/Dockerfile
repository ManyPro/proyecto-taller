# syntax=docker/dockerfile:1
# Backend Dockerfile for proyecto-taller
FROM node:20-alpine

# Ensure system has necessary packages
# - chromium: headless browser for HTML -> PDF rendering
# - fonts/libs: improve PDF typography and avoid missing font glyphs
RUN apk add --no-cache \
    tini \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV NODE_ENV=production \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PORT=3000

# Create app directory
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy source code
COPY src ./src
COPY scripts ./scripts
COPY perfiles.json ./perfiles.json

# Expose application port
EXPOSE 3000

# Run as non-root where possible
RUN mkdir -p /app/uploads \
 && chown -R node:node /app/uploads
USER node

ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","src/server.js"]