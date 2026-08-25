FROM node:22-bookworm-slim AS base
WORKDIR /app

FROM base AS build-tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

FROM build-tools AS deps
COPY package.json package-lock.json* ./
RUN npm install

FROM deps AS builder
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM base AS runner
# sshfs fürs Mounten der Freigaben (zieht fuse3 automatisch als Abhängigkeit
# - das ältere "fuse"-Paket NICHT explizit mitinstallieren, das bricht auf
# aktuellem Debian/bookworm mit "fuse3 : Breaks: fuse" / "sshfs : Breaks:
# fuse (< 3)"), samba fürs zentrale SMB, sshpass für Passwort-basierte
# SSHFS-Verbindungen, openssh-client liefert ssh-keygen für den
# SFTP-Host-Key, nfs-common für den optionalen NFS-Transport.
RUN apt-get update && apt-get install -y --no-install-recommends \
    sshfs samba samba-common-bin sshpass openssh-client nfs-common \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./package.json

RUN mkdir -p /mnt/nas /etc/netmaster-nas

EXPOSE 21 990 2222 4501
CMD ["node", "dist/index.js"]
