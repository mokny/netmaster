## v1.3.0 - 2026-08-22

- Add storage management: disks/LVM/RAID, NFS, Samba
- Add Samba install prompt and uninstall button
- Rework Samba share permissions to a checkbox user list
- Add global storage overview with live NFS/Samba management
- Add password change action for Samba users
- Fix read checkbox not showing for write users on share edit
- Add feature screenshots to README
- Reorganize installation instructions in README for clarity and consistency


## v1.2.0 - 2026-08-22

- Add job scheduling and network tools panel


## v1.1.0 - 2026-08-22

- feat: add admin panel to toggle all polling types instance-wide
- Reduce Proxmox/Docker polling load via ping and on-demand refresh
- Add zoomable/pannable time-series charts and poll-log debug view


# Changelog

## v1.0.0 - 2026-08-21

- Initial commit from Create Next App
- Add NetMaster: self-hosted server monitoring dashboard
- Add installation script and CLI for NetMaster; update README and Docker Compose configuration
- Fix Dockerfile: change apt-get install option to --no-install-recommends
- Update Dockerfile and next.config.ts: streamline npm installation and configure serverExternalPackages
- Add COOKIE_SECURE configuration for session cookies in .env and update auth logic
- Add middleware for session verification and redirect logic in proxy.ts
- Add DB-backed sessions, account/password page, Docker page, and dashboard resize fixes
- Add netmaster cleanup command to purge stale images, build cache, backups
- Add Docker widgets/terminal, QEMU VNC console, live widget titles, tabbed terminal panel
- Add Docker image/container management and explicit Docker/Proxmox toggles
- Add TOTP 2FA and passkey login with shell-based login reset
- Add Proxmox snapshot and backup management with multi-delete
- Add confirmation dialog for critical actions across multiple components
- Add SSH server firewall management, port overview, and network graphs
- Reuse SSH connection for live process-list polling
- Make process list collapsible, only poll while expanded
- Enhance WebAuthn support by improving origin handling behind reverse proxies
- Disable user verification requirement in registration and authentication verification
- Reuse SSH connections for scheduler and topology/ports polling
- Add server system info and enhance CLI commands
- Netzwerk-Durchsatzgraphen in GB/Gbit, PWA mit Push-Benachrichtigungen und mobiles Dashboard
- Fix: Dashboard-Graphen auf Mobile unsichtbar + seitliches Scrollen
- Fix: Server-Detail-Aktionen, Summary-Kacheln und Terminal auf Mobile
- VAPID-Schlüssel für Web-Push automatisch generieren statt manuell konfigurieren
- Granulare Push-Konfiguration, HTTP-Upchecker, Versionierung/Release und Router-Verwaltung
- feat: add explore functionality with network scanning and device discovery
- feat: add WakeLockCard component to prevent screen sleep
- feat: implement Wake Lock functionality with video fallback and test push notification API
- fix: update Dockerfile to use npm ci with TARGETOS and TARGETARCH, modify overflow-x to clip in globals.css, and simplify version retrieval in version.ts
- feat: add mobile navigation using Sheet component and refactor visibleNavItems logic
- fix: implement singleton pattern for VapidKeys to prevent race conditions during key generation
- feat: refactor push notification handling to support individual subscriptions and improve error management
- feat: add disk cleanup action for APT/Docker/journal on server detail page
- fix: slim down runtime Docker image by pruning build tools, dev deps, and .next cache
- fix: restore tsx/esbuild .bin symlinks in production image
- fix: copy full node_modules/.bin dir instead of cherry-picked symlinks
- feat: surface push send errors, server snippets, editable checks, router throughput graph
- fix: snippet runner no longer advances on its own input echo
- fix: include push-service response body in surfaced send errors
- fix: VAPID subject was defaulting to localhost, which Apple rejects
- feat: sticky mobile header, delayed/recovery notifications, ping checks, and exec-based file manager for Docker/Proxmox
- feat: WireGuard interface management for SSH-managed servers
- fix: status detail modal, scan hostnames, snippet race, mobile menu, version
- fix: show actual WARNING trigger in upchecker status modal
- feat: auto-detect VPN/LAN interfaces as Explore scan ranges
- feat: query LAN gateway DNS for Explore hostname resolution
- feat: connect links for HTTP/HTTPS/FTP/SSH on Explore hosts
- fix: VPN hosts (no ARP/MAC) were silently dropped from Explore scans
- feat: live-update the Explore host/range list instead of polling
- fix: exclude docker0/veth/bridge interfaces from Explore range detection
- feat: abort a running Explore scan and clear the discovered-hosts list
- fix: fall back to .1 convention when LAN gateway can't be detected
- fix: surface nmap's actual stderr/timeout reason, raise discovery timeout
- feat: sortierbare Spalten in Explore-Ergebnisliste
- feat: automatische Versionsanzeige pro Commit und im mobilen Menü
- feat: IP-Anzeige für VMs, LXCs und Docker-Container; fix: Docker-Build (husky)
- feat: make app multilingual (en/de/nl/fr/es)

