## 核验结果

### 任务完成情况

- [x] `tasks.md` 的 11 项任务均已勾选。
- 未完成任务：无。

### TDD 完整性

- [x] `test-plan.md` 的 4 条记录各有 1 个命名测试。4 个测试都在 `tests/scripts/install-via-npm.test.ts`。
- [x] 4 条记录均为 🟢 green。无 🔴 red 残留。
- [x] 定向测试套件通过。仓库根全量运行无本变更引入的回归。
- [x] 最终测试运行没有跳过、挂起或注释掉的测试。
- [x] 没有删除或弱化既有测试。测试文件只增不改。
- 红绿顺序属实。任务 1.1 与 1.2 先写失败测试。首轮运行 13 项通过、3 项失败。失败原因正确：两份 ps1 无单选逻辑、收敛调用 0 个。任务 1.3 与 1.4 后补实现。任务 1.5 重构注释后本组全绿。
- 护栏测试做过负向验证。向 `web/public/pre-install-tokens.ps1` 追加一个字节后护栏报红。恢复副本后回绿。护栏不是空断言。

### 证据

- 定向命令：`bun test tests/scripts/install-via-npm.test.ts`。结果：17 项通过，0 项失败。新增 4 个命名测试加既有 13 个测试。
- 全量命令：仓库根 `bun test`。结果：89 项通过，10 项失败，10 个错误。
- 10 个失败全部来自 `tests/e2e/*.spec.ts`。这些是 Playwright 用例。bun 的测试运行器收集它们后报 `Playwright Test did not expect test() to be called here`。
- 基线对照：用 `git stash` 摘除本次改动后重跑仓库根 `bun test`。结果 85 项通过、10 项失败。失败文件集合与改后完全一致。本次改动 0 回归，多出的 4 项通过即新增测试。
- `openspec validate fix-windows-tokens-shim-resolution` 通过。有一条 RFC 2119 措辞警告。警告非阻断，spec 为中文撰写，沿用项目既有口径。
- 覆盖账本 4 行全 🟢。`test-plan.md` 无 🔴 red 行。

### 审查完整性

- [x] `review.md` 为 `VERDICT: APPROVE`。门禁在实施开始时通过。
- [x] `proposal.md`、`design.md`、`specs/` 保持原样。裁决未失效。
- [x] 唯一 🟡 F1 已修复。同一评审复检 `ACCEPTED`。📌 S1 与 S2 为建议，处置已记录在 `review.md`。

### 交付状态

代码、测试与 OpenSpec 工件未提交。改动文件共 5 个。

- `pre-install-tokens.ps1`
- `register-tokens-submit-task.ps1`
- `tests/scripts/install-via-npm.test.ts`
- `openspec/changes/fix-windows-tokens-shim-resolution/tasks.md`
- `openspec/changes/fix-windows-tokens-shim-resolution/test-plan.md`

另同步工作区 `web/public/` 两份分发副本。副本由构建拷贝，Git 不跟踪。提交由用户或后续明确授权的流程处理。

## 总体结论

DECISION: PASS_WITH_WARNINGS

两个警告。

1. 仓库根 `bun test` 带 10 个既有失败。失败来自 `tests/e2e` 的 Playwright 用例。基线对照证明它们与本变更无关。这些用例应由 `npx playwright test` 运行。本变更未触碰它们。
2. ps1 的 Windows 运行时行为未实机验证。本机无 Windows 与 pwsh。断言沿用机械文本口径。该风险已在 `design.md` 接受，留待有环境时补验。
