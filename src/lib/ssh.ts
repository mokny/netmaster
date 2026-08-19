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
  "docker stats --no-stream --format '{{.ID}}|{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' 2>/dev/null && echo '__STATE__' && docker ps -a --format '{{.ID}}|{{.State}}|{{.Image}}' 2>/dev/null";

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
