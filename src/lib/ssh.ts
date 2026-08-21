import { Client, type ConnectConfig, type ClientChannel, type SFTPWrapper } from "ssh2";
import { decryptSecret } from "./crypto";
import type { Server as ServerModel } from "@/generated/prisma/client";

export interface SshExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

function buildConnectConfig(server: ServerModel): ConnectConfig {
  const secret = decryptSecret(server.encryptedSecret);
  const base: ConnectConfig = {
    host: server.hostname,
    port: server.sshPort,
    username: server.sshUsername,
    readyTimeout: 10_000,
    // Deckt PAM-basierte Server ab, die nur keyboard-interactive statt
    // password-auth anbieten (üblicher Fall bei gehärtetem sshd).
    tryKeyboard: true,
  };
  if (server.authType === "PRIVATE_KEY") {
    const passphrase = server.encryptedPassphrase
      ? decryptSecret(server.encryptedPassphrase)
      : undefined;
    return { ...base, privateKey: secret, passphrase };
  }
  return { ...base, password: secret };
}

// Beantwortet keyboard-interactive-Prompts automatisch mit dem gespeicherten
// Passwort. Deckt Standard-PAM-Password-Setups ab, NICHT echtes OTP/2FA, das
// eine dynamische, nicht vorhersehbare Eingabe erfordert.
function attachKeyboardInteractive(conn: Client, server: ServerModel) {
  if (server.authType !== "PASSWORD") return;
  const secret = decryptSecret(server.encryptedSecret);
  conn.on(
    "keyboard-interactive",
    (_name, _instructions, _lang, prompts, finish) => {
      finish(prompts.map(() => secret));
    }
  );
}

export function execOnServer(
  server: ServerModel,
  command: string,
  timeoutMs = 15_000,
  stdin?: string,
  onSent?: () => void
): Promise<SshExecResult> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH-Befehl auf ${server.hostname} hat Timeout überschritten`));
    }, timeoutMs);

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            conn.end();
            reject(err);
            return;
          }
          onSent?.();
          let stdout = "";
          let stderr = "";
          stream
            .on("close", (code: number | null) => {
              clearTimeout(timer);
              conn.end();
              resolve({ stdout, stderr, code });
            })
            .on("data", (data: Buffer) => {
              stdout += data.toString("utf8");
            })
            .stderr.on("data", (data: Buffer) => {
              stderr += data.toString("utf8");
            });
          if (stdin !== undefined) {
            stream.end(stdin);
          }
        });
      })
      .on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      })
      .connect(buildConnectConfig(server));
    attachKeyboardInteractive(conn, server);
  });
}

// Öffnet eine bloße SSH-Verbindung (ohne Shell/Exec), die der Aufrufer für
// mehrere aufeinanderfolgende `execOnConnection`-Aufrufe offen halten kann.
// Vermeidet wiederholten Handshake+Auth-Overhead bei häufigem Polling (z. B.
// Live-Prozessliste). Der Aufrufer ist dafür verantwortlich, `conn.end()`
// beim Schließen aufzurufen.
export function connectSsh(server: ServerModel): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;

    conn
      .on("ready", () => {
        settled = true;
        resolve(conn);
      })
      .on("error", (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      })
      .connect(buildConnectConfig(server));
    attachKeyboardInteractive(conn, server);
  });
}

// Führt einen Befehl auf einer bereits verbundenen SSH-Session aus, ohne die
// Verbindung danach zu schließen (im Gegensatz zu `execOnServer`).
export function execOnConnection(
  conn: Client,
  command: string,
  timeoutMs = 15_000,
  stdin?: string
): Promise<SshExecResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("SSH-Befehl hat Timeout überschritten"));
    }, timeoutMs);

    conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        reject(err);
        return;
      }
      let stdout = "";
      let stderr = "";
      stream
        .on("close", (code: number | null) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, code });
        })
        .on("data", (data: Buffer) => {
          stdout += data.toString("utf8");
        })
        .stderr.on("data", (data: Buffer) => {
          stderr += data.toString("utf8");
        });
      if (stdin !== undefined) {
        stream.end(stdin);
      }
    });
  });
}

export interface ShellSession {
  conn: Client;
  stream: ClientChannel;
}

// Öffnet eine interaktive PTY-Shell-Session (für das Web-Terminal). Der
// Aufrufer ist dafür verantwortlich, `conn.end()` beim Schließen aufzurufen.
export function openShellSession(
  server: ServerModel,
  size: { cols: number; rows: number }
): Promise<ShellSession> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;

    conn
      .on("ready", () => {
        conn.shell(
          { term: "xterm-256color", cols: size.cols, rows: size.rows },
          (err, stream) => {
            if (err) {
              settled = true;
              conn.end();
              reject(err);
              return;
            }
            settled = true;
            resolve({ conn, stream });
          }
        );
      })
      .on("error", (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      })
      .connect(buildConnectConfig(server));
    attachKeyboardInteractive(conn, server);
  });
}

export interface SftpSession {
  conn: Client;
  sftp: SFTPWrapper;
}

// Öffnet eine SFTP-Session für den Dateimanager. Der Aufrufer ist dafür
// verantwortlich, `conn.end()` beim Schließen aufzurufen.
export function openSftpSession(server: ServerModel): Promise<SftpSession> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;

    conn
      .on("ready", () => {
        conn.sftp((err, sftp) => {
          if (err) {
            settled = true;
            conn.end();
            reject(err);
            return;
          }
          settled = true;
          resolve({ conn, sftp });
        });
      })
      .on("error", (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      })
      .connect(buildConnectConfig(server));
    attachKeyboardInteractive(conn, server);
  });
}

// Kompakte ps-Ausgabe, ein Prozess pro Zeile.
export const PROCESS_LIST_COMMAND = "ps -eo pid,user,pcpu,pmem,comm --no-headers";

export function buildKillCommand(pid: number, signal: "TERM" | "KILL"): string {
  if (!Number.isInteger(pid) || pid <= 1) {
    throw new Error("Ungültige PID");
  }
  return `kill -${signal} ${pid}`;
}

// Kombinierter Befehl, um CPU/RAM/Disk/Load/Netzwerk in einer SSH-Session abzufragen.
// Erwartet ein Standard-Linux-System (/proc, df, uptime).
export const METRICS_COMMAND = `
echo "__CPU__"; grep 'cpu ' /proc/stat; sleep 0.3; grep 'cpu ' /proc/stat;
echo "__MEM__"; cat /proc/meminfo | grep -E 'MemTotal|MemAvailable';
echo "__DISK__"; df -kP -x tmpfs -x devtmpfs -x squashfs -x overlay 2>/dev/null | tail -n +2;
echo "__LOAD__"; cat /proc/loadavg;
echo "__NET__"; cat /proc/net/dev | grep -v -E 'lo:|Inter|face';
echo "__SYS__";
echo "CORES=$(nproc 2>/dev/null)";
echo "UPTIME=$(awk '{print $1}' /proc/uptime 2>/dev/null)";
echo "KERNEL=$(uname -r 2>/dev/null)";
echo "OS=$( . /etc/os-release 2>/dev/null; echo "$PRETTY_NAME" )";
`.trim();

// Baut einen Befehl (und ggf. stdin), der root-Rechte benötigt. Läuft der
// SSH-User als root, wird direkt ausgeführt; sonst über `sudo -S`, das
// Passwort wird per stdin übergeben (nicht im Befehlstext, um
// Shell-Injection/Leaks über die Prozessliste zu vermeiden). Wirft, wenn
// weder root noch ein Sudo-Passwort hinterlegt ist.
export function buildRootCommand(
  server: ServerModel,
  baseCommand: string
): { command: string; stdin?: string } {
  if (server.sshUsername === "root") {
    return { command: baseCommand };
  }
  if (server.encryptedSudoPassword) {
    const sudoPassword = decryptSecret(server.encryptedSudoPassword);
    return {
      command: `sudo -S -p '' ${baseCommand}`,
      stdin: `${sudoPassword}\n`,
    };
  }
  throw new Error(
    "Root oder Sudo-Passwort erforderlich, um diesen Befehl auszuführen"
  );
}

// Wie buildRootCommand, aber für mehrzeilige Skripte: das Skript wird per
// stdin an `bash -s` übergeben statt in den Befehlstext eingebettet. Das
// erlaubt komplexe (mehrzeilige) Logik ohne Shell-Escaping-Aufwand. Bei
// sudo liest `sudo -S` nur die erste stdin-Zeile (das Passwort) und reicht
// den Rest unverändert an die gestartete Shell durch.
export function buildRootScriptCommand(
  server: ServerModel,
  script: string
): { command: string; stdin?: string } {
  if (server.sshUsername === "root") {
    return { command: "bash -s", stdin: script };
  }
  if (server.encryptedSudoPassword) {
    const sudoPassword = decryptSecret(server.encryptedSudoPassword);
    return {
      command: "sudo -S -p '' bash -s",
      stdin: `${sudoPassword}\n${script}`,
    };
  }
  throw new Error(
    "Root oder Sudo-Passwort erforderlich, um diesen Befehl auszuführen"
  );
}

export interface CleanupOptions {
  apt: boolean;
  docker: boolean;
  dockerVolumes: boolean;
  journal: boolean;
  journalDays: number;
  dryRun: boolean;
}

// Baut ein bash-Skript, das die ausgewählten Bereinigungs-Schritte
// nacheinander ausführt. Jeder Schritt prüft per `command -v`, ob das
// jeweilige Tool überhaupt existiert (gemischte Server-Umgebungen), und
// bricht bei Fehlern eines Schritts nicht das ganze Skript ab. Im
// Dry-Run werden nur nicht-destruktive Vorschau-Befehle verwendet.
export function buildCleanupScript(opts: CleanupOptions): string {
  if (!opts.apt && !opts.docker && !opts.journal) {
    throw new Error("Keine Bereinigungs-Option ausgewählt");
  }
  const journalDays = Math.trunc(opts.journalDays);
  if (opts.journal && (!Number.isInteger(journalDays) || journalDays < 1 || journalDays > 365)) {
    throw new Error("Ungültige Journal-Aufbewahrungsdauer (1-365 Tage)");
  }

  const lines = ["set +e"];

  if (opts.apt) {
    lines.push('echo "__APT__"');
    lines.push("if command -v apt-get >/dev/null 2>&1; then");
    if (opts.dryRun) {
      lines.push("  apt-get -s autoremove 2>&1");
      lines.push('  echo "--- Paket-Cache ---"');
      lines.push("  du -sh /var/cache/apt/archives 2>/dev/null");
    } else {
      lines.push("  apt-get autoremove -y 2>&1");
      lines.push("  apt-get clean 2>&1");
    }
    lines.push("else");
    lines.push('  echo "apt-get nicht gefunden"');
    lines.push("fi");
  }

  if (opts.docker) {
    lines.push('echo "__DOCKER__"');
    lines.push("if command -v docker >/dev/null 2>&1; then");
    if (opts.dryRun) {
      lines.push("  docker system df 2>&1");
    } else {
      lines.push(`  docker system prune -f${opts.dockerVolumes ? " --volumes" : ""} 2>&1`);
    }
    lines.push("else");
    lines.push('  echo "docker nicht gefunden"');
    lines.push("fi");
  }

  if (opts.journal) {
    lines.push('echo "__JOURNAL__"');
    lines.push("if command -v journalctl >/dev/null 2>&1; then");
    if (opts.dryRun) {
      lines.push("  journalctl --disk-usage 2>&1");
    } else {
      lines.push(`  journalctl --vacuum-time=${journalDays}d 2>&1`);
    }
    lines.push("else");
    lines.push('  echo "journalctl nicht gefunden"');
    lines.push("fi");
  }

  return lines.join("\n");
}

export function buildCleanupCommand(
  server: ServerModel,
  opts: CleanupOptions
): { command: string; stdin?: string } {
  return buildRootScriptCommand(server, buildCleanupScript(opts));
}

export type PowerAction = "reboot" | "shutdown";

const POWER_COMMANDS: Record<PowerAction, string> = {
  reboot: "reboot",
  shutdown: "shutdown -h now",
};

export function buildPowerCommand(
  server: ServerModel,
  action: PowerAction
): { command: string; stdin?: string } {
  return buildRootCommand(server, POWER_COMMANDS[action]);
}

export const DOCKER_COMMAND =
  "docker stats --no-stream --format '{{.ID}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}' 2>/dev/null && echo '__STATE__' && docker ps -a --format '{{.ID}}|{{.State}}|{{.Image}}|{{.Names}}' 2>/dev/null";

export type DockerPowerAction = "start" | "stop" | "restart";

// Läuft ohne sudo/root, analog zu DOCKER_COMMAND – setzt voraus, dass der
// SSH-User Mitglied der 'docker'-Gruppe ist (oder root).
export function buildDockerPowerCommand(
  containerId: string,
  action: DockerPowerAction
): string {
  if (!/^[a-zA-Z0-9]+$/.test(containerId)) {
    throw new Error("Ungültige Container-ID");
  }
  return `docker ${action} ${containerId}`;
}

export function buildDockerRemoveContainerCommand(
  containerId: string,
  force: boolean
): string {
  if (!/^[a-zA-Z0-9]+$/.test(containerId)) {
    throw new Error("Ungültige Container-ID");
  }
  return `docker rm ${force ? "-f " : ""}${containerId}`;
}

export const DOCKER_IMAGES_COMMAND =
  "docker images --format '{{.ID}}|{{.Repository}}|{{.Tag}}|{{.Size}}|{{.CreatedSince}}' 2>/dev/null";

// Bettet einen Wert sicher als einzelnes Shell-Argument ein (Single-Quoting,
// eingebettete Single-Quotes werden escaped) – verhindert Command-Injection
// über Image-Namen, Ports, Env-Werte etc. in den per SSH ausgeführten Befehlen.
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// Docker-Image-Referenzen: [registry/]repo[:tag][@digest]
const IMAGE_REF_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._\-/:@]{0,255}$/;

export function buildDockerPullCommand(image: string): string {
  if (!IMAGE_REF_PATTERN.test(image)) {
    throw new Error("Ungültiger Image-Name");
  }
  return `docker pull ${shellQuote(image)}`;
}

export function buildDockerImageRemoveCommand(
  imageId: string,
  force: boolean
): string {
  if (!/^[a-zA-Z0-9]+$/.test(imageId)) {
    throw new Error("Ungültige Image-ID");
  }
  return `docker rmi ${force ? "-f " : ""}${imageId}`;
}

const CONTAINER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const PORT_MAPPING_PATTERN = /^\d{1,5}:\d{1,5}(\/(tcp|udp))?$/;
const ENV_KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const NETWORK_MODE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

export interface DockerRunOptions {
  image: string;
  name?: string;
  ports?: string[]; // "hostPort:containerPort[/tcp|udp]"
  envs?: { key: string; value: string }[];
  volumes?: string[]; // "hostPath:containerPath[:ro]"
  restartPolicy?: "no" | "always" | "unless-stopped" | "on-failure";
  network?: string;
  extraArgs?: string;
}

export function buildDockerRunCommand(opts: DockerRunOptions): string {
  if (!IMAGE_REF_PATTERN.test(opts.image)) {
    throw new Error("Ungültiger Image-Name");
  }
  const parts = ["docker", "run", "-d"];

  if (opts.name) {
    if (!CONTAINER_NAME_PATTERN.test(opts.name)) {
      throw new Error("Ungültiger Container-Name");
    }
    parts.push("--name", shellQuote(opts.name));
  }
  for (const port of opts.ports ?? []) {
    if (!PORT_MAPPING_PATTERN.test(port)) {
      throw new Error(`Ungültiges Port-Mapping: ${port}`);
    }
    parts.push("-p", shellQuote(port));
  }
  for (const env of opts.envs ?? []) {
    if (!ENV_KEY_PATTERN.test(env.key)) {
      throw new Error(`Ungültiger Umgebungsvariablen-Name: ${env.key}`);
    }
    parts.push("-e", shellQuote(`${env.key}=${env.value}`));
  }
  for (const volume of opts.volumes ?? []) {
    if (!volume.includes(":")) {
      throw new Error(`Ungültiges Volume-Mapping: ${volume}`);
    }
    parts.push("-v", shellQuote(volume));
  }
  if (opts.restartPolicy && opts.restartPolicy !== "no") {
    parts.push("--restart", shellQuote(opts.restartPolicy));
  }
  if (opts.network) {
    if (!NETWORK_MODE_PATTERN.test(opts.network)) {
      throw new Error("Ungültiger Netzwerk-Modus");
    }
    parts.push("--network", shellQuote(opts.network));
  }
  // Freies Flag-Feld für Power-User – bewusst ungefiltert, siehe
  // API-Route: gleiche Vertrauensstufe wie das bestehende Exec-Terminal.
  if (opts.extraArgs && opts.extraArgs.trim()) {
    parts.push(opts.extraArgs.trim());
  }
  parts.push(shellQuote(opts.image));

  return parts.join(" ");
}

// Liefert alle VMs/LXCs des (lokalen) Proxmox-Knotens als JSON-Array
// (leer/Fehler, falls kein Proxmox installiert ist -> vom Aufrufer als
// "kein Proxmox" behandelt, kein harter Fehler).
export const PROXMOX_COMMAND =
  "pvesh get /cluster/resources --type vm --output-format json 2>/dev/null";

export type VmType = "qemu" | "lxc";
export type VmPowerAction = "start" | "stop" | "reboot";

// qm/pct laufen lokal auf dem Knoten, der die VM/den Container hält - daher
// funktioniert dies nur für Proxmox-Hosts, die selbst (nicht ein anderer
// Cluster-Knoten) die VM besitzen.
export function buildVmPowerCommand(
  server: ServerModel,
  type: VmType,
  vmid: number,
  action: VmPowerAction
): { command: string; stdin?: string } {
  if (!Number.isInteger(vmid) || vmid <= 0) {
    throw new Error("Ungültige VM-ID");
  }
  const bin = type === "qemu" ? "qm" : "pct";
  return buildRootCommand(server, `${bin} ${action} ${vmid}`);
}

// LXC: 'pct enter' hängt sich direkt in die Container-Shell (funktioniert
// immer). QEMU: 'qm terminal' nutzt eine serielle Konsole und schlägt fehl,
// wenn im Gast-OS keine (z.B. ttyS0-getty) eingerichtet ist.
export function buildVmTerminalCommand(
  server: ServerModel,
  type: VmType,
  vmid: number
): { command: string; stdin?: string } {
  if (!Number.isInteger(vmid) || vmid <= 0) {
    throw new Error("Ungültige VM-ID");
  }
  const baseCommand = type === "lxc" ? `pct enter ${vmid}` : `qm terminal ${vmid}`;
  return buildRootCommand(server, baseCommand);
}

// Läuft ohne sudo/root, analog zu DOCKER_COMMAND – setzt voraus, dass der
// SSH-User Mitglied der 'docker'-Gruppe ist (oder root). Probiert zuerst
// bash, fällt sonst auf sh zurück (POSIX sh ist in praktisch jedem
// Container-Image vorhanden).
export function buildDockerExecCommand(containerId: string): string {
  if (!/^[a-zA-Z0-9]+$/.test(containerId)) {
    throw new Error("Ungültige Container-ID");
  }
  return `docker exec -it ${containerId} sh -c "exec bash 2>/dev/null || exec sh"`;
}

// Öffnet eine interaktive PTY-Session per 'docker exec' in einem Container.
// Der Aufrufer ist dafür verantwortlich, `conn.end()` beim Schließen
// aufzurufen.
export function openDockerExecSession(
  server: ServerModel,
  containerId: string,
  size: { cols: number; rows: number }
): Promise<ShellSession> {
  return new Promise((resolve, reject) => {
    const command = buildDockerExecCommand(containerId);
    const conn = new Client();
    let settled = false;

    conn
      .on("ready", () => {
        conn.exec(
          command,
          { pty: { term: "xterm-256color", cols: size.cols, rows: size.rows } },
          (err, stream) => {
            if (err) {
              settled = true;
              conn.end();
              reject(err);
              return;
            }
            settled = true;
            resolve({ conn, stream });
          }
        );
      })
      .on("error", (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      })
      .connect(buildConnectConfig(server));
    attachKeyboardInteractive(conn, server);
  });
}

// 'qm vncproxy' setzt (via LC_PVE_TICKET) ein frisches VNC-Passwort auf dem
// QEMU-Prozess und proxied danach das rohe VNC-Protokoll über
// stdin/stdout – ganz ohne Proxmox-API-Zugangsdaten, analog zu 'qm
// terminal'. Das Ticket wird vom Aufrufer erzeugt und dem VNC-Client als
// Passwort für die RFB-Authentifizierung mitgegeben.
export function buildVmVncCommand(
  server: ServerModel,
  vmid: number,
  ticket: string
): { command: string; stdin?: string } {
  if (!Number.isInteger(vmid) || vmid <= 0) {
    throw new Error("Ungültige VM-ID");
  }
  if (!/^[a-zA-Z0-9]{16,64}$/.test(ticket)) {
    throw new Error("Ungültiges VNC-Ticket");
  }
  return buildRootCommand(server, `env LC_PVE_TICKET='${ticket}' qm vncproxy ${vmid}`);
}

// Öffnet eine binäre (kein PTY) Session, die das rohe VNC-Protokoll einer
// QEMU-VM über stdin/stdout liefert. Der Aufrufer ist dafür verantwortlich,
// `conn.end()` beim Schließen aufzurufen.
export function openVmVncSession(
  server: ServerModel,
  vmid: number,
  ticket: string
): Promise<ShellSession> {
  return new Promise((resolve, reject) => {
    const { command, stdin } = buildVmVncCommand(server, vmid, ticket);
    const conn = new Client();
    let settled = false;

    conn
      .on("ready", () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            settled = true;
            conn.end();
            reject(err);
            return;
          }
          settled = true;
          if (stdin !== undefined) stream.write(stdin);
          resolve({ conn, stream });
        });
      })
      .on("error", (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      })
      .connect(buildConnectConfig(server));
    attachKeyboardInteractive(conn, server);
  });
}

// pvesh-Pfade brauchen einen Node-Namen; da nur der lokale (VM-besitzende)
// Knoten unterstützt wird (siehe buildVmPowerCommand), wird er per
// $(hostname) auf dem Zielserver selbst aufgelöst statt vorab per JS
// abgefragt zu werden. Setzt voraus, dass der Proxmox-Node-Name dem
// System-Hostnamen entspricht (Standardfall bei der Proxmox-Installation).
const PVE_NODE = "$(hostname)";

const SNAPSHOT_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const STORAGE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
// Proxmox-Volume-ID für Backups, z.B. "local:backup/vzdump-qemu-100-...vma.zst".
const VOLID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,255}$/;

function validateVmid(vmid: number): void {
  if (!Number.isInteger(vmid) || vmid <= 0) {
    throw new Error("Ungültige VM-ID");
  }
}

function vmBinary(type: VmType): "qm" | "pct" {
  return type === "qemu" ? "qm" : "pct";
}

function vmApiSegment(type: VmType): "qemu" | "lxc" {
  return type === "qemu" ? "qemu" : "lxc";
}

// Listet Snapshots einer VM/LXC als JSON (über pvesh, da 'qm listsnapshot'
// nur eine Textbaum-Darstellung liefert).
export function buildSnapshotListCommand(type: VmType, vmid: number): string {
  validateVmid(vmid);
  return `pvesh get /nodes/${PVE_NODE}/${vmApiSegment(type)}/${vmid}/snapshot --output-format json 2>/dev/null`;
}

export function buildSnapshotCreateCommand(
  server: ServerModel,
  type: VmType,
  vmid: number,
  name: string,
  opts: { description?: string; vmstate?: boolean } = {}
): { command: string; stdin?: string } {
  validateVmid(vmid);
  if (!SNAPSHOT_NAME_PATTERN.test(name)) {
    throw new Error("Ungültiger Snapshot-Name (nur Buchstaben, Zahlen, _ und -, muss mit Buchstabe beginnen)");
  }
  let cmd = `${vmBinary(type)} snapshot ${vmid} ${shellQuote(name)}`;
  if (opts.description) {
    cmd += ` --description ${shellQuote(opts.description)}`;
  }
  if (type === "qemu" && opts.vmstate) {
    cmd += " --vmstate 1";
  }
  return buildRootCommand(server, cmd);
}

export function buildSnapshotDeleteCommand(
  server: ServerModel,
  type: VmType,
  vmid: number,
  name: string
): { command: string; stdin?: string } {
  validateVmid(vmid);
  if (!SNAPSHOT_NAME_PATTERN.test(name)) {
    throw new Error("Ungültiger Snapshot-Name");
  }
  return buildRootCommand(server, `${vmBinary(type)} delsnapshot ${vmid} ${shellQuote(name)}`);
}

export function buildSnapshotRollbackCommand(
  server: ServerModel,
  type: VmType,
  vmid: number,
  name: string
): { command: string; stdin?: string } {
  validateVmid(vmid);
  if (!SNAPSHOT_NAME_PATTERN.test(name)) {
    throw new Error("Ungültiger Snapshot-Name");
  }
  return buildRootCommand(server, `${vmBinary(type)} rollback ${vmid} ${shellQuote(name)}`);
}

// Listet alle Storages des Knotens, die Backups aufnehmen können.
export const STORAGE_LIST_COMMAND = `pvesh get /nodes/${PVE_NODE}/storage --output-format json 2>/dev/null`;

export function buildBackupListCommand(storageId: string, vmid: number): string {
  validateVmid(vmid);
  if (!STORAGE_ID_PATTERN.test(storageId)) {
    throw new Error("Ungültige Storage-ID");
  }
  return `pvesh get /nodes/${PVE_NODE}/storage/${shellQuote(storageId)}/content --content backup --vmid ${vmid} --output-format json 2>/dev/null`;
}

export type ProxmoxBackupMode = "snapshot" | "suspend" | "stop";
export type ProxmoxBackupCompress = "zstd" | "gzip" | "lzo" | "0";

const BACKUP_MODES: ProxmoxBackupMode[] = ["snapshot", "suspend", "stop"];
const BACKUP_COMPRESS: ProxmoxBackupCompress[] = ["zstd", "gzip", "lzo", "0"];

export function buildBackupCreateCommand(
  server: ServerModel,
  vmid: number,
  opts: { storage: string; mode: ProxmoxBackupMode; compress: ProxmoxBackupCompress }
): { command: string; stdin?: string } {
  validateVmid(vmid);
  if (!STORAGE_ID_PATTERN.test(opts.storage)) {
    throw new Error("Ungültige Storage-ID");
  }
  if (!BACKUP_MODES.includes(opts.mode)) {
    throw new Error("Ungültiger Backup-Modus");
  }
  if (!BACKUP_COMPRESS.includes(opts.compress)) {
    throw new Error("Ungültige Kompression");
  }
  const cmd = `vzdump ${vmid} --storage ${shellQuote(opts.storage)} --mode ${opts.mode} --compress ${opts.compress} --quiet 1`;
  return buildRootCommand(server, cmd);
}

export function buildBackupDeleteCommand(
  server: ServerModel,
  storageId: string,
  volid: string
): { command: string; stdin?: string } {
  if (!STORAGE_ID_PATTERN.test(storageId)) {
    throw new Error("Ungültige Storage-ID");
  }
  if (!VOLID_PATTERN.test(volid)) {
    throw new Error("Ungültige Volume-ID");
  }
  const cmd = `pvesh delete /nodes/${PVE_NODE}/storage/${shellQuote(storageId)}/content/${shellQuote(volid)}`;
  return buildRootCommand(server, cmd);
}

export function buildBackupRestoreCommand(
  server: ServerModel,
  type: VmType,
  targetVmid: number,
  storage: string,
  volid: string,
  force: boolean
): { command: string; stdin?: string } {
  validateVmid(targetVmid);
  if (!STORAGE_ID_PATTERN.test(storage)) {
    throw new Error("Ungültige Storage-ID");
  }
  if (!VOLID_PATTERN.test(volid)) {
    throw new Error("Ungültige Volume-ID");
  }
  const cmd =
    type === "qemu"
      ? `qmrestore ${shellQuote(volid)} ${targetVmid} --storage ${shellQuote(storage)}${force ? " --force 1" : ""}`
      : `pct restore ${targetVmid} ${shellQuote(volid)} --storage ${shellQuote(storage)}${force ? " --force 1" : ""}`;
  return buildRootCommand(server, cmd);
}

// Öffnet eine interaktive PTY-Session, die statt einer Login-Shell direkt
// 'pct enter'/'qm terminal' ausführt (Proxmox-VM/LXC-Konsole). Der Aufrufer
// ist dafür verantwortlich, `conn.end()` beim Schließen aufzurufen.
export function openVmTerminalSession(
  server: ServerModel,
  type: VmType,
  vmid: number,
  size: { cols: number; rows: number }
): Promise<ShellSession> {
  return new Promise((resolve, reject) => {
    const { command, stdin } = buildVmTerminalCommand(server, type, vmid);
    const conn = new Client();
    let settled = false;

    conn
      .on("ready", () => {
        conn.exec(
          command,
          { pty: { term: "xterm-256color", cols: size.cols, rows: size.rows } },
          (err, stream) => {
            if (err) {
              settled = true;
              conn.end();
              reject(err);
              return;
            }
            settled = true;
            if (stdin !== undefined) stream.write(stdin);
            resolve({ conn, stream });
          }
        );
      })
      .on("error", (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      })
      .connect(buildConnectConfig(server));
    attachKeyboardInteractive(conn, server);
  });
}
