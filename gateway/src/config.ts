function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} ist nicht gesetzt.`);
  return value;
}

export const config = {
  mainApiUrl: required("NAS_MAIN_API_URL"), // z.B. http://localhost:3000
  internalSecret: required("NAS_INTERNAL_SECRET"),
  mountRoot: process.env.NAS_MOUNT_ROOT ?? "/mnt/nas",
  filesApiPort: Number(process.env.NAS_FILES_API_PORT ?? 4501),
  ftpPort: Number(process.env.NAS_FTP_PORT ?? 21),
  ftpsPort: Number(process.env.NAS_FTPS_PORT ?? 990),
  ftpEnabled: process.env.NAS_FTP_ENABLED !== "false",
  ftpsEnabled: process.env.NAS_FTPS_ENABLED === "true",
  ftpPasvUrl: process.env.NAS_FTP_PASV_URL, // öffentliche Host-Adresse für Passive-Mode
  sftpPort: Number(process.env.NAS_SFTP_PORT ?? 2222),
  sftpHostKeyPath: process.env.NAS_SFTP_HOST_KEY_PATH ?? "/etc/netmaster-nas/ssh_host_key",
  ftpTlsCertPath: process.env.NAS_FTP_TLS_CERT_PATH,
  ftpTlsKeyPath: process.env.NAS_FTP_TLS_KEY_PATH,
  mountPollIntervalMs: Number(process.env.NAS_MOUNT_POLL_INTERVAL_MS ?? 30_000),
  quotaCheckIntervalMs: Number(process.env.NAS_QUOTA_CHECK_INTERVAL_MS ?? 5 * 60_000),
};
