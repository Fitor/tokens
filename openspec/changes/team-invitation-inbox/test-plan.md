## Test Plan

场景以名称引用为准；台账按 Requirement 分组、组内行序与 spec 场景顺序一致，Coverage Notes 中的数字编号仅为辅助定位。测试函数名中的 "card" 为英文标识符，与规范术语「邀请区」（单容器、每条邀请一项）指同一对象。

| Requirement | Scenario | Test File | Test Name | Initial State |
|-------------|----------|-----------|-----------|---------------|
| specs/team-invitation-inbox/spec.md → 受邀人查看待处理邀请 | 有待处理邀请时显示邀请区 | tests/e2e/team-invitation-inbox.spec.ts | `inbox: pending invite renders card with ISO expiry` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 受邀人查看待处理邀请 | 已在团队时邀请区仍显示 | tests/e2e/team-invitation-inbox.spec.ts | `inbox: card renders alongside existing team dashboard` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 受邀人查看待处理邀请 | 过期邀请不渲染 | tests/e2e/team-invitation-inbox.spec.ts | `inbox: expired invitation is not rendered` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 受邀人接受邀请 | 接受成功入团 | tests/e2e/team-invitation-inbox.spec.ts | `accept: success joins team and card disappears` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 受邀人接受邀请 | 多条邀请时接受其一 | tests/e2e/team-invitation-inbox.spec.ts | `accept: accepting one invitation keeps the other card` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 受邀人接受邀请 | 已在团队时接受被阻断 | tests/e2e/team-invitation-inbox.spec.ts | `accept: blocked when already in a team (409 toast)` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 受邀人接受邀请 | 未验证邮箱时接受被阻断 | tests/e2e/team-invitation-inbox.spec.ts | `accept: blocked for unverified email invitee (403 toast)` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 受邀人接受邀请 | 页面停留期间邀请过期 | tests/e2e/team-invitation-inbox.spec.ts | `accept: invitation expiring after render shows expired toast` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 受邀人接受邀请 | 目标团队已解散时接受被阻断 | tests/e2e/team-invitation-inbox.spec.ts | `accept: disbanded team invitation shows notActive toast` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 邀请邮件链接携带回跳参数 | 已注册账号收到登录回跳链接 | web/src/lib/teams/inviteLink.test.ts | `invite link: registered account -> /login?returnTo=%2Fteams` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 邀请邮件链接携带回跳参数 | 未注册邮箱收到注册回跳链接 | web/src/lib/teams/inviteLink.test.ts | `invite link: unregistered email -> /register?returnTo=%2Fteams` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 邀请邮件链接携带回跳参数 | 未配置站点地址时回退本地默认 | web/src/lib/teams/inviteLink.test.ts | `invite link: NEXT_PUBLIC_URL fallback keeps path and query` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 邀请邮件链接携带回跳参数 | 登录成功后落到团队页 | tests/e2e/team-invitation-inbox.spec.ts | `deep link: login with returnTo=%2Fteams lands on /teams` | 🔴 red |
| specs/team-invitation-inbox/spec.md → 邀请邮件链接携带回跳参数 | 注册成功后落到团队页 | tests/e2e/team-invitation-inbox.spec.ts | `deep link: register with returnTo=%2Fteams lands on /teams` | 🔴 red |

## Coverage Notes

- **红的状态语义**：全部用例先于对应实现写入（tasks 组 2/3/4 的 Write failing 步骤均排在 Implement 之前），对改动前基线确认红。e2e 用例红的原因统一为邀请区组件不存在（无从渲染、无从点击、deep link 落地后断言邀请区可见失败）。
- **到期断言与日期 flake 消除**：API 邀请固定写 `expiresAt = now + 7 天`（`INVITE_TTL_MS`），e2e 在邀请创建后经 `users.ts` 的 loopback postgres 通道（`requireLoopbackPostgresUrl`）回填 `expiresAt = now + 3 天`并读回精确值，断言 `data-testid="invite-expires"` 的 `data-expires` 等于读回值的 ISO UTC 日期。期望值由测试计算，不含固定日历日期，断言与回填同源，无跨午夜偏差。
- **链接构造的真实覆盖**：`buildInviteLink(hasAccount)` 内部执行 `process.env.NEXT_PUBLIC_URL || "http://localhost:3000"` 并拼 `returnTo`。单测以环境注入覆盖三分支：设置 env + 已注册、设置 env + 未注册、删除 env 回退默认。场景 3.3 的「环境未设置」分支因此真实可达。调用点接线（`service.ts` 两处裸拼接被取代）由 tasks 1.3 的机械核对把关，不声称单测覆盖。
- e2e 复用 `tests/e2e/users.ts` 既有 fixture：`fixtureUser`、`registerUser`、`deleteFixtureUsers`，合成 `t5e2e-*` 账号，`afterAll` 清理并级联删除。
- DB 直连通道同上：场景 1.3（回填过期）、2.4（渲染后回填过期）、解散场景核实 `teams.status` 均走 loopback postgres。
- 单测 runner 为 `bun test`（对齐 `web/src/lib/email/send.test.ts` 的 `bun:test` 先例）。
- 失败 toast 断言统一引用 i18n 键名：`teams.err.leaveBeforeAccept`、`teams.err.verifyEmailFirst`、`teams.err.inviteExpired`、`teams.err.notActive`（`web/src/lib/i18n/serverError.ts:57-61`）。
- 多邀请用例不对展示顺序做断言（`listMyInvitations` 无 `ORDER BY`，第 1 轮 S4 处置约定）。
- 场景 2.3 与 3.5 依赖同一事实：本地 dev 栈无邮件通道，注册后 `emailVerifiedAt` 保持 null。
- 本地 dev 栈无真实邮件通道，3.1–3.3 的邮件正文内容由 `buildInviteLink` 纯函数单测覆盖；e2e 不读邮件。
- 执行命令：单测 `cd web && bun test src/lib/teams/inviteLink.test.ts`（收尾另跑全量 `bun test`）；e2e `cd web && npm run test:e2e`。
