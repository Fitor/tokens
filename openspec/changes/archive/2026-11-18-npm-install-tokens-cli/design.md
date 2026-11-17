## Context

安装入口现在有四套说法，互不一致。

- README.md 与 README_zh.md 按平台分三行：macOS 用 `brew install owo-network/brew/tokens`，Linux 用 `curl -fsSL https://<域名>/install.sh | sh`，Windows 用 `npm i -g tokens-cli`。下文再给一条 `curl … raw.githubusercontent.com/KunoLu/tokens/v1.0.5/pre-install-tokens.sh | bash` 一行命令。
- docs/deploy/tokens-cli-usage.md 与 .en.md 的平台表另有 Linux 行 `curl -fsSL https://s.ee/tokens | bash`，Windows 行 `npm i -g tokens-cli`。第 3 章描述 pre-install 脚本，附 curl 与 iex 一行命令，并说明发版时推进钉版 ref。
- 前端 docs 页（`web/src/app/(main)/docs/page.tsx`）按平台页签混排 brew、站点 `install.sh`、pre-install 脚本一行命令。「见 CLI 手册」链接经 `web/src/lib/scriptsRef.ts` 的 `SCRIPTS_BLOB_BASE` 指向 `github.com/KunoLu/tokens/blob/<ref>`。
- settings 页空态提示给出 `bunx tokens-cli submit`，指向旧上游包。
- pre-install-tokens.sh 的安装通道是 brew（macOS）与 `s.ee/tokens`（Linux）。pre-install-tokens.ps1 已用 npm，但装旧包 `tokens-cli`。
- npm 包 `@fitor/tokens-cli` 1.0.5 已发布。bin 为 `tokens`。八个平台包挂在 optionalDependencies。
- `scripts/set-version.sh` 发版时把 `PINNED_SCRIPTS_REF` 推进为 `v<version>`，并在五个文件里替换旧 ref。预检要求五个文件都含旧 ref。
- `tests/e2e/t9-acceptance.spec.ts` 断言旧 raw 链接可见、`brew install` 先于 `pre-install-tokens.sh` 出现。这些断言固化了旧契约。

用户已裁定两条决策。安装入口只留 npm 命令。包名写 `@fitor/tokens-cli`。

## Goals / Non-Goals

**Goals:**

- 四个入口给出同一条安装命令 `npm i -g @fitor/tokens-cli`。
- 删除旧仓库链接与四条旧安装命令。
- 两个 pre-install 脚本的安装通道统一为 npm。
- `scripts/set-version.sh` 与 `scriptsRef.ts` 适配新文档形态。
- e2e 与新增脚本测试固化新契约。

**Non-Goals:**

- 不改 `install.sh` 本体。它仍从上游 GitHub Releases 取二进制。本次只删提示里的入口。
- 不改 CLI 登录与提交语义、站点 API、alias 与 function 机制本身。
- 不发布 npm 新版本，不打 tag，不部署站点。
- 不改历史记录。CHANGELOG、`ai/tasks/**`、`docs/prd-*`、`docs/upstream_policy.md` 里对 `KunoLu/tokens` 的事实陈述保留。

## Decisions

**D1 安装命令定为 `npm i -g @fitor/tokens-cli`。**
四个入口逐字一致。备选 `npx @fitor/tokens-cli` 不落全局命令 `tokens`，与后文命令块矛盾，弃用。保留 brew 会继续依赖上游配方，与 npm 包脱节，弃用。

**D2 docs 页与 README 的命令块改用「先设环境变量，再跑命令」形态。**
每个平台页签的命令块首行设 `export TOKENS_API_URL=<站点>`（Windows 用 `$env:TOKENS_API_URL='<站点>'`）。其后 `tokens login` 等命令保持简洁。备选「每条命令带 `TOKENS_API_URL=…` 前缀」让五条日常命令噪音过大，弃用。备选「保留 pre-install 一行命令做站点指向」。用户裁定排除该备选。

**D3 `web/src/lib/scriptsRef.ts` 保留钉版 ref 机制，只换目标仓库。**
`PINNED_SCRIPTS_REF` 与 `TOKENS_SCRIPTS_REF` 的 fail-closed 覆盖逻辑原样保留。`SCRIPTS_RAW_BASE` 删除。`SCRIPTS_BLOB_BASE` 改为 `https://github.com/Fitor/tokens/blob/${SCRIPTS_REF}`，只服务「见 CLI 手册」链接。备选「删模块、page.tsx 硬编码链接」丢失发版推进机制，弃用。

**D4 文档正文不嵌 ref 值，`scripts/set-version.sh` 的 `REF_FILES` 收缩为 `web/src/lib/scriptsRef.ts`。**
文档示例链接写 `<ref>` 占位。ref 值只存在于 scriptsRef.ts。预检与替换循环代码保留，列表缩短即达成新契约。备选「五文件继续替换」要求 README 与手册常驻裸 URL，每次发版改五处，弃用。

**D5 settings 提示的命令统一渲染站点绑定。**
settings 空态提示的命令文本改为 `TOKENS_API_URL=<本站源> tokens submit`。两处 `tokens login` 提示（`settings.tokens.desc` 与 `settings.tokens.emptyHint`）改为 `TOKENS_API_URL=<本站源> tokens login`。`<本站源>` 在客户端组件取 `window.location.origin`。`emptyHintA` / `emptyHintB` 文案键不变，只换命令字符串。旧字符串 `bunx tokens-cli submit` 引导走旧包，弃用。裸 `tokens submit` 会把用量发往上游默认站，弃用。
命令形态按查看者平台渲染（round 2 修订，来自实现审查的 PowerShell 兼容性发现）。POSIX 用 `TOKENS_API_URL=<本站源> tokens …` 前缀。Windows PowerShell 不解析该前缀，用 `$env:TOKENS_API_URL='<本站源>'; tokens …` 单行赋值。客户端以 `navigator.userAgent` 判定平台，检测不到时回退 POSIX。settings 提示在认证与数据加载后才渲染，平台判定不产生 hydration 分歧。

**D6 测试分两层。**
站点行为进 Playwright e2e：改写 `tests/e2e/t9-acceptance.spec.ts` 的「Docs 页安装入口指向本站」用例，并在同一文件加 settings 空态断言。脚本与文档契约进新文件 `tests/scripts/install-via-npm.test.ts`，用 `bun test tests/scripts/install-via-npm.test.ts` 定向运行。sh 脚本行为用 stub `npm`、stub `tokens` 与临时 HOME 驱动真实脚本。ps1 行为做机械文本断言（本机无 Windows 环境）。set-version.sh 用合成 fixture 目录跑真实脚本，不碰工作区。fixture 带两个 pre-install 脚本占位、最小 `cli/Cargo.toml` workspace 与 `Cargo.lock`、`packages/` 下一个 package.json。运行环境 PATH 含 cargo 与 node。

**D7 `web/public/` 里的脚本副本不单独维护。**
`web/package.json` 的 build 步骤从仓库根拷贝。构建后核对副本与根一致即可。Git 不跟踪副本。

**D8 i18n 文案随命令形态改写。**
`docs.note.preinstall` 删除。`docs.reloadNote.posix` / `docs.reloadNote.windows` 改写为「重开终端后重新设置 `TOKENS_API_URL`」。`docs.windowsNote` 去掉「预安装脚本已通过 npm 全局安装 CLI」的说法。`docs.macosNote` / `docs.linuxNote` 去掉 alias 与 function 的表述。新增「指向本站」注解键。

**D9 `/local` 页安装引导换命令，npm 元数据改仓库地址。**
`web/src/lib/constants.ts` 的 `BREW_INSTALL_COMMAND` 改名 `NPM_INSTALL_COMMAND`，值改为 `npm i -g @fitor/tokens-cli`。`web/src/components/DataInput.tsx` 与 docs 页的引用一并更新。`packages/cli/package.json` 的 `repository.url` 从 `missuo/tokens` 改为 `git+https://github.com/Fitor/tokens.git`，避免 npm 页面把用户引向旧上游。docs/spec/tokens-cli/frontend/ 四份文件的包名事实与 `packages/cli` 对齐：裸包名 `tokens-cli` 改为 `@fitor/tokens-cli`，平台包名 `tokens-cli-<os>-<arch>` 改为 `@fitor/tokens-cli-<os>-<arch>`。

**D10 警告文本保信息、去禁用串。**
README 的「不要用 `bunx tokens-cli@latest`」警告保留原信息：裸命令会跳过站点指向、发往上游默认站。改写时不出现禁用串。示例表述：「不要用旧上游包的 `bunx` / `npx` 裸命令登录或提交」。

## Risks / Trade-offs

- [macOS / Linux 新增 Node.js 前提] → README 与手册明示前提。两个脚本缺 npm 时给出「先安装 Node.js」的报错。
- [npm 全局安装与旧 brew 安装并存会遮蔽命令] → 脚本保留停用 `tokens.service` 与 brew services 的逻辑。README 提示先删除旧安装。
- [文档改写可能漏掉旧链接] → 「文档与前端源码扫描零命中」进测试，逐模式断言。
- [`scripts/set-version.sh` 改错会卡发版] → 合成 fixture 测试覆盖预检通过与中止分支。
- [e2e 改写后可能与站点 build 产物脱节] → build 从根拷贝脚本。构建后核对 `web/public` 副本一致。
- [ps1 无真实运行验证] → 机械断言文本契约。风险接受：Windows 行为留待 Windows 环境补验。
- [npm 供应链信任：`npm i -g @fitor/tokens-cli` 浮动到最新版，平台包在安装期运行脚本] → 手册写明信任假设。需要钉版的用户可在命令后加 `@<版本>`。

## Migration Plan

纯文档、提示与脚本文案改动。随下次站点部署生效。回滚方式是 revert 提交。发版顺序不变：set-version → commit → tag → deploy。

## Open Questions

无。安装形态与包名已由用户裁定。settings 提示命令带 `TOKENS_API_URL=<本站源>` 站点绑定，按查看者平台渲染 POSIX 或 Windows PowerShell 形态，已记入 D5。
