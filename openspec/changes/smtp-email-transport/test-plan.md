## Test Plan

<!-- specs/email-transport/spec.md 的 17 个场景全部映射到具名测试。映射是下限不是上限： -->
<!-- apply 阶段可自由追加参数化用例与内部单元测试，无需在此登记。LIVE LEDGER：apply 期间 -->
<!-- 每行在其测试通过后由 🔴 red 翻为 🟢 green；verify 阻塞于任何遗留 red。 -->

| Requirement | Scenario | Test File | Test Name | Initial State |
|-------------|----------|-----------|-----------|---------------|
| specs/email-transport/spec.md → 传输层按环境变量优先级选择 | 只配置 SMTP_HOST 时选择 SMTP 传输层 | web/src/lib/email/send.test.ts | selection: smtp host alone selects smtp transport | 🔴 red |
| specs/email-transport/spec.md → 传输层按环境变量优先级选择 | 两者都配置时选择 SMTP | web/src/lib/email/send.test.ts | selection: both configured prefers smtp | 🔴 red |
| specs/email-transport/spec.md → 传输层按环境变量优先级选择 | 只配置 RESEND_API_KEY 时选择 Resend | web/src/lib/email/send.test.ts | selection: resend key alone selects resend | 🔴 red |
| specs/email-transport/spec.md → 传输层按环境变量优先级选择 | 空字符串 SMTP_HOST 视为未配置 | web/src/lib/email/send.test.ts | selection: empty smtp host treated as unset | 🔴 red |
| specs/email-transport/spec.md → 传输层按环境变量优先级选择 | 两者都未配置时跳过发送 | web/src/lib/email/send.test.ts | selection: nothing configured skips send with log | 🔴 red |
| specs/email-transport/spec.md → 传输层按环境变量优先级选择 | 非法端口回退默认值 | web/src/lib/email/send.test.ts | selection: invalid port falls back to 587 | 🔴 red |
| specs/email-transport/spec.md → 传输层按环境变量优先级选择 | 部署文档包含端口配对与明文警示 | web/src/lib/email/send.test.ts | docs: port pairing and plaintext warnings present | 🔴 red |
| specs/email-transport/spec.md → SMTP 传输层完成发送且失败不外溢 | SMTP 正常路径发送预期信封 | web/src/lib/email/send.test.ts | smtp: happy path sends expected envelope | 🔴 red |
| specs/email-transport/spec.md → SMTP 传输层完成发送且失败不外溢 | SMTP 失败不外溢 | web/src/lib/email/send.test.ts | smtp: failure contained and logged | 🔴 red |
| specs/email-transport/spec.md → SMTP 传输层完成发送且失败不外溢 | 缺少 EMAIL_FROM 时跳过 SMTP 发送 | web/src/lib/email/send.test.ts | smtp: missing EMAIL_FROM skips send | 🔴 red |
| specs/email-transport/spec.md → 主题清洗在发送入口统一执行 | SMTP 路径主题 CRLF 替换为空格 | web/src/lib/email/send.test.ts | sanitize: smtp path replaces crlf with spaces | 🔴 red |
| specs/email-transport/spec.md → 主题清洗在发送入口统一执行 | Resend 路径主题 CRLF 替换为空格 | web/src/lib/email/send.test.ts | sanitize: resend path replaces crlf with spaces | 🔴 red |
| specs/email-transport/spec.md → 主题清洗在发送入口统一执行 | 不含 CRLF 的主题逐字不变 | web/src/lib/email/send.test.ts | sanitize: subject without crlf unchanged | 🔴 red |
| specs/email-transport/spec.md → 主题清洗在发送入口统一执行 | 跳过日志同样得到清洗后的主题 | web/src/lib/email/send.test.ts | sanitize: skip log uses sanitized subject | 🔴 red |
| specs/email-transport/spec.md → Resend 传输层行为保持不变 | Resend 正常路径发送既有载荷 | web/src/lib/email/send.test.ts | resend: happy path posts existing payload | 🔴 red |
| specs/email-transport/spec.md → Resend 传输层行为保持不变 | Resend 拒绝不外溢 | web/src/lib/email/send.test.ts | resend: rejection contained and logged | 🔴 red |
| specs/email-transport/spec.md → Resend 传输层行为保持不变 | Resend 网络层失败不外溢 | web/src/lib/email/send.test.ts | resend: network failure contained and logged | 🔴 red |

## Coverage Notes

- 全部测试落在 `web/src/lib/email/send.test.ts`（仓库约定：`lib` 同目录 `*.test.ts`，`bun:test`，见 `web/src/lib/auth/rateLimit.test.ts`）。运行方式与该文件一致：`bun test`。
- 传输层选择场景直接对 `send.ts` 新导出的解析函数做纯求值（传入环境变量记录）。解析函数是本变更新增导出，当前不存在，故全部场景初始为 red。
- SMTP 场景经 `mock.module("nodemailer", ...)` 注入捕获 `sendMail` 参数的假实现；日志断言用 `bun:test` 的 `spyOn(console, "error")`。Resend 场景 stub `globalThis.fetch` 捕获请求。两者均沿用 rateLimit.test.ts 的 `mock.module`/afterEach 恢复模式；`process.env` 在每个测试后恢复（design 决策 5）。键控记忆化使测试间环境变更即时生效，无需额外重置钩子。
- 文档场景（第 7 行）是真正的代码测试：以 `import.meta.dir` 为基读取三个文档文件并断言警示文字存在，不依赖工作目录，无 N/A 项。
- red 的统一来源：`send.ts` 尚无解析函数导出、无 SMTP 路径、无主题清洗，测试在实现前必然失败（TDD 红绿重构顺序）。
