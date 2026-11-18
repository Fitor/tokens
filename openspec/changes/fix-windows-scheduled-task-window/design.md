## Context

`register-tokens-submit-task.ps1` 注册 `TokensSubmit` 计划任务，Action 是 `powershell.exe -NoProfile -WindowStyle Hidden -File <runner>`。`Register-ScheduledTask` 未指定 Principal，默认登录类型是「仅当用户登录时运行」（InteractiveToken）。进程活在用户的交互会话里。

`powershell.exe` 是控制台子系统程序。系统先在用户桌面分配可见的控制台窗口，`-WindowStyle Hidden` 在窗口出现后才生效。窗口持续到 `tokens submit` 提交结束。这是弹窗的根因。

约束沿用前次 change：脚本经 `iex (irm …)` 独立分发，必须自包含。计划任务与手动执行都走 Windows PowerShell 5.1，新逻辑只用 5.1 可用语法。本机无 Windows 环境，ps1 行为用机械文本断言验证。`web/public/` 副本由 web 构建从仓库根拷贝，Git 不跟踪。

## Goals / Non-Goals

**Goals:**

- 计划任务触发时不在用户桌面创建可见窗口。
- 任务历史记录继续反映 powershell 进程退出码。
- runner 内容、提交间隔、登录类型、凭据位置全部不变。
- `-Remove` 同步清理 launcher。`-DryRun` 不触碰文件系统。

**Non-Goals:**

- 不改登录类型。「登录与否都运行」（S4U、存密码）是独立语义决策，本次不引入。
- 不处理企业 GPO 禁用 `wscript.exe` 的环境。
- 不改 CLI 本体。转义输出适配归 `fix-windows-ansi-console-output`。
- 不改 docs 页、settings 提示、sh 脚本。

## Decisions

**D1 隐藏宿主选 `wscript.exe` + launcher.vbs，不改登录类型。**
弹窗根源是「控制台程序 + 交互会话」。换无窗口宿主转一手即可切断。备选「S4U 登录类型」让任务进后台会话，窗口物理上不可能出现，但行为变宽到登出后也提交，且 S4U 的网络限制要实机验证，弃用。备选「Password 登录类型」要在 LSA 存 Windows 密码，弃用。备选 `conhost.exe --headless` 仅 Windows 11 22H2+ 可用，弃用。备选给 tokens-cli 做 GUI 子系统构建，为启动方式改动产物构建，弃用。备选「保留 `-WindowStyle Hidden`」「任务 XML 的 `Hidden`」都不拦控制台窗口的分配，弃用。方案由用户在探索阶段选定。

**D2 launcher 写到 `%LOCALAPPDATA%\tokens\tokens-submit-hidden.vbs`，由注册脚本安装时生成。**
与 runner 同目录、同生命周期。脚本自包含，launcher 必须随安装生成，不能做成新分发物。`-Remove` 本就删 runner，同一分支扩一条删除即可。

**D3 vbs 等待 runner 并回传退出码：`WshShell.Run(cmd, 0, True)` + `WScript.Quit code`。**
等待返回值是 powershell 的进程退出码。任务结果只反映该退出码。runner 不含 `exit $LASTEXITCODE`。`tokens submit` 的专属退出码不进任务结果。这一现状不在本次改动范围。备选 `Run(cmd, 0, False)` 让 wscript 立即退出：任务结果恒为 0，无法区分 runner 是否执行完。该备选下任务即刻结束，上一次提交未结束时下一次触发还会再起一个进程。前提是任务沿用 `Register-ScheduledTask` 的默认多实例策略「不启动新实例」，它只对仍处于运行状态的任务生效。弃用。代价是 wscript 隐藏驻留到提交结束，与今天 powershell 驻留等长。

**D4 vbs 命令行的引号规则。**
`WshShell.Run` 的命令行把 `powershell.exe` 与 runner 路径都用双引号包裹，路径含空格时正确。撇号（如 `C:\Users\O'Brien`）在 vbs 双引号字符串里无需转义，与 ps1 单引号规则不同。嵌入字符串的双引号做加倍转义，防御性保留。`-NoProfile -WindowStyle Hidden` 保留在命令行里，双保险。

**D5 vbs 用 .NET API 写入带 BOM 的 UTF-8。**
写入用 `[System.IO.File]::WriteAllText`。编码用 `[System.Text.UTF8Encoding]::new($true)` 构造。`Set-Content -Encoding` 与 `Out-File -Encoding` 只收枚举，不收 Encoding 对象，不能用。`Set-Content -Encoding UTF8` 在 Windows PowerShell 5.1 写出 BOM。pwsh 7 的同名选项写无 BOM。docs 的执行入口指向 5.1，但脚本不拒绝 pwsh 执行。写入因此不依赖宿主版本。WSH 识别 BOM，非 ASCII 的用户目录路径不会乱码。无 BOM 时 wscript 按 ANSI 解析，中文用户名路径会被写坏。断言锚点是 `UTF8Encoding` 与 `$true`。

**D6 Action 参数带 `//B //Nologo`。**
`//B` 抑制脚本错误对话框。没有它，vbs 运行时错误会弹对话框，等于把问题换了个名字。`//Nologo` 抑制横幅。

**D7 验证沿用机械文本断言，实机行为留人工门禁。**
断言锚点：`wscript.exe`、`//B //Nologo`、`tokens-submit-hidden.vbs`、`WshShell.Run`、`, 0, True`、`WScript.Quit`、`UTF8Encoding`。不做整段文本比对。场景与测试 1:1，覆盖账本进 test-plan。Windows 实机门禁：连续两次触发全程无窗口。任务历史显示 `wscript.exe` 启动且 LastTaskResult 为 0。榜单显示两次提交成功。与既有 change 同口径。

## Risks / Trade-offs

- [企业 GPO 禁用 `wscript.exe`，任务静默不跑] → docs 补一行排查提示。该场景不在修复范围。备选回退（直接 powershell 启动）留给真实反馈后再加。
- [任务历史宿主显示 `wscript.exe`，排查者不认识链路] → docs 与 dry-run 输出说明 `wscript → vbs → runner` 链路。
- [机械断言与实现文本耦合] → 只锚定稳定标记。实现形态变化时同步更新断言。
- [等待语义让 wscript 驻留到提交结束] → 隐藏进程，资源占用可忽略。

## Migration Plan

纯脚本修复，无数据与接口迁移。合入后随下次站点部署，新下载的脚本即修复版。存量机器重跑注册脚本即自愈：`-Force` 覆盖既有任务，runner 与 launcher 原地重写。回滚方式是 revert 提交并重跑注册脚本。回滚后旧 launcher 文件残留，无任务引用，不产生行为，可手动删除。`-Remove` 同时清理 runner 与 launcher。

## Open Questions

无。方案由用户在探索阶段选定。退出码语义在本设计中定为保留。
