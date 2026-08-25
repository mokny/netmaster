#!/usr/bin/env bash
# NetMaster CLI - installed to /usr/local/bin/netmaster by install.sh.
# Usage: netmaster <status|logs|restart|update|uninstall> [options]

set -euo pipefail

# Updater version: automatically bumped by the Husky pre-commit hook
# (scripts/bump-script-versions.js) whenever this file changes in a commit.
UPDATER_VERSION="1.5"

REPO_SLUG="mokny/netmaster"
INSTALL_DIR="/opt/netmaster"
BIN_PATH="/usr/local/bin/netmaster"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31mXX\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

print_banner() {
  printf '\033[1;34m'
  cat <<'ASCII'
    _   __     __  __  ___           __
   / | / /__  / /_/  |/  /___ ______/ /____  _____
  /  |/ / _ \/ __/ /|_/ / __ `/ ___/ __/ _ \/ ___/
 / /|  /  __/ /_/ /  / / /_/ (__  ) /_/  __/ /
/_/ |_/\___/\__/_/  /_/\__,_/____/\__/\___/_/
ASCII
  printf 'Updater v%s\033[0m\n\n' "$UPDATER_VERSION"
}

[ -d "$INSTALL_DIR" ] || die "No NetMaster installation found at $INSTALL_DIR."

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -E bash "$0" "$@"
fi

print_banner

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
    read -r -p "$prompt [y/N]: " ans </dev/tty || true
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
    port=$(grep -m1 '^HOST_PORT=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d'"' -f2) || true
    echo "http://<server-ip>:${port:-3000}"
  fi
}

cmd_status() {
  compose ps
  printf '\nURL: %s\n' "$(current_url)"
  local version
  version=$(compose exec -T app node -e "process.stdout.write(require('./package.json').version)" 2>/dev/null || true)
  [ -n "$version" ] && printf 'Version: %s\n' "$version"
}

cmd_logs() {
  compose logs -f --tail=100
}

cmd_restart() {
  log "Restarting containers..."
  compose restart
}

cmd_stop() {
  log "Stopping containers..."
  compose stop
}

cmd_start() {
  log "Starting containers..."
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
    log "Updating to the latest main commit (nightly)..."
  else
    ref=$(resolve_release_ref)
    log "Updating to release $ref..."
  fi

  mkdir -p "$INSTALL_DIR/backups"
  local backup_file
  backup_file="$INSTALL_DIR/backups/netmaster-$(date +%Y%m%d-%H%M%S).db"
  if compose ps --status running --services 2>/dev/null | grep -q '^netmaster$'; then
    log "Backing up database to $backup_file..."
    compose cp netmaster:/app/data/netmaster.db "$backup_file" || warn "Backup failed, continuing anyway."
  fi

  # fetch just the target ref (works regardless of the shallow-clone boundary
  # left by install.sh, for both branch and tag names) and hard-reset onto it.
  # .env / docker-compose.override.yml / Caddyfile / backups are untracked
  # (gitignored) and are left alone by checkout/reset.
  git fetch --depth 1 origin "$ref"
  git checkout --detach FETCH_HEAD
  git reset --hard FETCH_HEAD

  log "Rebuilding and restarting containers..."
  # --remove-orphans: stops/removes containers for services that existed in
  # a previous docker-compose.yml but were removed since (e.g. a retired
  # add-on service) - without it they'd keep running as untracked orphans.
  compose up -d --build --remove-orphans

  # keep the installed CLI in sync with whatever shipped in this ref
  install -m 755 "$INSTALL_DIR/scripts/netmaster-cli.sh" "$BIN_PATH"

  cmd_cleanup

  log "Update complete (backup: $backup_file)."
}

cmd_cleanup() {
  log "Cleaning up files that are no longer needed..."

  local project
  project=$(basename "$INSTALL_DIR")

  log "Removing dangling Docker images..."
  docker image prune -f --filter "label=com.docker.compose.project=${project}" >/dev/null || true

  log "Removing Docker build cache..."
  docker builder prune -f >/dev/null || true

  local backup_dir="$INSTALL_DIR/backups" keep=3
  if [ -d "$backup_dir" ]; then
    local old_backups
    old_backups=$(find "$backup_dir" -maxdepth 1 -type f -name 'netmaster-*.db' | sort -r | tail -n +"$((keep + 1))")
    if [ -n "$old_backups" ]; then
      log "Removing old backups (keeping the last ${keep})..."
      echo "$old_backups" | xargs -r rm -f
    fi
  fi

  log "Cleanup complete."
}

cmd_prune_all() {
  warn "This runs 'docker system prune -a' on the entire host."
  warn "Affects ALL Docker images/containers/networks/build cache on this system,"
  warn "not just NetMaster - other Docker workloads on this host are affected too."
  warn "Volumes are NOT deleted."
  if ! ui_yesno "Really remove all unused Docker resources system-wide?"; then
    log "Aborted."
    return 0
  fi
  docker system prune -a -f
  log "System-wide cleanup complete."
}

cmd_reset_login() {
  local email="${1:-}"
  if [ -z "$email" ]; then
    die "Usage: netmaster reset-login <email>"
  fi

  if ! compose ps --status running --services 2>/dev/null | grep -q '^netmaster$'; then
    die "NetMaster container is not running. Start it first with 'netmaster restart'."
  fi

  log "Resetting login for $email (new password, passkeys/2FA will be removed)..."
  compose exec -T netmaster npm run --silent reset-login -- "$email"
}

cmd_uninstall() {
  if ! ui_yesno "Really uninstall NetMaster? Containers will be stopped and removed."; then
    log "Aborted."
    return 0
  fi

  local delete_data=0 delete_certs=0
  if ui_yesno "Also permanently delete the database (all servers, users, settings)?"; then
    delete_data=1
  fi
  if [ -f "$INSTALL_DIR/Caddyfile" ] && ui_yesno "Also delete the Caddy TLS certificates?"; then
    delete_certs=1
  fi

  log "Stopping and removing containers..."
  compose down

  local project
  project=$(basename "$INSTALL_DIR")

  if [ "$delete_data" -eq 1 ]; then
    log "Deleting database volume..."
    docker volume ls -q --filter "label=com.docker.compose.project=${project}" | grep -i data | xargs -r docker volume rm
  else
    log "Database volume is kept."
  fi

  if [ "$delete_certs" -eq 1 ]; then
    log "Deleting Caddy volumes (certificates)..."
    docker volume ls -q --filter "label=com.docker.compose.project=${project}" | grep -i caddy | xargs -r docker volume rm
  fi

  log "Removing Docker images..."
  docker compose -f "$INSTALL_DIR/docker-compose.yml" config --images 2>/dev/null \
    | xargs -r docker image rm 2>/dev/null || true

  log "Removing $INSTALL_DIR..."
  rm -rf "$INSTALL_DIR"

  log "Removing netmaster command..."
  rm -f "$BIN_PATH"

  log "NetMaster has been uninstalled."
}

usage() {
  cat <<EOF
Usage: netmaster <command> [options]

Commands:
  status               Show container status and URL
  logs                 View live logs (Ctrl+C to exit)
  stop                 Stop containers
  start                Start containers
  restart              Restart containers
  update [--nightly]   Update to the latest release (with --nightly: latest main commit)
  cleanup              Remove dangling Docker images/build cache and old backups
  prune-all            Remove all unused Docker resources system-wide (docker system prune -a)
  reset-login <email>  Reset a user's login (new password, removes passkeys/2FA)
  uninstall            Interactively remove NetMaster
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
