# --- build stage -----------------------------------------------------------
FROM node:22-slim AS builder
WORKDIR /app

# Build tools for native modules (better-sqlite3) in case no prebuild matches.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build
# Drop dev dependencies, keep the compiled better-sqlite3 binary.
RUN npm prune --omit=dev

# --- runtime stage ---------------------------------------------------------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/plate.db
ENV PORT=3000

# App runtime needs: the built server, production deps, and the migration SQL.
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/package.json ./package.json

# SQLite lives on a mounted volume.
RUN mkdir -p /data
VOLUME /data

EXPOSE 3000
CMD ["node", "build/index.js"]
