## Context

全部事务邮件收口在 `web/src/lib/email/send.ts`。三个文案包装函数（`sendVerificationEmail` / `sendPasswordResetEmail` / `sendTeamInviteEmail`）调用唯一的私有函数 `sendEmail(to, subject, text)`。该函数向 `https://api.resend.com/emails` 发送一次 `fetch`。`RESEND_API_KEY` 或 `EMAIL_FROM` 缺失时记录日志并跳过。发送是 fire-and-forget（`sendInBackground`）：失败记录日志并 resolve，不触碰调用方已提交的数据与 HTTP 响应。调用点共四个：注册、找回密码、重发验证信、团队邀请（`teams/service.ts:433`）。本仓库的测试为同目录 `*.test.ts`，运行于 `bun:test`，用 `mock.module` 注入依赖（见 `web/src/lib/auth/rateLimit.test.ts`）。

局域网自托管部署没有可用的发信域名。选定的发送路径是直连 QQ 邮箱 SMTP（`smtp.qq.com:465`，授权码认证，公网 CA 证书）。云上部署继续使用 Resend。

安全事实（已核实）。收件人地址经 `EMAIL_PATTERN` 检查（`register/route.ts:12`）。该模式排除空白字符，CRLF 无法存活。团队名只做 trim 与 100 字上限检查（`teams/service.ts:139-141`），内部 CRLF 存活，并经 `sendTeamInviteEmail` 进入邮件主题（`send.ts:85`）。Resend 是 HTTP API，非法头值的处置由服务端决定。SMTP 把 subject 当作协议头部值，原始 CR/LF 属于注入形态数据，发送方必须清洗。`EMAIL_PATTERN` 不排除其他控制字符（如 U+0001 至 U+0008）。这类字符可进入信封并被服务端拒发。属既有行为，本变更不改，记录为接受项。

## Goals / Non-Goals

**Goals:**
- 增加由环境变量选择的 SMTP 传输层，以 QQ 邮箱为参考后端。
- 保持 fire-and-forget 失败契约不变。任何发送失败不得 throw、reject 或影响调用方。
- 传输层为 Resend 时行为不变。
- 改动收敛在唯一收口点，外加依赖与文档。

**Non-Goals:**
- 不做 HTML 邮件、模板、正文 i18n。
- 未配置传输层时不向日志打印验证链接。保持「记录日志并跳过」。
- dev compose 不加 Mailpit 服务。需要时临时起容器。
- 不提供自签名证书逃生口。`tls.rejectUnauthorized` 保持 nodemailer 默认值。
- 不做连接池、队列、重试层。

## Decisions

1. **优先级：SMTP > Resend > 跳过。** 局域网实例显式配置 `SMTP_HOST` 表达了本地意图。云部署不会配置它。备选方案是 Resend 优先。否决理由：它会让自托管实例静默回落到自己明确配置要替代的云路径。选择逻辑在每次 `sendEmail` 调用时运行，解析结果做记忆化。记忆化按解析所用的环境变量取值组合键控。键变化时重新解析并重建 transporter。进程正常生命周期内环境变量不变，键控失效主要服务于测试。记忆化让 transporter 成为单例，同时模块加载阶段保持无副作用。Next.js 的模块实例化必须保持纯净。

2. **环境变量契约。** 变量为 `SMTP_HOST`、`SMTP_PORT`（默认 587）、`SMTP_SECURE`（`true`/`false`，大小写不限，默认 false）、`SMTP_USER` + `SMTP_PASS`（两者同时存在才启用认证）、`EMAIL_FROM`（两种传输层共用）。`SMTP_SECURE` 为 false 时，服务器提供 STARTTLS 就使用。端口解析：缺失、非数字，或解析结果不在 1-65535 范围时取 587，不在启动时崩溃。QQ 示例配置为 `SMTP_PORT=465`、`SMTP_SECURE=true`。

3. **nodemailer 选项。** 惰性单例 `createTransport({ host, port, secure, auth?, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 })`。不开连接池。理由：单实例团队规模的验证信、重置信、邀请信量级极低，局域网 SMTP 连接耗时毫秒级。设超时的原因：挂死的 socket 会让浮动 promise 与文件描述符永久存活。备选方案一，每次发送新建 transport 对象：否决，理由是重复解析环境变量与对象重建。共享单例省不掉连接与 TLS 握手，不开池时 nodemailer 每次 sendMail 都新建连接。备选方案二，连接池：否决，过度设计。

4. **主题清洗。** `sendEmail` 在入口把主题中的每个 CR 与每个 LF 各替换为一个空格。清洗先于任何日志与发送，两种传输层共享，跳过日志同样得到清洗后的主题。替换为空格而非直接删除，原因：保留词间边界，不改变可读文字。备选方案是只清洗 SMTP 路径。否决理由：同一数据（团队名）同样进入 Resend 的 JSON subject 字段。两种路径共用一次清洗，成本相同，行为更一致。发送方不清洗收件人与 from。`EMAIL_PATTERN` 已排除收件人地址中的空白字符。from 来自运维配置的环境变量，不来自用户输入。

5. **测试可注入性。** `send.ts` 导出解析函数，给定环境变量记录即可纯函数求值。测试经 `mock.module` 注入 nodemailer 模块或 `sendMail`，沿用 `rateLimit.test.ts` 的约定。Resend 路径测试 stub `global.fetch`。`send.test.ts` 按 `rateLimit.test.ts` 的约定在每个测试后恢复 `process.env`。键控记忆化让测试间的环境变更即时生效。四个文案包装函数不需要改动。

6. **依赖：`nodemailer` + `@types/nodemailer`。** 纯 JS，无重传递依赖，事实标准。手写 SMTP 协议直接否决，理由：TLS 与认证的正确性成本换不来任何收益。

7. **Next.js 打包风险在 apply 阶段处理。** nodemailer 以 CommonJS 动态加载传输实现。若 Next 16 服务端构建失败，在 `web/next.config.ts` 增加 `serverExternalPackages: ["nodemailer"]`。决策：先不加，以证据为准。验证方式：`next build` 与 `next start` 后实际发送一封信。理由：默认打包路径在多数 Next 应用可用，配置改动保持最小。这是 apply 阶段的验证任务，不是未决产品问题。

## Risks / Trade-offs

- [QQ 邮箱拒收 `EMAIL_FROM` 不等于认证账号 `SMTP_USER` 的邮件] → 文档在环境变量示例旁写明该约束。配置错误的后果是发送失败日志（失败包容语义已保证），不是服务中断。
- [授权码混淆（`SMTP_PASS` 是授权码，不是 QQ 登录密码）] → 文档在 env 示例内标注授权码。失败形态是首次发送时的认证拒绝日志，可见。
- [Next 打包 CommonJS 动态加载包的风险] → apply 阶段冒烟验证。缓解手段 `serverExternalPackages` 是一行配置，无行为面。
- [内部中继不提供 STARTTLS 且 `SMTP_SECURE=false`，凭据明文过网] → 文档写明该组合的后果与建议。实现不强制 requireTLS，属部署选择。
- [SMTP 失败不可见（fire-and-forget 让错误配置的实例继续「无邮件运行」）] → 日志行含传输层名称与错误。文档补一步验证流程：`nc -z smtp.qq.com 465`，再注册测试账号观察日志。
- [个人 QQ 账号有日发信限额] → 团队规模用量低于限额数个量级。文档作信息性说明。

## Migration Plan

部署顺序：合入代码 → `bun install` → 重建镜像 → 配置环境变量（`SMTP_*` 与 `EMAIL_FROM`）→ 重启。无数据库迁移，无 API 改动。回滚方式一：删除 `SMTP_HOST`，回落 Resend 或跳过。回滚方式二：回退提交。两者在发送进行中均安全，因为每次发送相互独立，失败不外溢。既有未验证用户在邮件通道可用后，经既有 resend-verification 流程恢复。

## Open Questions

无。范围、优先级、环境变量形态与 QQ 细节在探索阶段已定。唯一的条件项（`serverExternalPackages`）是带决策规则的 apply 阶段验证。
