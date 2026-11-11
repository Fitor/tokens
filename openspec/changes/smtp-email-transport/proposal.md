## Why

事务邮件（注册验证、密码重置、团队邀请）目前只有一条发送通道：Resend 云端 HTTP API。目标部署在局域网。局域网实例通常没有可用的发信域名，也可能没有到 Resend 的出网通道。此时 `send.ts` 跳过全部邮件，只记录一行日志。后果一：用户停留在未验证状态。后果二：按邮箱发出的团队邀请实际不可用。直连标准邮箱的 SMTP 能去掉这两个依赖。本提案选用 QQ 邮箱作参考后端。前提只有两个：局域网服务器能出网访问 `smtp.qq.com:465`，并持有一个 SMTP 授权码。

## What Changes

- 在唯一发送口 `sendEmail()`（`web/src/lib/email/send.ts`）下增加可选传输层：
  - 配置了 `SMTP_HOST` → 走 nodemailer SMTP（新路径）。
  - 只配置了 `RESEND_API_KEY` → 走现有 Resend HTTP 请求。行为不变。
  - 两者都未配置 → 维持现状。记录日志并跳过。
  - 两者都配置时 SMTP 优先。
- 新增环境变量：`SMTP_HOST`、`SMTP_PORT`（默认 587）、`SMTP_SECURE`（默认 false，465 端口配 true）、`SMTP_USER`、`SMTP_PASS`。`EMAIL_FROM` 由两种传输层共用。
- 保持 fire-and-forget 语义：SMTP 发送失败只记录日志并 resolve。它不回滚用户或令牌数据，也不阻塞触发它的 API 响应。
- 发送方在发送入口把主题中的每个 CR 与每个 LF 各替换为一个空格。清洗先于任何日志与发送，两种传输层共享。团队名只做 trim 与长度检查（`teams/service.ts:139-141`），内部 CRLF 能进入邀请邮件主题（`send.ts:85`）。SMTP 头部值含原始 CR/LF 属于注入形态数据。
- 新增依赖：`nodemailer` 与 `@types/nodemailer`。
- 文档改动：生产 `.env.example` 增加 SMTP 配置段（附 QQ 邮箱示例）。`docs/deploy/self-host-production.md` 及其英文版更新邮件条目。

范围外（探索阶段已确认）：未配置任何传输层时向日志打印验证链接。dev compose 增加 Mailpit 服务。自签名证书逃生口（QQ 邮箱使用 CA 签发证书）。邮件正文内容与 i18n 改动。

## Capabilities

### New Capabilities
- `email-transport`: 事务邮件发送。传输层可选（SMTP 或 Resend），由环境变量选择。失败语义保持 fire-and-forget。

### Modified Capabilities
<!-- openspec/specs/ 为空，没有需要改动的既有能力。 -->

## Impact

- `web/src/lib/email/send.ts`：传输层选择与 nodemailer 发送路径。这是唯一的代码核心。四个调用点（注册、找回密码、重发验证信、团队邀请）已经全部收口在这里。
- `web/package.json`：新增 `nodemailer` 与 `@types/nodemailer`。
- `web/next.config.ts`：可能改动。若 Next 16 打包 nodemailer 的 CommonJS 动态加载失败，则增加 `serverExternalPackages: ["nodemailer"]`。apply 阶段实测决定。
- `web/src/lib/email/send.test.ts`：新增。内容为传输层选择逻辑的单元测试。
- `docs/deploy/docker/prod/.env.example`、`docs/deploy/self-host-production.md`、`docs/deploy/self-host-production.en.md`：SMTP 环境变量与 QQ 邮箱配置说明。要点一：授权码不是登录密码。要点二：QQ 邮箱拒收 `EMAIL_FROM` 不等于 `SMTP_USER` 的邮件。通用 SMTP 服务器不必然如此。要点三：出网 `smtp.qq.com:465` 必须可达。
- 数据库、API 契约与 UI 不改动。Resend 路径与两种部署形态保持向后兼容。
