## Why

`pre-install-tokens.ps1` 与 `register-tokens-submit-task.ps1` 用 `Get-Command tokens -CommandType Application` 解析 `tokens` 的绝对路径。npm 在 Windows 上生成多个入口（`tokens.cmd`、无扩展名 shim、`tokens.ps1`），`Get-Command` 返回多个结果。脚本把多个结果拼成一个无效路径，写进 PowerShell Profile function 与计划任务 runner：预装脚本每次 Windows 安装后都产出坏的 `tokens` function，旧登录清理静默失败；任务注册脚本写出的 runner 每次触发都失败。

## What Changes

- 两个脚本解析 `tokens` 路径时先数组化结果再单选：Windows 上优先取 `*.cmd`，没有 `.cmd` 时取第一个结果。解析结果必须是单一、存在的可执行路径
- `pre-install-tokens.ps1` 用解析出的单一路径调用 `tokens logout`，并写进 Profile function
- `register-tokens-submit-task.ps1` 用解析出的单一路径写计划任务 runner
- 同步 `web/public/` 下的两个分发副本；新增机械断言，守护仓库根副本与 `web/public/` 副本一致
- `tests/scripts/install-via-npm.test.ts` 新增机械文本断言：两个 ps1 都含优先 `.cmd` 的单选逻辑

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `cli-install`: 新增需求——脚本解析 `tokens` 可执行路径必须把 `Get-Command` 的多个结果收敛为单一路径，Windows 上优先 `tokens.cmd`；写入 Profile function 与计划任务 runner 的路径必须是单一可执行路径

## Impact

- `pre-install-tokens.ps1`、`register-tokens-submit-task.ps1`（仓库根与 `web/public/` 各一份，共四处）
- `tests/scripts/install-via-npm.test.ts` 新增断言
- `openspec/specs/cli-install/spec.md` 收 delta
- 不改 CLI 本体；不改 docs 页（`cli-install` spec 已禁止 docs 页出现 pre-install 脚本下载命令，本次不触碰该约束）
- 本机无 Windows 与 pwsh：ps1 行为无法实跑验证，沿用既有机械文本断言模式
