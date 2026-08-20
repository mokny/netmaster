FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl python3 make g++ nmap \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
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

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
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
