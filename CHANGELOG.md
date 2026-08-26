## v1.5.0 - 2026-08-26

- Add VPN/WireGuard management feature to README
- Fix whiptail dialogs hanging when installed via curl | bash
- Add --no-whiptail flag to skip TUI in install.sh
- Add WireGuard config import option alongside create
- Surface remote error detail in WireGuard create/import toast
- Fix root-script sudo password leak and wg-quick temp file naming
- Fix WireGuard interface list silently returning empty on error
- Surface remote error detail across all WireGuard action toasts
- Include journalctl output when WireGuard unit fails to start
- Auto-install resolvconf before starting WireGuard interfaces with DNS set
- Replace automatic Proxmox/Docker polling with manual refresh and advanced polling toggle
- Add router and repeater devices to network topology graph
- Add connected-devices history chart for repeaters
- Draw client connections in network topology graph
- Link known servers to routers instead of duplicate client nodes
- Filter self and duplicate router/repeater client entries
- Spread client nodes into rings to avoid overlap
- Add auto-mount-on-boot option to disk mount dialog
- Surface real storage command errors instead of generic internal error
- Fall back to sudo for chmod/chown in file manager
- Add centralized NAS system with separate NAS users, shares, and gateway
- Auto-generate NAS_INTERNAL_SECRET in install/update scripts
- Exclude gateway/ from root tsconfig to fix Next.js build
- Disable Next.js telemetry collection
- Add version banner and auto-bump for installer/updater scripts
- Translate installer, updater CLI, and reset-login script to English
- Add folder browser for NAS share remote path selection
- Fix updater exiting silently when NAS secret is missing from .env
- Add NAS connect-info text, per-user quota, SSHFS-only share wizard
- Fix NAS connect-text crash and ICU parse errors
- Always start the NAS gateway container
- Fix gateway Docker build failing on fuse/fuse3 conflict
- Fix gateway crash-looping on ssh2's CommonJS/ESM import
- Fix runaway concurrent SSHFS mount attempts
- Move gateway image to Debian trixie for a modern openssh-client
- Fix password-auth SSHFS mounts never actually authenticating
- Detect and recover dead SSHFS mounts, add missing error translations
- Strengthen dead-mount detection from stat() to readdir()
- Remove sshfs's own "-o reconnect" - it wedges password-auth mounts
- Fix Samba config never removing its old managed block, slow recovery
- Use a readable Samba share name, drop stock printer shares
- Only suffix Samba share names when they'd actually collide
- Debounce dead-mount detection to stop killing in-progress transfers
- Replace proactive mount health-check with reactive recovery
- Remove the centralized NAS system
- Remove orphaned containers on update
- Add relocatable data directory to reduce SD card writes
- Enforce correct ownership/permissions on the data directory


## v1.4.0 - 2026-08-22

- Add input history dropdown to tools page fields
- Add complete feature list to README


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

