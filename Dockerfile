FROM node:22-bookworm-slim AS base
WORKDIR /app

# Build tools are only needed to compile native modules (better-sqlite3, ssh2)
# during npm install; they don't belong in the runtime image.
FROM base AS build-tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

FROM build-tools AS deps
ARG TARGETOS
ARG TARGETARCH
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN NPM_CPU=$(case "$TARGETARCH" in amd64) echo x64 ;; arm64) echo arm64 ;; *) echo "$TARGETARCH" ;; esac) \
    && npm ci --os=$TARGETOS --cpu=$NPM_CPU --libc=glibc

FROM deps AS builder
COPY . .
RUN npx prisma generate
RUN npm run build:next
# .next/cache only speeds up subsequent local builds; it's dead weight in an image.
RUN rm -rf .next/cache

# Production-only node_modules, skipping devDependencies (eslint, typescript,
# tailwindcss, @types/*) that aren't needed at runtime. `start` runs server.ts
# through tsx though, so that (and its only dependency, esbuild) is copied back in.
FROM build-tools AS prod-deps
ARG TARGETOS
ARG TARGETARCH
COPY package.json package-lock.json ./
COPY prisma ./prisma
# devDependencies (incl. husky) are omitted below, but npm still runs the
# "prepare" script -- drop it here so `npm ci` doesn't fail looking for husky.
RUN npm pkg delete scripts.prepare
RUN NPM_CPU=$(case "$TARGETARCH" in amd64) echo x64 ;; arm64) echo arm64 ;; *) echo "$TARGETARCH" ;; esac) \
    && npm ci --omit=dev --os=$TARGETOS --cpu=$NPM_CPU --libc=glibc
COPY --from=deps /app/node_modules/tsx ./node_modules/tsx
COPY --from=deps /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=deps /app/node_modules/@esbuild ./node_modules/@esbuild
# npm generates per-install helper shim files alongside the .bin symlinks
# (e.g. package-<hash>.mjs) that the tsx/esbuild wrappers need to resolve
# their own package.json -- copy the whole .bin dir rather than guessing names.
COPY --from=deps /app/node_modules/.bin ./node_modules/.bin

FROM base AS runner
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl nmap iputils-ping traceroute whois \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

RUN mkdir -p /app/data
VOLUME ["/app/data"]
ENV DATABASE_URL="file:/app/data/netmaster.db"

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "start"]
