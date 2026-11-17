# Binary Resolution: How the Launcher Finds `tokens`

> All logic lives in `packages/cli/src/index.ts`. The flow is: detect the
> platform triple → build an ordered search-path list → pick the first existing
> path that is not the launcher itself → `spawnSync(binary, process.argv.slice(2), { stdio: "inherit" })`
> and exit with the child's status (`index.ts:235-236`).

---

## Platform and libc detection

- **OS/arch** map from `process.platform`/`process.arch` to a directory name
  like `cli-darwin-arm64` in `resolveTargetPackageName()` (`index.ts:133+`).
  The directory name equals the monorepo directory and the suffix of the
  scoped npm package name (`@fitor/tokens-cli-darwin-arm64` ↔ `packages/cli-darwin-arm64/`).
- **libc** matters only on Linux: `detectLibcKind()` (`index.ts:29-89`)
  distinguishes `gnu` from `musl` by looking for the dynamic loader —
  glibc ships `ld-linux-*.so.*` in `/lib64` (or `/lib`), musl distros ship
  `/lib/ld-musl-<arch>.so.1` (`loaderPresent()`, `index.ts:91-104`).
- **`TOKENS_LIBC` override**: setting `TOKENS_LIBC=musl` (or `gnu`) skips
  detection. Use it in containers where the loader heuristic lies.

## Search paths (in order)

1. The sibling platform package:
   `.../node_modules/@fitor/tokens-cli-<platform>/bin/tokens` — the packages are
   scoped, so platform binaries are siblings of the dispatcher under the same
   `@fitor` scope directory inside `node_modules` (path math and comments at
   `index.ts:9-25,170-185`).
2. Cargo cross-build output:
   `<repo>/cli/target/<rust-target-triple>/release/tokens`
   (`resolveRustTargetTriple()`, `index.ts:166,191-194`).
3. Cargo default output: `<repo>/cli/target/release/tokens`.
4. `<launcher-package>/bin/tokens` (a binary staged next to the dispatcher).

Paths 2–4 exist for monorepo development only: cargo output lives under
`cli/target/` because the Rust workspace manifest is `cli/Cargo.toml`, and an
npm install resolves the sibling platform package at step 1 and never reaches
the cargo fallbacks (`index.ts:187-199`).

## Anti-recursion guard

A resolved path that would re-enter this wrapper causes a fork bomb. Before
accepting a candidate, the launcher compares **realpaths** against a
`selfPaths` set (the dispatcher's own file plus `process.argv[1]`, both
dereferenced so npm/bun bin shims and symlinks resolve to the real file):
`isSelfReference()` at `index.ts:207-224`. Never remove this guard when
editing the search order — it is what makes "binary not found" a clean error
instead of an infinite respawn.

## Failure mode

If no candidate exists, the launcher prints an explanatory `console.error`
(listing the platform package it looked for) and exits non-zero
(`index.ts:226-233`). It never downloads anything and never guesses.

## Rules for changes

- Keep zero runtime dependencies — detection uses only `node:*` builtins.
- Preserve the search order; the sibling package must always win over dev
  fallbacks.
- Any new platform package (new OS/arch/libc target) needs entries in
  `resolveTargetPackageName()`, `resolveRustTargetTriple()`, the launcher's
  `optionalDependencies`, and the publish workflow matrix — see
  [Packaging](./packaging.md).
