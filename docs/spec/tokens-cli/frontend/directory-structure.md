# Directory Structure: `packages/cli` npm Launcher

> The `@fitor/tokens-cli` npm package is a native-binary dispatcher. Everything in it
> exists to find the right prebuilt Rust binary and exec it.

---

## Layout

```
packages/cli/
├── bin.js            # npm bin shim: `#!/usr/bin/env node` + `await import("./dist/index.js")`
├── src/index.ts      # the entire dispatcher: detect → resolve → spawnSync
├── dist/             # tsc output; `dist/index.js` is the package `main`
├── package.json      # see below
├── tsconfig.json
└── bunfig.toml
```

There is no other source. No UI, no commands, no config schema.

## package.json contract (`packages/cli/package.json`)

- `bin: { "tokens": "./bin.js" }` — the executable users get on `PATH`.
- `main: "./dist/index.js"`, `files: ["bin.js", "dist/**/*"]` — only the shim
  and the compiled dispatcher are published.
- `type: "module"`; build is plain `tsc` (`scripts.build`), with
  `prepublishOnly` running the build.
- `"dependencies": {}` — zero runtime dependencies, on purpose. The dispatcher
  uses only `node:*` builtins so it runs on any Node that can host npm.
- `optionalDependencies` pin all eight `@fitor/tokens-cli-<os>-<arch>` packages at the
  **exact same version** as the launcher (`package.json:31-40`). npm installs
  only the one matching the host's `os`/`cpu`/`libc`; the dispatcher resolves
  the binary inside that sibling package.

## Relationship to the rest of the monorepo

| Piece | Path | Relationship |
|-------|------|--------------|
| Rust binary source | `cli/tokens-cli/`, `cli/tokens-core/` | What actually runs; see `docs/spec/tokens-cli/backend/` |
| Platform packages | `packages/cli-darwin-arm64/` … | Sibling npm packages holding `bin/tokens` per platform; see [Packaging](./packaging.md) |
| Dev runner | `scripts/cli.sh` | `cargo build` + `bun packages/cli/src/index.ts` for local runs |
| Version writer | `scripts/set-version.sh` | Rewrites every manifest in one pass |

In monorepo development the dispatcher runs from `src/` (via bun) or `dist/`
and falls back to cargo's output under `cli/target/` — see
[Binary Resolution](./binary-resolution.md) for the exact search order.
