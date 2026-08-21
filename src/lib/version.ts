import { execFileSync } from "node:child_process";
import packageJson from "../../package.json";

// package.json speichert immer "major.minor.0" (vom Release-Command
// geschrieben). Die Revision (dritte Stelle) wird - wo möglich - live aus
// der Git-Historie berechnet: Anzahl Commits seit dem letzten Release-Tag,
// oder - falls es noch keinen Release-Tag gibt - Anzahl aller Commits seit
// Projektbeginn. Das funktioniert nur, wenn eine vollständige .git-Historie
// vorhanden ist (lokale Entwicklung) - im Produktions-Image (flacher Klon
// ohne .git) fällt das auf die im package.json gebackene Version zurück, was
// dort korrekt ist, da eine Deployment-Kopie exakt einem Release entspricht.
function commitCount(range: string): string {
  return execFileSync("git", ["rev-list", "--count", range], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "ignore"],
  })
    .toString()
    .trim();
}

function computeDynamicVersion(baseVersion: string): string {
  const [major, minor] = baseVersion.split(".");
  try {
    const tag = execFileSync("git", ["describe", "--tags", "--abbrev=0"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    const count = commitCount(`${tag}..HEAD`);
    return `${major}.${minor}.${count}`;
  } catch {
    try {
      const count = commitCount("HEAD");
      return `${major}.${minor}.${count}`;
    } catch {
      return `${major}.${minor}.0`;
    }
  }
}

export function getVersion(): string {
  return computeDynamicVersion(packageJson.version);
}
