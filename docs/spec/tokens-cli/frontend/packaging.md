# Packaging: Platform Binary Packages and Publishing

> How the Rust binary reaches users: eight platform npm packages, one launcher
> package, a single version writer, one publish workflow, and a legacy
> GitHub-tarball installer. Shared by all eight
> `@fitor/tokens-cli-<os>-<arch>` packages.

---

## The eight platform packages

One per target triple, named `@fitor/tokens-cli-<os>-<arch>[-<libc>]`:

`darwin-arm64`, `darwin-x64`, `linux-x64-gnu`, `linux-x64-musl`,
`linux-arm64-gnu`, `linux-arm64-musl`, `win32-x64-msvc`, `win32-arm64-msvc`
— directories `packages/cli-<name>/`.

**In git, each package is a `package.json` and nothing else.** There is no JS
or TS in any `packages/cli-*` tree; `bin/` is staged by CI at publish time and
is never committed. Manifest shape (example
`packages/cli-darwin-arm64/package.json`):

```json
{
  "name": "@fitor/tokens-cli-darwin-arm64",
  "os": ["darwin"],
  "cpu": ["arm64"],
  "main": "bin/tokens",
  "files": ["bin"],
  "publishConfig": { "access": "public" }
}
```

- `os`/`cpu` (and `libc: ["glibc"]` on the `-gnu` Linux packages, e.g.
  `packages/cli-linux-x64-gnu/package.json`) make npm install only the matching
  package as an optional dependency of the launcher.
- `main` points at the executable itself: `bin/tokens`, or `bin/tokens.exe` on
  Windows (`packages/cli-win32-x64-msvc/package.json`). There is no wrapper
  script and no `bin` npm field — these packages are pure binary carriers.
- **Do not add JS, React, or any source code to these packages.** If a change
  needs logic, it belongs in `cli/` (Rust) or `packages/cli` (dispatcher).

## Version lockstep

The Cargo workspace, the launcher, and all eight platform packages carry the
**same version**, and the launcher's `optionalDependencies` pin the platform
packages by exact version. `scripts/set-version.sh <version>` is the only way
to bump: one pass writes `cli/Cargo.toml` `[workspace.package].version`,
refreshes `cli/Cargo.lock`, rewrites every `packages/cli*/package.json`
`version`, and rewrites the launcher's pins. There is deliberately no
coherence check elsewhere — a drift would publish an uninstallable release, so
the script makes drift impossible (comment at `set-version.sh:3-8`).

## Publish pipeline

`.github/workflows/publish-cli.yml` (manual `workflow_dispatch`):

1. Matrix-builds the eight Rust targets (zigbuild for Linux cross-compile);
   `fail-fast: true` because one broken target means an unpublishable release.
2. Runs `set-version.sh` with the input version.
3. Downloads artifacts, `chmod +x`, and copies each binary into its
   `packages/cli-*/bin/`.
4. Builds the launcher (`bun run --cwd packages/cli build`; deliberately not
   `--frozen-lockfile` — a stale bun.lock from an unrelated web change must
   not fail a CLI release).
5. **Publishes platform packages first, then the launcher** — the launcher
   pins them by exact version and would install with no binary if it landed
   ahead of them (`publish-cli.yml:199-204`).
6. Commits the version bump and creates GitHub release tarballs
   (`tokens-v{version}-{triple}.tar.gz`).

## `install.sh`: legacy tarball channel

Root `install.sh` installs a Linux binary from **GitHub release tarballs**,
not npm: it downloads the prebuilt binary for the architecture and optionally
sets up a systemd *user* service running `tokens serve`. It is not an
advertised install path anymore — docs and site prompts point at
`npm i -g @fitor/tokens-cli` only. The tarball naming contract
(`tokens-v{version}-{triple}.tar.gz`) is what `publish-cli.yml` produces.
