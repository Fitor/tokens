## Context

后端能力齐全，界面缺失。现状链路：

1. 管理员调用 `POST /api/teams/{teamId}/members` 创建 `pending` 邀请（`web/src/lib/teams/service.ts:330`）。
2. 邀请邮件链接是裸 `${NEXT_PUBLIC_URL}/login` 或 `/register`（`service.ts:430-433`）。
3. 登录成功后落在默认页，页面上没有任何邀请入口。
4. 接受邀请只有 API 路径：`GET /api/me/invitations`（`service.ts:768`）和 `POST /api/invitations/{id}/accept`（`service.ts:824`）。前端没有任何组件调用这两个端点。

既有可复用资产：

- `listMyInvitations` 已过滤过期邀请，join 返回团队名和到期时间。
- 接受失败的全部错误已有本地化映射（`web/src/lib/i18n/serverError.ts:57-61`）：先退出当前团队、先验证邮箱、邀请已过期、邀请不再是 pending。
- `returnTo` 机制完整：login/register 页读取并消毒参数，登录成功后跳转（`web/src/lib/auth/returnTo.ts`、`web/src/app/login/LoginForm.tsx:39`）。
- 硬约束：`team_members_user_unique` 保证一人最多一团（`web/src/lib/db/schema.ts:584`）。

用户已确认三个决策：邮件链接加 `returnTo`；有邀请就展示卡片；卡片不带拒绝按钮。

## Goals / Non-Goals

**Goals:**

- 受邀人登录后能在 `/teams` 发现并接受待处理邀请。
- 邀请邮件链接直达 `/teams`。
- 复用既有端点和既有错误文案，后端校验逻辑不变。

**Non-Goals:**

- 拒绝操作的界面入口（用户决策，`decline` 端点保留）。
- 登录时自动接受邀请。
- 邮件链接携带邀请 token 的一键接受。
- 管理员侧的待处理邀请展示（既有 InviteDialog 撤回能力不变）。
- 多条邀请的排序规则（按 `listMyInvitations` 返回顺序展示）。

## Decisions

### D1 卡片挂载在 TeamsClient 顶层

邀请卡片组件挂在 `TeamsClient` 返回树的顶层。两个既有分支（`TeamDashboard`、`CreateTeamCard`）不动。已在团队的用户同时看到团队面板和邀请卡片。

备选方案：卡片只放在无团队的 `CreateTeamCard` 分支。否决，用户明确要求有邀请就展示，不论归属状态。

### D2 服务端取数，props 下发

`web/src/lib/teams/pageData.ts` 新增加载函数。函数入参 `userId`，内部查 `users` 表取邮箱，调用 `listMyInvitations`。`teams/page.tsx` 在 `getSession()` 后调用，结果作为 props 传入 `TeamsClient`。

备选方案：客户端 `useEffect` 拉取。否决，与页面既有 SSR 数据流不同构，多一次请求且首屏闪烁。

### D3 无拒绝按钮

卡片只有「接受」。不想要的邀请保留到过期（发出后 7 天），期间卡片持续展示。服务端已过滤过期邀请，前端不需要处理过期状态。

备选方案：提供「接受 / 拒绝」双按钮。否决，用户决策砍掉拒绝操作以减小界面面积。`declineInvitation` 服务函数和 decline 端点保留，不删除。

### D4 邮件链接追加 returnTo

`service.ts` 新增 `buildInviteLink(hasAccount: boolean)`，内部执行 `process.env.NEXT_PUBLIC_URL || "http://localhost:3000"` 回退，按账号状态拼 `${base}/login?returnTo=...` 或 `${base}/register?returnTo=...`（`returnTo` 值为 `encodeURIComponent("/teams")`）。`inviteMembers` 内的 `baseUrl` 变量与两处裸拼接由该函数取代。放行链路：Next.js 向登录/注册页提供已解码的 `searchParams`，`sanitizeAuthReturnTo` 收到 `/teams` 后放行。该函数本身不接受 raw `%2Fteams`（不以 `/` 开头，命中不安全起点检查并回退默认值）。

备选方案：邮件链接直接指向 `/teams`，由页面自身的登录门禁跳转登录。否决，门禁跳转丢失来路，登录后仍回不到 `/teams`。

### D5 错误处理复用既有映射

接受操作走既有 `teamApi` 封装（`web/src/components/teams/api.ts`）。所有失败分支命中 `serverError.ts` 既有映射，toast 直接可用。新增文案键只覆盖卡片自身：标题、接受按钮、到期日期格式。

### D6 接受成功后 router.refresh()

接受成功调用 `router.refresh()`，重新走 SSR 渲染。新数据中 `team_members` 已有行，页面自然切换到团队面板。这与 `CreateTeamCard` 建团成功后的刷新路径一致。

## Risks / Trade-offs

- [卡片最长滞留 7 天] → 用户决策接受。服务端过滤过期，卡片显示到期日期供用户判断。
- [已在团队时点接受产生 409 提示] → 用户决策接受。toast 显示既有文案「先退出当前团队」。
- [存量 pending 邀请的旧邮件链接无 returnTo] → 不迁移。受邀人直接访问 `/teams` 同样能看到卡片。
- [`/teams` 每次渲染多一次 DB 查询] → 页面已 `force-dynamic`，查询为单表 join，量级可忽略。
- [returnTo 编码回归] → e2e 走真实 URL `/login?returnTo=%2Fteams`：浏览器导航、登录、断言落到 `/teams`。不写针对 `sanitizeAuthReturnTo` 函数本体的单元断言。

## Migration Plan

纯增量改动。无 schema 变更，无 API 变更，无环境变量变更。部署即生效。回滚只需还原涉及的五个文件。存量 `pending` 邀请不需要任何数据处理，卡片自动可见。

## Open Questions

无。三个决策点已由用户确认并记录于 Context 节。
