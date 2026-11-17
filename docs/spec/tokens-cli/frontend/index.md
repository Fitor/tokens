# @fitor/tokens-cli "Frontend": npm Launcher Guidelines

> Trellis labels this layer "frontend", but `packages/cli/` is **not a UI**.
> It is the `@fitor/tokens-cli` npm package: a zero-dependency Node dispatcher that
> resolves the prebuilt Rust binary for the current platform and executes it.
> There are no components, hooks, or state management here.

---

## Overview

- `packages/cli` (npm name `@fitor/tokens-cli`) is the user-facing install:
  `npm i -g @fitor/tokens-cli` → `bin.js` → `dist/index.js` → `spawnSync(binary, argv)`.
- The real CLI is the Rust binary from `cli/tokens-cli/` (see
  `docs/spec/tokens-cli/backend/`).
- Eight sibling packages `@fitor/tokens-cli-<os>-<arch>` carry the prebuilt binaries;
  the launcher pins all eight in `optionalDependencies` at the exact same
  version (`packages/cli/package.json:31-40`).

---

## Guidelines Index

| Guide | Description |
|-------|-------------|
| [Directory Structure](./directory-structure.md) | `bin.js`, `src/index.ts`, `dist/`, and the optionalDependencies contract |
| [Binary Resolution](./binary-resolution.md) | Platform/libc detection, search paths, `TOKENS_LIBC`, anti-recursion guard, cargo fallback |
| [Packaging](./packaging.md) | The eight platform packages, publish order, `set-version.sh` lockstep, `install.sh` |
| [Quality Guidelines](./quality-guidelines.md) | No business logic in the launcher; version lockstep rules |

---

## Pre-Development Checklist

1. Confirm the change actually belongs here — anything about scanning,
   parsing, submitting, or commands belongs in the Rust workspace
   (`docs/spec/tokens-cli/backend/`), not the launcher.
2. Read [Binary Resolution](./binary-resolution.md) before touching
   `packages/cli/src/index.ts`; the search-path order and the self-reference
   guard are load-bearing.
3. If versions or package manifests change, read [Packaging](./packaging.md)
   and use `scripts/set-version.sh` — never edit a version by hand.

## Quality Check

- The launcher still has zero runtime `dependencies`
  (`packages/cli/package.json:30`).
- `bun run --cwd packages/cli build` (tsc) passes.
- All eight `optionalDependencies` pins equal the package's own version.
- No logic beyond detect → resolve → spawn (see
  [Quality Guidelines](./quality-guidelines.md)).

---

**Language**: All documentation is written in **English**.
