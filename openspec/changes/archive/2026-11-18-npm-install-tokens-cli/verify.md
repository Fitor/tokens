## Verification Results

### Task Completion

- [x] tasks.md 全部任务为 `[x]`：44 项应用清单加 7.1-7.7 round 2 回归。无遗留 `- [ ]`。
- Remaining open tasks: none

### TDD Integrity

- [x] test-plan.md 的 20 个场景都有同名真实测试。分布在 `tests/scripts/install-via-npm.test.ts`、`tests/e2e/t9-acceptance.spec.ts`、`web/src/lib/scriptsRef.test.ts`。无 `N/A — non-executable` 项。
- [x] 账本 20/20 行全部 🟢 green。无 🔴 遗留。
- [x] 全量套件通过。零 skip、零 todo、零注释掉的测试。
- [x] 未弱化或删除任何测试。唯一例外需 REMOVED 说明：「Docs 页安装入口指向本站」用例按 design D6 整块改写为本变更的四个场景测试。旧断言描述旧契约。本变更删除该契约。旧断言随之删除。test-plan「Coverage Notes」第 5 条已预先记录该改写。
- [x] 无 symptoms patch。一处真实缺口按根因修复：「scriptsRef 缺失时中止」护栏并非基线绿。`set -e` 下 grep 无匹配会静默中止。报错信息缺失，不满足 spec THEN。修复方式：让 `scripts/set-version.sh` 显式报错。grep 无匹配是预期分支，脚本先 `|| true`，再由既有显式检查报错退出。测试断言未改。test-plan 该行原判定「基线即绿」，有误，已更正为 🔴→🟢 并注明原因。
- [x] round 2：「settings 提示命令带站点绑定」扩展为双 UA 断言，并加双向排他断言。Windows 视图无 POSIX 字面形态。POSIX 视图无 `$env:` 形态。平台检测改用 `/Windows/`。round 2 裁决为 APPROVE，无 Required Changes，无断言弱化。

### Evidence

- Final full-suite command:
  - `cd web && bun test`
  - `cd web && bunx playwright test tests/e2e/t9-acceptance.spec.ts`
  - `bun test tests/scripts/install-via-npm.test.ts`（仓库根）
- Result summary:
  - `web && bun test`：72 passed / 0 failed / 0 skipped。含 `scriptsRef.test.ts`。
  - `install-via-npm.test.ts`：13 passed / 0 failed。含真实脚本驱动 7 项、ps1 机械 2 项、文档契约 2 项、发版脚本 2 项。
  - `t9-acceptance.spec.ts`：13 passed / 0 failed / 0 flaky。
- Non-executable checks run:
  - `cd web && bun run build`：构建通过。`diff -q` 检查 `web/public` 两个 pre-install 脚本副本，与仓库根一致（design D7）。
  - 全库禁用模式扫描。范围＝spec 扫描场景（README×2、docs/**/*.md、web/src/**/*.{ts,tsx}、两个 pre-install 脚本、scripts/*.sh），测试文件除外。285 个文件。7 个禁用模式零命中。
  - ste-lint（`scripts/ste-lint-zh.py`）复检改写中文文档。README_zh.md 硬违规 8 处，等于改动前基线 8 处。tokens-cli-usage.md 硬违规 12 处，少于基线 15 处。剩余违规都在未触碰段落。无新增。
  - ps1 无 Windows 运行环境。仅机械文本断言。design Risks 已接受该风险。
- Round 2 final full-suite（实现审查修复与 📌 P1/P2 采纳后全新实跑）：
  - `cd web && bun test`：72 passed / 0 failed。
  - `bun test tests/scripts/install-via-npm.test.ts`：13 passed / 0 failed。
  - `cd web && bunx playwright test tests/e2e/t9-acceptance.spec.ts`：13 passed / 0 failed / 0 flaky。settings 用例含双 UA 与排他断言。
  - `cd web && bun run build`：构建通过。

### Review Integrity

- [x] review.md `VERDICT: APPROVE_WITH_CHANGES` 且 `CHANGES_APPLIED: yes`。
- [x] 裁决不失效。`git status` 检查确认：proposal.md、design.md、specs/ 自裁决以来零改动。实施期偏差全部落在 tasks.md、test-plan.md 账本与代码。无规格修订，无需重审。
- [x] F1–F7 全部修复，评审员逐条标注「accepted by reviewer」。P1–P4 全部接受并落实。P1 写入 npm 信任假设。P2 写入 fixture 前提。P3 改写裸命令警告。P4 改 `repository.url`。
- [x] round 2（新语境评审员）：实施审查发现的 PowerShell 兼容性缺口已按 SPEC DRIFT 纪律修复并重审。spec R1 与 design D5 修订先行，实现与 e2e 随后。评审结论 `VERDICT: APPROVE`。无 🔴 无 🟡。📌 P1、P2 采纳并落实。📌 P3 作者拒绝。作者回应与 CHANGES_APPLIED 翻转记入 review.md。

### Change Delivery

- Commit range (if committed): `fca3a79`（实现、测试与 tasks.md / test-plan.md 账本一笔）。本 verify 工件单独提交。提交经用户确认后落 main。`web/public/` 脚本副本与 `.next` 构建产物不入库（design D7）。

### 实施期记录（非阻断）

- 4.1 预检发现：历史文档（docs/prd-*、docs/upstream_policy.md）只含裸 `KunoLu/tokens` 事实陈述。禁用 URL 模式零命中。spec 扫描与 design Non-Goal 无冲突。未走 SPEC DRIFT 流程。
- tasks 1.6、1.10、3.3、3.5、3.10 的测试写入即绿，或红灯并入相邻增量。tasks.md 已逐条注明实际红绿时序。
- `packages/cli/src/index.ts` 的 "unscoped" 注释与 `scripts/set-version.sh` 的 raw URL 旧语义注释：round 2 已修复（仅注释，无行为变化）。两个评审块均点名，评审确认修正准确。

## Overall Decision

DECISION: PASS

人类可读复述：✅ PASS。20 个场景全部有真实测试，全部绿。round 2 全量套件零失败。扫描零命中。build 与副本检查通过。round 2 评审裁决 APPROVE。实施审查的 PowerShell 兼容性缺口已按 SPEC DRIFT 纪律修复并重审。原三项警示已处理。其一，5.3 的基线判定有误。账本已更正，脚本已按 spec 修复。其二，旧契约 e2e 用例按 D6 改写。账本预已记录。其三，两处滞后注释已修。提交记录：实现 `fca3a79`，verify 初版与账本随后入库，round 2 修复为后续提交。
