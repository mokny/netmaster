// Called from .husky/pre-commit. Increments the third version segment
// (major.minor.REVISION) in package.json and re-stages it, so every commit
// carries its own version. `scripts/release.sh` commits with --no-verify
// when it sets major.minor.0 itself, so releases aren't bumped an extra time.
const fs = require("fs");

const pkgPath = "package.json";
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const [major, minor, revision] = pkg.version.split(".").map(Number);
pkg.version = `${major}.${minor}.${revision + 1}`;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
