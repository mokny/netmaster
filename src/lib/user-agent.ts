// Sehr einfache, heuristische Zuordnung von User-Agent zu einem lesbaren
// Namen ("Chrome auf macOS") – keine vollständige UA-Parsing-Bibliothek,
// reicht aber aus, um Sessions in der Liste unterscheidbar zu machen.
export function formatUserAgent(userAgent: string): string {
  if (!userAgent) return "Unknown device";

  let os = "Unbekanntes System";
  if (/windows/i.test(userAgent)) os = "Windows";
  else if (/iphone|ipad/i.test(userAgent)) os = "iOS";
  else if (/mac os x/i.test(userAgent)) os = "macOS";
  else if (/android/i.test(userAgent)) os = "Android";
  else if (/linux/i.test(userAgent)) os = "Linux";

  let browser = "Browser";
  if (/edg\//i.test(userAgent)) browser = "Edge";
  else if (/chrome\//i.test(userAgent) && !/chromium/i.test(userAgent)) browser = "Chrome";
  else if (/firefox\//i.test(userAgent)) browser = "Firefox";
  else if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) browser = "Safari";

  return `${browser} auf ${os}`;
}
