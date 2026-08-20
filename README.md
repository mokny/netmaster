# NetMaster

Selbst-gehostetes Netzwerkadministratorpanel: Live-Monitoring deiner Server (CPU/RAM/Disk/Load/Netzwerk via SSH), HTTP-Health-Checks, Docker-Container-Übersicht und ein frei anordenbares Dashboard – hinter einem Multi-User-Login mit Rollen (Admin/Editor/Viewer).

## Stack

- Next.js 16 (App Router) + TypeScript, Tailwind CSS + shadcn/ui
- Custom Node-Server (`server.ts`) für WebSocket-Live-Updates neben Next.js
- SQLite via Prisma (`@prisma/adapter-better-sqlite3`)
- SSH-Monitoring über `ssh2`, verschlüsselte Credentials (AES-256-GCM)
- Recharts für Live-Graphen, `react-grid-layout` für das Drag-&-Drop-Dashboard

## Installation (Linux-Server, empfohlen)

Ein einzelner Befehl installiert Docker (falls nötig), lädt das neueste Release,
führt dich durch ein kurzes Setup (Admin-Account, Port, optional HTTPS via
Caddy + Let's Encrypt) und startet NetMaster:

```bash
curl -fsSL https://raw.githubusercontent.com/mokny/netmaster/main/install.sh | bash
```

Danach steht der `netmaster`-Befehl zur Verfügung:

```bash
netmaster status              # Status & URL anzeigen
netmaster logs                # Live-Logs
netmaster restart             # Container neu starten
netmaster update               # auf neuestes Release aktualisieren (mit DB-Backup)
netmaster update --nightly     # auf neuesten main-Commit aktualisieren
netmaster uninstall            # interaktiv entfernen
```

Der Einzeiler ist auch für Updates/Reparatur sicher erneut ausführbar: eine
bestehende Installation wird automatisch erkannt und stattdessen aktualisiert
(Secrets/`.env` bleiben unangetastet).

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

## Manuelle Docker-Compose-Installation

Für alle, die `install.sh` nicht nutzen wollen (z.B. bestehender Docker-Host):

```bash
cp .env.example .env
# MASTER_SECRET, AUTH_SECRET und SEED_ADMIN_PASSWORD in .env setzen

docker compose up --build -d
```

Die SQLite-Datenbank liegt persistent im Docker-Volume `netmaster-data`. Migrationen und der Admin-Seed laufen automatisch beim Containerstart (`docker-entrypoint.sh`). Optional: `HOST_PORT` in `.env` setzt den Port, auf dem die App lauscht (Standard `3000`). Für HTTPS via Caddy + Let's Encrypt: `COMPOSE_PROFILES=proxy` in `.env` setzen sowie ein `Caddyfile` anlegen (siehe `install.sh` für ein Beispiel), das per `reverse_proxy localhost:<HOST_PORT>` auf die App zeigt.

Der `netmaster`-Container läuft mit `network_mode: host` (kein Docker-Portmapping) und `cap_add: [NET_ADMIN, NET_RAW]`, damit die Explore-Netzwerkerkennung (siehe unten) das echte LAN sehen kann – er teilt sich also direkt das Netzwerk-Interface des Hosts. Wird Caddy als einziger öffentlicher Zugang genutzt, sollte der App-eigene Port zusätzlich per Host-Firewall von außen gesperrt werden (macht `install.sh` automatisch, wenn eine unterstützte Firewall aktiv ist).

## Explore (Netzwerk-Scan)

Der Menüpunkt „Explore" durchsucht das lokale Netzwerk per `nmap` (ARP-/Ping-Sweep, danach Port-/Dienst-Erkennung für gefundene Hosts) und zeigt an, welche Geräte noch nicht als Server/Router in NetMaster erfasst sind.

- **Docker**: funktioniert nur mit `network_mode: host` + `NET_ADMIN`/`NET_RAW` (siehe oben) – ohne Host-Networking sieht der Scan nur das isolierte Docker-Bridge-Netz, nicht das echte LAN. `network_mode: host` funktioniert unter Linux; unter Docker Desktop für Mac/Windows verhält es sich anders bzw. wird nicht unterstützt.
- **Lokale Entwicklung** (`npm run dev`): benötigt ein installiertes `nmap`-Binary im `PATH`. Ohne erhöhte Rechte liefert der Host-Sweep in der Regel keine MAC-Adressen (und Hosts ohne MAC werden übersprungen) – für vollständige Ergebnisse lokal ggf. `sudo npm run dev` verwenden.

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
