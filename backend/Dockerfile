# Multi-stage build to avoid npm on host. Container handles build and runtime.
FROM node:20-bookworm AS builder
WORKDIR /app

# Install all deps including devDependencies for TypeScript compilation
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY assets ./assets
COPY reports ./reports

# Build TypeScript to dist
RUN npm run build

FROM node:20-bookworm AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Puppeteer should download Chromium during install
ENV PUPPETEER_SKIP_DOWNLOAD=false

COPY package*.json ./
RUN npm ci --only=production

# Copy built app and required static assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/reports ./reports

# Ensure reports/saved exists
RUN mkdir -p /app/reports/saved

EXPOSE 3000
CMD ["node", "dist/app.js"]

