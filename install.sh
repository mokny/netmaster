#!/usr/bin/env bash
# NetMaster installer.
#
#   curl -fsSL https://raw.githubusercontent.com/mokny/netmaster/main/install.sh | bash
#
# Installs Docker (if missing), clones the app, walks through a short setup
# dialog and starts it via docker compose. Safe to re-run: an existing
# installation is redirected to `netmaster update` instead of reinstalling.
#
# Flags:
#   --no-whiptail, --plain   Skip the whiptail TUI and use plain text
#                            prompts instead (useful if whiptail dialogs
#                            don't respond, e.g. in some SSH/tty setups).
#                            Pass through curl | bash like this:
#                              curl -fsSL <url> | bash -s -- --no-whiptail

set -euo pipefail

# Installer version: automatically bumped by the Husky pre-commit hook
# (scripts/bump-script-versions.js) whenever this file changes in a commit.
INSTALLER_VERSION="1.3"

REPO_URL="https://github.com/mokny/netmaster.git"
REPO_SLUG="mokny/netmaster"
SCRIPT_URL="https://raw.githubusercontent.com/mokny/netmaster/main/install.sh"
INSTALL_DIR="/opt/netmaster"
BIN_PATH="/usr/local/bin/netmaster"

# ---------------------------------------------------------------------------
# args
# ---------------------------------------------------------------------------
NO_WHIPTAIL=0
for arg in "$@"; do
  case "$arg" in
    --no-whiptail|--plain) NO_WHIPTAIL=1 ;;
  esac
done

# ---------------------------------------------------------------------------
# logging
# ---------------------------------------------------------------------------
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
  printf 'Installer v%s\033[0m\n\n' "$INSTALLER_VERSION"
}

# ---------------------------------------------------------------------------
# re-exec as root
# ---------------------------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
  log "Root is required (Docker installation, /opt, /usr/local/bin) - re-invoking via sudo..."
  if [ -f "$0" ]; then
    # invoked as a real file (e.g. `bash install.sh`) - re-exec it directly
    exec sudo -E bash "$0" "$@"
  else
    # invoked as `curl ... | bash`: $0 is not a real script path in this case,
    # so re-fetch a local copy first and re-exec that as root instead.
    TMP_SCRIPT="$(mktemp /tmp/netmaster-install.XXXXXX.sh)"
    curl -fsSL "$SCRIPT_URL" -o "$TMP_SCRIPT"
    chmod +x "$TMP_SCRIPT"
    exec sudo -E bash "$TMP_SCRIPT" "$@"
  fi
fi

print_banner

# preserve the invoking (non-root) user, if any, so we can add them to the docker group
REAL_USER="${SUDO_USER:-}"

# ---------------------------------------------------------------------------
# existing installation? -> hand off to `netmaster update`
# ---------------------------------------------------------------------------
if [ -f "$INSTALL_DIR/.env" ] && [ -x "$BIN_PATH" ]; then
  log "NetMaster is already installed under $INSTALL_DIR."
  log "Running an update instead..."
  exec "$BIN_PATH" update
fi

# ---------------------------------------------------------------------------
# package manager detection
# ---------------------------------------------------------------------------
PKG_MANAGER=""
if command -v apt-get >/dev/null 2>&1; then PKG_MANAGER="apt"
elif command -v dnf >/dev/null 2>&1; then PKG_MANAGER="dnf"
elif command -v yum >/dev/null 2>&1; then PKG_MANAGER="yum"
elif command -v pacman >/dev/null 2>&1; then PKG_MANAGER="pacman"
elif command -v zypper >/dev/null 2>&1; then PKG_MANAGER="zypper"
fi
[ -n "$PKG_MANAGER" ] || die "No supported package manager found (apt/dnf/yum/pacman/zypper)."

pkg_install() {
  case "$PKG_MANAGER" in
    apt)    DEBIAN_FRONTEND=noninteractive apt-get install -y "$@" ;;
    dnf)    dnf install -y "$@" ;;
    yum)    yum install -y "$@" ;;
    pacman) pacman -S --noconfirm --needed "$@" ;;
    zypper) zypper --non-interactive install "$@" ;;
  esac
}

pkg_update_index() {
  case "$PKG_MANAGER" in
    apt)    apt-get update -y ;;
    dnf|yum|pacman|zypper) : ;; # these resolve on install, no separate index refresh needed
  esac
}

pkg_clean_cache() {
  case "$PKG_MANAGER" in
    apt)    apt-get clean && rm -rf /var/lib/apt/lists/* ;;
    dnf)    dnf clean all ;;
    yum)    yum clean all ;;
    pacman) pacman -Scc --noconfirm ;;
    zypper) zypper clean --all ;;
  esac
}

log "Package manager detected: $PKG_MANAGER"
pkg_update_index

# ---------------------------------------------------------------------------
# prerequisites
# ---------------------------------------------------------------------------
for tool in curl git openssl; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    log "Installing $tool..."
    pkg_install "$tool"
  fi
done

# ---------------------------------------------------------------------------
# docker
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Docker not found, installing via get.docker.com..."
  curl -fsSL https://get.docker.com | sh
else
  log "Docker already installed."
fi

systemctl enable --now docker >/dev/null 2>&1 || true

if ! docker compose version >/dev/null 2>&1; then
  die "Docker is installed, but the 'docker compose' plugin is missing. Please install it manually (docker-compose-plugin)."
fi

if [ -n "$REAL_USER" ] && ! id -nG "$REAL_USER" | grep -qw docker; then
  log "Adding $REAL_USER to the docker group (takes effect after re-login)..."
  usermod -aG docker "$REAL_USER" || true
fi

# ---------------------------------------------------------------------------
# whiptail (TUI), with plain-read fallback
# ---------------------------------------------------------------------------
HAS_WHIPTAIL=0
if [ "$NO_WHIPTAIL" -eq 1 ]; then
  log "--no-whiptail set, using plain text prompts."
elif command -v whiptail >/dev/null 2>&1; then
  HAS_WHIPTAIL=1
else
  log "Installing whiptail for the interactive setup dialog..."
  case "$PKG_MANAGER" in
    apt)    pkg_install whiptail && HAS_WHIPTAIL=1 ;;
    dnf|yum) pkg_install newt && HAS_WHIPTAIL=1 ;;
    pacman) pkg_install libnewt && HAS_WHIPTAIL=1 ;;
    zypper) pkg_install newt && HAS_WHIPTAIL=1 ;;
  esac
  command -v whiptail >/dev/null 2>&1 || HAS_WHIPTAIL=0
fi

if [ "$HAS_WHIPTAIL" -eq 1 ]; then
  log "Interactive setup dialog: whiptail"
else
  warn "whiptail not available, using plain text prompts."
fi

ui_info() {
  local text="$1"
  if [ "$HAS_WHIPTAIL" -eq 1 ]; then
    whiptail --title "NetMaster Setup" --msgbox "$text" 12 70 < /dev/tty
  else
    printf '\n%s\n\n' "$text"
  fi
}

# ui_input <prompt> <default>  -> echoes result
ui_input() {
  local prompt="$1" default="$2" result
  if [ "$HAS_WHIPTAIL" -eq 1 ]; then
    result=$(whiptail --title "NetMaster Setup" --inputbox "$prompt" 10 70 "$default" 3>&1 1>&2 2>&3 < /dev/tty) || result="$default"
  else
    read -r -p "$prompt [$default]: " result </dev/tty || true
  fi
  echo "${result:-$default}"
}

# ui_password <prompt> -> echoes result (may be empty)
ui_password() {
  local prompt="$1" result
  if [ "$HAS_WHIPTAIL" -eq 1 ]; then
    result=$(whiptail --title "NetMaster Setup" --passwordbox "$prompt" 10 70 3>&1 1>&2 2>&3 < /dev/tty) || result=""
  else
    read -r -s -p "$prompt: " result </dev/tty || true
    printf '\n'
  fi
  echo "$result"
}

# ui_yesno <prompt> -> return code 0=yes, 1=no
ui_yesno() {
  local prompt="$1"
  if [ "$HAS_WHIPTAIL" -eq 1 ]; then
    whiptail --title "NetMaster Setup" --yesno "$prompt" 10 70 < /dev/tty
  else
    local ans
    read -r -p "$prompt [y/N]: " ans </dev/tty || true
    case "$ans" in j|J|y|Y|yes|Yes) return 0 ;; *) return 1 ;; esac
  fi
}

# ---------------------------------------------------------------------------
# resolve version: newest GitHub release, fallback to main
# ---------------------------------------------------------------------------
resolve_release_ref() {
  local tag
  tag=$(curl -fsSL "https://api.github.com/repos/${REPO_SLUG}/releases/latest" 2>/dev/null \
    | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name":\s*"([^"]+)".*/\1/') || true
  if [ -n "${tag:-}" ]; then
    echo "$tag"
  else
    echo "main"
  fi
}

REF=$(resolve_release_ref)
if [ "$REF" = "main" ]; then
  log "No GitHub release found, installing the latest main commit (nightly)."
else
  log "Installing release $REF."
fi

# ---------------------------------------------------------------------------
# clone
# ---------------------------------------------------------------------------
log "Cloning NetMaster into $INSTALL_DIR..."
git clone --branch "$REF" --depth 1 "$REPO_URL" "$INSTALL_DIR"
cd "$INSTALL_DIR"

# ---------------------------------------------------------------------------
# setup dialog
# ---------------------------------------------------------------------------
ui_info "Welcome to NetMaster!\n\nNext, we'll set up the first admin account and a few basic settings."

ui_info "Note on Explore (network scan):\n\nNetMaster can scan the local network for devices (ARP/ping sweep + port scan). To do this, the container runs with network_mode: host and the NET_ADMIN/NET_RAW capabilities - it shares the host's network interface directly, instead of running isolated on the Docker bridge network. This means there's no more Docker port mapping; the app is always reachable directly on the host network. If a domain for Caddy is set up below, the app's own port is additionally blocked from the outside via the host firewall, so Caddy remains the only public entry point (only if a supported firewall - ufw or firewalld - is active)."

ADMIN_EMAIL=$(ui_input "Admin email address" "admin@netmaster.local")
GENERATED_PASSWORD=$(openssl rand -base64 18 | tr -d '=+/' | cut -c1-16)
ADMIN_PASSWORD=$(ui_password "Admin password (leave empty for a randomly generated one)")
if [ -z "$ADMIN_PASSWORD" ]; then
  ADMIN_PASSWORD="$GENERATED_PASSWORD"
  PASSWORD_WAS_GENERATED=1
else
  PASSWORD_WAS_GENERATED=0
fi
ADMIN_NAME=$(ui_input "Admin display name" "Admin")
HOST_PORT=$(ui_input "Port NetMaster should be reachable on" "3000")

DOMAIN=""
if ui_yesno "Set up a reverse proxy with automatic HTTPS (Caddy + Let's Encrypt)?\n\nRequirement: a domain that already points to this server via DNS (A/AAAA record)."; then
  DOMAIN=$(ui_input "Domain (e.g. netmaster.example.com)" "")
fi

# ---------------------------------------------------------------------------
# .env
# ---------------------------------------------------------------------------
log "Generating .env with generated secrets..."
MASTER_SECRET=$(openssl rand -hex 32)
AUTH_SECRET=$(openssl rand -hex 32)
# Secret used for mutual authentication between the main container and the
# NAS gateway (see docker-compose.yml) - the gateway always starts, so this
# is needed from the first run even before any NAS share exists.
NAS_INTERNAL_SECRET=$(openssl rand -hex 32)

cat > "$INSTALL_DIR/.env" <<EOF
DATABASE_URL="file:/app/data/netmaster.db"
MASTER_SECRET="${MASTER_SECRET}"
AUTH_SECRET="${AUTH_SECRET}"
SEED_ADMIN_EMAIL="${ADMIN_EMAIL}"
SEED_ADMIN_PASSWORD="${ADMIN_PASSWORD}"
SEED_ADMIN_NAME="${ADMIN_NAME}"
HOST_PORT="${HOST_PORT}"
NAS_INTERNAL_SECRET="${NAS_INTERNAL_SECRET}"
EOF

if [ -n "$DOMAIN" ]; then
  log "Setting up Caddy reverse proxy for $DOMAIN..."
  cat > "$INSTALL_DIR/Caddyfile" <<EOF
{
	email ${ADMIN_EMAIL}
}

${DOMAIN} {
	reverse_proxy localhost:${HOST_PORT}
}
EOF
  # NetMaster runs with network_mode: host (see above) and therefore no
  # longer has a Docker port mapping that would let us restrict the app
  # port to localhost (no HOST_BIND like before on the bridge network).
  # Caddy should be the only public entry point - the app port is
  # therefore explicitly blocked from the outside via the host firewall
  # further below.
  printf 'COMPOSE_PROFILES=proxy\n' >> "$INSTALL_DIR/.env"
  printf 'COOKIE_SECURE=true\n' >> "$INSTALL_DIR/.env"
fi

chmod 600 "$INSTALL_DIR/.env"

# ---------------------------------------------------------------------------
# firewall
# ---------------------------------------------------------------------------
open_ports() {
  local ports=("$@")
  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    if ui_yesno "An active ufw firewall was detected.\n\nOpen port(s) ${ports[*]} now so NetMaster is reachable?"; then
      for p in "${ports[@]}"; do ufw allow "$p"/tcp || true; done
    fi
  elif command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
    if ui_yesno "An active firewalld firewall was detected.\n\nOpen port(s) ${ports[*]} now so NetMaster is reachable?"; then
      for p in "${ports[@]}"; do firewall-cmd --permanent --add-port="${p}/tcp" || true; done
      firewall-cmd --reload || true
    fi
  fi
}

# Blocks a port from the outside (only relevant if Caddy is meant to be the
# only public entry point) - under network_mode: host there's no more
# Docker NAT to otherwise shield the app port from the outside.
deny_port_externally() {
  local port="$1"
  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    ufw deny "$port"/tcp || true
  elif command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
    firewall-cmd --permanent --add-rich-rule="rule family='ipv4' port port='${port}' protocol='tcp' reject" || true
    firewall-cmd --reload || true
  fi
}

if [ -n "$DOMAIN" ]; then
  open_ports 80 443
  deny_port_externally "$HOST_PORT"
else
  open_ports "$HOST_PORT"
fi

# ---------------------------------------------------------------------------
# start
# ---------------------------------------------------------------------------
log "Building and starting the containers (this can take a few minutes the first time)..."
docker compose -f "$INSTALL_DIR/docker-compose.yml" up -d --build

# ---------------------------------------------------------------------------
# install the `netmaster` CLI
# ---------------------------------------------------------------------------
log "Installing the netmaster command to $BIN_PATH..."
install -m 755 "$INSTALL_DIR/scripts/netmaster-cli.sh" "$BIN_PATH"

# ---------------------------------------------------------------------------
# cleanup: drop build cache / images / host package cache left behind by
# the install so the disk doesn't fill up over time
# ---------------------------------------------------------------------------
"$BIN_PATH" cleanup || warn "Cleanup failed, continuing anyway."

log "Cleaning up package manager cache..."
pkg_clean_cache || true

# ---------------------------------------------------------------------------
# summary
# ---------------------------------------------------------------------------
if [ -n "$DOMAIN" ]; then
  URL="https://${DOMAIN}"
else
  URL="http://$(curl -fsSL ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "<server-ip>"):${HOST_PORT}"
fi

SUMMARY="NetMaster is now running!

URL:      ${URL}
Login:    ${ADMIN_EMAIL}"

if [ "$PASSWORD_WAS_GENERATED" -eq 1 ]; then
  SUMMARY="${SUMMARY}
Password: ${ADMIN_PASSWORD}  (randomly generated, write it down now!)"
fi

SUMMARY="${SUMMARY}

Management:
  netmaster status      Show status
  netmaster logs        View live logs
  netmaster stop        Stop the containers
  netmaster start        Start the containers
  netmaster restart      Restart the containers
  netmaster update       Update to the latest release
  netmaster update --nightly   Update to the latest main commit
  netmaster prune-all    Remove all unused Docker resources system-wide
  netmaster uninstall    Remove NetMaster"

if [ -z "$DOMAIN" ]; then
  SUMMARY="${SUMMARY}

Note: HTTPS is not active. Don't expose port ${HOST_PORT} unprotected to
the internet - use your own reverse proxy with TLS if needed."
fi

ui_info "$SUMMARY"
printf '\n%s\n\n' "$SUMMARY"
