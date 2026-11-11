## 1. 传输层选择器（纯函数，TDD）

- [ ] 1.1 Write failing tests: test-plan 中 6 条选择场景——`selection: smtp host alone selects smtp transport`、`selection: both configured prefers smtp`、`selection: resend key alone selects resend`、`selection: empty smtp host treated as unset`、`selection: nothing configured skips send with log`、`selection: invalid port falls back to 587`（断言失败原因：`send.ts` 尚无解析函数导出）
- [ ] 1.2 Implement: `send.ts` 导出传输层解析纯函数（优先级 SMTP > Resend > 跳过；空字符串 `SMTP_HOST` 视为未配置；`SMTP_PORT` 缺失、非数字或不在 1-65535 范围取 587；`SMTP_SECURE` 只接受 `true`/`false` 大小写不限、默认 false；`SMTP_USER`+`SMTP_PASS` 同时存在才启用认证）使 1.1 通过
- [ ] 1.3 Refactor; full suite stays green

## 2. Resend 路径特征化（经新接缝，行为保持重构）

- [ ] 2.1 Write failing tests: test-plan 中 3 条 Resend 场景——`resend: happy path posts existing payload`、`resend: rejection contained and logged`、`resend: network failure contained and logged`（断言失败原因：测试经重构后的传输层分发接缝（解析函数选中的 Resend 传输与注入 fetch）调用，该接缝尚不存在）
- [ ] 2.2 Implement: 按设计决策 1、5 重构 `sendEmail` 为解析 + 传输分发的结构（键控记忆化、惰性单例接口、`sendInBackground` 原样保留）。行为逐字节保持现状，使 2.1 通过
- [ ] 2.3 Refactor; full suite stays green（此时不含清洗，第 3 组再引入）

## 3. 主题清洗（入口统一，TDD）

- [ ] 3.1 Write failing tests: test-plan 中 4 条清洗场景——`sanitize: smtp path replaces crlf with spaces`、`sanitize: resend path replaces crlf with spaces`（期望串精确为 `You're invited to Foo  Bcc: attacker@example.com on Tokens`，两个空格）、`sanitize: subject without crlf unchanged`、`sanitize: skip log uses sanitized subject`（断言失败原因：`sendEmail` 入口尚无清洗）
- [ ] 3.2 Implement: `sendEmail` 入口、任何日志与发送之前，把主题中的每个 CR 与每个 LF 各替换为一个空格（design 决策 4）使 3.1 通过
- [ ] 3.3 Refactor; full suite stays green

## 4. SMTP 传输层（nodemailer，TDD）

- [ ] 4.1 Write failing tests: test-plan 中 3 条 SMTP 场景——`smtp: happy path sends expected envelope`、`smtp: failure contained and logged`、`smtp: missing EMAIL_FROM skips send`（断言失败原因：`nodemailer` 依赖与 SMTP 路径尚不存在；经 `mock.module("nodemailer", ...)` 注入）
- [ ] 4.2 Implement: 安装 `nodemailer` 与 `@types/nodemailer`；惰性单例 `createTransport({ host, port, secure, auth?, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 })`（design 决策 3）；`EMAIL_FROM` 缺失跳过并记录；任何 SMTP 失败捕获、记录并 resolve，使 4.1 通过
- [ ] 4.3 Refactor; full suite stays green

## 5. 部署文档与 .env.example

- [ ] 5.1 Write failing test: `docs: port pairing and plaintext warnings present`（以 `import.meta.dir` 为基读取三个文档文件，断言失败原因：文档尚无警示文字）
- [ ] 5.2 Implement: `docs/deploy/docker/prod/.env.example` 增加 SMTP 配置段（含 QQ 邮箱示例：`smtp.qq.com`、465、授权码不是登录密码、`EMAIL_FROM` 与 `SMTP_USER` 一致的 QQ 拒收行为表述）；`docs/deploy/self-host-production.md` 与 `.en.md` 更新邮件行，各写明：465 端口必须配 `SMTP_SECURE=true`；`SMTP_SECURE=false` 且无 STARTTLS 时凭据明文传输；出网 `smtp.qq.com:465` 可达检查（`nc -z`）；个人 QQ 账号日发信限额说明。使 5.1 通过
- [ ] 5.3 Refactor; full suite stays green

## 6. 打包冒烟与收尾

- [ ] 6.1 运行 `bun test`（全量）与 `bun run typecheck`，确认全绿
- [ ] 6.2 按 design 决策 7 验证打包：`next build` + `next start` 后实际发送一封 SMTP 信（本地 mailpit 容器或真实 QQ 账号）；若构建或运行失败，加 `serverExternalPackages: ["nodemailer"]` 到 `web/next.config.ts` 并重跑验证
- [ ] 6.3 更新本文件复选框与 test-plan 台账（🔴 → 🟢），确认 17 行全部 🟢 后交 verify
