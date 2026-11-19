## Why

Windows 上的 `TokensSubmit` 计划任务每次触发都会在用户桌面弹出 PowerShell 窗口。任务默认以「仅当用户登录时运行」方式注册。`powershell.exe` 是控制台程序，系统先给它分配可见的控制台窗口。`-WindowStyle Hidden` 在窗口出现后才生效，拦不住弹窗。窗口会持续到 `tokens submit` 提交结束。

## What Changes

- `register-tokens-submit-task.ps1` 写 runner 的同一步，增写 `tokens-submit-hidden.vbs` 到 `%LOCALAPPDATA%\tokens\`。该文件用 `WshShell.Run` 以隐藏窗口方式启动 runner。
- 计划任务的 Action 从 `powershell.exe -NoProfile -WindowStyle Hidden -File <runner>` 改为 `wscript.exe //B //Nologo <launcher>`。`wscript.exe` 不带控制台，不创建可见窗口。
- `-Remove` 同步删除 launcher 文件。
- 以下内容不变：登录类型（仍仅登录时运行）、提交间隔、runner 内容、凭据位置、`-DryRun` 行为。
- `web/public/register-tokens-submit-task.ps1` 分发副本同步更新。副本由 web 构建从仓库根拷贝，Git 不跟踪。
- `docs/deploy/tokens-cli-usage.md` 与 `docs/deploy/tokens-cli-usage.en.md` 各补一段。内容是 `wscript → vbs → runner` 启动链路说明，以及 GPO 禁用 `wscript.exe` 的排查提示。
- 无 **BREAKING** 变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `cli-install`: 新增需求。计划任务注册必须使用无窗口宿主启动 runner。任务触发时不得在用户桌面创建可见窗口。

## Impact

- 脚本：`register-tokens-submit-task.ps1` 与其 `web/public/` 副本。
- 文档：`docs/deploy/tokens-cli-usage.md` 与 `docs/deploy/tokens-cli-usage.en.md`。
- 测试：`tests/` 增加机械文本断言。本机无 Windows 环境，ps1 行为用文本断言验证。
- 平台：行为变化仅限 Windows。macOS 与 Linux 不受影响。
- 观测变化：任务历史记录的宿主进程显示 `wscript.exe`，不再显示 `powershell.exe`。
- 已知风险：企业 GPO 禁用 `wscript.exe` 的环境里任务会静默不跑。该场景不在本次修复范围。
