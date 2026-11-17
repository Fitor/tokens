## Why

README、docs 手册与前端提示仍从旧仓库 `KunoLu/tokens` 的 raw 地址拉取 pre-install 脚本。它们还引导使用者走 brew 配方、站点 `install.sh` 或旧上游包 `tokens-cli` 安装 CLI。旧仓库地址会失效，安装通道也不统一。仓库已经把 CLI 发布为 npm 包 `@fitor/tokens-cli`（1.0.5，bin `tokens`）。安装引导统一到这个包。

## What Changes

- 安装命令统一为 `npm i -g @fitor/tokens-cli`。适用范围：README.md、README_zh.md、docs/deploy/tokens-cli-usage(.en).md、前端 docs 页、`/local` 页安装引导。
- 删除四条旧命令：`brew install owo-network/brew/tokens`、`curl …/install.sh | sh`、`curl -fsSL https://s.ee/tokens | bash`、`npm i -g tokens-cli`。
- 删除所有指向旧仓库的链接。包括 `raw.githubusercontent.com/KunoLu/tokens/...` 的 curl / iex 一行命令。也包括 `github.com/KunoLu/tokens/blob/...` 的手册链接。手册链接改指 `Fitor/tokens` 仓库的钉版 ref。
- 提示不再展示脚本下载命令。**BREAKING**：原先一条 curl / iex 命令完成的预装流程不再出现在文档与前端提示。脚本仍随仓库与站点发布，供手动使用。
- pre-install-tokens.sh 与 pre-install-tokens.ps1 的 CLI 安装步骤统一改用 `npm i -g @fitor/tokens-cli`。两个脚本保留其余行为：清理旧登录、写 shell alias 或 PowerShell function、停用既有常驻上报服务。
- settings 提示的 `tokens login` 与 `tokens submit` 命令统一渲染 `TOKENS_API_URL=<本站源>` 站点绑定。README 的裸命令警告改写为不含禁用串的等效表述，警告信息保留。
- 同步修改配套件：`scripts/set-version.sh` 的 ref 推进逻辑、`web/src/lib/scriptsRef.ts`、e2e 断言、i18n 文案。
- docs/spec/tokens-cli/frontend/ 四份文件的包名事实与 `packages/cli` 对齐：裸包名 `tokens-cli` 改为 `@fitor/tokens-cli`，平台包名 `tokens-cli-<os>-<arch>` 改为 `@fitor/tokens-cli-<os>-<arch>`。

## Capabilities

### New Capabilities

- `cli-install`: CLI 安装与站点指向的统一引导。覆盖 README、docs 手册、前端 docs 页与 settings 提示的安装命令，以及两个 pre-install 脚本的安装步骤。

### Modified Capabilities

无。`openspec/specs/` 下的 `trae-cn-local-scan`、`email-transport`、`team-invitation-inbox` 不涉及安装引导。

## Impact

- 文档：`README.md`、`README_zh.md`、`docs/deploy/tokens-cli-usage.md`、`docs/deploy/tokens-cli-usage.en.md`、`docs/spec/tokens-cli/frontend/` 下的 `index.md`、`packaging.md`、`directory-structure.md`、`binary-resolution.md`。
- 前端：`web/src/app/(main)/docs/page.tsx`、`web/src/lib/scriptsRef.ts`、`web/src/lib/constants.ts`、`web/src/lib/i18n/t.ts`、`web/src/app/settings/SettingsClient.tsx`、`web/src/components/DataInput.tsx`。
- 脚本：`pre-install-tokens.sh`、`pre-install-tokens.ps1`、`scripts/set-version.sh`。
- npm 元数据：`packages/cli/package.json` 的 `repository.url` 从 `missuo/tokens` 改为 `Fitor/tokens`。
- 测试：`tests/e2e/t9-acceptance.spec.ts`、新增 `tests/scripts/install-via-npm.test.ts`。
- 使用前提变化：npm 通道要求使用者安装 Node.js。macOS / Linux 新增此前只有 Windows 才有的前提。
- 记录两条假设。包名以 `packages/cli/package.json` 为准写 `@fitor/tokens-cli`。手册链接以本仓库新地址 `Fitor/tokens` 为准。
- 不在本次范围：`install.sh` 本体。它仍从上游 GitHub Releases 取二进制。本次只从提示中删除它的入口。`enable-tokens-service.sh` 与 `register-tokens-submit-task.ps1` 的行为不变。
