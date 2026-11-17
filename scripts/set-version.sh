#!/usr/bin/env bash
#
# Write one version into every manifest that carries it.
#
# There is no separate coherence check because there is nothing to check: the
# Cargo workspace, the launcher and all eight platform packages are written from
# the same argument, in one pass. The launcher pins its platform packages by
# exact version, so a drift here would publish an uninstallable release.
set -euo pipefail

VERSION="${1:?usage: set-version.sh <version>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

# Preflight the docs scripts ref advance BEFORE touching any manifest: a
# fail-closed exit must not leave versions bumped without the ref moved.
# A tag without the preinstall scripts must never become the ref — its raw
# URLs would 404 (v27.0.0/v27.0.1 predate the scripts).
for script in pre-install-tokens.sh pre-install-tokens.ps1; do
  [ -f "${script}" ] || { echo "ERROR: ${script} missing; refusing to advance scripts ref" >&2; exit 1; }
done
NEW_REF="v${VERSION}"
CUR_REF=$(grep -oE 'PINNED_SCRIPTS_REF = "[^"]+"' web/src/lib/scriptsRef.ts | cut -d'"' -f2)
[ -n "${CUR_REF}" ] || { echo "ERROR: cannot read PINNED_SCRIPTS_REF from web/src/lib/scriptsRef.ts" >&2; exit 1; }
REF_FILES="web/src/lib/scriptsRef.ts README.md README_zh.md docs/deploy/tokens-cli-usage.md docs/deploy/tokens-cli-usage.en.md"
if [ "${CUR_REF}" != "${NEW_REF}" ]; then
  for f in ${REF_FILES}; do
    grep -qF "${CUR_REF}" "${f}" || { echo "ERROR: ${f} has no occurrence of ${CUR_REF}" >&2; exit 1; }
  done
fi

# Rust workspace.
perl -0pi -e "s/^(\[workspace\.package\](?:.|\n)*?^version = )\"[^\"]+\"/\${1}\"${VERSION}\"/m" cli/Cargo.toml
grep -qF "version = \"${VERSION}\"" cli/Cargo.toml || { echo "ERROR: cli/Cargo.toml not updated" >&2; exit 1; }

# Keep Cargo.lock in step so the build does not rewrite it mid-release.
cargo update --manifest-path cli/Cargo.toml --workspace --offline >/dev/null 2>&1 || \
  cargo update --manifest-path cli/Cargo.toml --workspace >/dev/null

# Launcher and platform packages.
node - "${VERSION}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const version = process.argv[2];

const dirs = fs.readdirSync("packages").filter((d) => d.startsWith("cli"));
for (const dir of dirs) {
  const file = path.join("packages", dir, "package.json");
  if (!fs.existsSync(file)) continue;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  pkg.version = version;
  // The launcher resolves its binary through optionalDependencies pinned to an
  // exact version; they move together or the install picks nothing.
  if (pkg.optionalDependencies) {
    for (const name of Object.keys(pkg.optionalDependencies)) {
      if (/^(?:@[^/]+\/)?tokens-cli-/.test(name)) pkg.optionalDependencies[name] = version;
    }
  }
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`  ${file} -> ${version}`);
}
NODE
# Docs scripts ref: advance the docs page, manual and READMEs to the
# v<version> tag about to be created. Raw GitHub URLs resolve as soon as the
# tag itself is pushed (git push origin v<version>) — the tag carries its
# commit object, so pushing the branch is not required for the raw ref.
if [ "${CUR_REF}" != "${NEW_REF}" ]; then
  for f in ${REF_FILES}; do
    count=$(grep -cF "${CUR_REF}" "${f}")
    perl -pi -e "s/\Q${CUR_REF}\E/${NEW_REF}/g" "${f}"
    echo "  ${f}: ${CUR_REF} -> ${NEW_REF} (${count})"
  done
fi

echo "set-version: ${VERSION}"
