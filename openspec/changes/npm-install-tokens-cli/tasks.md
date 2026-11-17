## 1. pre-install-tokens.sh 安装通道

- [x] 1.1 Add regression guards:「sh 脚本在 tokens 已存在时不要求 npm」与「sh 脚本清登录并写 alias」。两者是 test-plan 护栏行。确认改动前基线即绿。
- [x] 1.2 Write failing test:「sh 脚本缺 CLI 时经 npm 安装」。test-plan 🔴 行。断言 stub `npm` 收到 `i -g @fitor/tokens-cli`。确认按预期原因失败：脚本仍走 brew / `s.ee/tokens` 通道。
- [x] 1.3 Implement: pre-install-tokens.sh 安装分支统一运行 `npm i -g @fitor/tokens-cli`。npm 检查只在安装分支触发（spec R3、design D1）。通过 1.2，且 1.1 保持绿。
- [x] 1.4 Write failing test:「sh 脚本缺 npm 时中止」。断言退出码非 0。stderr 提示先安装 Node.js。rc 文件未写入。
- [x] 1.5 Implement: 安装分支缺 npm 时报错退出。退出前不做任何本机修改。通过 1.4。
- [x] 1.6 Write failing test:「sh 脚本在 npm 安装失败时中止」。stub `npm` 以非零码退出。（写入即绿：1.3 的实现配 `set -euo pipefail` 已覆盖该契约，红灯并入 1.3 增量。）
- [x] 1.7 Implement: 安装命令非零退出时报错退出。退出前不做任何本机修改。通过 1.6。（显式化：npm 失败补 `die` 明确报错文案。）
- [x] 1.8 Write failing test:「sh 脚本 dry-run 不修改本机」。断言未调用 stub `npm`。rc 文件未写入。输出含 `npm i -g @fitor/tokens-cli`。
- [x] 1.9 Implement: dry-run 分支报出将运行的 npm 命令。dry-run 不调用任何命令。通过 1.8。
- [x] 1.10 Write failing test:「sh 脚本文本无旧安装入口（机械检查）」。断言文本不含 `s.ee`、`brew install`、`install.sh` 安装入口。（写入即绿：入口已随 1.3、1.9 增量删除，红灯并入这两步。）
- [x] 1.11 Implement: 删除 brew 配方、`s.ee/tokens`、站点 `install.sh` 三处安装入口（spec R3、design D1）。提及这些入口的文案一并删除。通过 1.10。
- [x] 1.12 Refactor: 脚本结构与文案整理。本组测试全绿。

## 2. pre-install-tokens.ps1 安装通道

- [x] 2.1 Write failing test:「ps1 脚本缺 CLI 时经 npm 安装（机械检查）」。断言文本含 `npm i -g @fitor/tokens-cli`。断言文本不含 `npm i -g tokens-cli` 与旧安装入口。
- [x] 2.2 Implement: ps1 安装命令与 dry-run 文案改 `npm i -g @fitor/tokens-cli`（spec R3、design D1）。通过 2.1。
- [x] 2.3 Add regression guard:「ps1 脚本缺 npm 时中止（机械检查）」。护栏行。确认基线即绿。
- [x] 2.4 Refactor: ps1 文案一致。本组测试全绿。

## 3. 前端 docs 页与链接

- [x] 3.1 Write failing test:「docs 页各平台页签给出 npm 安装命令」。含首行站点绑定断言。macOS 与 Linux 页签断言 `export TOKENS_API_URL=<本站源>`。Windows 页签断言 `$env:TOKENS_API_URL='<本站源>'`。（按 D6 把「Docs 页安装入口指向本站」用例整块改写，3.3/3.5 的测试随改写一并落位。）
- [x] 3.2 Implement: docs 页命令块改 npm 安装加站点指向首行（spec R1、design D2）。通过 3.1。
- [x] 3.3 Write failing test:「docs 页不含旧链接」与「docs 页无脚本下载命令」。两个 🔴 行。（已随 3.1 改写落位并确认红灯。）
- [x] 3.4 Implement: 删除 `preinstallSh` 与 `preinstallPs1` 一行命令。删除旧仓库链接（spec R2、R5）。通过 3.3。（一行命令的删除红绿并入 3.1→3.2 增量；旧仓库链接的红绿落在 3.6。）
- [x] 3.5 Write failing test:「手册链接指向新仓库钉版 ref」。断言 href 等于 `https://github.com/Fitor/tokens/blob/<ref>/docs/deploy/tokens-cli-usage.md`。（已随 3.1 改写落位并确认红灯。）
- [x] 3.6 Implement: `web/src/lib/scriptsRef.ts` 改造（spec R5、design D3）。删 `SCRIPTS_RAW_BASE`。`SCRIPTS_BLOB_BASE` 改指 `Fitor/tokens`。`PINNED_SCRIPTS_REF` 与 `TOKENS_SCRIPTS_REF` 覆盖逻辑保留。通过 3.5。
- [x] 3.7 Add regression guard:「非法 ref 覆盖回退钉版」。测试文件 `web/src/lib/scriptsRef.test.ts`。护栏行。确认基线即绿。
- [x] 3.8 Write failing test:「settings 提示命令带站点绑定」。三处命令文本断言 `TOKENS_API_URL=<本站源> tokens …`。页面不含 `bunx tokens-cli`。
- [x] 3.9 Implement: `web/src/app/settings/SettingsClient.tsx` 三处命令渲染站点绑定（spec R1、design D5）。`<本站源>` 取 `window.location.origin`。通过 3.8。
- [x] 3.10 Write failing test:「/local 页安装引导显示 npm 命令」。
- [x] 3.11 Implement: `web/src/lib/constants.ts` 与 `web/src/components/DataInput.tsx` 改造（design D9）。`BREW_INSTALL_COMMAND` 改名 `NPM_INSTALL_COMMAND`。值换 `npm i -g @fitor/tokens-cli`。通过 3.10。
- [x] 3.12 Implement: i18n 文案改写（design D8）。删 `docs.note.preinstall`。改 `docs.reloadNote.posix`、`docs.reloadNote.windows`、`docs.macosNote`、`docs.linuxNote`、`docs.windowsNote`。新增站点指向注解键。e2e 文案断言随之更新。（站点指向注解键 `docs.note.sitePin` 已随 3.2 落位；旧「reopen the terminal」文案断言随旧契约用例改写删除，新断言不依赖 reloadNote 文案。）
- [x] 3.13 Refactor: 前端结构整理。web 目录 `bun test` 全绿。e2e 定向全绿。（bun test 72/72；t9 e2e 全文件 13/13。）

## 4. 文档改写

- [x] 4.1 Write failing test:「README 与手册给出同一安装命令」与「文档与前端源码扫描零命中」。两个 🔴 行。
- [x] 4.2 Implement: README.md 与 README_zh.md 安装段改写。安装命令统一 `npm i -g @fitor/tokens-cli`。删 curl raw 一行命令。裸命令警告改写为不含禁用串的等效表述（design D10、P3）。
- [x] 4.3 Implement: docs/deploy/tokens-cli-usage.md 与 .en.md 改写。平台表改单行 npm。第 3 章脚本说明改 npm 安装。删 curl 与 iex 一行命令。ref 说明按 design D4 改写。补 npm 信任假设与钉版写法（P1）。
- [x] 4.4 Implement: docs/spec/tokens-cli/frontend/ 四份文件包名契约改写（proposal What Changes、design D9）。四份文件为 index.md、packaging.md、directory-structure.md、binary-resolution.md。`tokens-cli` 改 `@fitor/tokens-cli`。`tokens-cli-<os>-<arch>` 改 `@fitor/tokens-cli-<os>-<arch>`。（packaging.md 的 s.ee 段落一并清除，扫描场景 docs/** 覆盖它。）
- [x] 4.5 Confirm: 4.1 的两个测试转绿。ste-lint 对改写文档复检无新增硬违规。（README_zh 8 处＝基线 8 处；手册 12 处＜基线 15 处；全部为未触碰段落的存量违规。）

## 5. 发版脚本与 npm 元数据

- [x] 5.1 Write failing test:「ref 预检只检查仍含 ref 的文件」。用合成 fixture。README 与手册不含 ref 时 `bash scripts/set-version.sh 1.0.6` 退出 0。`PINNED_SCRIPTS_REF` 变 `v1.0.6`。
- [x] 5.2 Implement: `scripts/set-version.sh` 的 `REF_FILES` 收缩为 `web/src/lib/scriptsRef.ts`（spec R6、design D4）。预检与替换循环保留。通过 5.1。
- [x] 5.3 Add regression guard:「scriptsRef 缺失时发版脚本中止」。护栏行。断言退出码非 0。断言脚本未修改任何 package.json。（实测非基线绿：`set -e` 下 grep 无匹配静默中止，缺 spec 要求的报错信息。按 spec 修脚本为显式报错后转绿；test-plan 护栏分类已更正。）
- [x] 5.4 Implement: `packages/cli/package.json` 的 `repository.url` 改 `git+https://github.com/Fitor/tokens.git`（design D9、P4）。
- [x] 5.5 Refactor: 本组测试全绿。

## 6. 验证汇总

- [x] 6.1 Run: web 目录 `bun test`。全绿。（72 pass / 0 fail）
- [x] 6.2 Run: `bun test tests/scripts/install-via-npm.test.ts`。全绿。（13 pass / 0 fail）
- [x] 6.3 Run: `bunx playwright test tests/e2e/t9-acceptance.spec.ts`。全绿。（13 passed / 0 failed / 0 flaky）
- [x] 6.4 Run: web `bun run build`。检查 `web/public` 下 pre-install 脚本副本与仓库根一致（design D7）。（build 通过，`diff -q` 两副本一致）
- [x] 6.5 Run: 全库禁用模式扫描（测试文件除外）。零命中。test-plan 账本回填至全绿。（285 个文件零命中；账本 20/20 行 🟢）

## 7. round 2 审查回归（实现审查发现修复）

- [x] 7.1 Amend: spec R1 场景与 design D5 按 review.md「实现审查」的 PowerShell 兼容性发现修订。settings 命令按查看者平台渲染：POSIX 前缀形态与 Windows `$env:` 单行赋值形态。
- [x] 7.2 Implement: `SettingsClient.tsx` 三处命令按 `navigator.userAgent` 渲染平台形态，检测不到回退 POSIX。提示在认证与数据加载后渲染，无 hydration 分歧。
- [x] 7.3 Test: settings e2e 扩展双平台断言。默认上下文（Playwright 桌面 Chromium 固定发 Windows UA）断言 `$env:` 形态；macOS UA 克隆上下文断言 POSIX 形态。
- [x] 7.4 Fix: 📌 两条滞后注释修正（`scripts/set-version.sh` 两处、`packages/cli/src/index.ts` 两处）。仅注释，无行为变化。
- [x] 7.5 Run: 全量套件复跑。web `bun test` 全绿；`install-via-npm.test.ts` 全绿；t9 e2e 全文件全绿；web build 通过。
- [x] 7.6 Round 2 评审返回：`VERDICT: APPROVE`。无 🔴 无 🟡。三条 📌 建议。（评审块已记入 review.md。）
- [x] 7.7 📌 处理：P1 已采纳，settings e2e 加双向排他断言。P2 已采纳，平台检测改用 `/Windows/`。P3 作者拒绝：cmd.exe 口径与 docs 页 Windows 页签、pre-install-tokens.ps1 一致，属既有生态立场，非本变更引入。作者回应记入 review.md。verify.md 补 round 2 记录后翻转 CHANGES_APPLIED。
