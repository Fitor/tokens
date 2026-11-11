## ADDED Requirements

### Requirement: 受邀人查看待处理邀请

`/teams` 页必须渲染一个邀请区，显示当前用户名下全部 `pending` 且未过期的邀请。每条邀请渲染为邀请区内的一项，必须显示目标团队名和到期日期。每项只提供「接受」操作，不提供「拒绝」操作。不存在待处理邀请时，页面不得渲染邀请区。邀请区渲染不依赖用户的团队归属状态。目标团队已解散的邀请照常展示，界面不加区分提示；接受时由服务端阻断。

#### Scenario: 有待处理邀请时显示邀请区

- **GIVEN** 用户 `mikoto` 名下有一条 `pending` 邀请，目标团队 "Neon Ravens"，`expiresAt` 为当前时间加 3 天
- **WHEN** `mikoto` 打开 `/teams`
- **THEN** 页面渲染邀请区，可见文本包含 "Neon Ravens"，该项的到期元素 `data-testid="invite-expires"` 的 `data-expires` 等于该 `expiresAt` 的 ISO UTC 日期（期望值由测试计算），且该项含「接受」按钮、不含「拒绝」按钮

#### Scenario: 已在团队时邀请区仍显示

- **GIVEN** 用户 `mikoto` 已属于团队 "Sky Wolves"，名下另有 "Neon Ravens" 的一条 `pending` 邀请
- **WHEN** `mikoto` 打开 `/teams`
- **THEN** 页面同时渲染 "Sky Wolves" 团队面板和含 "Neon Ravens" 一项的邀请区

#### Scenario: 过期邀请不渲染

- **GIVEN** 用户 `mikoto` 名下只有一条已过期的邀请
- **WHEN** `mikoto` 打开 `/teams`
- **THEN** 页面不渲染邀请区

### Requirement: 受邀人接受邀请

受邀人点「接受」后，系统必须调用 `POST /api/invitations/{id}/accept`。接受成功后，页面必须刷新，该条邀请从邀请区移除。邀请区仅当无剩余待处理邀请时消失。接受失败时，界面必须显示该错误对应的既有本地化文案，邀请区状态由服务端返回结果决定。

#### Scenario: 接受成功入团

- **GIVEN** 无团队的 `mikoto` 在 `/teams` 的邀请区看到 "Neon Ravens" 一项，名下无其他邀请
- **WHEN** `mikoto` 点「接受」
- **THEN** `POST /api/invitations/{id}/accept` 返回 200，页面刷新为 "Neon Ravens" 团队面板，无剩余待处理邀请，整个邀请区消失

#### Scenario: 多条邀请时接受其一

- **GIVEN** `mikoto` 名下有 "Neon Ravens" 和 "Sky Wolves" 两条 `pending` 邀请
- **WHEN** `mikoto` 接受 "Neon Ravens"
- **THEN** "Neon Ravens" 一项从邀请区移除，"Sky Wolves" 一项仍显示

#### Scenario: 已在团队时接受被阻断

- **GIVEN** `mikoto` 已属于 "Sky Wolves"，名下有 "Neon Ravens" 的 `pending` 邀请
- **WHEN** `mikoto` 点「接受」
- **THEN** 界面显示 `teams.err.leaveBeforeAccept` 对应的本地化提示，邀请区该项保留

#### Scenario: 未验证邮箱时接受被阻断

- **GIVEN** `mikoto` 未验证邮箱，名下有一条按邮箱地址发出的 `pending` 邀请
- **WHEN** `mikoto` 点「接受」
- **THEN** 界面显示 `teams.err.verifyEmailFirst` 对应的本地化提示，`team_members` 表不新增行

#### Scenario: 页面停留期间邀请过期

- **GIVEN** `mikoto` 打开 `/teams` 时看到一条 `pending` 邀请，该邀请在其停留期间到达 `expiresAt`
- **WHEN** `mikoto` 点「接受」
- **THEN** 界面显示 `teams.err.inviteExpired` 对应的本地化提示，`team_members` 表不新增行

#### Scenario: 目标团队已解散时接受被阻断

- **GIVEN** `mikoto` 名下有一条 `pending` 邀请，其目标团队状态为 `disbanded`
- **WHEN** `mikoto` 打开 `/teams` 并点「接受」
- **THEN** 邀请区照常展示该邀请（无团队状态区分），点击后界面显示 `teams.err.notActive` 对应的本地化提示，`team_members` 表不新增行

### Requirement: 邀请邮件链接携带回跳参数

系统必须按受邀人账号状态构造邀请邮件链接。已注册账号的链接必须是 `{NEXT_PUBLIC_URL}/login?returnTo=%2Fteams`。未注册邮箱的链接必须是 `{NEXT_PUBLIC_URL}/register?returnTo=%2Fteams`。环境未设置 `NEXT_PUBLIC_URL` 时，链接主机必须回退到 `http://localhost:3000`。

#### Scenario: 已注册账号收到登录回跳链接

- **GIVEN** 环境设置 `NEXT_PUBLIC_URL=https://tokens.example.com`，"Neon Ravens" 的 admin 邀请已注册账号 `mikoto`
- **WHEN** 系统发送邀请邮件
- **THEN** 邮件正文中的链接为 `https://tokens.example.com/login?returnTo=%2Fteams`

#### Scenario: 未注册邮箱收到注册回跳链接

- **GIVEN** 环境设置 `NEXT_PUBLIC_URL=https://tokens.example.com`，admin 按邮箱地址邀请一个未注册地址
- **WHEN** 系统发送邀请邮件
- **THEN** 邮件正文中的链接为 `https://tokens.example.com/register?returnTo=%2Fteams`

#### Scenario: 未配置站点地址时回退本地默认

- **GIVEN** 环境未设置 `NEXT_PUBLIC_URL`
- **WHEN** 系统发送邀请邮件
- **THEN** 邮件正文中的链接以 `http://localhost:3000` 开头，路径和查询参数不变

#### Scenario: 登录成功后落到团队页

- **GIVEN** `mikoto` 从邀请邮件进入 `/login?returnTo=%2Fteams`
- **WHEN** `mikoto` 登录成功
- **THEN** 浏览器跳转到 `/teams`，邀请区可见

#### Scenario: 注册成功后落到团队页

- **GIVEN** 一个未注册邮箱持有 `pending` 邀请，邮件链接为 `/register?returnTo=%2Fteams`
- **WHEN** 该邮箱用此链接完成注册
- **THEN** 浏览器落到 `/teams`，邀请区可见；账号此时未验证邮箱，点「接受」时按「未验证邮箱」场景被拦截
