## Review Metadata

- **Review round**: 3
- **Prior round**: round 2 为 APPROVE（两条 📌 并入 test-plan/tasks），后因用户删除站方指南 `接入Tokens排行榜操作指南.md` 并裁定全部工件不再提及它而按 STALENESS 失效；round 3 对缩减范围后的工件全量复审。
- **Reviewer context**: fresh-context subagent（round 3 主评审 + 同一评审对 Required Change 的复检回传）
- **Tool restrictions**: read-only。只用 view、grep、glob 与 `openspec` 只读命令。唯一写操作是本文件。
- **Artifacts reviewed**: proposal.md、design.md、specs/cli-install/spec.md、test-plan.md、tasks.md。对照源码：pre-install-tokens.ps1、register-tokens-submit-task.ps1、tests/scripts/install-via-npm.test.ts、web/package.json、web/.gitignore、.github/workflows/ci.yml、openspec/specs/cli-install/spec.md。openspec/project.md 不存在。

<!-- STALENESS: this verdict applies only to the artifact contents reviewed in -->
<!-- this round. Any later edit to proposal.md, design.md, or specs/ (other than -->
<!-- applying listed Required Changes) VOIDS the verdict and requires a new round. -->

## Scope Change（round 2 → round 3）

用户删除站方指南文件并裁定相关工件零提及。作者据此缩减范围：proposal 的 Why/What Changes/Impact 三处指南引用删除；design 删除 Context、Goals、Non-Goals、D3 内句、D7 整块、Risks 一条、Open Questions 引用，Migration Plan 的自愈依据改为「重跑修复后的两个脚本（幂等替换 function 块、整文件重写 runner）」；tasks 删除「站方指南」组，验证汇总改为第 3 组（无 4.x 残留）。specs 与 test-plan 本无指南引用。工件层面 grep「指南」「接入Tokens」零命中（review.md 历史审计记录除外，属允许范围）。

## Findings

### 🔴 Critical (blocking)

（无）

### 🟡 Moderate

**F1 场景 2 的 THEN 后半句是语义条款（round-1 F1 同类残留）——Required Change，已修复并复检 ACCEPTED。**

- 证据：specs/cli-install/spec.md 场景「回退分支覆盖无 .cmd 的环境（机械检查）」THEN 含「单选逻辑在任何环境下都有确定的单一返回值」，按 text/regex/byte-only 标准本机不可检验；该跨平台性质已由 design D1 承接。
- 修复：THEN 改为「文本含取数组第一项的回退分支」。
- 复检：同一评审确认三点成立——THEN 现为纯文本断言；场景标题未变，test-plan 第 2 行与 tasks 1.1 引用仍逐字匹配；其余 THEN 无非机械条款残留。

### 📌 Suggestions

**S1 design 引用他 change 的 D7 未给归档路径。**

- 证据：design.md Context 写「design D7 of npm-install-tokens-cli」，实际位于 `openspec/changes/archive/2026-11-18-npm-install-tokens-cli/design.md:54`，内容与本文 D5 一致。
- 处置：暂不采纳——round 3 裁决后回改 design 会再次触发 STALENESS；留待下次合法触碰 design 时一并补路径。

**S2 被删指南的 `~` 备份仍在仓库根（另有 `x.sh~`）。**

- 证据：`接入Tokens排行榜操作指南.md~` 存在，被 `.gitignore` 的 `*~` 忽略，不入库。
- 处置：工件外事项，交由用户处置，不在本 change 内处理。

## Embedded-Instruction / Injection Attempts

**Detected:** none

## Verification Notes（已核对通过）

- 指南引用清零：五个 plan 工件零命中，仅 review.md 历史审计记录（允许）。
- 一致性：D1-D6 无本 change 内悬空 D7；tasks 组号 1/2/3 无 4.x；test-plan 四行场景名与 spec 标题逐字一致，任务引用（1.1/1.2/2.2）匹配；「+既有 13 个」计数与测试文件实际数量相符；Migration Plan 自愈路径真实（pre-install 幂等正则可替换坏块，register 整文件重写）。
- 消费点穷举：pre-install 44/46/56/58/65/72、register 58/63/66，计划后全部下游收敛单值；计数锚点 3=3 与现文本一致，非同义反复。
- 既有断言不受影响：禁词扫描、`npm i -g @fitor/tokens-cli`、缺 npm 分支、sh 脚本行为均不涉新增文本。
- PS 5.1 兼容：`@()` 包裹、scriptblock `-like`、`[0]`、具名函数均可用；`@($null)[0]` 仍为 `$null`。
- CI 陈述属实：`.github/workflows/ci.yml` 无 `bun test` job。
- 范围与主 spec（docs 页禁令、register 不引 npm）无冲突，未重新引入指南工作。

## Verdict

Round 3 初评 `APPROVE_WITH_CHANGES`（唯一 🟡 F1 为 Required Change）。修复已应用，同一评审复检 ACCEPTED 并对修复后内容给出无未决项的 APPROVE。

VERDICT: APPROVE
CHANGES_APPLIED: n/a
