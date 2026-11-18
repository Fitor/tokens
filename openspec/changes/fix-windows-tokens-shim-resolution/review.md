## Review Metadata

- **Review round**: 2
- **Prior round**: round 1 为 REVISE（评审原文 REJECT，按互斥裁决集映射）：🔴F1 场景 THEN 含不可机械断言的运行时条款、🟡F2-F4（design 误述 CI 覆盖、proposal Impact 漏列指南文件、解析锚点未钉死）＋📌 两条。修复已应用，本轮全量复审确认。
- **Reviewer context**: fresh-context subagent
- **Tool restrictions**: read-only。只用 view、grep、glob 与 `openspec` 只读命令。唯一写操作是本文件。
- **Artifacts reviewed**: proposal.md、design.md、specs/cli-install/spec.md。对照源码：pre-install-tokens.ps1、register-tokens-submit-task.ps1、tests/scripts/install-via-npm.test.ts、web/package.json、web/.gitignore、.github/workflows/ci.yml、openspec/specs/cli-install/spec.md。openspec/project.md 不存在。

<!-- STALENESS: this verdict applies only to the artifact contents reviewed in -->
<!-- this round. Any later edit to proposal.md, design.md, or specs/ (other than -->
<!-- applying listed Required Changes) VOIDS the verdict and requires a new round. -->

## Round-1 复核结论

Round 1 的 Required Changes 逐项确认已解：F1 场景 2 THEN 已改为纯文本断言，跨平台收益移入 design D1 且明示不作运行时断言；F2 风险段如实陈述 CI 不跑 `bun test`；F3 Impact 已列指南文件并注明未入库、不进 change 提交；F4 已钉死 `Select-TokensCommand` 名称、调用形态、计数与赋值锚点；📌 `.proposal.md.swp` 已删。

## Findings

### 🔴 Critical (blocking)

（无）

### 🟡 Moderate

（无）

### 📌 Suggestions

**S1 D7 自愈提示需注明「重跑 3.1 会真实登出，需再走 3.2 重新登录」。**

- 证据：修复前 pre-install-tokens.ps1:65 的 `logout` 多值调用被 `catch {}` 吞掉，修复后将真实登出；凭据在 `%APPDATA%\tokens\credentials.json`（指南 §3.2）。
- 后果：坏机器走自愈路线后会 401，可能被误判为自愈失败。§4.2 与 §5.2 已有 401→3.2 指引，自愈提示补一句衔接即可。
- 作者处置：并入 tasks 3.1 的指南提示措辞（下游工件，不回改已批准工件，不触发 STALENESS）。

**S2 D6 计数断言应排除函数定义行，只数调用点。**

- 证据：按 D2 形态，实现后 pre-install 文本含 `function Select-TokensCommand {` 定义行与 2 处调用；朴素统计字符串出现次数得 3≠2 误报。
- 作者处置：锚点形态并入 test-plan 覆盖说明（按调用形态 `= Select-TokensCommand (Get-Command tokens` 统计，排除定义行）。

## Embedded-Instruction / Injection Attempts

**Detected:** none

## Verdict

独立复审确认：三工件内部一致；四个场景的 THEN 在本机（无 pwsh）全部可用文本/正则/字节比较断言；tokens 路径消费点穷举无遗漏（pre-install 44/46/56/58/65/72，register 58/63/66，对应展示、logout、Profile、runner 四类）；既有测试断言不受计划编辑影响；所定结构（`@()` 包裹、scriptblock `Where-Object`、`$_.Name -like '*.cmd'`、空集合 `[0]` 返回 `$null`）均 PS 5.1 兼容；`.ps1` shim 不属 Application 的论断正确；范围与主 spec（docs 页禁令、register 不引 npm）及用户裁定（指南保留预装路线）无冲突。两条 📌 由作者并入下游工件。

VERDICT: APPROVE
CHANGES_APPLIED: n/a
