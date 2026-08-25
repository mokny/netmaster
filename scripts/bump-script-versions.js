// Called from .husky/pre-commit. For each staged shell script that carries
// its own major.minor version variable, bumps the minor version and
// re-stages the file - but only if that file is actually part of this
// commit, so unrelated commits don't touch its version.
const fs = require("fs");
const { execSync } = require("child_process");

const staged = execSync("git diff --cached --name-only", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const targets = [
  { file: "install.sh", varName: "INSTALLER_VERSION" },
  { file: "scripts/netmaster-cli.sh", varName: "UPDATER_VERSION" },
];

for (const { file, varName } of targets) {
  if (!staged.includes(file)) continue;

  const content = fs.readFileSync(file, "utf8");
  const re = new RegExp(`^(${varName}=")(\\d+)\\.(\\d+)(")`, "m");
  const match = content.match(re);
  if (!match) continue;

  const [, prefix, major, minor, suffix] = match;
  const bumped = `${prefix}${major}.${Number(minor) + 1}${suffix}`;
  fs.writeFileSync(file, content.replace(re, bumped));
  execSync(`git add ${file}`);
}
