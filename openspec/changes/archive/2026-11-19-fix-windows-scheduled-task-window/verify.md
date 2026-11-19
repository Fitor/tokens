## 核验结果

### 任务完成情况

- [x] `tasks.md` 的 15 项任务全部勾选。
- 未完成任务：无。5.5（Windows 实机人工门禁）已核销：用户 2026-11-19 复测回执「验证 OK」。cscript 退出码 0；门禁三项通过（注册后连续两次触发全程无窗口；任务历史显示 `wscript.exe` 启动且 LastTaskResult 为 0；榜单显示两次提交成功）。首轮回执曾未过（LastTaskResult = 1），根因与修复见「总体结论」的历史记录。

### TDD 完整性

- [x] `test-plan.md` 的 9 行机械记录各有 1 个命名测试。9 个测试都在 `tests/scripts/register-scheduled-task-window.test.ts`。实机行记为 `N/A — non-executable`。该行可机械化的等价断言（Action 宿主、launcher 写入编码、退出码回传、命令行引号、`-Remove` 清理、两处 `-DryRun` 顺序）全部跑绿。实机行为另经 Windows 人工门禁核销通过（见「证据」）。
- [x] 9 行机械记录全 🟢 green。无 🔴 red 残留。实机行保持 N/A。
- [x] 定向测试套件通过。仓库根全量运行无本变更引入的回归。基线对照见「证据」。
- [x] 最终测试运行没有跳过、挂起或注释掉的测试。
- [x] 没有删除或弱化既有测试。测试文件只增不改。
- 红绿顺序属实。1.1 先写 4 个失败测试。首轮 0 通过、4 失败。失败原因正确：脚本无 `$launcher` 写入，Action 仍是 `powershell.exe`。1.2 后补实现并转绿。2.1 先写 3 个测试。2 个按预期失败（缺 launcher 删除、`-DryRun` 输出缺 `wscript.exe`），1 个护栏测试改动前后都绿。2.2 实现后转绿。3.1 先写 2 个失败测试（手册缺链路与 GPO 提示、收尾提示含旧口径）。3.2 实现后转绿。

### 证据

- 定向命令：`bun test tests/scripts/register-scheduled-task-window.test.ts`。结果：9 项通过，0 项失败。
- 既有契约命令：`bun test tests/scripts/install-via-npm.test.ts`。结果：17 项通过，0 项失败。
- 全量命令：仓库根 `bun test`。结果：98 项通过，10 项失败，10 个错误（共 108 项）。编码修复后复跑，结果一致。
- 10 个失败全部来自 `tests/e2e/*.spec.ts`。这些是 Playwright 用例。bun 的测试运行器收集它们后报 `Playwright Test did not expect test() to be called here`。
- 基线对照：用 `git stash push` 摘除本次改动、移开新测试文件后重跑仓库根 `bun test`。结果：89 项通过、10 项失败（共 99 项）。失败集与改后完全一致。本次改动 0 回归，多出的 9 项通过即新增测试。
- `openspec validate fix-windows-scheduled-task-window` 通过。2 条 warning 与规划期一致（英文 spec 的 RFC 2119 与长度建议）。spec 为中文撰写，沿用项目既有 `必须` 口径。
- 覆盖账本 9 行机械行全 🟢。`test-plan.md` 无 🔴 red 行。
- 分发副本：`web/public/register-tokens-submit-task.ps1` 与仓库根 `cmp` 一致。副本由构建拷贝，Git 不跟踪。
- 实机门禁首轮回执（2026-11-19）：`Get-ScheduledTaskInfo -TaskName "TokensSubmit"` 的 LastTaskResult = 1；`cscript.exe //Nologo tokens-submit-hidden.vbs` 报「Microsoft VBScript 编译器错误：无效字符 (1, 1)」。根因：launcher 写成 UTF-8 with BOM，WSH 只认 ANSI 或带 BOM 的 UTF-16 LE。修复为 UTF-16 LE with BOM 后机械断言 26/26 重跑全绿（含既有 `install-via-npm.test.ts` 17 项）。
- Windows 复测核销（2026-11-19）：修复后用户回执「验证 OK」。cscript 退出码 0。门禁三项通过：注册后连续两次触发全程无窗口；任务历史显示 `wscript.exe` 启动且 LastTaskResult 为 0；榜单显示两次提交成功。
- 非可执行检查：无。实机门禁三项已核销。

### 审查完整性

- [x] `review.md` 最新结论为 `VERDICT: APPROVE`（round 4）。round 1 的 `APPROVE_WITH_CHANGES`＋`CHANGES_APPLIED: yes`、round 3 的 `APPROVE` 也满足门槛。门禁在实施开始时通过。
- [x] verdict 未失效。reviewed 工件在 verdict 之后的改动只有两类，均经评审员回执确认：round 3 后应用的 S1–S3 建议原文修法；round 4 前置的编码修法六处（design D5/D7、spec 需求句与场景 2、tasks 1.2、test-plan 锚点、实现与测试断言）加 S1 锚点收紧四处。改动链完整记录在 `review.md` 的 Amendment/Recheck Record。
- [x] 所有 Critical/Moderate finding 已修复并被评审员标记 accepted（M1–M5、N1；round 3 与 round 4 均无 Critical/Moderate）。S 系列处置记录在 `review.md`。

### 交付状态

代码、测试、文档与 OpenSpec 工件未提交。改动文件如下。

- `register-tokens-submit-task.ps1`
- `tests/scripts/register-scheduled-task-window.test.ts`（新增）
- `docs/deploy/tokens-cli-usage.md`
- `docs/deploy/tokens-cli-usage.en.md`
- `openspec/changes/fix-windows-scheduled-task-window/specs/cli-install/spec.md`
- `openspec/changes/fix-windows-scheduled-task-window/design.md`
- `openspec/changes/fix-windows-scheduled-task-window/review.md`
- `openspec/changes/fix-windows-scheduled-task-window/tasks.md`
- `openspec/changes/fix-windows-scheduled-task-window/test-plan.md`
- `openspec/changes/fix-windows-scheduled-task-window/verify.md`（本文件）

另同步工作区 `web/public/register-tokens-submit-task.ps1` 分发副本。副本由构建拷贝，Git 不跟踪。提交由用户或后续明确授权的流程处理。提交时排除 `openspec/changes/fix-windows-scheduled-task-window/.tasks.md.swp`（vim 交换文件，对应会话关闭后由用户清理）。

## 总体结论

DECISION: PASS_WITH_WARNINGS

一个警告。

1. 仓库根 `bun test` 带 10 个既有失败。失败来自 `tests/e2e` 的 Playwright 用例。基线对照证明它们与本变更无关。这些用例应由 `npx playwright test` 运行。本变更未触碰它们。

历史记录（已解决，不计警告）：Windows 实机门禁首轮回执未过（LastTaskResult = 1，cscript 报「无效字符 (1, 1)」）。根因是 launcher 写成 UTF-8 with BOM——WSH 只认 ANSI 或带 BOM 的 UTF-16 LE。编码改为 UTF-16 LE with BOM（round 4 评审确认）后复测通过，门禁三项核销完成。机械断言查不出该缺陷的原因：断言只锁编码 API 的字面锚点，锁不住 WSH 运行时编码行为。

⚠️ PASS WITH WARNINGS
