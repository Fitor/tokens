## ADDED Requirements

### Requirement: 传输层按环境变量优先级选择

发送方必须在发送时按以下优先级选择传输层。配置了 `SMTP_HOST` 且值为非空字符串时使用 SMTP 传输层。空字符串的 `SMTP_HOST` 视为未配置。否则，配置了 `RESEND_API_KEY` 时使用 Resend HTTP 传输层。两者都未配置时不发送，记录一条跳过日志。`SMTP_HOST` 与 `RESEND_API_KEY` 同时配置时必须选择 SMTP。`SMTP_PORT` 缺失、不是数字，或解析结果不在 1-65535 范围内时取 587。`SMTP_SECURE` 只接受字符串 `true`/`false`（大小写不限），默认 false。值为 false 时，服务器支持 STARTTLS 就使用 STARTTLS。`SMTP_USER` 与 `SMTP_PASS` 可选。两者同时配置才启用 SMTP 认证，其余组合一律忽略认证。部署文档必须写明两点：端口 465 必须配置 `SMTP_SECURE=true`；`SMTP_SECURE=false` 且服务器不提供 STARTTLS 时凭据明文传输。

#### Scenario: 只配置 SMTP_HOST 时选择 SMTP 传输层
- **GIVEN** 环境变量为 `SMTP_HOST=smtp.qq.com`、`SMTP_PORT=465`、`SMTP_SECURE=true`、`SMTP_USER=user@qq.com`、`SMTP_PASS=code`，且未配置 `RESEND_API_KEY`
- **WHEN** 解析传输层
- **THEN** 结果为 SMTP 传输层。主机为 `smtp.qq.com`，端口为 `465`，启用隐式 TLS，认证凭据为 `user@qq.com`/`code`

#### Scenario: 两者都配置时选择 SMTP
- **GIVEN** 环境变量同时含 `SMTP_HOST=smtp.qq.com` 与 `RESEND_API_KEY=re_xxx`
- **WHEN** 解析传输层
- **THEN** 结果为 SMTP 传输层

#### Scenario: 只配置 RESEND_API_KEY 时选择 Resend
- **GIVEN** 环境变量为 `RESEND_API_KEY=re_xxx`，且未配置 `SMTP_HOST`
- **WHEN** 解析传输层
- **THEN** 结果为 Resend 传输层

#### Scenario: 空字符串 SMTP_HOST 视为未配置
- **GIVEN** 环境变量为 `SMTP_HOST=`（空字符串）与 `RESEND_API_KEY=re_xxx`
- **WHEN** 解析传输层
- **THEN** 结果为 Resend 传输层

#### Scenario: 两者都未配置时跳过发送
- **GIVEN** 环境变量既无非空 `SMTP_HOST` 也无 `RESEND_API_KEY`
- **WHEN** 调用 `sendEmail(to, subject, text)`
- **THEN** 不发起任何网络发送。输出一条错误日志，日志包含 `SMTP_HOST` 与 `RESEND_API_KEY` 字样及主题原文。调用正常 resolve

#### Scenario: 非法端口回退默认值
- **GIVEN** `SMTP_HOST` 已配置，且 `SMTP_PORT` 依次取 `abc`、`0`、`70000`、空字符串
- **WHEN** 解析传输层
- **THEN** 四种取值下结果均为 SMTP 传输层，端口取 587

#### Scenario: 部署文档包含端口配对与明文警示
- **GIVEN** apply 完成后的仓库
- **WHEN** 检索 `docs/deploy/docker/prod/.env.example`、`docs/deploy/self-host-production.md`、`docs/deploy/self-host-production.en.md`
- **THEN** 三个文件各自包含 465 端口配 `SMTP_SECURE=true` 的警示，以及 `SMTP_SECURE=false` 且服务器不提供 STARTTLS 时凭据明文传输的说明

### Requirement: SMTP 传输层完成发送且失败不外溢

选择 SMTP 传输层时，发送方必须经 nodemailer 发送。信封为 `from`=`EMAIL_FROM`、`to`、`subject`、纯文本 `text`。`EMAIL_FROM` 未配置时不得发起发送，必须记录跳过日志。发送方必须捕获并记录 SMTP 层的任何失败（连接拒绝、认证拒绝、TLS 错误），随后 resolve。失败不得向调用方 reject。

#### Scenario: SMTP 正常路径发送预期信封
- **GIVEN** 传输层为 SMTP，且 `EMAIL_FROM=Tokens <noreply@example.com>`
- **WHEN** `sendVerificationEmail(to, link)` 执行完成
- **THEN** nodemailer 收到一次发送调用。from 为 `Tokens <noreply@example.com>`，to 为收件人地址，subject 为 `Verify your Tokens email`，text 正文含验证链接

#### Scenario: SMTP 失败不外溢
- **GIVEN** 传输层为 SMTP，且 nodemailer 的发送以连接错误 reject
- **WHEN** `sendEmail` 执行
- **THEN** 返回的 promise resolve，不得 reject。输出一条错误日志

#### Scenario: 缺少 EMAIL_FROM 时跳过 SMTP 发送
- **GIVEN** `SMTP_HOST` 已配置，且 `EMAIL_FROM` 未配置
- **WHEN** 调用 `sendEmail`
- **THEN** 不发起 SMTP 连接。输出一条指明缺失配置的错误日志

### Requirement: 主题清洗在发送入口统一执行

发送方必须在 `sendEmail` 入口、任何日志与发送之前，把主题中的每个 CR（U+000D）与每个 LF（U+000A）各替换为一个空格。该清洗与传输层选择无关，两种传输层都适用。

#### Scenario: SMTP 路径主题 CRLF 替换为空格
- **GIVEN** 传输层为 SMTP。团队名为 `Foo\r\nBcc: attacker@example.com`（trim 后仍含内部 CRLF）
- **WHEN** `sendTeamInviteEmail(to, teamName, link)` 执行
- **THEN** 实际发送的 subject 为 `You're invited to Foo  Bcc: attacker@example.com on Tokens`（`Foo` 与 `Bcc` 之间为两个空格），不含 CR 与 LF

#### Scenario: Resend 路径主题 CRLF 替换为空格
- **GIVEN** 只配置 `RESEND_API_KEY`，未配置 `SMTP_HOST`。团队名为 `Foo\r\nBcc: attacker@example.com`
- **WHEN** `sendTeamInviteEmail(to, teamName, link)` 执行
- **THEN** POST 主体的 subject 为 `You're invited to Foo  Bcc: attacker@example.com on Tokens`（两个空格）

#### Scenario: 不含 CRLF 的主题逐字不变
- **GIVEN** 主题为 `You're invited to 平台组 on Tokens`，不含 CR 与 LF
- **WHEN** 清洗执行
- **THEN** 主题逐字不变，无空格插入

#### Scenario: 跳过日志同样得到清洗后的主题
- **GIVEN** 环境变量既无非空 `SMTP_HOST` 也无 `RESEND_API_KEY`。团队名含内部 CRLF
- **WHEN** `sendTeamInviteEmail(to, teamName, link)` 执行并命中跳过分支
- **THEN** 跳过日志中的主题不含 CR 与 LF

### Requirement: Resend 传输层行为保持不变

除「主题清洗在发送入口统一执行」外，只配置 `RESEND_API_KEY` 与 `EMAIL_FROM` 时，发送方必须保持现有行为。向 `https://api.resend.com/emails` 发送一次 HTTP POST，携带 bearer 授权与 JSON 主体 `{ from, to: [to], subject, text }`。HTTP 响应非成功状态时记录日志，不得抛出。`RESEND_API_KEY` 已配置而 `EMAIL_FROM` 缺失时跳过发送并记录日志，与现状一致。

#### Scenario: Resend 正常路径发送既有载荷
- **GIVEN** 环境变量为 `RESEND_API_KEY=re_xxx` 与 `EMAIL_FROM=Tokens <noreply@example.com>`，且未配置 `SMTP_HOST`
- **WHEN** `sendPasswordResetEmail(to, link)` 执行完成
- **THEN** 向 `https://api.resend.com/emails` 发送一次 POST。`Authorization` 头为 `Bearer re_xxx`。主体为 `{ from: "Tokens <noreply@example.com>", to: [<to>], subject: "Reset your Tokens password", text: <含链接> }`

#### Scenario: Resend 拒绝不外溢
- **GIVEN** 传输层为 Resend，且 API 响应 HTTP 422
- **WHEN** `sendEmail` 执行
- **THEN** promise resolve。输出一条记录状态码的日志。调用方不受影响

#### Scenario: Resend 网络层失败不外溢
- **GIVEN** 只配置 `RESEND_API_KEY`，且 fetch 以网络错误 reject（无出网）
- **WHEN** `sendEmail` 执行
- **THEN** promise resolve。输出一条错误日志。调用方不受影响
