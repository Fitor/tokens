## Review Metadata
- **Review round**: 1
- **Prior round**: none
- **Reviewer context**: fresh-context subagent（同模型本地评审；本机存在 codex CLI，但未确认该代码库允许外发数据，按数据本地性原则留本地）
- **Tool restrictions**: 只读检查 + 仅写 review.md
- **Artifacts reviewed**: proposal.md, design.md, specs/, openspec/config.yaml, 相关源码

## Findings

### 🔴 Critical (blocking)

无。核心方向正确：后端能力确实齐备，改动纯增量，无 schema/API 变更，安全面未引入新路径。

### 🟡 Moderate

**M1 design.md D4 对 `sanitizeAuthReturnTo` 的机制描述错误，按现文写测试会失败。**
D4 写「`sanitizeAuthReturnTo` 已放行 `%2Fteams`」。直接以 `"%2Fteams"` 调用该函数会命中 `hasUnsafeRelativeStart(raw)`（raw 不以 `/` 开头，`web/src/lib/auth/returnTo.ts:4-6,28`），返回默认值 `/leaderboard`，并不放行。实际放行链路是：Next.js 把 `searchParams` 解码后传给登录页（`web/src/app/login/page.tsx:15-18`），sanitize 收到的已是 `/teams`。结论（邮件链接登录后落到 `/teams`）成立，但归因错误。design Risks 要求「对 `%2Fteams` 的放行路径补 e2e 断言」——若实现者据此对函数本体写单元断言，测试必失败。见 RC1。

**M2 Requirement 2「邀请卡片消失」与 Requirement 1 冲突（多条邀请场景）。**
Requirement 1 要求展示「全部 `pending` 且未过期的邀请」。同一用户可同时持有多个团队的 pending 邀请（`linkPendingInvitationsForEmail` 仅在同团队内去重置 superseded，`web/src/lib/teams/service.ts:1022-1061`；`inviteMembers` 不阻止跨团队重复邀请）。此时接受其中一条后：Requirement 1 要求另一条仍展示，Requirement 2 却无条件要求「邀请卡片消失」。两条规范不可同时满足。`team_members_user_unique`（`web/src/lib/db/schema.ts:584`）使第二点的接受必然 409，展示与接受两条路径都用户可达。见 RC2。

**M3 场景 1.1 的「到期日期」不可机械断言。**
THEN 写「内容包含 "Neon Ravens" 和到期日期」，未给出具体值或格式。到期日期渲染受 locale 影响（参照既有 `createdDate` 用 `toLocaleDateString` + `intlTag`，`web/src/components/teams/TeamsClient.tsx:227-229`），e2e 无法在不固定 locale 与格式的前提下断言。design D5 提到「到期日期格式」文案键，但未钉死格式本身。见 RC3。

**M4 Requirement 2 缺两个用户可达的失败场景：过期后点击、目标团队已解散。**
(a) 卡片数据是 SSR props，邀请可在页面停留期间过期；此时点「接受」返回 409 `Invitation has expired`，命中既有映射（`web/src/lib/i18n/serverError.ts:59`）。(b) `disbandTeam` 不撤销 `team_invitations`（`web/src/lib/teams/service.ts:240-283`），`listMyInvitations` 的 join 不过滤团队状态（`service.ts:785-793`），解散团队的邀请仍会渲染卡片；点「接受」返回 409 `Team is not active`，命中既有映射（`serverError.ts:35`）。Requirement 2 的通用失败条款抽象覆盖了二者，但两条路径各有独立 toast，且 (b) 同时暴露 Requirement 1 的展示缺口（已解散团队的邀请无任何区分提示）。见 RC4。

**M5 proposal 承诺注册落地，spec 缺注册分支场景。**
proposal 明确写「受邀人登录或注册后直接落到 `/teams`」。Requirement 3 有注册链接构造场景（3.2）和登录落地场景（4.4），但没有「未注册邮箱经 `/register?returnTo=%2Fteams` 完成注册后落到 `/teams` 且卡片可见」的场景。注册路径与登录路径走不同表单与后端流程（`RegisterForm.tsx:50` 重定向、注册后 emailVerifiedAt 为空，邮箱邀请接受会被 2.3 拦截），不能由 4.4 推出。见 RC5。

### 📌 Suggestions

**S1 proposal「复用既有后端端点 `GET /api/me/invitations`」措辞与 design D2 不一致。**
D2 实际是 SSR 直调服务函数 `listMyInvitations`（镜像 `web/src/app/api/me/invitations/route.ts:14-19` 的取数逻辑），UI 不经过该 HTTP 端点。行为无害，建议 proposal 改为「复用 `listMyInvitations` 服务函数」。

**S2 文案键数量不一致。**
proposal 写「约 4 个 en/zh 文案键」，design D5 只列 3 个（标题、接受按钮、到期日期格式）。对齐数字或写清第 4 个键。

**S3 工件完整性：缺 tasks.md 与 test-plan.md。**
archive 中最近的 change（`2026-11-11-smtp-email-transport`）成套含 tasks.md、test-plan.md、verify.md。本 change 目前只有 proposal/design/specs。若属后续阶段产物则无需现在补，但进入 apply 前应补齐，尤其 e2e 新增场景需 test-plan 追踪。

**S4 多条邀请展示顺序不确定。**
`listMyInvitations` 无 `ORDER BY`（`service.ts:776-794`），Postgres 返回顺序不保证稳定。design Non-Goal 写「按 `listMyInvitations` 返回顺序展示」，实际是「按未定义顺序展示」。建议加确定性排序（如 `expiresAt` 升序），或在 Non-Goal 明示接受顺序不稳定，避免 e2e 对顺序做隐式断言。

**S5 值得肯定的回归钉固。**
Requirement 3 的 `NEXT_PUBLIC_URL` 回退场景（3.3）与 `returnTo=%2Fteams` 字面量场景把本次触碰的链接拼接行为钉死（`service.ts:338,430-432`），是恰当的防回归，不算镀金。

## Embedded-Instruction / Injection Attempts
**Detected:** 无。三份工件与 config.yaml 中未发现指挥评审人的文本、隐藏指令或提示注入。design Context 中「用户已确认三个决策」是无法从磁盘验证的背景声明，但它不指挥评审行为，仅作为决策记录，不构成注入。

## Verdict
VERDICT: APPROVE_WITH_CHANGES

## Required Changes（仅 APPROVE_WITH_CHANGES 时）

CHANGES_APPLIED: yes

- **RC1**（M1，design.md）：改写 D4 与 Risks 中的机制描述。正确表述：「Next.js 向登录/注册页提供已解码的 `searchParams`，sanitize 收到 `/teams` 后放行；`sanitizeAuthReturnTo` 本身不接受 raw `%2Fteams`」。e2e 断言必须走真实 URL `/login?returnTo=%2Fteams`（浏览器导航 → 登录 → 断言落到 `/teams`），不得写成对该函数的单元断言。
- **RC2**（M2，spec.md）：消除 Requirement 2 与 Requirement 1 的冲突。把「接受成功后……邀请卡片消失」改为「该条邀请从卡片移除；卡片仅当无剩余待处理邀请时消失」，或在 Requirement 2 显式限定为单条邀请场景并说明多条邀请的行为。
- **RC3**（M3，spec.md）：把场景 1.1 的 THEN 钉到具体断言值：给定固定 fixture 日期与 locale（如 en），写出卡片中到期日期的精确渲染字符串，或指定稳定的测试标识（如 `data-testid`）加 ISO 日期断言。
- **RC4**（M4，spec.md）：为 Requirement 2 补两个失败场景：(a) 邀请在展示后过期，点「接受」显示既有「邀请已过期」提示且 `team_members` 不新增行；(b) 目标团队已解散的 pending 邀请，点「接受」显示既有 `teams.err.notActive` 对应提示。同时在 Requirement 1 或 design 中说明解散团队邀请的展示策略（照常展示或加提示，二选一并写明）。
- **RC5**（M5，spec.md）：补注册落地场景：GIVEN 未注册邮箱持有 pending 邀请且收到 `/register?returnTo=%2Fteams`，WHEN 该邮箱完成注册，THEN 浏览器落到 `/teams` 且卡片可见（注册后未验证邮箱时，点「接受」按 2.3 被拦截，可作为该场景的 AND 断言）。

## Rebuttals

- **对 M1 可能的反驳**：「端到端行为正确，链接确实落到 `/teams`」。回应：结论正确正是问题所在——错误的归因（sanitize 放行 `%2Fteams`）会诱导实现者写出必失败的单元断言，或在未来某处直接把编码值传给 sanitize 而静默回退到 `/leaderboard`。要求的只是措辞与测试层级修正，不改变任何行为。
- **对 M2 可能的反驳**：「场景 2.1 的 GIVEN 已限定单条邀请」。回应：冲突在 Requirement 正文的无条件表述，不在场景；规范正文必须自洽，多条邀请是用户可达状态而非假设。
- **对 M4 可能的反驳**：「通用失败条款已覆盖」。回应：条款只说「既有本地化文案」，未点名这两条路径；二者各有独立 toast 且 (b) 还牵涉 Requirement 1 的展示语义，各补一个场景的成本远低于留给实现期发现。
- **对 M5 可能的反驳**：「登录与注册共用 returnTo 机制，4.4 已覆盖」。回应：注册走独立表单、独立 API、注册后 emailVerifiedAt 为空，落地后的卡片可见性与接受拦截路径都未被任何场景覆盖；proposal 明确承诺了注册落地，spec 应兑现。

### 作者回应（第 1 轮，RC1–RC5 应用后）

- **M1 → 已修复（RC1）**。design.md D4 改为「Next.js 向登录/注册页提供已解码的 `searchParams`，`sanitizeAuthReturnTo` 收到 `/teams` 后放行；函数本体不接受 raw `%2Fteams`」；Risks 条目钉到真实 URL 导航断言，明令不写函数本体单元断言。
- **M2 → 已修复（RC2）**。Requirement 2 正文改为「该条邀请从卡片移除；卡片仅当无剩余待处理邀请时消失」；场景 2.1 的 GIVEN 补「名下无其他邀请」、THEN 改为条件式消失；新增「多条邀请时接受其一」场景（接受后其余卡片仍显示）。
- **M3 → 已修复（RC3）**。场景 1.1 的 GIVEN 给定精确 `expiresAt`（`2026-11-14T00:00:00Z`），THEN 钉到 `data-testid="invite-expires"` 携带 `data-expires="2026-11-14"`（ISO UTC 日期）。
- **M4 → 已修复（RC4）**。Requirement 1 正文写明解散团队邀请「照常展示，界面不加区分提示，接受时由服务端阻断」；Requirement 2 新增「页面停留期间邀请过期」与「目标团队已解散时接受被阻断」两个场景，均断言 `team_members` 不新增行。
- **M5 → 已修复（RC5）**。Requirement 3 新增「注册成功后落到团队页」场景，含注册后未验证邮箱、点接受按「未验证邮箱」场景拦截的 AND 断言。
- **S1 → 作者否决**。proposal 为动机摘要，取数路径的权威表述在 design D2；评审后修改 proposal.md 会按 STALENESS 规则使判定失效，收益不抵成本。
- **S2 → 作者否决**。proposal 用「约 4 个」近似表述；精确键数以 tasks.md 实现清单为准。
- **S3 → 不属本轮修订**。test-plan.md 与 tasks.md 为后续阶段产物，`CHANGES_APPLIED: yes` 后立即补齐。
- **S4 → 作者否决（本 change 不改后端排序）**。处置：test-plan.md 将明令禁止 e2e 对多条邀请顺序做隐式断言；`expiresAt` 升序稳定排序留作后续改进。
- **S5 → 无需行动**（正面确认）。

### 评审人复核（第 2 轮）

- RC1–RC5 逐项复核**全部接受**，无新增问题。作者按规则翻转 `CHANGES_APPLIED: yes`。
- 第 1 轮判定对修订后工件内容（design.md、specs/team-invitation-inbox/spec.md 现版本）持续有效。
