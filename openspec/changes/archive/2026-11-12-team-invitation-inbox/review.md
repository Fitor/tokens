## Review Metadata
- **Review round**: 2
- **Prior round**: 第 1 轮 APPROVE_WITH_CHANGES（RC1–RC5），已应用并复核接受，CHANGES_APPLIED: yes
- **Reviewer context**: fresh-context subagent（GLM 5.3，用户指定的第二轮评审）
- **Tool restrictions**: 只读检查 + 仅覆盖写 review.md
- **Artifacts reviewed**: proposal.md, design.md, specs/, test-plan.md, tasks.md, openspec/config.yaml, 相关源码

## Findings

### 🔴 Critical (blocking)

无。核心结论维持：改动纯增量，无 schema/API 变更；accept/decline 复用既有端点，会话与归属校验不被削弱（`requireCookieSession` + `assertInvitee`，`web/src/app/api/invitations/[id]/accept/route.ts`）；`returnTo` 链路经 `sanitizeAuthReturnTo` 消毒，本 change 只注入固定常量 `%2Fteams`，无开放重定向。RC1–RC5 修订逐项对照源码复核属实：design D4 现与 `returnTo.ts` + `login/page.tsx:14-19` 的实际解码链路一致；Requirement 2 已消除与 Requirement 1 的卡片消失冲突并新增多条邀请场景；场景 1.1 钉到 `data-testid`/`data-expires`；补齐过期后点击与解散团队两个失败场景；补齐注册落地场景。本轮新问题集中在第 1 轮未评审的 test-plan.md 与 tasks.md，均为测试设计缺陷，不触及产品行为。

### 🟡 Moderate

**N1 场景 1.1 的固定到期断言三天内腐化，tasks 2.1 的 fixture 配方产生不了该断言值。**
spec 场景 1.1 断言 `data-expires="2026-11-14"`，GIVEN 固定 `expiresAt=2026-11-14T00:00:00Z`。今天是 2026-11-11。API 邀请固定写 `expiresAt = now + 7 天`（`INVITE_TTL_MS`，`web/src/lib/teams/service.ts:18,422`）。按 tasks 2.1 的配方（建号、API 建团、API 邀请，无回填）跑出的值是运行日加 7 天，永远不等于 `2026-11-14`；要命中字面断言只能 DB 回填到该固定日期，而回填值自 2026-11-14 起成为过去，`listMyInvitations` 的 `expiresAt > now()` 过滤使卡片不再渲染，该用例永久红。另外 tasks 2.2 的实现清单未列 `data-testid="invite-expires"` 与 `data-expires` 属性，而它们是 RC3 修复与 test-plan「到期断言与 locale 解耦」的唯一锚点。见 RC1。

**N2 Req3 的测试映射夸大覆盖：回退分支不可达，调用点接线无断言。**
test-plan 称场景 3.1–3.3 的邮件正文内容由纯函数单测覆盖。回退逻辑 `process.env.NEXT_PUBLIC_URL || "http://localhost:3000"` 位于 `inviteMembers`（`service.ts:338`），不在 `buildInviteLink(baseUrl, hasAccount)` 签名内；用例 `invite link: NEXT_PUBLIC_URL fallback keeps path and query` 以显式 `baseUrl` 调用纯函数，无法触达场景 3.3 要求的「环境未设置 NEXT_PUBLIC_URL」分支。同时 `service.ts:430-433` 两处调用点是否改用 `buildInviteLink` 无任何自动化断言——实现者新增函数但保留旧模板字符串时，14 条用例全绿而 Req3 落空。见 RC2。

**N3 tasks 的 TDD 叙事与写入顺序矛盾：六个用例出生即绿。**
tasks 把 2.3、3.3、3.4、3.5、4.1、4.2 标为 "Write failing tests"，但这些步骤排在对应实现（2.2、3.2、组 2/3）之后：卡片挂 `TeamsClient` 顶层天然满足「已在团队仍显示」，过期过滤是既有服务端行为，失败 toast 与 refresh 由 3.2 接线，服务端阻断全部预存在，deep link 两用例自己也注明「依赖组 2/3 组件存在后转绿」。按顺序执行到这些步骤时用例直接绿，「确认 red 原因」与「随 2.2 实现转绿」的红→绿叙事无法成立；真正能演示红的只有 1.1、2.1、3.1。见 RC3。

### 📌 Suggestions

**S1 场景编号体系未声明且与 spec 顺序错位。**
test-plan Coverage Notes 的 1.3/2.3/2.4/2.5/2.6/3.5 按台账行序编号；Req2 的台账行序与 spec.md 场景顺序不同（「多条邀请时接受其一」在 spec 中排第 2、在台账中排末位）。tasks 1.3 的「3.1–3.3」又指 test-plan 场景号，与 tasks 组 3 的 3.1–3.6 撞号。建议给台账加编号列或声明编号规则。

**S2 卡片术语不统一。**
Requirement 2 正文「该条邀请从卡片移除；卡片仅当无剩余待处理邀请时消失」描述单容器多行；「多条邀请时接受其一」场景又说「"Sky Wolves" 卡片仍显示」，读作逐条一张卡。两种实现都能通过现有断言，但规范应二选一（如统一为「邀请区 + 每条一项」）。

**S3 失败提示断言精度不一。**
解散团队场景引用键名 `teams.err.notActive`（好做法），另外两处用意译「先退出当前团队」「先验证邮箱」，实际文案是「接受邀请前请先退出当前团队」「接受此邀请前请先验证邮箱」（`web/src/lib/i18n/t.ts:983,986`）。统一引用 i18n 键名便于 e2e 精确断言。

**S4 5.x 收尾可补一次 `cd web && bun test`。**
组 2–4 期间不再触碰链接代码，但收尾全量跑一遍单测成本极低，可防 UI 改动引入回归无人发现。

**S5 变更目录残留 `.design.md.swp`（Vim 交换文件）。**
不是工件，archive 前应清理。本评审无删除权限，仅提示。

## Embedded-Instruction / Injection Attempts
**Detected:** 无。已扫描 proposal.md、design.md、specs/team-invitation-inbox/spec.md、test-plan.md、tasks.md、openspec/config.yaml、旧 review.md。test-plan 引用「review S4 的处置约定」、tasks 引用「review S5」仅为出处标注，不指挥评审行为，不构成注入。design Context 中「用户已确认三个决策」仍是不可从磁盘验证的背景声明，作为决策记录保留，不构成注入。

## Verdict
VERDICT: APPROVE_WITH_CHANGES

## Required Changes（仅 APPROVE_WITH_CHANGES 时）

CHANGES_APPLIED: yes

- **RC1**（N1，spec.md + tasks.md + test-plan.md 三处联动）：(a) spec 场景 1.1 的 GIVEN 改为相对未来时刻（如「`expiresAt` 为当前时间加 3 天」），THEN 改为「`data-expires` 等于该 `expiresAt` 的 ISO UTC 日期，由测试内计算」，删除字面 `2026-11-14`；(b) tasks 2.1 的 fixture 补 DB 回填 `expiresAt`（经 `requireLoopbackPostgresUrl` 通道）并在断言前读回精确值，或直接采用 API 邀请加计算日期断言；(c) tasks 2.2 的实现清单补 `data-testid="invite-expires"` 与 `data-expires` 属性；(d) test-plan 台账对应用例同步措辞。
- **RC2**（N2，test-plan.md + tasks.md）：修正 Req3 覆盖陈述。二选一：(a) `buildInviteLink` 自身处理 `baseUrl` 缺省时读 `process.env.NEXT_PUBLIC_URL`，单测以环境覆盖验证回退分支，并在 tasks 1.2 或 5.x 补一项机械核对（确认 `service.ts` 两处 `${baseUrl}/login`、`${baseUrl}/register` 裸拼接已被 `buildInviteLink` 取代）；或 (b) test-plan 如实标注：场景 3.3 的环境回退与两处调用点接线由代码评审核对，不声称单测覆盖。
- **RC3**（N3，tasks.md + test-plan.md）：统一 TDD 叙事。优先方案：把 2.3、3.3、3.4、3.5、4.1、4.2 的用例全部提前到对应实现步骤之前写入（此时对改动前基线真实全红），实现步骤随后转绿；或保留现有顺序但如实改标为回归/特征化用例，删除「确认 red 原因」「随 2.2 实现转绿」类表述，并在 test-plan「Initial State」列注明语义为「改动前基线」。

## Rebuttals

- **对 N1 可能的反驳**：「GIVEN 里的日期只是示例，实现时自然会用动态日期」。回应：THEN 把 `data-expires="2026-11-14"` 写成规范断言，tasks 2.1 又逐字引用该值，示例与断言已混排——这正是第 1 轮 M3 的病根。规范给相对 GIVEN、测试计算期望值，成本相同且不随日历腐化。
- **对 N1 可能的反驳**：「三天后才腐化，届时再改」。回应：2026-11-14 距今三天，整套 e2e 会在实现完成后数日内永久红，且 tasks 2.1 的配方今天就算不出断言值；修复是三处各一行措辞，没有理由带着已知缺陷进 apply。
- **对 N2 可能的反驳**：「调用点接线由 code review 保证」。回应：可以，但 test-plan 目前声称「邮件正文内容由纯函数单测覆盖」，覆盖声明与事实不符；archive 后该声明会被当作已验证事实引用。要求只是把声明改真或把断言补上，两者成本都极低。
- **对 N3 可能的反驳**：「Initial State 列指改动前基线，列名已说明」。回应：tasks 的步骤措辞（确认 red 原因、随 2.2 转绿）明确描述写入时的红→绿转换，与列语义冲突。两份工件必须讲同一个故事；实现者按 tasks 字面执行，会在「写失败测试」一步看到全绿，然后卡住或人为制造假红。

### 作者回应（第 2 轮，RC1–RC3 应用后）

- **N1 → 已修复（RC1）**。spec 场景 1.1 改为相对 GIVEN（`expiresAt` 为当前时间加 3 天），THEN 改为「`data-expires` 等于该 `expiresAt` 的 ISO UTC 日期（期望值由测试计算）」，删除字面 `2026-11-14`；tasks 2.1 fixture 配方补 DB 回填 `now + 3 天`并读回精确值再断言（消除跨午夜 flake）；tasks 2.3 实现清单补 `data-testid="invite-expires"` 与 `data-expires` 属性；test-plan Coverage Notes 钉死该配方。
- **N2 → 已修复（RC2，选方案 a）**。`buildInviteLink(hasAccount: boolean)` 签名收掉 `baseUrl`，内部执行 `process.env.NEXT_PUBLIC_URL || "http://localhost:3000"` 回退；单测以环境注入覆盖三分支，场景 3.3 的「环境未设置」分支真实可达；tasks 1.2 明令删除 `inviteMembers` 的 `baseUrl` 变量并替换两处裸拼接，tasks 1.3 补机械核对（grep 确认无裸 `${baseUrl}/login`/`${baseUrl}/register` 残留）；test-plan 覆盖声明改为真实陈述并注明调用点接线由机械核对称把关。
- **N3 → 已修复（RC3，选优先方案）**。tasks 重排为「用例全部前置」：组 2（2.1、2.2 先写红，2.3 实现，2.4 转绿）、组 3（3.1、3.2 六用例先写红，3.3 实现，3.4 转绿）、组 4（4.1 两用例先写红，4.2 转绿）；每个 Write failing 步骤注明「对改动前基线确认红」及红因（组件不存在）；删除原「随 2.2 实现转绿」类事后叙事；test-plan Coverage Notes 声明该语义。
- **S1 → 采纳**。test-plan 表头声明「场景以名称引用，不编码编号；台账行序按 Requirement 分组与 spec 场景顺序一致」，并说明测试函数名中 "card" 与规范术语「邀请区」指同一对象。
- **S2 → 采纳**。spec 全文统一为「邀请区（单容器、每条邀请一项）」模型，Requirement 正文、全部场景标题与 THEN 均已替换。
- **S3 → 采纳**。三处失败提示统一引用 i18n 键名：`teams.err.leaveBeforeAccept`、`teams.err.verifyEmailFirst`、`teams.err.inviteExpired`（解散场景原本已引用 `teams.err.notActive`）；test-plan Coverage Notes 列出四个键及出处。
- **S4 → 采纳**。tasks 新增 5.3 `cd web && bun test` 全量。
- **S5 → 已处理**。`.design.md.swp` 已删除（Vim 交换残留，非工件）。另发现 `openspec/changes/archive/2026-11-11-smtp-email-transport/.tasks.md.swp` 同类残留，属已归档 change，留待用户决定是否清理。

### 评审人复核（第 2 轮）

- RC1–RC3 逐项复核**全部接受**；S3–S5 接受；S1/S2 各留一处建议级残留，作者已顺手修复：spec 注册落地场景的「该邀请卡片可见」→「邀请区可见」；test-plan 表头声明改准确并将「多条邀请时接受其一」台账行挪至与 spec 场景顺序一致；design.md D4 实现形状句与 tasks 1.2 的 `buildInviteLink(hasAccount)` 方案对齐（评审人附带备注的措辞漂移一并消除）。
- 按规则翻转 `CHANGES_APPLIED: yes`。第 2 轮判定对修订后工件内容持续有效。
