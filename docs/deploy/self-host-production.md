# 云服务器自建部署清单（Web + Postgres）

[English](./self-host-production.en.md)

本 fork 的部署：**自建 Postgres + Node 跑本仓 `web/`**。Cloudflare Workers 层（`wrangler.jsonc`、`worker.ts`、OpenNext 配置与依赖）已在 self-host cutover 中整层删除；Neon + Hyperdrive 是直接上游 `missuo/tokens` 的历史拓扑。

相关：本地开发栈 `docs/local-dev-database.md`、`docs/deploy/local-orbstack-compose.md`（OrbStack Compose，仅本地 dev）。生产容器化资产在 `docs/deploy/docker/prod/`（Dockerfile + compose + runbook，编排可重复化）；本文件是上线前必须满足的条件清单，两者配合使用。Vercel Hobby 是另一条路径（`docs/deploy/vercel/`），不改本清单，也不改 `docs/deploy/docker/prod/`。

## 结论

外网用户用**同一套上游 tokens CLI**（不改二进制）指向本站 HTTPS API 后，登录、上报、Leaderboard 与 Team（建团、角色、用户名邀请、Teamboard）可用。

新自建库是**独立空库**：`tokens.ci` 的账号、`tt_` token、历史用量不会过来。用户须在本站重新注册、重新 device login。目前没有上游数据/账号迁移方案。

## Blocker（缺一条就不可用或不安全）

| # | 条件 | 依据 | 不满足的后果 |
|---|---|---|---|
| 1 | 公网 **HTTPS** 反代 + 证书 | CLI device flow 只接受 HTTPS；HTTP 仅 loopback（`cli/tokens-cli/src/auth.rs:246-249`）。生产会话 cookie 仅 `NODE_ENV=production` 标 `Secure`（`web/src/lib/auth/session.ts`） | CLI 拒绝打开 verification URL；HTTP 下会话 cookie 落不了 |
| 2 | `NEXT_PUBLIC_URL=https://你的域名` | device `verificationUrl`、验证信、邀请链接都按它拼，默认 `http://localhost:3000`（`web/src/app/api/auth/device/route.ts`、`web/src/lib/auth/emailTokens.ts`、`web/src/lib/teams/service.ts`）；CSRF 也按它放行本站 Origin（`web/src/lib/auth/requestSession.ts`）；自品牌清理起，OG 卡片、embed 徽章、法律页与 og:url 的站点身份也全部由它派生（`web/src/lib/site.ts`） | CLI 打印的授权链接指向 localhost；邮件/邀请链接错；OG 卡片与 embed 徽章显示错误域名 |
| 3 | 用户侧 `TOKENS_API_URL=https://你的域名` | 默认固定 `https://tokens.ci`（`auth.rs:215-217`） | login / submit 仍进上游，本站榜是空的 |
| 4 | 既有 `tokens.ci` 用户**先退出再登录** | `credentials.json` 只存 `token`/`username`，不存 API 基址；`tokens login` 发现凭据直接返回（`auth.rs:338-351`） | 带上游 token 打本站 `/api/submit` → **401** |
| 5 | 自建库跑本 fork 迁移到 **0027** | `0024` 邮箱密码认证、`0025` teams/groups、`0026` 邀请 `group_id`、`0027` 私密模式与读令牌 | 没有邮箱认证、Team 表或私密开关 |

### 用户侧迁移口令（写进上线公告）

```bash
tokens logout                                        # 4：清掉 tokens.ci 凭据
TOKENS_API_URL=https://你的域名 tokens login          # 开 https://你的域名/device 授权
TOKENS_API_URL=https://你的域名 tokens submit
```

`TOKENS_API_TOKEN` 同理：指错站就 401。**双站并存**（同时用 tokens.ci 与本站）现成 CLI 做不到：`TOKENS_CONFIG_DIR` 可隔离两套配置目录，但没有 endpoint profile；要双站需先改 CLI，不能只靠部署文档。

## 自建运行时的既定事实（cutover 已落地）

| 能力 | 现状 |
|---|---|
| DB 连接 | 仅 `DATABASE_URL`，进程级单例池（默认 `max=5`，`DATABASE_POOL_MAX` 1..5 可调）；TLS 由 `DATABASE_SSL` 控制，生产默认 `require` |
| 每日维护 | `POST /api/cron/refresh-social-links`（Bearer `CRON_SECRET`）：同步执行社交链接刷新 + 过期邮件 token 清理 + `expireInvitations`；全成功 200，任一失败 500（调度器按非 2xx 重试；任务均幂等） |
| 登录/注册限流 | 进程内固定窗口 10 次/60s/IP（`lib/auth/rateLimit.ts`）；反代必须覆写 `X-Forwarded-For`；多实例需共享存储 |
| 邮件 | 配置 `SMTP_HOST` 或 `RESEND_API_KEY`，并设置 `EMAIL_FROM`。SMTP 优先；均未配置时只记录日志 |
| 缓存 | Next 默认 cache handler（`.next/cache` + 内存）；无边缘 HTML 缓存，OG/embed 每次回源渲染 |

## Team 可用性分级

| 能力 | 条件 |
|---|---|
| 建团 / 角色 / 用户名邀请 / Teamboard / 榜上 Team·Group 列 | 库迁到 0027 + Web 起来即可 |
| 邮件邀请发信 | 需 SMTP 或 Resend，以及 `EMAIL_FROM`；否则邀请落库但对方收不到 |
| 按邮箱邀请的接受 | 要求被邀请人 `emailVerifiedAt`，没验证信会 403 |
| 邀请过期 | 挂系统 cron 调维护端点（见上） |

## 已验证 / 未验证

**已验证（2026-09-16，本机 Compose Postgres）**

- `bun run lint`、`bun run typecheck`（纯 `tsc --noEmit`）、`bun run build`（无 `DATABASE_URL`）全绿。
- `next start` 活库：核心页面 200，`POST /api/submit` 带伪造 token → 401（查库）；死库（空端口）：同一请求 → 500。证明生产路径只走 `DATABASE_URL`。
- Compose `next dev`（无 CF env）照常工作。
- `test:migrations`、`test:teams` 通过；Playwright 回归 10/10（`tests/e2e/reports/html/playwright-report-self-host-cutover-*`）。
- 限流实测：同一 IP 第 11 次登录请求起 429。

**未验证**

- 外网 HTTPS + 真实域名 + 外网 CLI 端到端（只能上线时验）。

## 上线步骤（顺序执行）

1. 云服务器装 Postgres 16，建库建号；不要用 Compose 的 `tokens/tokens` 口令。
2. 跑本仓迁移到 0027：**生产库只执行 `DATABASE_URL=… bun run db:migrate`（`drizzle-kit migrate`）**。不要对云上库跑 `bun run test:migrations`——它会执行 `scripts/check-migrations.ts`（在事务里插入回放数据，虽 ROLLBACK，但会拿锁、跑断言，是验证工具不是迁移工具）。`test:migrations` 只对本地 Compose 或一次性隔离验证库执行。
3. 反代 HTTPS；环境：`NODE_ENV=production`、`NEXT_PUBLIC_URL=https://你的域名`、`DATABASE_URL=…`、`DATABASE_SSL` 按 TLS 实配（无 TLS 用 `disable`）、`CRON_SECRET`（随机长串）。反代必须覆写 `X-Forwarded-For`。可选：`CONTACT_EMAIL`（法律页联系邮箱；未配置则法律页只显示站点链接，不渲染 mailto）、SMTP 或 `RESEND_API_KEY`，以及 `EMAIL_FROM`（验证与邀请邮件）。
4. `next build && next start`，或用 `docs/deploy/docker/prod/` 的 compose 栈（`up -d --build` 后在 web 容器内 `bun run --cwd web db:migrate` 跑迁移，runbook 见该目录 README）。
5. 系统 cron（同机 loopback）：`curl -fsS -X POST http://127.0.0.1:3000/api/cron/refresh-social-links -H "Authorization: Bearer $CRON_SECRET"`，非 2xx 时告警/重试。
6. 端到端验收（见下）。

## 验收（外网，不是 localhost）

- [ ] `TOKENS_API_URL=https://域名 tokens login` 打印 `https://域名/device` 链接和 user code，浏览器输入 code 授权后拿到本库 `tt_` token
- [ ] `TOKENS_API_URL=https://域名 tokens submit` 返回成功，本站 Leaderboard 出现该用户用量（与 login 同 shell 则需整段 export，CLI 凭据不存 API 基址）
- [ ] 未验证邮箱的用户按邮箱被邀请时接受被拒（403），验证后接受成功（配了 Resend 的前提下）
- [ ] 用户名邀请全流程（建团 → 邀请 → 接受 → Teamboard 选人 → 榜列显示 Team/Group）
- [ ] 过期邀请被定时任务标记 expired（cron 返回 200 且 `expiredInvitations` 计数正确）
- [ ] `tokens.ci` 老用户未 logout 直接 submit → 本站 401（确认拦截，不是误收上游数据）
- [ ] 登录接口同一 IP 第 11 次请求起 429


## 待开发项（不属于部署，属于缺口）

1. **CLI endpoint profile / `TOKENS_CONFIG_DIR` 双站方案**：允许 tokens.ci 与自建站并存。目前是单凭据单基址。

### SMTP 邮件

配置 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE` 和 `EMAIL_FROM`。需要认证时，同时配置 `SMTP_USER` 与 `SMTP_PASS`。QQ 邮箱使用 `smtp.qq.com` 和 465 端口；`SMTP_PASS` 是授权码，不是登录密码。QQ 邮箱会拒收 `EMAIL_FROM` 与 `SMTP_USER` 不一致的邮件。465 端口必须设置 `SMTP_SECURE=true`。`SMTP_SECURE=false` 且服务器不提供 STARTTLS 时，凭据会明文传输。运行 `nc -z smtp.qq.com 465` 检查出网。个人 QQ 账号有每日发信限额。
