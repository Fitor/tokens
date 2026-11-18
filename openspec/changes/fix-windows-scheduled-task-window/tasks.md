## 1. launcher 与 Action（specs 场景 1–4）

- [ ] 1.1 Write failing tests:「Action 由 wscript 启动」「launcher 内容以隐藏窗口启动 runner」「退出码回传任务历史」「路径含空格时命令行仍正确」（test-plan 行 1–4）。新文件 `tests/scripts/register-scheduled-task-window.test.ts`。断言锚点见 test-plan Coverage Notes。确认按预期失败：现脚本无 launcher 写入，Action 的 Execute 仍是 `powershell.exe`。
- [ ] 1.2 Implement: `register-tokens-submit-task.ps1` 增写 launcher（design D2/D4/D5）：写 `%LOCALAPPDATA%\tokens\tokens-submit-hidden.vbs`，写入用 `[System.IO.File]::WriteAllText` 与 `[System.Text.UTF8Encoding]::new($true)`，嵌入 vbs 的双引号加倍。launcher 内容含 `WshShell.Run`、`, 0, True`、`WScript.Quit` 回传退出码，命令行双引号包裹 `powershell.exe` 与 `$escapedTokensPath`（design D3/D4）。Action 改 `wscript.exe //B //Nologo "<launcher>"`，launcher 路径双引号包裹（design D1/D6）。runner 内容不变。通过 1.1 全部断言。
- [ ] 1.3 Refactor; 本组断言与既有 `tests/scripts/install-via-npm.test.ts` 断言全绿。

## 2. -Remove 与 -DryRun（specs 场景 5–7）

- [ ] 2.1 Write failing tests:「-Remove 同步清理 launcher」「注册分支的 -DryRun 不触碰文件系统」「-Remove 分支的 -DryRun 不触碰文件系统」（test-plan 行 5–7）。确认按预期失败：`-Remove` 分支现只删 runner，`-DryRun` 输出现无 `wscript.exe` 与 launcher 描述。
- [ ] 2.2 Implement: `-Remove` 分支增删 `tokens-submit-hidden.vbs`（与 runner 删除同分支）。注册路径 `-DryRun` 的 `exit 0` 保持在 `Set-Content` 之前，输出补 launcher 路径与 `wscript.exe` Action 描述。`-Remove -DryRun` 子分支的 `exit 0` 保持在 `Remove-Item` 之前，不加 Action 描述。通过 2.1 全部断言。
- [ ] 2.3 Refactor; 本组断言全绿。

## 3. 收尾提示与手册（补充行，Rebuttal S2/S5）

- [ ] 3.1 Write failing tests:「docs 双手册含链路说明与 GPO 提示」「收尾提示不把任务历史当提交成功证据」（test-plan 补充两行）。确认按预期失败：两份手册现无链路说明与 GPO 提示，收尾提示现含「以任务历史记录和本站榜单为准」。
- [ ] 3.2 Implement: `register-tokens-submit-task.ps1` 两处收尾提示改口径为「任务历史只反映任务退出码；提交成功看榜单」（Rebuttal S5）。`docs/deploy/tokens-cli-usage.md` 与 `docs/deploy/tokens-cli-usage.en.md` 各补一段：`wscript → vbs → runner` 链路说明与 GPO 禁用 `wscript.exe` 排查提示（proposal What Changes）。通过 3.1 全部断言。
- [ ] 3.3 Refactor; 本组断言全绿。

## 4. 副本一致性

- [ ] 4.1 Implement: 同步 `web/public/register-tokens-submit-task.ps1` 副本（与 web 构建的 cp 同源）。既有护栏「web/public 分发副本与仓库根一致」在根脚本改动后短暂转红，此步回绿。

## 5. 验证汇总

- [ ] 5.1 Run: `bun test tests/scripts/register-scheduled-task-window.test.ts` 全绿（9 个命名测试）。
- [ ] 5.2 Run: 仓库根 `bun test` 全量，无回归。
- [ ] 5.3 Run: `openspec validate fix-windows-scheduled-task-window` 通过。
- [ ] 5.4 Confirm: 覆盖账本 9 行机械行全 🟢，实机行保持 N/A。
- [ ] 5.5 Run（Windows 实机人工门禁，test-plan N/A 行）: 注册后连续两次触发全程无窗口。任务历史显示 `wscript.exe` 启动且 LastTaskResult 为 0。榜单显示两次提交成功。核销结果记入 verify.md。
