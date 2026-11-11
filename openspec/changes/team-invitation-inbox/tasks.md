## 1. 邀请链接构造（Req3，单测）

- [x] 1.1 Write failing test: `web/src/lib/teams/inviteLink.test.ts` 三条用例（对齐 test-plan 台账）——`invite link: registered account -> /login?returnTo=%2Fteams`（注入 `NEXT_PUBLIC_URL=https://tokens.example.com`，`hasAccount=true`）、`invite link: unregistered email -> /register?returnTo=%2Fteams`（同 env，`hasAccount=false`）、`invite link: NEXT_PUBLIC_URL fallback keeps path and query`（删除 env，回退 `http://localhost:3000`）；每条用例内保存/注入/删除/恢复 `process.env.NEXT_PUBLIC_URL`；确认 red 原因为 `buildInviteLink` 不存在
- [x] 1.2 Implement: `service.ts` 新增 `buildInviteLink(hasAccount: boolean): string`，内部执行 `process.env.NEXT_PUBLIC_URL || "http://localhost:3000"` 回退并拼 `returnTo=${encodeURIComponent("/teams")}`；删除 `inviteMembers` 内 `baseUrl` 变量（`service.ts:338`），`service.ts:430-433` 两处裸拼接改为调用 `buildInviteLink(Boolean(row.row.invitedUserId))`（design D4）
- [x] 1.3 机械核对 + 重构: grep 确认 `service.ts` 无 `${baseUrl}/login`、`${baseUrl}/register` 裸拼接残留；`cd web && bun test` 全量绿（台账三条单测转绿）

## 2. 展示邀请区（Req1，e2e）

- [x] 2.1 Write failing test: `inbox: pending invite renders card with ISO expiry`——fixture：`fixtureUser` 建号、API 建团、API 邀请后经 `requireLoopbackPostgresUrl` 通道回填 `expiresAt = now + 3 天`并读回精确值；断言可见文本含 "Neon Ravens"、`data-testid="invite-expires"` 的 `data-expires` 等于读回值的 ISO UTC 日期、该项含「接受」按钮、不含「拒绝」按钮；确认 red 原因为邀请区组件不存在
- [x] 2.2 Write failing tests: `inbox: card renders alongside existing team dashboard`（先入团再受另一团邀请，断言面板与邀请区并存）、`inbox: expired invitation is not rendered`（回填 `expiresAt` 到过去，断言无邀请区）；对改动前基线确认 red（组件不存在）
- [x] 2.3 Implement: `pageData.ts` 新增 `loadPendingInvitations(userId)`（查邮箱并调 `listMyInvitations`）；`(main)/teams/page.tsx` 注入 props；`TeamsClient.tsx` 新增邀请区组件（单容器、每条邀请一项）挂顶层，每项含团队名、`data-testid="invite-expires"` 与 `data-expires`（`expiresAt` 的 ISO UTC 日期）、「接受」按钮；i18n 新增键 `teams.invites.title`、`teams.invites.accept`、`teams.invites.expires`（en/zh）
- [x] 2.4 Confirm green: 2.1–2.2 三用例转绿；未绿则修实现

## 3. 接受邀请（Req2，e2e）

- [x] 3.1 Write failing tests: `accept: success joins team and card disappears`（无团队单邀请，接受后断言团队面板渲染、邀请区消失）、`accept: blocked when already in a team (409 toast)`（断言 `teams.err.leaveBeforeAccept` 文案）、`accept: blocked for unverified email invitee (403 toast)`（断言 `teams.err.verifyEmailFirst` 文案）；对改动前基线确认 red（邀请区不存在，无从点击）
- [x] 3.2 Write failing tests: `accept: invitation expiring after render shows expired toast`（渲染后回填过期再点击，断言 `teams.err.inviteExpired`）、`accept: disbanded team invitation shows notActive toast`（API 解散后断言邀请仍展示、点击断言 `teams.err.notActive`）、`accept: accepting one invitation keeps the other card`（两项邀请接受其一，另一项仍在；不做顺序断言）；对改动前基线确认 red
- [x] 3.3 Implement: 「接受」按钮经 `teamApi` 调 `POST /api/invitations/{id}/accept`；成功后 `router.refresh()`（design D6）；失败 toast 走既有本地化映射（design D5，零后端改动）
- [x] 3.4 Confirm green: 3.1–3.2 六用例转绿；未绿修 UI 层，不改后端校验

## 4. 邮件直达链路（Req3，e2e）

- [x] 4.1 Write failing tests: `deep link: login with returnTo=%2Fteams lands on /teams`（浏览器导航真实 URL `/login?returnTo=%2Fteams`，登录后断言落 `/teams` 且邀请区可见）、`deep link: register with returnTo=%2Fteams lands on /teams`（UI 表单经 `/register?returnTo=%2Fteams` 注册，落地后断言邀请区可见；注册后未验证邮箱，点接受断言 `teams.err.verifyEmailFirst` 拦截）；对改动前基线确认 red（断言邀请区可见失败）
- [x] 4.2 Confirm green: 两用例随组 2/3 组件转绿（returnTo 机制为既有能力，钉固回归，review 第 1 轮 S5）；未绿排查链接拼接与 returnTo 传递，不改 `sanitizeAuthReturnTo`
- [x] 4.3 同步 `web/features/team-management.feature`：按 spec.md 三个 Requirement 补中文场景（英文关键词），与既有场景风格一致

## 5. 收尾验证

- [x] 5.1 `cd web && npm run typecheck` 通过
- [x] 5.2 `cd web && npm run lint` 通过
- [x] 5.3 `cd web && bun test` 全量绿（防 UI 改动引入单测回归）
- [x] 5.4 `cd web && npm run test:e2e` 全量绿（含既有 teams/profile spec 无回归）
- [x] 5.5 更新 test-plan.md 台账：全部行 🔴 red → 🟢 green
- [x] 5.6 核对 feature 文件场景与 specs/team-invitation-inbox/spec.md 一一对应，无遗漏
