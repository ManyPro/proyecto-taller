# syntax=docker/dockerfile:1
# Backend Dockerfile for proyecto-taller
FROM node:20-alpine

# Ensure system has necessary packages (optional)
RUN apk add --no-cache tini

ENV NODE_ENV=production \
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
# node image already has `node` user, but our deps may write to uploads. Ensure perms.
RUN mkdir -p /app/uploads \
 && chown -R node:node /app/uploads
USER node

ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","src/server.js"]
