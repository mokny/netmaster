#!/usr/bin/env bash
# Erstellt ein neues NetMaster-Release: schlägt die nächste Version vor
# (major.minor.0 - Minor wird bei jedem Release erhöht, Major bleibt manuell),
# fasst die Commits seit dem letzten Release-Tag als Release-Text zusammen,
# lässt beides vor der Veröffentlichung bearbeiten, aktualisiert
# package.json + CHANGELOG.md und erstellt Git-Tag + GitHub-Release.
#
# Voraussetzung: `gh` CLI installiert und eingeloggt (gh auth login).

set -euo pipefail

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31mXX\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

command -v gh >/dev/null 2>&1 || die "gh CLI nicht gefunden. Installation: https://cli.github.com"
gh auth status >/dev/null 2>&1 || die "gh ist nicht eingeloggt. Führe zuerst 'gh auth login' aus."

if [ -n "$(git status --porcelain)" ]; then
  die "Working Tree ist nicht sauber. Bitte erst committen oder stashen."
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "main" ]; then
  warn "Aktueller Branch ist '$CURRENT_BRANCH', nicht 'main'."
fi

CURRENT_VERSION="$(node -p "require('./package.json').version")"
LAST_TAG="$(git describe --tags --abbrev=0 2>/dev/null || true)"

if [ -z "$LAST_TAG" ]; then
  log "Kein vorheriges Release gefunden - erstes Release wird aus package.json (${CURRENT_VERSION}) vorgeschlagen."
  PROPOSED_VERSION="$CURRENT_VERSION"
  COMMIT_RANGE="HEAD"
else
  log "Letztes Release: ${LAST_TAG}"
  MAJOR="$(echo "${LAST_TAG#v}" | cut -d. -f1)"
  MINOR="$(echo "${LAST_TAG#v}" | cut -d. -f2)"
  PROPOSED_VERSION="${MAJOR}.$((MINOR + 1)).0"
  COMMIT_RANGE="${LAST_TAG}..HEAD"
fi

if [ -z "$(git log "$COMMIT_RANGE" --oneline 2>/dev/null)" ]; then
  die "Keine Commits seit ${LAST_TAG:-Projektbeginn} - nichts zu releasen."
fi

RELEASE_NOTES="$(git log "$COMMIT_RANGE" --reverse --pretty=format:'- %s')"

echo
log "Vorgeschlagene Version: v${PROPOSED_VERSION}"
echo "----------------------------------------"
echo "$RELEASE_NOTES"
echo "----------------------------------------"
echo

read -r -p "Version übernehmen? [${PROPOSED_VERSION}]: " INPUT_VERSION </dev/tty
VERSION="${INPUT_VERSION:-$PROPOSED_VERSION}"
TAG="v${VERSION}"

git rev-parse "$TAG" >/dev/null 2>&1 && die "Tag ${TAG} existiert bereits."

NOTES_FILE="$(mktemp)"
trap 'rm -f "$NOTES_FILE"' EXIT
echo "$RELEASE_NOTES" > "$NOTES_FILE"

echo "Release-Text bearbeiten? Öffnet \$EDITOR (${EDITOR:-vi}). [j/N]: "
read -r -p "> " EDIT_NOTES </dev/tty
if [[ "$EDIT_NOTES" =~ ^[jJyY] ]]; then
  "${EDITOR:-vi}" "$NOTES_FILE" </dev/tty
  RELEASE_NOTES="$(cat "$NOTES_FILE")"
fi

log "Aktualisiere package.json auf ${VERSION}..."
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '${VERSION}';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

log "Aktualisiere CHANGELOG.md..."
CHANGELOG_ENTRY="## ${TAG} - $(date +%Y-%m-%d)

${RELEASE_NOTES}
"
if [ -f CHANGELOG.md ]; then
  { echo "$CHANGELOG_ENTRY"; echo; cat CHANGELOG.md; } > CHANGELOG.md.tmp
  mv CHANGELOG.md.tmp CHANGELOG.md
else
  printf '# Changelog\n\n%s\n' "$CHANGELOG_ENTRY" > CHANGELOG.md
fi

git add package.json package-lock.json CHANGELOG.md 2>/dev/null || git add package.json CHANGELOG.md
# --no-verify: skip the pre-commit hook that bumps the revision on every
# commit - this commit sets the exact release version itself.
git commit --no-verify -m "Release ${TAG}"

log "Push nach origin/${CURRENT_BRANCH}..."
git push origin "$CURRENT_BRANCH"

log "Erstelle GitHub Release ${TAG}..."
gh release create "$TAG" \
  --title "$TAG" \
  --notes "$RELEASE_NOTES" \
  --target "$CURRENT_BRANCH"

log "Release ${TAG} veröffentlicht: $(gh release view "$TAG" --json url -q .url)"
