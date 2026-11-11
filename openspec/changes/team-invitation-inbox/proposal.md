## Why

管理员邀请已注册用户后，受邀人看不到任何待处理邀请，也没有接受邀请的入口。邀请一直停在 `pending` 状态，团队成员始终只有管理员一人。邀请邮件链接指向裸 `/login`，登录成功后落在默认页，页面上没有入口指向 `/teams`。

## What Changes

- `/teams` 页新增「待处理邀请」卡片。卡片显示团队名和到期日期，只提供「接受」操作。
- 卡片不提供「拒绝」操作。不想要的邀请保留到过期（发出后 7 天），期间卡片持续展示。
- 只要存在 `pending` 邀请就渲染卡片，不论用户是否已属于某个团队。用户已在某个团队时点「接受」，服务端返回 409。前端显示本地化错误提示。
- 邀请邮件链接追加 `returnTo=/teams` 参数。受邀人登录或注册后直接落到 `/teams`。
- 复用既有后端端点：`GET /api/me/invitations` 和 `POST /api/invitations/{id}/accept`。后端校验逻辑不变。
- 补充 `web/features/team-management.feature` 场景和对应 e2e 测试。

## Capabilities

### New Capabilities

- `team-invitation-inbox`: 受邀人在 `/teams` 页查看并接受待处理团队邀请的界面能力。

### Modified Capabilities

无。`openspec/specs/` 现有 `email-transport` 只覆盖邮件通道选择，不涉及邀请链接格式，本改动不触碰其需求。

## Impact

- `web/src/app/(main)/teams/page.tsx`：服务端加载当前用户的待处理邀请，作为 props 下发。
- `web/src/lib/teams/pageData.ts`：新增邀请列表加载函数（含按用户查询邮箱）。
- `web/src/components/teams/TeamsClient.tsx`：新增邀请卡片组件，挂在页面顶部，两个既有分支不变。
- `web/src/lib/teams/service.ts`：两处邮件链接拼接追加 `returnTo` 参数。
- `web/src/lib/i18n/t.ts`：新增约 4 个 en/zh 文案键。
- `web/features/team-management.feature`、`tests/e2e/`：新增场景和测试。
- 后端 API、数据库 schema、邮件发送通道不变。`decline` 端点保留，界面不使用。
