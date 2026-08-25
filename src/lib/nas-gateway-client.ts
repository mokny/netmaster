// Push-Benachrichtigung an den NAS-Gateway-Container, wenn sich ein
// NAS-Passwort ändert. Nötig, weil Samba (smbd, lokal im Gateway) das
// Passwort per `smbpasswd` in eigener Form (NT-Hash) braucht - das lässt
// sich nicht aus dem bcrypt-Hash ableiten, das Klartext-Passwort muss daher
// einmalig im Moment der Änderung durchgereicht werden. FTP/SFTP prüfen
// dagegen live gegen /api/internal/nas/auth und brauchen diesen Push nicht.
// Best-effort: schlägt der Push fehl (Gateway nicht erreichbar/deaktiviert),
// bleibt der Passwort-Wechsel selbst trotzdem gültig - Samba synct beim
// nächsten erfolgreichen Push nach.
export async function pushNasPasswordToGateway(
  email: string,
  password: string
): Promise<void> {
  const gatewayUrl = process.env.NAS_GATEWAY_INTERNAL_URL;
  const secret = process.env.NAS_INTERNAL_SECRET;
  if (!gatewayUrl || !secret) return;

  try {
    await fetch(`${gatewayUrl}/internal/samba-password`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error("Konnte Passwortänderung nicht an NAS-Gateway pushen:", err);
  }
}
