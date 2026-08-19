# NetMaster

Selbst-gehostetes Netzwerkadministratorpanel: Live-Monitoring deiner Server (CPU/RAM/Disk/Load/Netzwerk via SSH), HTTP-Health-Checks, Docker-Container-Übersicht und ein frei anordenbares Dashboard – hinter einem Multi-User-Login mit Rollen (Admin/Editor/Viewer).

## Stack

- Next.js 16 (App Router) + TypeScript, Tailwind CSS + shadcn/ui
- Custom Node-Server (`server.ts`) für WebSocket-Live-Updates neben Next.js
- SQLite via Prisma (`@prisma/adapter-better-sqlite3`)
- SSH-Monitoring über `ssh2`, verschlüsselte Credentials (AES-256-GCM)
- Recharts für Live-Graphen, `react-grid-layout` für das Drag-&-Drop-Dashboard

## Lokale Entwicklung

```bash
npm install
cp .env.example .env
# MASTER_SECRET und AUTH_SECRET setzen: openssl rand -hex 32 (jeweils einmal ausführen)

npx prisma migrate dev
npm run seed        # legt den ersten Admin-Account an (SEED_ADMIN_* aus .env)
npm run dev
```

Das Panel läuft dann unter http://localhost:3000. Login mit den `SEED_ADMIN_*`-Zugangsdaten aus der `.env`.

## Produktion mit Docker Compose

```bash
cp .env.example .env
# MASTER_SECRET, AUTH_SECRET und SEED_ADMIN_PASSWORD in .env setzen

docker compose up --build -d
```

Die SQLite-Datenbank liegt persistent im Docker-Volume `netmaster-data`. Migrationen und der Admin-Seed laufen automatisch beim Containerstart (`docker-entrypoint.sh`).

## Wichtige Umgebungsvariablen

| Variable | Zweck |
| --- | --- |
| `MASTER_SECRET` | AES-256-Schlüssel zur Verschlüsselung der SSH-Zugangsdaten in der DB (64 Hex-Zeichen) |
| `AUTH_SECRET` | Signaturschlüssel für Login-Session-JWTs (64 Hex-Zeichen) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | Nur beim ersten Start verwendet, um den initialen Admin-Account anzulegen |
| `DATABASE_URL` | SQLite-Pfad, z.B. `file:./prisma/dev.db` |

## Architekturnotizen

- Monitoring läuft als In-Process-Scheduler in `server.ts` (`src/lib/monitor/scheduler.ts`), der Server/Health-Checks per Intervall pollt und Ergebnisse per SQLite + WebSocket-Broadcast verteilt.
- Rollen: **Viewer** sieht nur, **Editor** verwaltet Server/Checks/Dashboard, **Admin** zusätzlich Nutzerverwaltung.
- Docker-Container-Metriken werden per SSH (`docker stats`/`docker ps`) auf dem Zielserver abgefragt – kein separater Agent nötig.
