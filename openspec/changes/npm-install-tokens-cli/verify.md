## Verification Results

### Task Completion

- [x] tasks.md 全部 44 项为 `[x]`，无遗留 `- [ ]`。
- Remaining open tasks: none

### TDD Integrity

- [x] test-plan.md 的 20 个场景都有同名真实测试。分布在 `tests/scripts/install-via-npm.test.ts`、`tests/e2e/t9-acceptance.spec.ts`、`web/src/lib/scriptsRef.test.ts`。无 `N/A — non-executable` 项。
- [x] 账本 20/20 行全部 🟢 green。无 🔴 遗留。
- [x] 全量套件通过。零 skip、零 todo、零注释掉的测试。
- [x] 未弱化或删除任何测试。唯一例外需 REMOVED 说明：「Docs 页安装入口指向本站」用例按 design D6 整块改写为本变更的四个场景测试。旧断言描述旧契约。本变更删除该契约。旧断言随之删除。test-plan「Coverage Notes」第 5 条已预先记录该改写。
- [x] 无 symptoms patch。一处真实缺口按根因修复：「scriptsRef 缺失时中止」护栏并非基线绿。`set -e` 下 grep 无匹配会静默中止。报错信息缺失，不满足 spec THEN。修复方式：让 `scripts/set-version.sh` 显式报错。grep 无匹配是预期分支，脚本先 `|| true`，再由既有显式检查报错退出。测试断言未改。test-plan 该行原判定「基线即绿」，有误，已更正为 🔴→🟢 并注明原因。

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

### Review Integrity

- [x] review.md `VERDICT: APPROVE_WITH_CHANGES` 且 `CHANGES_APPLIED: yes`。
- [x] 裁决不失效。`git status` 检查确认：proposal.md、design.md、specs/ 自裁决以来零改动。实施期偏差全部落在 tasks.md、test-plan.md 账本与代码。无规格修订，无需重审。
- [x] F1–F7 全部修复，评审员逐条标注「accepted by reviewer」。P1–P4 全部接受并落实。P1 写入 npm 信任假设。P2 写入 fixture 前提。P3 改写裸命令警告。P4 改 `repository.url`。

### Change Delivery

- Commit range (if committed): `fca3a79`（实现、测试与 tasks.md / test-plan.md 账本一笔）。本 verify 工件单独提交。提交经用户确认后落 main。`web/public/` 脚本副本与 `.next` 构建产物不入库（design D7）。

### 实施期记录（非阻断）

- 4.1 预检发现：历史文档（docs/prd-*、docs/upstream_policy.md）只含裸 `KunoLu/tokens` 事实陈述。禁用 URL 模式零命中。spec 扫描与 design Non-Goal 无冲突。未走 SPEC DRIFT 流程。
- tasks 1.6、1.10、3.3、3.5、3.10 的测试写入即绿，或红灯并入相邻增量。tasks.md 已逐条注明实际红绿时序。
- `packages/cli/src/index.ts:11-15,169-170` 源码注释仍写 "unscoped"。这与 scoped 包名事实不符。路径数学本身正确，npm 安装解析正常。源码注释不在本变更四份 docs 文件契约内。本次未改动。留作后续顺手修正。

## Overall Decision

DECISION: PASS_WITH_WARNINGS

人类可读复述：⚠️ PASS WITH WARNINGS。20 个场景全部有真实测试，全部绿。全量套件零失败。扫描零命中。build 与副本检查通过。警示三项。其一，test-plan 原判定「scriptsRef 缺失时中止」为基线绿护栏。实测基线缺 spec 要求的报错信息。脚本已按 spec 修复，账本已更正。其二，旧契约 e2e 用例按 D6 整块改写。旧断言描述的契约已删除，旧断言随之删除。账本已预记录。其三，`packages/cli/src/index.ts` 两处 "unscoped" 注释过时。该注释不在本次契约内，未改动。改动未提交，待人工评审。
