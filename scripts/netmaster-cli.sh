#!/usr/bin/env bash
# NetMaster CLI - installed to /usr/local/bin/netmaster by install.sh.
# Usage: netmaster <status|logs|restart|update|uninstall> [options]

set -euo pipefail

REPO_SLUG="mokny/netmaster"
INSTALL_DIR="/opt/netmaster"
BIN_PATH="/usr/local/bin/netmaster"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31mXX\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

[ -d "$INSTALL_DIR" ] || die "Keine NetMaster-Installation unter $INSTALL_DIR gefunden."

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -E bash "$0" "$@"
fi

cd "$INSTALL_DIR"

compose() {
  docker compose -f "$INSTALL_DIR/docker-compose.yml" "$@"
}

HAS_WHIPTAIL=0
command -v whiptail >/dev/null 2>&1 && HAS_WHIPTAIL=1

ui_yesno() {
  local prompt="$1"
  if [ "$HAS_WHIPTAIL" -eq 1 ]; then
    whiptail --title "NetMaster" --yesno "$prompt" 10 70
  else
    local ans
    read -r -p "$prompt [j/N]: " ans </dev/tty || true
    case "$ans" in j|J|y|Y|yes|Yes) return 0 ;; *) return 1 ;; esac
  fi
}

current_url() {
  if [ -f "$INSTALL_DIR/Caddyfile" ]; then
    local domain
    domain=$(head -n1 <(grep -m1 -E '^[^ {]+ \{' "$INSTALL_DIR/Caddyfile") | awk '{print $1}')
    echo "https://${domain}"
  else
    local port
    port=$(grep -m1 '^HOST_PORT=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d'"' -f2)
    echo "http://<server-ip>:${port:-3000}"
  fi
}

cmd_status() {
  compose ps
  printf '\nURL: %s\n' "$(current_url)"
}

cmd_logs() {
  compose logs -f --tail=100
}

cmd_restart() {
  log "Starte Container neu..."
  compose restart
}

cmd_stop() {
  log "Stoppe Container..."
  compose stop
}

cmd_start() {
  log "Starte Container..."
  compose up -d
}

resolve_release_ref() {
  local tag
  tag=$(curl -fsSL "https://api.github.com/repos/${REPO_SLUG}/releases/latest" 2>/dev/null \
    | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name":\s*"([^"]+)".*/\1/') || true
  [ -n "${tag:-}" ] && echo "$tag" || echo "main"
}

cmd_update() {
  local nightly=0
  for arg in "$@"; do
    [ "$arg" = "--nightly" ] && nightly=1
  done

  local ref
  if [ "$nightly" -eq 1 ]; then
    ref="main"
    log "Aktualisiere auf den neuesten main-Commit (nightly)..."
  else
    ref=$(resolve_release_ref)
    log "Aktualisiere auf Release $ref..."
  fi

  mkdir -p "$INSTALL_DIR/backups"
  local backup_file
  backup_file="$INSTALL_DIR/backups/netmaster-$(date +%Y%m%d-%H%M%S).db"
  if compose ps --status running --services 2>/dev/null | grep -q '^netmaster$'; then
    log "Sichere Datenbank nach $backup_file..."
    compose cp netmaster:/app/data/netmaster.db "$backup_file" || warn "Backup fehlgeschlagen, fahre trotzdem fort."
  fi

  # fetch just the target ref (works regardless of the shallow-clone boundary
  # left by install.sh, for both branch and tag names) and hard-reset onto it.
  # .env / docker-compose.override.yml / Caddyfile / backups are untracked
  # (gitignored) and are left alone by checkout/reset.
  git fetch --depth 1 origin "$ref"
  git checkout --detach FETCH_HEAD
  git reset --hard FETCH_HEAD

  log "Baue und starte Container neu..."
  compose up -d --build

  # keep the installed CLI in sync with whatever shipped in this ref
  install -m 755 "$INSTALL_DIR/scripts/netmaster-cli.sh" "$BIN_PATH"

  cmd_cleanup

  log "Update abgeschlossen (Backup: $backup_file)."
}

cmd_cleanup() {
  log "Räume nicht mehr benötigte Dateien auf..."

  local project
  project=$(basename "$INSTALL_DIR")

  log "Entferne verwaiste Docker-Images..."
  docker image prune -f --filter "label=com.docker.compose.project=${project}" >/dev/null || true

  log "Entferne Docker-Build-Cache..."
  docker builder prune -f >/dev/null || true

  local backup_dir="$INSTALL_DIR/backups" keep=3
  if [ -d "$backup_dir" ]; then
    local old_backups
    old_backups=$(find "$backup_dir" -maxdepth 1 -type f -name 'netmaster-*.db' | sort -r | tail -n +"$((keep + 1))")
    if [ -n "$old_backups" ]; then
      log "Entferne alte Backups (behalte die letzten ${keep})..."
      echo "$old_backups" | xargs -r rm -f
    fi
  fi

  log "Cleanup abgeschlossen."
}

cmd_prune_all() {
  warn "Dies führt 'docker system prune -a' auf dem gesamten Host aus."
  warn "Betrifft ALLE Docker-Images/Container/Netzwerke/Build-Cache auf diesem System,"
  warn "nicht nur NetMaster - auch anderer Docker-Workload auf diesem Host ist betroffen."
  warn "Volumes werden NICHT gelöscht."
  if ! ui_yesno "Wirklich systemweit alle ungenutzten Docker-Ressourcen entfernen?"; then
    log "Abgebrochen."
    return 0
  fi
  docker system prune -a -f
  log "System-weites Cleanup abgeschlossen."
}

cmd_reset_login() {
  local email="${1:-}"
  if [ -z "$email" ]; then
    die "Verwendung: netmaster reset-login <email>"
  fi

  if ! compose ps --status running --services 2>/dev/null | grep -q '^netmaster$'; then
    die "NetMaster-Container läuft nicht. Starte ihn zuerst mit 'netmaster restart'."
  fi

  log "Setze Login für $email zurück (neues Passwort, Passkeys/2FA werden entfernt)..."
  compose exec -T netmaster npm run --silent reset-login -- "$email"
}

cmd_uninstall() {
  if ! ui_yesno "NetMaster wirklich deinstallieren? Container werden gestoppt und entfernt."; then
    log "Abgebrochen."
    return 0
  fi

  local delete_data=0 delete_certs=0
  if ui_yesno "Auch die Datenbank (alle Server, Nutzer, Einstellungen) unwiderruflich löschen?"; then
    delete_data=1
  fi
  if [ -f "$INSTALL_DIR/Caddyfile" ] && ui_yesno "Auch die Caddy-TLS-Zertifikate löschen?"; then
    delete_certs=1
  fi

  log "Stoppe und entferne Container..."
  compose down

  local project
  project=$(basename "$INSTALL_DIR")

  if [ "$delete_data" -eq 1 ]; then
    log "Lösche Datenbank-Volume..."
    docker volume ls -q --filter "label=com.docker.compose.project=${project}" | grep -i data | xargs -r docker volume rm
  else
    log "Datenbank-Volume bleibt erhalten."
  fi

  if [ "$delete_certs" -eq 1 ]; then
    log "Lösche Caddy-Volumes (Zertifikate)..."
    docker volume ls -q --filter "label=com.docker.compose.project=${project}" | grep -i caddy | xargs -r docker volume rm
  fi

  log "Entferne Docker-Images..."
  docker compose -f "$INSTALL_DIR/docker-compose.yml" config --images 2>/dev/null \
    | xargs -r docker image rm 2>/dev/null || true

  log "Entferne $INSTALL_DIR..."
  rm -rf "$INSTALL_DIR"

  log "Entferne netmaster-Befehl..."
  rm -f "$BIN_PATH"

  log "NetMaster wurde deinstalliert."
}

usage() {
  cat <<EOF
Verwendung: netmaster <befehl> [optionen]

Befehle:
  status               Container-Status und URL anzeigen
  logs                 Live-Logs ansehen (Strg+C zum Beenden)
  stop                 Container stoppen
  start                Container starten
  restart              Container neu starten
  update [--nightly]   Auf neuestes Release aktualisieren (mit --nightly: neuester main-Commit)
  cleanup              Verwaiste Docker-Images/Build-Cache und alte Backups entfernen
  prune-all            Systemweit alle ungenutzten Docker-Ressourcen entfernen (docker system prune -a)
  reset-login <email>  Login eines Users zurücksetzen (neues Passwort, Passkeys/2FA entfernt)
  uninstall            NetMaster interaktiv entfernen
EOF
}

case "${1:-}" in
  status)      cmd_status ;;
  logs)        cmd_logs ;;
  stop)        cmd_stop ;;
  start)       cmd_start ;;
  restart)     cmd_restart ;;
  update)      shift; cmd_update "$@" ;;
  cleanup)     cmd_cleanup ;;
  prune-all)   cmd_prune_all ;;
  reset-login) shift; cmd_reset_login "$@" ;;
  uninstall)   cmd_uninstall ;;
  *)           usage; exit 1 ;;
esac
