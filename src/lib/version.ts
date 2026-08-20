import { execFileSync } from "node:child_process";
import packageJson from "../../package.json";

// package.json speichert immer "major.minor.0" (vom Release-Command
// geschrieben). Die Revision (dritte Stelle) wird - wo möglich - live aus
// der Git-Historie berechnet: Anzahl Commits seit dem letzten Release-Tag.
// Das funktioniert nur, wenn eine vollständige .git-Historie vorhanden ist
// (lokale Entwicklung) - im Produktions-Image (flacher Klon ohne .git) fällt
// das auf die im package.json gebackene Version (revision 0) zurück, was
// dort korrekt ist, da eine Deployment-Kopie exakt einem Release entspricht.
function computeDynamicVersion(baseVersion: string): string {
  const [major, minor] = baseVersion.split(".");
  try {
    const tag = execFileSync("git", ["describe", "--tags", "--abbrev=0"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    const count = execFileSync(
      "git",
      ["rev-list", "--count", `${tag}..HEAD`],
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] }
    )
      .toString()
      .trim();
    return `${major}.${minor}.${count}`;
  } catch {
    return `${major}.${minor}.0`;
  }
}

let cached: string | null = null;

export function getVersion(): string {
  if (cached === null) {
    cached = computeDynamicVersion(packageJson.version);
  }
  return cached;
}
