/**
 * CLI 安装通道契约测试：安装引导统一 `npm i -g @fitor/tokens-cli`。
 *
 * sh 脚本用 stub `npm` / stub `tokens`、临时 HOME 与受控 PATH 驱动真实脚本；
 * ps1 本机无 Windows 环境，做机械文本断言。禁用串在这些断言里以反向形式出现，
 * 「文档与前端源码扫描零命中」的扫描范围不含测试文件。
 */

import { describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../..");
const SH_SCRIPT = path.join(ROOT, "pre-install-tokens.sh");
const PS1_SCRIPT = path.join(ROOT, "pre-install-tokens.ps1");
const SITE = "https://example.com";
const ALIAS_LINE = `alias tokens='TOKENS_API_URL=${SITE} tokens'`;

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface Harness {
  home: string;
  binDir: string;
  npmLog: string;
  tokensLog: string;
  npmInstalled: boolean;
  run(args: string[]): RunResult;
  npmCalls(): string[];
  tokensCalls(): string[];
  bashrc(): string;
  dispose(): void;
}

/**
 * 受控环境驱动 pre-install-tokens.sh：
 * - binDir 里按需放 stub `tokens`（记录子命令）与 stub `npm`（记录参数，
 *   可注入失败退出码，并在「安装」后创建假 `tokens`）；
 * - PATH 只含 binDir 与 /usr/bin:/bin，真实机器上的 brew / systemctl /
 *   curl 一律不可见；
 * - HOME 指向临时目录，SHELL 固定 bash，rc 写入可断言。
 */
function makeHarness(opts: { withTokens?: boolean; withNpm?: boolean; npmFail?: string } = {}): Harness {
  const base = mkdtempSync(path.join(tmpdir(), "tokens-install-test-"));
  const home = path.join(base, "home");
  const binDir = path.join(base, "bin");
  mkdirSync(home, { recursive: true });
  mkdirSync(binDir, { recursive: true });

  const tokensLog = path.join(base, "tokens-calls.log");
  const npmLog = path.join(base, "npm-calls.log");

  const tokensStub = [
    "#!/usr/bin/env bash",
    'printf \'%s\\n\' "$*" >> "$TOKENS_CALLS_LOG"',
    "exit 0",
    "",
  ].join("\n");

  const npmStub = [
    "#!/usr/bin/env bash",
    'printf \'%s\\n\' "$*" >> "$NPM_CALLS_LOG"',
    'if [ -n "${NPM_FAIL:-}" ]; then exit "$NPM_FAIL"; fi',
    `cat > "\${STUB_BIN_DIR}/tokens" <<'STUB'`,
    "#!/usr/bin/env bash",
    'printf \'%s\\n\' "$*" >> "$TOKENS_CALLS_LOG"',
    "STUB",
    'chmod +x "${STUB_BIN_DIR}/tokens"',
    "exit 0",
    "",
  ].join("\n");

  if (opts.withTokens) {
    writeFileSync(path.join(binDir, "tokens"), tokensStub);
    chmodSync(path.join(binDir, "tokens"), 0o755);
  }
  if (opts.withNpm) {
    writeFileSync(path.join(binDir, "npm"), npmStub);
    chmodSync(path.join(binDir, "npm"), 0o755);
  }

  const env: Record<string, string> = {
    HOME: home,
    SHELL: "/bin/bash",
    PATH: `${binDir}:/usr/bin:/bin`,
    TOKENS_CALLS_LOG: tokensLog,
    NPM_CALLS_LOG: npmLog,
    STUB_BIN_DIR: binDir,
    ...(opts.npmFail ? { NPM_FAIL: opts.npmFail } : {}),
  };

  const run = (args: string[]): RunResult => {
    const proc = Bun.spawnSync(["bash", SH_SCRIPT, ...args], {
      cwd: ROOT,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      exitCode: proc.exitCode ?? -1,
      stdout: proc.stdout ? proc.stdout.toString() : "",
      stderr: proc.stderr ? proc.stderr.toString() : "",
    };
  };

  return {
    home,
    binDir,
    npmLog,
    tokensLog,
    npmInstalled: opts.withNpm === true,
    run,
    npmCalls: () => (existsSync(npmLog) ? readFileSync(npmLog, "utf8").trim().split("\n").filter(Boolean) : []),
    tokensCalls: () => (existsSync(tokensLog) ? readFileSync(tokensLog, "utf8").trim().split("\n").filter(Boolean) : []),
    bashrc: () => readFileSync(path.join(home, ".bashrc"), "utf8"),
    dispose: () => rmSync(base, { recursive: true, force: true }),
  };
}

describe("文档与前端源码的安装命令契约", () => {
  const BANNED_PATTERNS: ReadonlyArray<[string, RegExp]> = [
    ["raw.githubusercontent.com/KunoLu", /raw\.githubusercontent\.com\/KunoLu/],
    ["github.com/KunoLu/tokens", /github\.com\/KunoLu\/tokens/],
    ["brew install owo-network", /brew install owo-network/],
    ["npm i -g tokens-cli", /npm i -g tokens-cli/],
    ["bunx tokens-cli", /bunx tokens-cli/],
    ["install.sh | sh", /install\.sh \| sh/],
    ["s.ee/tokens", /s\.ee\/tokens/],
  ];

  const DOC_FILES = [
    "README.md",
    "README_zh.md",
    "docs/deploy/tokens-cli-usage.md",
    "docs/deploy/tokens-cli-usage.en.md",
  ];

  function* walkFiles(dir: string, suffixes: string[]): Generator<string> {
    for (const entry of readdirSync(dir)) {
      const p = path.join(dir, entry);
      if (statSync(p).isDirectory()) {
        yield* walkFiles(p, suffixes);
      } else if (
        suffixes.some((s) => entry.endsWith(s)) &&
        !entry.endsWith(".test.ts") &&
        !entry.endsWith(".test.tsx")
      ) {
        yield p;
      }
    }
  }

  test("README 与手册给出同一安装命令", () => {
    for (const rel of DOC_FILES) {
      const text = readFileSync(path.join(ROOT, rel), "utf8");
      expect(text).toContain("npm i -g @fitor/tokens-cli");
      expect(text).not.toContain("brew install owo-network/brew/tokens");
      expect(text).not.toContain("install.sh | sh");
      expect(text).not.toContain("curl -fsSL https://s.ee/tokens | bash");
      expect(text).not.toContain("npm i -g tokens-cli");
    }
  });

  test("文档与前端源码扫描零命中", () => {
    const scope: string[] = [
      path.join(ROOT, "README.md"),
      path.join(ROOT, "README_zh.md"),
      ...walkFiles(path.join(ROOT, "docs"), [".md"]),
      ...walkFiles(path.join(ROOT, "web/src"), [".ts", ".tsx"]),
      path.join(ROOT, "pre-install-tokens.sh"),
      path.join(ROOT, "pre-install-tokens.ps1"),
      ...walkFiles(path.join(ROOT, "scripts"), [".sh"]),
    ];
    const hits: string[] = [];
    for (const file of scope) {
      const text = readFileSync(file, "utf8");
      for (const [label, pattern] of BANNED_PATTERNS) {
        if (pattern.test(text)) hits.push(`${path.relative(ROOT, file)}: ${label}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe("pre-install-tokens.ps1 安装通道（机械检查）", () => {
  const ps1Text = () => readFileSync(PS1_SCRIPT, "utf8");

  test("ps1 脚本缺 CLI 时经 npm 安装（机械检查）", () => {
    const text = ps1Text();
    expect(text).toContain("npm i -g @fitor/tokens-cli");
    expect(text).not.toContain("npm i -g tokens-cli");
    expect(text).not.toContain("s.ee");
    expect(text).not.toContain("brew");
    expect(text).not.toContain("install.sh");
  });

  // 护栏行：行为保持测试，改动前后都必须绿（test-plan「🟢 green（护栏）」）。
  test("ps1 脚本缺 npm 时中止（机械检查）", () => {
    const text = ps1Text();
    expect(text).toMatch(/没有 npm 可用|未找到 npm|Get-Command npm/);
    expect(text).toContain("Node.js");
  });
});

describe("pre-install-tokens.sh 安装通道", () => {
  test("sh 脚本缺 CLI 时经 npm 安装", () => {
    const h = makeHarness({ withNpm: true });
    try {
      const result = h.run([SITE]);
      expect(result.exitCode).toBe(0);
      expect(h.npmCalls()).toEqual(["i -g @fitor/tokens-cli"]);
    } finally {
      h.dispose();
    }
  });

  test("sh 脚本缺 npm 时中止", () => {
    const h = makeHarness({});
    try {
      const result = h.run([SITE]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("Node.js");
      expect(existsSync(path.join(h.home, ".bashrc"))).toBe(false);
    } finally {
      h.dispose();
    }
  });

  test("sh 脚本在 npm 安装失败时中止", () => {
    const h = makeHarness({ withNpm: true, npmFail: "3" });
    try {
      const result = h.run([SITE]);
      expect(result.exitCode).not.toBe(0);
      expect(existsSync(path.join(h.home, ".bashrc"))).toBe(false);
    } finally {
      h.dispose();
    }
  });

  test("sh 脚本 dry-run 不修改本机", () => {
    const h = makeHarness({ withNpm: true });
    try {
      const result = h.run(["--dry-run", SITE]);
      expect(result.exitCode).toBe(0);
      expect(existsSync(path.join(h.home, ".bashrc"))).toBe(false);
      expect(h.npmCalls()).toEqual([]);
      expect(result.stdout).toContain("npm i -g @fitor/tokens-cli");
    } finally {
      h.dispose();
    }
  });

  test("sh 脚本文本无旧安装入口（机械检查）", () => {
    const text = readFileSync(SH_SCRIPT, "utf8");
    expect(text).not.toContain("s.ee");
    expect(text).not.toContain("brew install");
    expect(text).not.toContain("install.sh");
  });

  // 护栏行：行为保持测试，改动前后都必须绿（test-plan「🟢 green（护栏）」）。

  test("sh 脚本在 tokens 已存在时不要求 npm", () => {
    const h = makeHarness({ withTokens: true });
    try {
      const result = h.run([SITE]);
      expect(result.exitCode).toBe(0);
      expect(h.npmCalls()).toEqual([]);
      expect(h.bashrc()).toContain(ALIAS_LINE);
    } finally {
      h.dispose();
    }
  });

  test("sh 脚本清登录并写 alias", () => {
    const h = makeHarness({ withTokens: true });
    try {
      const result = h.run([SITE]);
      expect(result.exitCode).toBe(0);
      expect(h.tokensCalls()).toContain("logout");
      expect(h.bashrc()).toContain(ALIAS_LINE);
    } finally {
      h.dispose();
    }
  });
});

describe("发版脚本与 npm 元数据", () => {
  // 合成 fixture（design D6）：set-version.sh 原样拷贝、两个 pre-install 占位
  // 文件、最小 Cargo workspace 与 Cargo.lock、packages/ 下一个 package.json、
  // scriptsRef.ts 由用例给内容；README 与手册不含 ref 值。
  function makeSetVersionFixture(scriptsRefContent: string): string {
    const root = mkdtempSync(path.join(tmpdir(), "set-version-fixture-"));
    mkdirSync(path.join(root, "scripts"), { recursive: true });
    copyFileSync(
      path.join(ROOT, "scripts/set-version.sh"),
      path.join(root, "scripts/set-version.sh")
    );
    writeFileSync(path.join(root, "pre-install-tokens.sh"), "#!/usr/bin/env bash\n");
    writeFileSync(path.join(root, "pre-install-tokens.ps1"), "# placeholder\n");
    mkdirSync(path.join(root, "cli/member/src"), { recursive: true });
    writeFileSync(
      path.join(root, "cli/Cargo.toml"),
      '[workspace]\nresolver = "2"\nmembers = ["member"]\n\n[workspace.package]\nversion = "1.0.5"\n'
    );
    writeFileSync(
      path.join(root, "cli/member/Cargo.toml"),
      '[package]\nname = "fixture-member"\nversion = "0.1.0"\nedition = "2021"\n'
    );
    writeFileSync(path.join(root, "cli/member/src/lib.rs"), "");
    writeFileSync(
      path.join(root, "cli/Cargo.lock"),
      'version = 3\n\n[[package]]\nname = "fixture-member"\nversion = "0.1.0"\n'
    );
    mkdirSync(path.join(root, "packages/cli"), { recursive: true });
    writeFileSync(
      path.join(root, "packages/cli/package.json"),
      JSON.stringify(
        {
          name: "@fitor/tokens-cli",
          version: "1.0.5",
          optionalDependencies: { "@fitor/tokens-cli-darwin-arm64": "1.0.5" },
        },
        null,
        2
      ) + "\n"
    );
    mkdirSync(path.join(root, "web/src/lib"), { recursive: true });
    writeFileSync(path.join(root, "web/src/lib/scriptsRef.ts"), scriptsRefContent);
    writeFileSync(path.join(root, "README.md"), "# fixture README without the pinned ref\n");
    mkdirSync(path.join(root, "docs/deploy"), { recursive: true });
    writeFileSync(path.join(root, "docs/deploy/tokens-cli-usage.md"), "# fixture manual without the pinned ref\n");
    return root;
  }

  function runSetVersion(root: string, args: string[]): RunResult {
    const proc = Bun.spawnSync(["bash", "scripts/set-version.sh", ...args], {
      cwd: root,
      env: { ...process.env },
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      exitCode: proc.exitCode ?? -1,
      stdout: proc.stdout ? proc.stdout.toString() : "",
      stderr: proc.stderr ? proc.stderr.toString() : "",
    };
  }

  test("ref 预检只检查仍含 ref 的文件", () => {
    const root = makeSetVersionFixture('export const PINNED_SCRIPTS_REF = "v1.0.5";\n');
    try {
      const result = runSetVersion(root, ["1.0.6"]);
      expect(result.stderr).not.toContain("has no occurrence of");
      expect(result.exitCode).toBe(0);
      const ref = readFileSync(path.join(root, "web/src/lib/scriptsRef.ts"), "utf8");
      expect(ref).toContain("v1.0.6");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // 护栏行：行为保持测试，改动前后都必须绿（test-plan「🟢 green（护栏）」）。
  test("scriptsRef 缺失时发版脚本中止", () => {
    const root = makeSetVersionFixture('export const SOMETHING_ELSE = "x";\n');
    try {
      const result = runSetVersion(root, ["1.0.6"]);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("cannot read PINNED_SCRIPTS_REF");
      const pkg = readFileSync(path.join(root, "packages/cli/package.json"), "utf8");
      expect(pkg).toContain('"version": "1.0.5"');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
