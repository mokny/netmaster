import crypto from "crypto";

// AES-256-GCM Verschlüsselung für sensible Daten (SSH-Passwörter/Private-Keys),
// abgeleitet aus MASTER_SECRET (64 Hex-Zeichen = 32 Byte).
function getKey(): Buffer {
  const secret = process.env.MASTER_SECRET;
  if (!secret || secret.length < 64) {
    throw new Error(
      "MASTER_SECRET is missing or too short (needs: 64 hex characters / 32 bytes)."
    );
  }
  return Buffer.from(secret.slice(0, 64), "hex");
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivB64, authTagB64, ciphertextB64] = payload.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Invalid encrypted secret format.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
