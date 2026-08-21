import packageJson from "../../package.json";

// package.json's third version segment (the revision) is bumped by the
// pre-commit hook (scripts/bump-version.js) on every commit, so it's always
// accurate here - no need to compute anything from git history at runtime.
export function getVersion(): string {
  return packageJson.version;
}
