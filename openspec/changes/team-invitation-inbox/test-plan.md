## Test Plan

| Requirement | Scenario | Test File | Test Name | Initial State |
|-------------|----------|-----------|-----------|---------------|
| specs/team-invitation-inbox/spec.md → 受邀人查看待处理邀请 | 有待处理邀请时显示卡片 | tests/e2e/team-invitation-inbox.spec.ts | `inbox: pending invite renders card with ISO expiry` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 受邀人查看待处理邀请 | 已在团队时卡片仍显示 | tests/e2e/team-invitation-inbox.spec.ts | `inbox: card renders alongside existing team dashboard` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 受邀人查看待处理邀请 | 过期邀请不渲染 | tests/e2e/team-invitation-inbox.spec.ts | `inbox: expired invitation is not rendered` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 受邀人接受邀请 | 接受成功入团 | tests/e2e/team-invitation-inbox.spec.ts | `accept: success joins team and card disappears` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 受邀人接受邀请 | 已在团队时接受被阻断 | tests/e2e/team-invitation-inbox.spec.ts | `accept: blocked when already in a team (409 toast)` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 受邀人接受邀请 | 未验证邮箱时接受被阻断 | tests/e2e/team-invitation-inbox.spec.ts | `accept: blocked for unverified email invitee (403 toast)` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 受邀人接受邀请 | 页面停留期间邀请过期 | tests/e2e/team-invitation-inbox.spec.ts | `accept: invitation expiring after render shows expired toast` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 受邀人接受邀请 | 目标团队已解散时接受被阻断 | tests/e2e/team-invitation-inbox.spec.ts | `accept: disbanded team invitation shows notActive toast` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 受邀人接受邀请 | 多条邀请时接受其一 | tests/e2e/team-invitation-inbox.spec.ts | `accept: accepting one invitation keeps the other card` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 邀请邮件链接携带回跳参数 | 已注册账号收到登录回跳链接 | web/src/lib/teams/inviteLink.test.ts | `invite link: registered account -> /login?returnTo=%2Fteams` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 邀请邮件链接携带回跳参数 | 未注册邮箱收到注册回跳链接 | web/src/lib/teams/inviteLink.test.ts | `invite link: unregistered email -> /register?returnTo=%2Fteams` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 邀请邮件链接携带回跳参数 | 未配置站点地址时回退本地默认 | web/src/lib/teams/inviteLink.test.ts | `invite link: NEXT_PUBLIC_URL fallback keeps path and query` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 邀请邮件链接携带回跳参数 | 登录成功后落到团队页 | tests/e2e/team-invitation-inbox.spec.ts | `deep link: login with returnTo=%2Fteams lands on /teams` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 邀请邮件链接携带回跳参数 | 注册成功后落到团队页 | tests/e2e/team-invitation-inbox.spec.ts | `deep link: register with returnTo=%2Fteams lands on /teams` | 🔴 red |

## Coverage Notes

- e2e 复用 `tests/e2e/users.ts` 既有 fixture 机制：`fixtureUser`、`registerUser`、`deleteFixtureUsers`，合成 `t5e2e-*` 账号，`afterAll` 清理并级联删除团队数据。
- 直接 DB 操作走 `users.ts` 的 loopback postgres 通道（`requireLoopbackPostgresUrl`）：场景 1.3 和 2.4 用它回填 `team_invitations.expiresAt` 到过去；场景 2.5 用它核实 `teams.status='disbanded'`（解散动作走既有 API `POST /api/teams/{id}/disband`）。
- 单测 runner 为 `bun test`（对齐 `web/src/lib/email/send.test.ts` 的 `bun:test` 先例）。链接构造实现为纯函数 `buildInviteLink(baseUrl, hasAccount)`，`service.ts` 两处调用点各一行，与 design D4 一致；单测直接断言返回字符串。
- 到期断言与 locale 解耦：断言 `data-testid="invite-expires"` 的 `data-expires` ISO UTC 日期值，不断言本地化渲染文本。
- 场景 2.3 与 3.5 依赖同一事实：本地 dev 栈无邮件通道，注册后 `emailVerifiedAt` 保持 null。
- 场景 2.6 及全部多邀请用例不得对展示顺序做断言（`listMyInvitations` 无 `ORDER BY`，review S4 的处置约定）。
- 执行命令：单测 `cd web && bun test src/lib/teams/inviteLink.test.ts`；e2e `cd web && npm run test:e2e`。
- 本地 dev 栈无真实邮件通道，3.1–3.3 的邮件正文内容由纯函数单测覆盖；e2e 不读邮件。
