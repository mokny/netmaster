#!/usr/bin/env bash
# NetMaster installer.
#
#   curl -fsSL https://raw.githubusercontent.com/mokny/netmaster/main/install.sh | bash
#
# Installs Docker (if missing), clones the app, walks through a short setup
# dialog and starts it via docker compose. Safe to re-run: an existing
# installation is redirected to `netmaster update` instead of reinstalling.

set -euo pipefail

REPO_URL="https://github.com/mokny/netmaster.git"
REPO_SLUG="mokny/netmaster"
SCRIPT_URL="https://raw.githubusercontent.com/mokny/netmaster/main/install.sh"
INSTALL_DIR="/opt/netmaster"
BIN_PATH="/usr/local/bin/netmaster"

# ---------------------------------------------------------------------------
# logging
# ---------------------------------------------------------------------------
log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31mXX\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

# ---------------------------------------------------------------------------
# re-exec as root
# ---------------------------------------------------------------------------
if [ "$(id -u)" -ne 0 ]; then
  log "Root wird benötigt (Docker-Installation, /opt, /usr/local/bin) – erneuter Aufruf per sudo..."
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

# preserve the invoking (non-root) user, if any, so we can add them to the docker group
REAL_USER="${SUDO_USER:-}"

# ---------------------------------------------------------------------------
# existing installation? -> hand off to `netmaster update`
# ---------------------------------------------------------------------------
if [ -f "$INSTALL_DIR/.env" ] && [ -x "$BIN_PATH" ]; then
  log "NetMaster ist bereits unter $INSTALL_DIR installiert."
  log "Führe stattdessen ein Update durch..."
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
[ -n "$PKG_MANAGER" ] || die "Kein unterstützter Paketmanager gefunden (apt/dnf/yum/pacman/zypper)."

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

log "Paketmanager erkannt: $PKG_MANAGER"
pkg_update_index

# ---------------------------------------------------------------------------
# prerequisites
# ---------------------------------------------------------------------------
for tool in curl git openssl; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    log "Installiere $tool..."
    pkg_install "$tool"
  fi
done

# ---------------------------------------------------------------------------
# docker
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Docker nicht gefunden, installiere via get.docker.com..."
  curl -fsSL https://get.docker.com | sh
else
  log "Docker bereits installiert."
fi

systemctl enable --now docker >/dev/null 2>&1 || true

if ! docker compose version >/dev/null 2>&1; then
  die "Docker ist installiert, aber das 'docker compose'-Plugin fehlt. Bitte manuell installieren (docker-compose-plugin)."
fi

if [ -n "$REAL_USER" ] && ! id -nG "$REAL_USER" | grep -qw docker; then
  log "Füge $REAL_USER zur docker-Gruppe hinzu (wirkt erst nach Neu-Login)..."
  usermod -aG docker "$REAL_USER" || true
fi

# ---------------------------------------------------------------------------
# whiptail (TUI), with plain-read fallback
# ---------------------------------------------------------------------------
HAS_WHIPTAIL=0
if command -v whiptail >/dev/null 2>&1; then
  HAS_WHIPTAIL=1
else
  log "Installiere whiptail für den interaktiven Setup-Dialog..."
  case "$PKG_MANAGER" in
    apt)    pkg_install whiptail && HAS_WHIPTAIL=1 ;;
    dnf|yum) pkg_install newt && HAS_WHIPTAIL=1 ;;
    pacman) pkg_install libnewt && HAS_WHIPTAIL=1 ;;
    zypper) pkg_install newt && HAS_WHIPTAIL=1 ;;
  esac
  command -v whiptail >/dev/null 2>&1 || HAS_WHIPTAIL=0
fi

if [ "$HAS_WHIPTAIL" -eq 1 ]; then
  log "Interaktiver Setup-Dialog: whiptail"
else
  warn "whiptail nicht verfügbar, verwende einfache Texteingaben."
fi

ui_info() {
  local text="$1"
  if [ "$HAS_WHIPTAIL" -eq 1 ]; then
    whiptail --title "NetMaster Setup" --msgbox "$text" 12 70
  else
    printf '\n%s\n\n' "$text"
  fi
}

# ui_input <prompt> <default>  -> echoes result
ui_input() {
  local prompt="$1" default="$2" result
  if [ "$HAS_WHIPTAIL" -eq 1 ]; then
    result=$(whiptail --title "NetMaster Setup" --inputbox "$prompt" 10 70 "$default" 3>&1 1>&2 2>&3) || result="$default"
  else
    read -r -p "$prompt [$default]: " result </dev/tty || true
  fi
  echo "${result:-$default}"
}

# ui_password <prompt> -> echoes result (may be empty)
ui_password() {
  local prompt="$1" result
  if [ "$HAS_WHIPTAIL" -eq 1 ]; then
    result=$(whiptail --title "NetMaster Setup" --passwordbox "$prompt" 10 70 3>&1 1>&2 2>&3) || result=""
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
    whiptail --title "NetMaster Setup" --yesno "$prompt" 10 70
  else
    local ans
    read -r -p "$prompt [j/N]: " ans </dev/tty || true
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
  log "Kein GitHub-Release gefunden, installiere neuesten main-Stand (nightly)."
else
  log "Installiere Release $REF."
fi

# ---------------------------------------------------------------------------
# clone
# ---------------------------------------------------------------------------
log "Klone NetMaster nach $INSTALL_DIR..."
git clone --branch "$REF" --depth 1 "$REPO_URL" "$INSTALL_DIR"
cd "$INSTALL_DIR"

# ---------------------------------------------------------------------------
# setup dialog
# ---------------------------------------------------------------------------
ui_info "Willkommen bei NetMaster!\n\nIm nächsten Schritt richten wir den ersten Admin-Account und ein paar Grundeinstellungen ein."

ui_info "Hinweis zu Explore (Netzwerk-Scan):\n\nNetMaster kann das lokale Netzwerk nach Geräten durchsuchen (ARP-/Ping-Sweep + Port-Scan). Dafür läuft der Container mit network_mode: host und den Capabilities NET_ADMIN/NET_RAW - er teilt sich also direkt das Netzwerk-Interface des Hosts, statt isoliert im Docker-Bridge-Netz zu laufen. Es gibt dadurch kein Docker-Portmapping mehr; die App ist immer direkt auf dem Host-Netzwerk erreichbar. Wird unten eine Domain für Caddy eingerichtet, wird der App-eigene Port zusätzlich per Host-Firewall von außen gesperrt, damit Caddy der einzige öffentliche Zugang bleibt (nur wenn eine unterstützte Firewall - ufw oder firewalld - aktiv ist)."

ADMIN_EMAIL=$(ui_input "Admin-E-Mail-Adresse" "admin@netmaster.local")
GENERATED_PASSWORD=$(openssl rand -base64 18 | tr -d '=+/' | cut -c1-16)
ADMIN_PASSWORD=$(ui_password "Admin-Passwort (leer lassen für ein zufällig generiertes Passwort)")
if [ -z "$ADMIN_PASSWORD" ]; then
  ADMIN_PASSWORD="$GENERATED_PASSWORD"
  PASSWORD_WAS_GENERATED=1
else
  PASSWORD_WAS_GENERATED=0
fi
ADMIN_NAME=$(ui_input "Admin-Anzeigename" "Admin")
HOST_PORT=$(ui_input "Port, auf dem NetMaster erreichbar sein soll" "3000")

DOMAIN=""
if ui_yesno "Soll ein Reverse-Proxy mit automatischem HTTPS (Caddy + Let's Encrypt) eingerichtet werden?\n\nVoraussetzung: eine Domain, die bereits per DNS (A/AAAA-Record) auf diesen Server zeigt."; then
  DOMAIN=$(ui_input "Domain (z.B. netmaster.example.com)" "")
fi

# ---------------------------------------------------------------------------
# .env
# ---------------------------------------------------------------------------
log "Erzeuge .env mit generierten Secrets..."
MASTER_SECRET=$(openssl rand -hex 32)
AUTH_SECRET=$(openssl rand -hex 32)

cat > "$INSTALL_DIR/.env" <<EOF
DATABASE_URL="file:/app/data/netmaster.db"
MASTER_SECRET="${MASTER_SECRET}"
AUTH_SECRET="${AUTH_SECRET}"
SEED_ADMIN_EMAIL="${ADMIN_EMAIL}"
SEED_ADMIN_PASSWORD="${ADMIN_PASSWORD}"
SEED_ADMIN_NAME="${ADMIN_NAME}"
HOST_PORT="${HOST_PORT}"
EOF

if [ -n "$DOMAIN" ]; then
  log "Richte Caddy-Reverse-Proxy für $DOMAIN ein..."
  cat > "$INSTALL_DIR/Caddyfile" <<EOF
{
	email ${ADMIN_EMAIL}
}

${DOMAIN} {
	reverse_proxy localhost:${HOST_PORT}
}
EOF
  # NetMaster läuft mit network_mode: host (siehe unten) und hat damit kein
  # Docker-Portmapping mehr, über das sich der App-Port auf localhost
  # beschränken ließe (kein HOST_BIND wie zuvor im Bridge-Netz). Caddy soll
  # der einzige öffentliche Entrypoint sein - der App-Port wird daher weiter
  # unten per Host-Firewall explizit von außen gesperrt.
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
    if ui_yesno "Eine aktive ufw-Firewall wurde erkannt.\n\nPort(e) ${ports[*]} jetzt freigeben, damit NetMaster erreichbar ist?"; then
      for p in "${ports[@]}"; do ufw allow "$p"/tcp || true; done
    fi
  elif command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
    if ui_yesno "Eine aktive firewalld-Firewall wurde erkannt.\n\nPort(e) ${ports[*]} jetzt freigeben, damit NetMaster erreichbar ist?"; then
      for p in "${ports[@]}"; do firewall-cmd --permanent --add-port="${p}/tcp" || true; done
      firewall-cmd --reload || true
    fi
  fi
}

# Sperrt einen Port von außen (nur relevant, wenn Caddy der einzige
# öffentliche Entrypoint sein soll) - unter network_mode: host gibt es kein
# Docker-NAT mehr, das den App-Port sonst nach außen abschirmen würde.
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
log "Baue und starte die Container (das kann beim ersten Mal einige Minuten dauern)..."
docker compose -f "$INSTALL_DIR/docker-compose.yml" up -d --build

# ---------------------------------------------------------------------------
# install the `netmaster` CLI
# ---------------------------------------------------------------------------
log "Installiere netmaster-Befehl nach $BIN_PATH..."
install -m 755 "$INSTALL_DIR/scripts/netmaster-cli.sh" "$BIN_PATH"

# ---------------------------------------------------------------------------
# cleanup: drop build cache / images / host package cache left behind by
# the install so the disk doesn't fill up over time
# ---------------------------------------------------------------------------
"$BIN_PATH" cleanup || warn "Cleanup fehlgeschlagen, fahre trotzdem fort."

log "Bereinige Paketmanager-Cache..."
pkg_clean_cache || true

# ---------------------------------------------------------------------------
# summary
# ---------------------------------------------------------------------------
if [ -n "$DOMAIN" ]; then
  URL="https://${DOMAIN}"
else
  URL="http://$(curl -fsSL ifconfig.me 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || echo "<server-ip>"):${HOST_PORT}"
fi

SUMMARY="NetMaster läuft jetzt!

URL:      ${URL}
Login:    ${ADMIN_EMAIL}"

if [ "$PASSWORD_WAS_GENERATED" -eq 1 ]; then
  SUMMARY="${SUMMARY}
Passwort: ${ADMIN_PASSWORD}  (zufällig generiert, jetzt notieren!)"
fi

SUMMARY="${SUMMARY}

Verwaltung:
  netmaster status      Status anzeigen
  netmaster logs        Live-Logs ansehen
  netmaster stop        Container stoppen
  netmaster start        Container starten
  netmaster restart      Container neu starten
  netmaster update       auf neuestes Release aktualisieren
  netmaster update --nightly   auf neuesten main-Commit aktualisieren
  netmaster prune-all    systemweit alle ungenutzten Docker-Ressourcen entfernen
  netmaster uninstall    NetMaster entfernen"

if [ -z "$DOMAIN" ]; then
  SUMMARY="${SUMMARY}

Hinweis: kein HTTPS aktiv. Exponiere Port ${HOST_PORT} nicht ungeschützt
ins Internet - nutze bei Bedarf einen eigenen Reverse-Proxy mit TLS."
fi

ui_info "$SUMMARY"
printf '\n%s\n\n' "$SUMMARY"
