import { execOnServer, buildRootCommand, buildRootScriptCommand, shellQuote } from "./ssh";
import type { Server as ServerModel } from "@/generated/prisma/client";

// Linux-Interface-Namen sind auf 15 Zeichen begrenzt (IFNAMSIZ - 1).
export const IFACE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_=+.-]{0,14}$/;
const NET_IFACE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.@_-]{0,31}$/;

export function validateIfaceName(name: string) {
  if (!IFACE_NAME_PATTERN.test(name)) {
    throw new Error("Invalid interface name (max. 15 characters, no special characters)");
  }
}

function confPath(name: string): string {
  return `/etc/wireguard/${name}.conf`;
}

export interface WgPeer {
  name: string;
  publicKey: string;
  presharedKey?: string;
  allowedIps: string;
  endpoint?: string;
  persistentKeepalive?: number;
}

export interface WgInterfaceConfig {
  name: string;
  address?: string;
  listenPort?: number;
  privateKey?: string;
  dns?: string;
  mtu?: number;
  postUp?: string;
  postDown?: string;
  peers: WgPeer[];
}

// ---------------------------------------------------------------------------
// Erkennung / Installation
// ---------------------------------------------------------------------------

export const DETECT_WG_COMMAND =
  "command -v wg >/dev/null 2>&1 && command -v wg-quick >/dev/null 2>&1 && echo yes || echo no";

export async function isWireguardInstalled(server: ServerModel): Promise<boolean> {
  const res = await execOnServer(server, DETECT_WG_COMMAND, 10_000);
  return res.stdout.trim() === "yes";
}

// Distro-übergreifendes Installationsskript, analog zu buildCleanupScript in
// ssh.ts: jeder Zweig prüft per `command -v`, welcher Paketmanager vorhanden
// ist, statt die Distro vorab zu erraten.
export function buildInstallScript(): string {
  return `
set -e
if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y wireguard wireguard-tools
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y wireguard-tools
elif command -v yum >/dev/null 2>&1; then
  yum install -y wireguard-tools
elif command -v pacman >/dev/null 2>&1; then
  pacman -Sy --noconfirm wireguard-tools
elif command -v apk >/dev/null 2>&1; then
  apk add --no-cache wireguard-tools
elif command -v zypper >/dev/null 2>&1; then
  zypper install -y wireguard-tools
else
  echo "Kein unterstuetzter Paketmanager gefunden (apt/dnf/yum/pacman/apk/zypper)" >&2
  exit 1
fi
mkdir -p /etc/wireguard
chmod 700 /etc/wireguard
`.trim();
}

export function buildInstallCommand(server: ServerModel): { command: string; stdin?: string } {
  return buildRootScriptCommand(server, buildInstallScript());
}

// `wg-quick up` ruft bei einem gesetzten `DNS =`-Eintrag extern `resolvconf`
// auf, um resolv.conf zu verwalten - fehlt das Tool (z.B. auf schlanken
// NAS-Distros), bricht der komplette Interface-Start mit "command not
// found" ab, obwohl Link/Adresse/Key-Setup erfolgreich waren.
export const DETECT_RESOLVCONF_COMMAND =
  "command -v resolvconf >/dev/null 2>&1 && echo yes || echo no";

export async function isResolvconfInstalled(server: ServerModel): Promise<boolean> {
  const res = await execOnServer(server, DETECT_RESOLVCONF_COMMAND, 10_000);
  return res.stdout.trim() === "yes";
}

export function buildInstallResolvconfScript(): string {
  return `
set -e
if command -v resolvconf >/dev/null 2>&1; then
  exit 0
fi
if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y openresolv || apt-get install -y resolvconf
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y openresolv
elif command -v yum >/dev/null 2>&1; then
  yum install -y openresolv
elif command -v pacman >/dev/null 2>&1; then
  pacman -Sy --noconfirm openresolv
elif command -v apk >/dev/null 2>&1; then
  apk add --no-cache openresolv
elif command -v zypper >/dev/null 2>&1; then
  zypper install -y openresolv
else
  echo "Kein unterstuetzter Paketmanager fuer resolvconf gefunden (apt/dnf/yum/pacman/apk/zypper)" >&2
  exit 1
fi
`.trim();
}

export function buildInstallResolvconfCommand(
  server: ServerModel
): { command: string; stdin?: string } {
  return buildRootScriptCommand(server, buildInstallResolvconfScript());
}

// Prüft best-effort, ob ein `DNS =`-Eintrag `resolvconf` beim Start
// benötigen würde, und installiert es bei Bedarf nach - schlägt die
// Installation fehl (z.B. kein Internetzugang), läuft der eigentliche
// Start-Versuch trotzdem weiter und liefert die reale Fehlermeldung.
export async function ensureResolvconfForConfig(
  server: ServerModel,
  config: Pick<WgInterfaceConfig, "dns">
): Promise<void> {
  if (!config.dns) return;
  try {
    if (await isResolvconfInstalled(server)) return;
    const { command, stdin } = buildInstallResolvconfCommand(server);
    await execOnServer(server, command, 60_000, stdin);
  } catch {
    // Best effort - der eigentliche Start-Befehl liefert bei
    // fortbestehendem Problem die reale Fehlermeldung inkl. journalctl.
  }
}

// ---------------------------------------------------------------------------
// Interfaces auflisten / lesen
// ---------------------------------------------------------------------------

// `find` liefert bei leerem Verzeichnis Exit-Code 0 (anders als ein
// nicht-matchendes `ls`-Glob, das Exit != 0 zurückgibt) - so lässt sich ein
// echter Fehler (z.B. fehlende Sudo-Rechte für /etc/wireguard) vom
// "einfach noch keine Interfaces vorhanden"-Fall unterscheiden (siehe GET
// in app/api/servers/[id]/wireguard/route.ts, das den Exit-Code prüft).
export const LIST_INTERFACES_COMMAND =
  "find /etc/wireguard -maxdepth 1 -type f -name '*.conf' -printf '%f\\n' | sed 's/\\.conf$//'";

export function buildListInterfacesCommand(server: ServerModel) {
  return buildRootCommand(server, LIST_INTERFACES_COMMAND);
}

export function parseInterfaceNames(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function buildReadConfigCommand(server: ServerModel, name: string) {
  validateIfaceName(name);
  return buildRootCommand(server, `cat ${shellQuote(confPath(name))} 2>/dev/null`);
}

// ---------------------------------------------------------------------------
// Config parsen / serialisieren
// ---------------------------------------------------------------------------

// Peer-Namen sind keine WireGuard-eigene Eigenschaft, sondern folgen der
// verbreiteten Konvention einer Kommentarzeile direkt über dem [Peer]-Block.
export function parseWgConfig(name: string, raw: string): WgInterfaceConfig {
  const config: WgInterfaceConfig = { name, peers: [] };
  let section: "none" | "interface" | "peer" = "none";
  let currentPeer: WgPeer | null = null;
  let pendingComment = "";

  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#") || line.startsWith(";")) {
      pendingComment = line.replace(/^[#;]\s*/, "");
      continue;
    }
    if (line === "[Interface]") {
      section = "interface";
      pendingComment = "";
      continue;
    }
    if (line === "[Peer]") {
      if (currentPeer) config.peers.push(currentPeer);
      currentPeer = { name: pendingComment, publicKey: "", allowedIps: "" };
      section = "peer";
      pendingComment = "";
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();

    if (section === "interface") {
      switch (key) {
        case "Address":
          config.address = value;
          break;
        case "ListenPort":
          config.listenPort = Number(value);
          break;
        case "PrivateKey":
          config.privateKey = value;
          break;
        case "DNS":
          config.dns = value;
          break;
        case "MTU":
          config.mtu = Number(value);
          break;
        case "PostUp":
          config.postUp = value;
          break;
        case "PostDown":
          config.postDown = value;
          break;
      }
    } else if (section === "peer" && currentPeer) {
      switch (key) {
        case "PublicKey":
          currentPeer.publicKey = value;
          break;
        case "PresharedKey":
          currentPeer.presharedKey = value;
          break;
        case "AllowedIPs":
          currentPeer.allowedIps = value;
          break;
        case "Endpoint":
          currentPeer.endpoint = value;
          break;
        case "PersistentKeepalive":
          currentPeer.persistentKeepalive = Number(value);
          break;
      }
    }
  }
  if (currentPeer) config.peers.push(currentPeer);
  return config;
}

export function serializeWgConfig(config: WgInterfaceConfig): string {
  const lines: string[] = ["[Interface]"];
  if (config.address) lines.push(`Address = ${config.address}`);
  if (config.listenPort) lines.push(`ListenPort = ${config.listenPort}`);
  if (config.privateKey) lines.push(`PrivateKey = ${config.privateKey}`);
  if (config.dns) lines.push(`DNS = ${config.dns}`);
  if (config.mtu) lines.push(`MTU = ${config.mtu}`);
  if (config.postUp) lines.push(`PostUp = ${config.postUp}`);
  if (config.postDown) lines.push(`PostDown = ${config.postDown}`);

  for (const peer of config.peers) {
    lines.push("");
    if (peer.name) lines.push(`# ${peer.name}`);
    lines.push("[Peer]");
    lines.push(`PublicKey = ${peer.publicKey}`);
    if (peer.presharedKey) lines.push(`PresharedKey = ${peer.presharedKey}`);
    lines.push(`AllowedIPs = ${peer.allowedIps}`);
    if (peer.endpoint) lines.push(`Endpoint = ${peer.endpoint}`);
    if (peer.persistentKeepalive) lines.push(`PersistentKeepalive = ${peer.persistentKeepalive}`);
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Schreiben (mit Backup + Syntax-Validierung vor dem Überschreiben)
// ---------------------------------------------------------------------------

// `wg-quick strip` scheitert (Exit != 0) bei einer syntaktisch ungültigen
// Config, bevor die eigentliche Datei überschrieben wird ("set -e"). Ein
// `.conf.bak` der vorherigen Version wird immer angelegt, sofern eine
// existierte.
export function buildWriteConfigScript(name: string, content: string): string {
  const path = confPath(name);
  const b64 = Buffer.from(content, "utf8").toString("base64");
  // `wg-quick strip` lehnt Dateien ab, deren Name nicht dem Muster
  // <interface-name>.conf entspricht (siehe IFACE_NAME_PATTERN) - ein
  // gewöhnlicher `mktemp`-Pfad (z.B. /tmp/tmp.Xy12Z) erfüllt das nicht.
  return `
set -e
TMPDIR=$(mktemp -d)
TMP="$TMPDIR/${name}.conf"
echo ${shellQuote(b64)} | base64 -d > "$TMP"
wg-quick strip "$TMP" >/dev/null
if [ -f ${shellQuote(path)} ]; then cp ${shellQuote(path)} ${shellQuote(`${path}.bak`)}; fi
mv "$TMP" ${shellQuote(path)}
rmdir "$TMPDIR" 2>/dev/null || true
chmod 600 ${shellQuote(path)}
`.trim();
}

export function buildWriteConfigCommand(
  server: ServerModel,
  name: string,
  content: string
): { command: string; stdin?: string } {
  validateIfaceName(name);
  return buildRootScriptCommand(server, buildWriteConfigScript(name, content));
}

export function buildDeleteInterfaceScript(name: string): string {
  const path = confPath(name);
  return `
set +e
systemctl stop wg-quick@${shellQuote(name)} 2>/dev/null
systemctl disable wg-quick@${shellQuote(name)} 2>/dev/null
rm -f ${shellQuote(path)} ${shellQuote(`${path}.bak`)}
`.trim();
}

export function buildDeleteInterfaceCommand(
  server: ServerModel,
  name: string
): { command: string; stdin?: string } {
  validateIfaceName(name);
  return buildRootScriptCommand(server, buildDeleteInterfaceScript(name));
}

// Ergänzt eine Fehlermeldung um die letzten Zeilen aus dem systemd-Journal
// des wg-quick-Units - `systemctl start/restart` liefert bei einem
// fehlgeschlagenen Startvorgang selbst oft nur einen Verweis auf
// "journalctl -xeu ...", die eigentliche Ursache steht erst dort.
export async function appendServiceJournal(
  server: ServerModel,
  name: string,
  detail: string
): Promise<string> {
  try {
    const { command, stdin } = buildRootCommand(
      server,
      `journalctl -u ${shellQuote(`wg-quick@${name}.service`)} --no-pager -n 15 2>/dev/null`
    );
    const res = await execOnServer(server, command, 10_000, stdin);
    const journal = res.stdout.trim();
    return journal ? `${detail}\n${journal}` : detail;
  } catch {
    return detail;
  }
}

// ---------------------------------------------------------------------------
// systemd-Steuerung
// ---------------------------------------------------------------------------

export type WgAction = "start" | "stop" | "restart" | "enable" | "disable";
const WG_ACTIONS: WgAction[] = ["start", "stop", "restart", "enable", "disable"];

export function buildControlCommand(
  server: ServerModel,
  name: string,
  action: WgAction
): { command: string; stdin?: string } {
  validateIfaceName(name);
  if (!WG_ACTIONS.includes(action)) {
    throw new Error("Invalid action");
  }
  return buildRootCommand(server, `systemctl ${action} wg-quick@${shellQuote(name)}`);
}

// Wendet die aktuelle Datei live an (ohne Interface-Down/Up), falls das
// Interface bereits läuft - schlägt bewusst leise fehl, wenn es (noch)
// down ist, damit Peer-Änderungen nicht zwingend einen manuellen Neustart
// erfordern (im Gegensatz zum Raw-Editor-Speichern, siehe buildWriteConfigCommand).
export function buildSyncCommand(
  server: ServerModel,
  name: string
): { command: string; stdin?: string } {
  validateIfaceName(name);
  const cmd = `bash -c 'wg syncconf ${shellQuote(name)} <(wg-quick strip ${shellQuote(name)})' 2>/dev/null || true`;
  return buildRootCommand(server, cmd);
}

// ---------------------------------------------------------------------------
// Live-Status (wg show dump)
// ---------------------------------------------------------------------------

export interface WgPeerStatus {
  publicKey: string;
  endpoint: string | null;
  allowedIps: string;
  latestHandshake: number; // unix seconds, 0 = nie
  transferRx: number;
  transferTx: number;
  persistentKeepalive: string;
}

export interface WgInterfaceStatus {
  name: string;
  up: boolean;
  enabled: boolean;
  listenPort: number | null;
  publicKey: string | null;
  peers: WgPeerStatus[];
}

export function buildStatusCommand(
  server: ServerModel,
  name: string
): { command: string; stdin?: string } {
  validateIfaceName(name);
  const script = `
echo "__ACTIVE__"; systemctl is-active wg-quick@${shellQuote(name)} 2>/dev/null;
echo "__ENABLED__"; systemctl is-enabled wg-quick@${shellQuote(name)} 2>/dev/null;
echo "__DUMP__"; wg show ${shellQuote(name)} dump 2>/dev/null;
`.trim();
  return buildRootCommand(server, script);
}

export function parseStatus(name: string, stdout: string): WgInterfaceStatus {
  const activeMatch = stdout.match(/__ACTIVE__\n([\s\S]*?)__ENABLED__/);
  const enabledMatch = stdout.match(/__ENABLED__\n([\s\S]*?)__DUMP__/);
  const dumpMatch = stdout.match(/__DUMP__\n?([\s\S]*)$/);
  const up = (activeMatch?.[1] ?? "").trim() === "active";
  const enabled = (enabledMatch?.[1] ?? "").trim() === "enabled";
  const dumpLines = (dumpMatch?.[1] ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let listenPort: number | null = null;
  let publicKey: string | null = null;
  const peers: WgPeerStatus[] = [];

  dumpLines.forEach((line, i) => {
    const cols = line.split("\t");
    if (i === 0) {
      publicKey = cols[1] || null;
      listenPort = cols[2] ? Number(cols[2]) : null;
    } else {
      peers.push({
        publicKey: cols[0] ?? "",
        endpoint: cols[2] && cols[2] !== "(none)" ? cols[2] : null,
        allowedIps: cols[3] ?? "",
        latestHandshake: Number(cols[4] ?? 0),
        transferRx: Number(cols[5] ?? 0),
        transferTx: Number(cols[6] ?? 0),
        persistentKeepalive: cols[7] ?? "off",
      });
    }
  });

  return { name, up, enabled, listenPort, publicKey, peers };
}

// ---------------------------------------------------------------------------
// Schlüssel-Erzeugung (wg genkey/genpsk benötigen keine root-Rechte)
// ---------------------------------------------------------------------------

export async function generateKeypair(
  server: ServerModel
): Promise<{ privateKey: string; publicKey: string }> {
  const res = await execOnServer(
    server,
    "set -e; priv=$(wg genkey); pub=$(echo \"$priv\" | wg pubkey); echo \"$priv\"; echo \"$pub\"",
    10_000
  );
  const lines = res.stdout.trim().split("\n").filter(Boolean);
  if (res.code !== 0 || lines.length < 2) {
    throw new Error(res.stderr.trim() || "Key generation failed");
  }
  return { privateKey: lines[0], publicKey: lines[1] };
}

export async function generatePresharedKey(server: ServerModel): Promise<string> {
  const res = await execOnServer(server, "wg genpsk", 10_000);
  if (res.code !== 0) {
    throw new Error(res.stderr.trim() || "PSK-Erzeugung fehlgeschlagen");
  }
  return res.stdout.trim();
}

// ---------------------------------------------------------------------------
// NAT/Forwarding-Komfortfeld (Gateway/Exit-Node)
// ---------------------------------------------------------------------------

export const DEFAULT_ROUTE_IFACE_COMMAND =
  "ip route show default 2>/dev/null | awk '{for(i=1;i<=NF;i++) if ($i==\"dev\") print $(i+1)}' | head -1";

export async function detectDefaultRouteInterface(server: ServerModel): Promise<string | null> {
  const res = await execOnServer(server, DEFAULT_ROUTE_IFACE_COMMAND, 10_000);
  const iface = res.stdout.trim();
  return iface || null;
}

export const LIST_NET_INTERFACES_COMMAND =
  "ip -o link show 2>/dev/null | awk -F': ' '{print $2}'";

export async function listNetworkInterfaces(server: ServerModel): Promise<string[]> {
  const res = await execOnServer(server, LIST_NET_INTERFACES_COMMAND, 10_000);
  return res.stdout
    .split("\n")
    .map((l) => l.trim().split("@")[0])
    .filter((l) => l && l !== "lo");
}

export function buildNatRules(
  wgIface: string,
  egressIface: string
): { postUp: string; postDown: string } {
  validateIfaceName(wgIface);
  if (!NET_IFACE_PATTERN.test(egressIface)) {
    throw new Error("Invalid network interface name");
  }
  const postUp = `sysctl -w net.ipv4.ip_forward=1; iptables -A FORWARD -i ${wgIface} -j ACCEPT; iptables -t nat -A POSTROUTING -o ${egressIface} -j MASQUERADE`;
  const postDown = `iptables -D FORWARD -i ${wgIface} -j ACCEPT; iptables -t nat -D POSTROUTING -o ${egressIface} -j MASQUERADE`;
  return { postUp, postDown };
}

// ---------------------------------------------------------------------------
// Client-Config für externe Peers (Handy/Laptop)
// ---------------------------------------------------------------------------

export interface PeerClientConfigInput {
  peerPrivateKey: string;
  peerAddress: string;
  dns?: string;
  serverPublicKey: string;
  serverEndpoint: string;
  allowedIps: string;
  presharedKey?: string;
  persistentKeepalive?: number;
}

export function buildPeerClientConfig(opts: PeerClientConfigInput): string {
  const lines = [
    "[Interface]",
    `PrivateKey = ${opts.peerPrivateKey}`,
    `Address = ${opts.peerAddress}`,
  ];
  if (opts.dns) lines.push(`DNS = ${opts.dns}`);
  lines.push("", "[Peer]", `PublicKey = ${opts.serverPublicKey}`);
  if (opts.presharedKey) lines.push(`PresharedKey = ${opts.presharedKey}`);
  lines.push(`AllowedIPs = ${opts.allowedIps}`);
  lines.push(`Endpoint = ${opts.serverEndpoint}`);
  if (opts.persistentKeepalive) lines.push(`PersistentKeepalive = ${opts.persistentKeepalive}`);
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// High-level Helfer (lesen + parsen in einem Schritt)
// ---------------------------------------------------------------------------

export async function readAndParseConfig(
  server: ServerModel,
  name: string
): Promise<WgInterfaceConfig> {
  const { command, stdin } = buildReadConfigCommand(server, name);
  const res = await execOnServer(server, command, 15_000, stdin);
  if (res.code !== 0 && !res.stdout.trim()) {
    throw new Error(res.stderr.trim() || "Config konnte nicht gelesen werden");
  }
  return parseWgConfig(name, res.stdout);
}
