import crypto from "crypto";

// Minimaler TR-064-Client (SOAP über HTTP mit Digest-Auth), wie er von
// FRITZ!OS-Geräten (FritzBox, FritzRepeater) auf Port 49000 (bzw. 49443 mit
// TLS) angeboten wird. Deckt genau die Services ab, die NetMaster für die
// Router-Übersicht benötigt - kein vollständiger TR-064-Stack.
//
// Referenz: AVM TR-064 First Steps
// https://avm.de/service/schnittstellen/

export interface Tr064Config {
  hostname: string;
  port: number;
  useTls: boolean;
  username: string;
  password: string;
}

interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
}

function parseDigestHeader(header: string): DigestChallenge | null {
  const match = header.match(/^Digest\s+(.*)$/i);
  if (!match) return null;
  const params: Record<string, string> = {};
  const re = /(\w+)=(?:"([^"]*)"|([^,\s]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(match[1]))) {
    params[m[1]] = m[2] ?? m[3];
  }
  if (!params.realm || !params.nonce) return null;
  return { realm: params.realm, nonce: params.nonce, qop: params.qop, opaque: params.opaque };
}

function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

function buildDigestAuthHeader(
  challenge: DigestChallenge,
  config: Tr064Config,
  method: string,
  uri: string
): string {
  const ha1 = md5(`${config.username}:${challenge.realm}:${config.password}`);
  const ha2 = md5(`${method}:${uri}`);
  const nc = "00000001";
  const cnonce = crypto.randomBytes(8).toString("hex");
  const response = challenge.qop
    ? md5(`${ha1}:${challenge.nonce}:${nc}:${cnonce}:${challenge.qop}:${ha2}`)
    : md5(`${ha1}:${challenge.nonce}:${ha2}`);

  const parts = [
    `username="${config.username}"`,
    `realm="${challenge.realm}"`,
    `nonce="${challenge.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (challenge.qop) {
    parts.push(`qop=${challenge.qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }
  if (challenge.opaque) parts.push(`opaque="${challenge.opaque}"`);
  return `Digest ${parts.join(", ")}`;
}

function baseUrl(config: Tr064Config): string {
  const scheme = config.useTls ? "https" : "http";
  return `${scheme}://${config.hostname}:${config.port}`;
}

// Führt einen TR-064-SOAP-Aufruf aus. Bei 401 wird automatisch mit
// HTTP-Digest-Auth erneut versucht (Standardverhalten von FRITZ!OS).
export async function tr064Call(
  config: Tr064Config,
  controlUrl: string,
  serviceType: string,
  action: string,
  args: Record<string, string> = {}
): Promise<Record<string, string>> {
  const url = `${baseUrl(config)}${controlUrl}`;
  const argsXml = Object.entries(args)
    .map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`)
    .join("");
  const body = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <u:${action} xmlns:u="${serviceType}">${argsXml}</u:${action}>
  </s:Body>
</s:Envelope>`;

  const headers: Record<string, string> = {
    "Content-Type": 'text/xml; charset="utf-8"',
    SOAPACTION: `${serviceType}#${action}`,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    let res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });

    if (res.status === 401) {
      const wwwAuth = res.headers.get("www-authenticate");
      const challenge = wwwAuth ? parseDigestHeader(wwwAuth) : null;
      if (!challenge) throw new Error("Authentifizierung fehlgeschlagen (kein Digest-Challenge)");
      const authHeader = buildDigestAuthHeader(challenge, config, "POST", controlUrl);
      res = await fetch(url, {
        method: "POST",
        headers: { ...headers, Authorization: authHeader },
        body,
        signal: controller.signal,
      });
    }

    const text = await res.text();
    if (!res.ok) {
      const faultMatch = text.match(/<errorDescription>(.*?)<\/errorDescription>/);
      throw new Error(faultMatch ? faultMatch[1] : `TR-064-Fehler (HTTP ${res.status})`);
    }
    return parseSoapResponse(text);
  } finally {
    clearTimeout(timeout);
  }
}

function escapeXml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseSoapResponse(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const re = /<([\w:]+)>([^<]*)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const key = m[1].includes(":") ? m[1].split(":").pop()! : m[1];
    result[key] = m[2];
  }
  return result;
}

const SVC = {
  deviceInfo: { url: "/upnp/control/deviceinfo", type: "urn:dslforum-org:service:DeviceInfo:1" },
  deviceConfig: {
    url: "/upnp/control/deviceconfig",
    type: "urn:dslforum-org:service:DeviceConfig:1",
  },
  wanIpConn: {
    url: "/upnp/control/wanipconnection1",
    type: "urn:dslforum-org:service:WANIPConnection:1",
  },
  hosts: { url: "/upnp/control/hosts", type: "urn:dslforum-org:service:Hosts:1" },
  wanCommonIfConfig: {
    url: "/upnp/control/wancommonifconfig1",
    type: "urn:dslforum-org:service:WANCommonInterfaceConfig:1",
  },
  wlan: (index: number) => ({
    url: `/upnp/control/wlanconfig${index}`,
    type: "urn:dslforum-org:service:WLANConfiguration:1",
  }),
};

export interface RouterDeviceInfo {
  modelName: string | null;
  firmwareVersion: string | null;
  uptimeSec: number | null;
}

export async function getDeviceInfo(config: Tr064Config): Promise<RouterDeviceInfo> {
  const res = await tr064Call(config, SVC.deviceInfo.url, SVC.deviceInfo.type, "GetInfo");
  return {
    modelName: res.NewModelName ?? null,
    firmwareVersion: res.NewSoftwareVersion ?? null,
    uptimeSec: res.NewUpTime ? Number(res.NewUpTime) : null,
  };
}

export interface WanStatus {
  connectionStatus: string | null;
  externalIp: string | null;
}

// Nicht auf jedem Gerät vorhanden (Repeater haben keine eigene WAN-Verbindung)
// - Aufrufer sollte Fehler abfangen und WAN-Felder dann einfach leer lassen.
export async function getWanStatus(config: Tr064Config): Promise<WanStatus> {
  const [info, addr] = await Promise.all([
    tr064Call(config, SVC.wanIpConn.url, SVC.wanIpConn.type, "GetInfo"),
    tr064Call(config, SVC.wanIpConn.url, SVC.wanIpConn.type, "GetExternalIPAddress"),
  ]);
  return {
    connectionStatus: info.NewConnectionStatus ?? null,
    externalIp: addr.NewExternalIPAddress ?? null,
  };
}

export async function rebootDevice(config: Tr064Config): Promise<void> {
  await tr064Call(config, SVC.deviceConfig.url, SVC.deviceConfig.type, "Reboot");
}

export async function reconnectWan(config: Tr064Config): Promise<void> {
  await tr064Call(config, SVC.wanIpConn.url, SVC.wanIpConn.type, "ForceTermination");
  await new Promise((r) => setTimeout(r, 2000));
  await tr064Call(config, SVC.wanIpConn.url, SVC.wanIpConn.type, "RequestConnection");
}

export interface HostEntry {
  name: string;
  ip: string;
  mac: string;
  active: boolean;
  interfaceType: string;
}

export async function getConnectedHosts(config: Tr064Config): Promise<HostEntry[]> {
  const countRes = await tr064Call(
    config,
    SVC.hosts.url,
    SVC.hosts.type,
    "GetHostNumberOfEntries"
  );
  const count = Number(countRes.NewHostNumberOfEntries ?? 0);
  const hosts: HostEntry[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const h = await tr064Call(config, SVC.hosts.url, SVC.hosts.type, "GetGenericHostEntry", {
        NewIndex: String(i),
      });
      hosts.push({
        name: h.NewHostName ?? "",
        ip: h.NewIPAddress ?? "",
        mac: h.NewMACAddress ?? "",
        active: h.NewActive === "1",
        interfaceType: h.NewInterfaceType ?? "",
      });
    } catch {
      // Einzelner Host nicht lesbar - überspringen statt ganzen Poll abzubrechen.
    }
  }
  return hosts;
}

export interface WifiNetwork {
  index: number;
  ssid: string;
  enabled: boolean;
}

// Prüft nacheinander WLAN-Konfigurationsindex 1-4 (2,4GHz/5GHz + Gastnetze) -
// FRITZ!OS meldet für nicht vorhandene Indizes einen SOAP-Fault, den wir
// stillschweigend als "nicht vorhanden" werten.
export async function getWifiNetworks(config: Tr064Config): Promise<WifiNetwork[]> {
  const networks: WifiNetwork[] = [];
  for (let i = 1; i <= 4; i++) {
    try {
      const svc = SVC.wlan(i);
      const [info, ssid] = await Promise.all([
        tr064Call(config, svc.url, svc.type, "GetInfo"),
        tr064Call(config, svc.url, svc.type, "GetSSID"),
      ]);
      networks.push({
        index: i,
        ssid: ssid.NewSSID ?? "",
        enabled: info.NewEnable === "1",
      });
    } catch {
      break;
    }
  }
  return networks;
}

export interface WanByteCounters {
  bytesReceived: number;
  bytesSent: number;
}

// Kumulative Byte-Zähler seit letztem Verbindungsaufbau (WANCommonInterfaceConfig).
// Funktioniert unabhängig vom Anschlusstyp (DSL/Kabel/Glasfaser) - im
// Gegensatz zu den DSL-spezifischen Sync-Raten. Aufrufer bildet daraus über
// zwei Messpunkte eine Rate (siehe router-collect.ts).
export async function getWanByteCounters(config: Tr064Config): Promise<WanByteCounters> {
  const svc = SVC.wanCommonIfConfig;
  const [rx, tx] = await Promise.all([
    tr064Call(config, svc.url, svc.type, "GetTotalBytesReceived"),
    tr064Call(config, svc.url, svc.type, "GetTotalBytesSent"),
  ]);
  return {
    bytesReceived: Number(rx.NewTotalBytesReceived ?? 0),
    bytesSent: Number(tx.NewTotalBytesSent ?? 0),
  };
}

export async function setWifiEnabled(
  config: Tr064Config,
  index: number,
  enabled: boolean
): Promise<void> {
  const svc = SVC.wlan(index);
  await tr064Call(config, svc.url, svc.type, "SetEnable", {
    NewEnable: enabled ? "1" : "0",
  });
}
