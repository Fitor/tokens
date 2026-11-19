## Test Plan

每个 `specs/cli-install/spec.md` 的 Scenario 映射一个命名测试。覆盖账本在实施期逐行由 🔴 翻 🟢。verify 检查全绿。补充行不是 spec 场景，是 Rebuttal S2 与 S5 的落地检查。

| Requirement | Scenario | Test File | Test Name | Initial State |
|-------------|----------|-----------|-----------|---------------|
| specs/cli-install/spec.md → 计划任务触发不得创建可见窗口 | Action 由 wscript 启动（机械检查） | tests/scripts/register-scheduled-task-window.test.ts | Action 由 wscript 启动（机械检查） | 🟢 green |
| specs/cli-install/spec.md → 计划任务触发不得创建可见窗口 | launcher 内容以隐藏窗口启动 runner（机械检查） | tests/scripts/register-scheduled-task-window.test.ts | launcher 内容以隐藏窗口启动 runner（机械检查） | 🟢 green |
| specs/cli-install/spec.md → 计划任务触发不得创建可见窗口 | 退出码回传任务历史（机械检查） | tests/scripts/register-scheduled-task-window.test.ts | 退出码回传任务历史（机械检查） | 🟢 green |
| specs/cli-install/spec.md → 计划任务触发不得创建可见窗口 | 路径含空格时命令行仍正确（机械检查） | tests/scripts/register-scheduled-task-window.test.ts | 路径含空格时命令行仍正确（机械检查） | 🟢 green |
| specs/cli-install/spec.md → 计划任务触发不得创建可见窗口 | -Remove 同步清理 launcher（机械检查） | tests/scripts/register-scheduled-task-window.test.ts | -Remove 同步清理 launcher（机械检查） | 🟢 green |
| specs/cli-install/spec.md → 计划任务触发不得创建可见窗口 | 注册分支的 -DryRun 不触碰文件系统（机械检查） | tests/scripts/register-scheduled-task-window.test.ts | 注册分支的 -DryRun 不触碰文件系统（机械检查） | 🟢 green |
| specs/cli-install/spec.md → 计划任务触发不得创建可见窗口 | -Remove 分支的 -DryRun 不触碰文件系统（机械检查） | tests/scripts/register-scheduled-task-window.test.ts | -Remove 分支的 -DryRun 不触碰文件系统（机械检查） | 🟢 green |
| specs/cli-install/spec.md → 计划任务触发不得创建可见窗口 | 弹窗不再出现（Windows 实机人工门禁） | Windows 实机（发布前人工门禁） | 弹窗不再出现（Windows 实机人工门禁） | N/A — non-executable |
| （补充行，非 spec 场景）docs 双手册补链路说明与 GPO 提示 | Rebuttal S2 的确认项 | tests/scripts/register-scheduled-task-window.test.ts | docs 双手册含链路说明与 GPO 提示（机械检查） | 🟢 green |
| （补充行，非 spec 场景）收尾提示口径对齐 | Rebuttal S5 的落地项 | tests/scripts/register-scheduled-task-window.test.ts | 收尾提示不把任务历史当提交成功证据（机械检查） | 🟢 green |

## Coverage Notes

- 运行方式。本 change 的契约用 `bun test tests/scripts/register-scheduled-task-window.test.ts` 定向运行。全量回归用仓库根 `bun test`。CI 不运行测试（`.github/workflows/ci.yml` 无 bun test job），本地运行为准。
- 断言口径。全部 ps1 与 vbs 断言是机械文本断言（text/regex/byte-only）。对齐前次 change 评审确立的 F1 标准。不做语义或控制流判定。锚点清单：`wscript.exe`、`//B //Nologo`、`tokens-submit-hidden.vbs`、`WshShell.Run`、`, 0, True`、`WScript.Quit`、`UnicodeEncoding]::new($false, $true)`、`$RunnerPath`、`Remove-Item`、`exit 0`。
- 实机行是 N/A — non-executable。本机无 Windows 环境，无法自动执行该场景。门禁清单：注册后连续两次触发全程无窗口；任务历史显示 `wscript.exe` 启动且 LastTaskResult 为 0；榜单显示两次提交成功。核销结果记入 verify.md。
- docs 补充行把 Rebuttal S2 的人工确认项升级为机械断言。断言两份手册各含 `wscript → vbs → runner` 链路说明与 GPO 排查提示。
- 收尾提示补充行对应 Rebuttal S5。断言旧口径「以任务历史记录和本站榜单为准」缺席，新口径「任务历史只反映任务退出码；提交成功看榜单」在场。
- 非目标回归面。既有 `tests/scripts/install-via-npm.test.ts` 断言不受本 change 编辑影响。全量 `bun test` 兜底。
