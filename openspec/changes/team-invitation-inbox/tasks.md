## 1. 邀请链接构造（Req3，单测）

- [ ] 1.1 Write failing test: `web/src/lib/teams/inviteLink.test.ts` 三条用例——`invite link: registered account -> /login?returnTo=%2Fteams`、`invite link: unregistered email -> /register?returnTo=%2Fteams`、`invite link: NEXT_PUBLIC_URL fallback keeps path and query`（对齐 test-plan 台账；确认 red 原因为 `buildInviteLink` 不存在）
- [ ] 1.2 Implement: `service.ts` 新增纯函数 `buildInviteLink(baseUrl, hasAccount)`；`service.ts:430-433` 两处调用点各改一行（design D4）
- [ ] 1.3 Refactor; `cd web && bun test` 全量保持绿（3.1–3.3 转绿）

## 2. 待处理邀请展示（Req1，e2e）

- [ ] 2.1 Write failing test: `inbox: pending invite renders card with ISO expiry`（fixture：`fixtureUser` 建号、API 建团、API 邀请；断言 `data-testid="invite-expires"` 携带 `data-expires="2026-11-14"`、含「接受」按钮、不含「拒绝」按钮；确认 red 原因为组件不存在）
- [ ] 2.2 Implement: `pageData.ts` 新增 `loadPendingInvitations(userId)`（内部查邮箱并调 `listMyInvitations`）；`(main)/teams/page.tsx` 注入 props；`TeamsClient.tsx` 新增 `PendingInvitationsCard` 挂顶层；i18n 新增键 `teams.invites.title`、`teams.invites.accept`、`teams.invites.expires`（en/zh，需要 aria 标签时再补）
- [ ] 2.3 Write failing tests: `inbox: card renders alongside existing team dashboard`（先入团再受另一团邀请）、`inbox: expired invitation is not rendered`（DB 回填 `expiresAt` 到过去）
- [ ] 2.4 Confirm green: 2.3 两用例随 2.2 实现转绿；未绿则补实现；`cd web && npm run test:e2e` 本 spec 相关用例全绿

## 3. 接受邀请（Req2，e2e）

- [ ] 3.1 Write failing test: `accept: success joins team and card disappears`（无团队单邀请，接受后断言团队面板渲染、卡片消失）
- [ ] 3.2 Implement: 卡片「接受」按钮经 `teamApi` 调 `POST /api/invitations/{id}/accept`；成功后 `router.refresh()`（design D6）；失败 toast 走既有本地化映射（design D5，预期零后端改动）
- [ ] 3.3 Write failing tests: `accept: blocked when already in a team (409 toast)`、`accept: blocked for unverified email invitee (403 toast)`
- [ ] 3.4 Write failing tests: `accept: invitation expiring after render shows expired toast`（页面渲染后 DB 回填过期再点击）、`accept: disbanded team invitation shows notActive toast`（API 解散团队后照常展示并点击）
- [ ] 3.5 Write failing test: `accept: accepting one invitation keeps the other card`（两条邀请，接受其一后断言其余卡片仍显示；不做顺序断言）
- [ ] 3.6 Confirm green: 第 3 组全部用例转绿；未绿则修 UI 层，不改动后端校验

## 4. 邮件直达链路（Req3，e2e）

- [ ] 4.1 Write failing test: `deep link: login with returnTo=%2Fteams lands on /teams`（浏览器导航真实 URL；依赖组 2/3 组件存在后转绿；此用例钉固既有 returnTo 机制回归，review S5）
- [ ] 4.2 Write failing test: `deep link: register with returnTo=%2Fteams lands on /teams`（UI 表单注册，注册后未验证邮箱，点接受按 2.3 场景拦截）
- [ ] 4.3 Confirm green: 组 4 两用例转绿；如 red 排查 link 拼接与 returnTo 传递，不改 `sanitizeAuthReturnTo`
- [ ] 4.4 同步 `web/features/team-management.feature`：按 spec.md 三个 Requirement 补中文场景（英文关键词），与既有场景风格一致

## 5. 收尾验证

- [ ] 5.1 `cd web && npm run typecheck` 通过
- [ ] 5.2 `cd web && npm run lint` 通过
- [ ] 5.3 `cd web && npm run test:e2e` 全量绿（含既有 teams/profile spec 无回归）
- [ ] 5.4 更新 test-plan.md 台账：全部行 🔴 red → 🟢 green
- [ ] 5.5 核对 feature 文件场景与 specs/team-invitation-inbox/spec.md 一一对应，无遗漏
