import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { fetchShares, reportMountStatus, type GatewayShare } from "./main-api-client.js";

const execFileAsync = promisify(execFile);

// Harte Obergrenze für einen einzelnen Mount-Versuch, siehe Kommentar in
// mountSshfs() und startMountManager().
const MOUNT_ATTEMPT_TIMEOUT_MS = 20_000;

interface MountEntry {
  share: GatewayShare;
  mountPoint: string;
  keyFilePath?: string;
}

// Aktuell aktive Mounts, keyed by shareId - Referenz, um bei Konfigurations-
// änderungen (Freigabe gelöscht, Zielpfad/-server geändert) den alten Mount
// sauber abzuhängen, bevor neu gemountet wird.
const activeMounts = new Map<string, MountEntry>();

export function mountPointFor(shareId: string): string {
  return path.join(config.mountRoot, shareId);
}

// Nur ein billiger Check (reine /proc/mounts-Abfrage, kein Zugriff auf den
// FUSE-Datenpfad selbst) - bewusst KEIN readdir()/stat() mehr hier. Ein
// solcher aktiver Health-Check konkurriert um dieselbe (einzige) SSH-
// Verbindung wie ein laufender Upload/Download und kann bei einem großen
// oder lang laufenden Transfer leicht ins Timeout laufen, obwohl der Mount
// völlig gesund ist - live reproduziert: sowohl ein 200-MB-Upload als auch
// ein Ordner mit mehreren Dateien brachen dadurch mitten im Transfer ab,
// weil der "gesunde aber gerade beschäftigte" Mount fälschlich abgehängt
// wurde. Einen wirklich toten Mount ("gemountet, aber tot" - siehe
// mountSshfs()-Kommentar zu "-o reconnect") erkennen wir stattdessen
// reaktiv: sobald eine echte Operation (Web-Upload, Quota-Check) auf EIO/
// ENOTCONN läuft, meldet sie das über reportMountIoError() unten.
async function isMounted(mountPoint: string): Promise<boolean> {
  try {
    await execFileAsync("mountpoint", ["-q", mountPoint]);
    return true;
  } catch {
    return false;
  }
}

// Zeitpunkt (ms) der letzten reaktiven Reparatur je Freigabe - verhindert,
// dass z.B. mehrere gleichzeitige fehlgeschlagene Uploads für dieselbe
// Freigabe mehrfach parallel neu mounten.
const lastRepairAt = new Map<string, number>();
const REPAIR_DEBOUNCE_MS = 15_000;

// Von files-api.ts/quota.ts aufgerufen, sobald eine echte Dateioperation auf
// dieser Freigabe mit einem für einen toten FUSE-Mount typischen Fehler
// (EIO, ENOTCONN, ESTALE) fehlschlägt. Hängt den Mount ab und sofort wieder
// neu ein, statt auf den nächsten regulären syncMounts()-Durchlauf zu warten.
export function reportMountIoError(shareId: string): void {
  const last = lastRepairAt.get(shareId) ?? 0;
  if (Date.now() - last < REPAIR_DEBOUNCE_MS) return;
  lastRepairAt.set(shareId, Date.now());

  const entry = activeMounts.get(shareId);
  if (!entry) return;
  console.error(`I/O-Fehler auf Freigabe ${shareId} gemeldet - hänge Mount neu ein.`);
  teardownMount(shareId)
    .then(() => ensureMount(entry.share))
    .catch((err) => console.error(`Reaktiver Remount für Freigabe ${shareId} fehlgeschlagen:`, err));
}

// EIO/ENOTCONN/ESTALE sind die typischen Symptome eines "gemountet, aber
// tot" hängenden FUSE-Mounts (siehe reportMountIoError) - andere Fehler
// (z.B. ENOENT für einen schlicht nicht vorhandenen Pfad, EACCES für ein
// echtes Rechteproblem) deuten nicht darauf hin und sollen keinen Remount
// auslösen. Node's fs/promises setzt bei sowas ".code" auf den Errno-String;
// execFile-Fehler (z.B. quota.ts' "du") haben stattdessen nur den
// Exitcode in ".code" und die eigentliche Meldung in stderr/message, daher
// zusätzlich ein Text-Fallback.
export function isDeadMountError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === "EIO" || code === "ENOTCONN" || code === "ESTALE") return true;
  const text = String((err as { stderr?: string; message?: string })?.stderr ?? (err as Error)?.message ?? "");
  return /input\/output error|transport endpoint is not connected|stale file handle/i.test(text);
}

// fuse3 (heutiger Standard, siehe gateway/Dockerfile) installiert nur
// "fusermount3", nicht mehr das alte "fusermount" - beide probieren, bevor
// auf das langsamere Lazy-umount zurückgefallen wird.
async function unmount(mountPoint: string): Promise<void> {
  await execFileAsync("fusermount3", ["-uz", mountPoint]).catch(() =>
    execFileAsync("fusermount", ["-uz", mountPoint]).catch(() =>
      execFileAsync("umount", ["-l", mountPoint]).catch(() => {})
    )
  );
}

function sameConfig(a: GatewayShare, b: GatewayShare): boolean {
  return (
    a.remotePath === b.remotePath &&
    a.mountTransport === b.mountTransport &&
    a.server.hostname === b.server.hostname &&
    a.server.sshPort === b.server.sshPort &&
    a.server.sshUsername === b.server.sshUsername &&
    a.server.secret === b.server.secret
  );
}

async function mountSshfs(share: GatewayShare, mountPoint: string): Promise<string | undefined> {
  const { server } = share;
  const target = `${server.sshUsername}@${server.hostname}:${share.remotePath}`;
  const sshOpts = [
    "-p",
    String(server.sshPort),
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "UserKnownHostsFile=/dev/null",
    // Ohne festes Timeout kann der SSH-Handshake bei einem instabilen/
    // überlasteten Zielserver sehr lange hängen, statt zügig fehlzuschlagen.
    "-o",
    "ConnectTimeout=10",
    // Bewusst KEIN "-o reconnect": das führt bei Passwort-Auth zu einem
    // Mount, der nach dem kleinsten Verbindungsaussetzer dauerhaft "gemountet,
    // aber tot" hängen bleibt (jeder Zugriff liefert EIO) - der interne
    // Reconnect-Versuch von sshfs hat keinen Zugriff mehr auf das Passwort,
    // das nur beim initialen Start per sshpass hereinkam, und scheitert daher
    // lautlos (live so beobachtet, reproduzierbar sogar bei druckfrisch
    // angelegten Freigaben). Ein toter Mount wird stattdessen reaktiv über
    // reportMountIoError() erkannt und komplett neu aufgebaut, statt auf
    // sshfs' brüchigen Reconnect zu vertrauen.
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "allow_other",
  ];

  let keyFilePath: string | undefined;
  let command: string;
  let args: string[];

  if (server.authType === "PRIVATE_KEY") {
    keyFilePath = path.join("/tmp/netmaster-nas-keys", `${share.id}.key`);
    await fs.mkdir(path.dirname(keyFilePath), { recursive: true, mode: 0o700 });
    await fs.writeFile(keyFilePath, server.secret, { mode: 0o600 });
    command = "sshfs";
    args = [target, mountPoint, ...sshOpts, "-o", `IdentityFile=${keyFilePath}`, "-o", "IdentitiesOnly=yes"];
  } else {
    // sshpass reicht das Passwort per PTY an den Passwort-Prompt von ssh
    // durch. WICHTIG: kein zusätzliches "-o password_stdin" - das würde
    // sshfs/ssh anweisen, den Prompt zu überspringen und das Passwort
    // stattdessen direkt von stdin zu lesen, das hier aber nie beschrieben
    // wird (stdio ist unten bewusst "ignore", siehe spawn-Aufruf) - die
    // beiden Mechanismen schließen sich gegenseitig aus, kombiniert kommt
    // nie ein Passwort an und die Authentifizierung schlägt jedes Mal fehl.
    command = "sshpass";
    args = ["-p", server.secret, "sshfs", target, mountPoint, ...sshOpts];
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let settled = false;
    // `-o reconnect` lässt sshfs bei einem hängenden/instabilen Ziel intern
    // immer wieder selbst neu verbinden, statt sich zu beenden - ohne
    // Hard-Timeout würde dieses Promise dann nie auflösen. Das würde den
    // gesamten syncMounts()-Durchlauf blockieren, wodurch der nächste
    // setInterval-Tick eine zweite, überlappende Mount-Runde für dieselbe
    // Freigabe startet - jeder weitere hängende Versuch verschärft das immer
    // mehr, bis der Zielserver unter der SSH-Verbindungslast selbst instabil
    // wird (siehe startMountManager()-Kommentar).
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`Mount-Versuch nach ${MOUNT_ATTEMPT_TIMEOUT_MS / 1000}s abgebrochen (Zielserver antwortet nicht)`));
    }, MOUNT_ATTEMPT_TIMEOUT_MS);
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${command} beendete sich mit Code ${code}`));
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });

  return keyFilePath;
}

async function mountNfs(share: GatewayShare, mountPoint: string): Promise<void> {
  await execFileAsync("mount", [
    "-t",
    "nfs",
    "-o",
    "vers=4,soft,timeo=30",
    `${share.server.hostname}:${share.remotePath}`,
    mountPoint,
  ]);
}

async function ensureMount(share: GatewayShare): Promise<void> {
  const mountPoint = mountPointFor(share.id);
  await fs.mkdir(mountPoint, { recursive: true });

  try {
    if (share.mountTransport === "NFS") {
      await mountNfs(share, mountPoint);
    } else {
      const keyFilePath = await mountSshfs(share, mountPoint);
      activeMounts.set(share.id, { share, mountPoint, keyFilePath });
      await reportMountStatus(share.id, true);
      return;
    }
    activeMounts.set(share.id, { share, mountPoint });
    await reportMountStatus(share.id, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Mount für Freigabe ${share.id} fehlgeschlagen:`, message);
    // Best-effort: ein per Timeout gekillter oder abgebrochener Versuch kann
    // einen kaputten FUSE-Mount ("Transport endpoint is not connected") am
    // Mountpoint zurücklassen, der den nächsten Versuch blockieren würde.
    await unmount(mountPoint);
    await reportMountStatus(share.id, false, message.slice(0, 500)).catch(() => {});
  }
}

async function teardownMount(shareId: string): Promise<void> {
  const entry = activeMounts.get(shareId);
  if (!entry) return;
  await unmount(entry.mountPoint);
  if (entry.keyFilePath) await fs.unlink(entry.keyFilePath).catch(() => {});
  activeMounts.delete(shareId);
}

// Ein Sync-Durchlauf: gleicht den Soll-Zustand (aktuelle Freigaben laut
// Haupt-App) mit dem Ist-Zustand (aktuell aktive Mounts) ab - mountet neue
// Freigaben und hängt entfernte/geänderte ab. Ein "gemountet, aber tot"
// hängender Mount wird hier bewusst NICHT erkannt (siehe isMounted()-
// Kommentar) - das übernimmt reportMountIoError() reaktiv.
export async function syncMounts(): Promise<void> {
  let shares: GatewayShare[];
  try {
    shares = await fetchShares();
  } catch (err) {
    console.error("Konnte Freigabenliste nicht laden:", err);
    return;
  }

  const currentIds = new Set(shares.map((s) => s.id));
  for (const shareId of activeMounts.keys()) {
    if (!currentIds.has(shareId)) {
      await teardownMount(shareId);
    }
  }

  for (const share of shares) {
    const existing = activeMounts.get(share.id);
    if (existing && !sameConfig(existing.share, share)) {
      await teardownMount(share.id);
    }
    const stillActive = activeMounts.has(share.id);
    if (!stillActive || !(await isMounted(mountPointFor(share.id)))) {
      if (stillActive) await teardownMount(share.id);
      await ensureMount(share);
    }
  }
}

// setInterval feuert unabhängig davon, ob der vorherige Durchlauf schon
// fertig ist - ohne dieses Lock würde ein hängender/langsamer Durchlauf
// (z.B. viele Freigaben, oder ein Zielserver, der erst nach dem
// ConnectTimeout aufgibt) einen zweiten, überlappenden syncMounts()-Aufruf
// auslösen, der für dieselben Freigaben erneut Mount-Prozesse startet.
let syncInProgress = false;

async function syncMountsGuarded(): Promise<void> {
  if (syncInProgress) return;
  syncInProgress = true;
  try {
    await syncMounts();
  } finally {
    syncInProgress = false;
  }
}

export function startMountManager(): void {
  syncMountsGuarded();
  setInterval(syncMountsGuarded, config.mountPollIntervalMs);
}
