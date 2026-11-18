## ADDED Requirements

### Requirement: 计划任务触发不得创建可见窗口

`register-tokens-submit-task.ps1` 注册计划任务时，必须用无窗口宿主启动 runner。计划任务的 Action 可执行文件必须是 `wscript.exe`。Action 参数必须含 `//B //Nologo` 与 launcher 路径。launcher 路径在 Action 参数中必须用双引号包裹。脚本必须把 launcher 写到 `%LOCALAPPDATA%\tokens\tokens-submit-hidden.vbs`。launcher 必须以带 BOM 的 UTF-8 写入。launcher 必须用 `WshShell.Run` 启动 runner，窗口样式参数必须是 `0`。launcher 必须等待 runner 结束，并把 powershell 进程的退出码经 `WScript.Quit` 回传给计划任务。runner 内容、`tokens submit` 调用结构、提交间隔、登录类型保持不变。`-Remove` 必须同时删除 launcher 文件。`-DryRun` 不得写入或删除任何文件。本机无 Windows 环境时，ps1 与 vbs 行为用机械文本断言验证。

#### Scenario: Action 由 wscript 启动（机械检查）

- **GIVEN** 仓库根 `register-tokens-submit-task.ps1` 的文本
- **WHEN** 检查计划任务注册处的 Action
- **THEN** 文本含以 `wscript.exe` 为 Execute 的 Action。参数含 `//B //Nologo`。launcher 路径以双引号包裹。Action 的 Execute 不再是 `powershell.exe`

#### Scenario: launcher 内容以隐藏窗口启动 runner（机械检查）

- **GIVEN** 仓库根 `register-tokens-submit-task.ps1` 的文本
- **WHEN** 检查 launcher 的写入动作与写入内容
- **THEN** 文本含 `tokens-submit-hidden.vbs` 的写入动作。写入编码写法含 `UTF8Encoding` 与 `$true`。写入内容含字面串 `WshShell.Run`、`, 0, True`、`powershell.exe`，并引用 `$escapedTokensPath`

#### Scenario: 退出码回传任务历史（机械检查）

- **GIVEN** 仓库根 `register-tokens-submit-task.ps1` 的文本
- **WHEN** 检查 launcher 的退出码处理
- **THEN** 写入内容含 `WshShell.Run` 返回值赋给变量的字面形态，含 `WScript.Quit` 以该变量为参数的字面形态

#### Scenario: 路径含空格时命令行仍正确（机械检查）

- **GIVEN** 仓库根 `register-tokens-submit-task.ps1` 的文本
- **WHEN** 检查 launcher 命令行的引号处理
- **THEN** launcher 的 Run 命令行把 `powershell.exe` 与 runner 路径都用双引号包裹。文本对嵌入 vbs 字符串的双引号做加倍转义

#### Scenario: -Remove 同步清理 launcher（机械检查）

- **GIVEN** 仓库根 `register-tokens-submit-task.ps1` 的文本
- **WHEN** 检查 `-Remove` 分支
- **THEN** 分支含 `Remove-Item` 与 `tokens-submit-hidden.vbs` 的删除动作。删除动作与既有 runner 删除动作位于同一分支

#### Scenario: 注册分支的 -DryRun 不触碰文件系统（机械检查）

- **GIVEN** 仓库根 `register-tokens-submit-task.ps1` 的文本
- **WHEN** 检查注册路径的 `-DryRun` 分支
- **THEN** `exit 0` 出现在 `Set-Content` 之前。输出含 `wscript.exe` 与 `tokens-submit-hidden.vbs`

#### Scenario: -Remove 分支的 -DryRun 不触碰文件系统（机械检查）

- **GIVEN** 仓库根 `register-tokens-submit-task.ps1` 的文本
- **WHEN** 检查 `-Remove` 分支的 `-DryRun` 子分支
- **THEN** `exit 0` 出现在 `Remove-Item` 之前。该子分支不要求输出 Action 描述

#### Scenario: 弹窗不再出现（Windows 实机人工门禁）

- **GIVEN** Windows 机器已完成 preinstall 与 login，注册脚本以默认参数运行成功
- **WHEN** 等待计划任务连续触发两次
- **THEN** 用户桌面全程不出现 PowerShell 或控制台窗口。任务历史显示 `wscript.exe` 启动且 LastTaskResult 为 0。榜单显示两次提交成功
