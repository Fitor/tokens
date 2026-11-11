# Self-hosted production checklist (Web + Postgres)

[中文](./self-host-production.md)

This fork runs **your Postgres and this repo's `web/` on Node**. The Cloudflare Workers layer (`wrangler.jsonc`, `worker.ts`, OpenNext config and dependencies) was removed in the self-host cutover. Neon + Hyperdrive is the old topology of upstream `missuo/tokens`.

Related: local database notes in `docs/local-dev-database.md`, and `docs/deploy/local-orbstack-compose.md` (OrbStack Compose, local dev only). Production container assets are in `docs/deploy/docker/prod/` (Dockerfile, compose, and a Chinese runbook). This file is the condition list that must pass before go-live. Use both. Vercel Hobby is a separate path (`docs/deploy/vercel/`); it does not change this checklist or `docs/deploy/docker/prod/`.

## Outcome

An external user points the **same upstream tokens CLI** (binary unchanged) at this site's HTTPS API. Login, submit, Leaderboard, and Team (create, roles, username invites, Teamboard) then work.

A new self-hosted database is an **empty database of its own**. Accounts, `tt_` tokens, and usage history from `tokens.ci` do not come over. Users register again on this site and run device login again. There is no upstream account or data migration.

## Blockers (miss one and the site is unusable or unsafe)

| # | Condition | Basis | If missing |
|---|---|---|---|
| 1 | Public **HTTPS** reverse proxy and certificate | CLI device flow accepts HTTPS only; HTTP is loopback only (`cli/tokens-cli/src/auth.rs:246-249`). The production session cookie is marked `Secure` only when `NODE_ENV=production` (`web/src/lib/auth/session.ts`) | CLI refuses the verification URL; the session cookie is not stored over HTTP |
| 2 | `NEXT_PUBLIC_URL=https://your-domain` | Device `verificationUrl`, verification mail, and invite links are built from it. Default is `http://localhost:3000` (`web/src/app/api/auth/device/route.ts`, `web/src/lib/auth/emailTokens.ts`, `web/src/lib/teams/service.ts`). CSRF also allows this site's Origin from it (`web/src/lib/auth/requestSession.ts`). Since the brand cleanup, OG cards, embed badges, legal pages, and og:url identity all derive from it (`web/src/lib/site.ts`) | The CLI prints a localhost authorization link; mail and invite links are wrong; OG cards and embed badges show the wrong domain |
| 3 | User-side `TOKENS_API_URL=https://your-domain` | Default is fixed at `https://tokens.ci` (`auth.rs:215-217`) | login / submit still hit upstream; this site's board stays empty |
| 4 | Existing `tokens.ci` users **log out, then log in** | `credentials.json` stores `token` / `username` only, not the API base. `tokens login` returns immediately when credentials exist (`auth.rs:338-351`) | An upstream token against this site's `/api/submit` returns **401** |
| 5 | Self-hosted database migrated to **0027** | `0024` email/password auth, `0025` teams/groups, `0026` invite `group_id`, `0027` private mode and read tokens | No email auth, Team tables, or private switch |

### User cutover commands (put these in the launch note)

```bash
tokens logout                                        # 4: clear tokens.ci credentials
TOKENS_API_URL=https://your-domain tokens login      # opens https://your-domain/device
TOKENS_API_URL=https://your-domain tokens submit
```

`TOKENS_API_TOKEN` is the same: the wrong site returns 401. **Using both sites at once** (tokens.ci and this site) is not possible with the current CLI. `TOKENS_CONFIG_DIR` can separate two config directories, but there is no endpoint profile. Dual-site use needs a CLI change. Deployment docs cannot provide it.

## Runtime facts already landed by the cutover

| Capability | Current behavior |
|---|---|
| DB connection | `DATABASE_URL` only. Process-wide singleton pool (default `max=5`, `DATABASE_POOL_MAX` adjustable in 1..5). TLS is controlled by `DATABASE_SSL`; production default is `require` |
| Daily maintenance | `POST /api/cron/refresh-social-links` (Bearer `CRON_SECRET`): refreshes social links, deletes expired email tokens, and runs `expireInvitations`, in that order. All success is 200; any failure is 500 (a scheduler retries non-2xx; the jobs are idempotent) |
| Login/register limit | In-process fixed window, 10 requests / 60s / IP (`lib/auth/rateLimit.ts`). The proxy must overwrite `X-Forwarded-For`. Multiple instances need shared storage |
| Mail | Configure `SMTP_HOST` or `RESEND_API_KEY`, and set `EMAIL_FROM`. SMTP takes priority. Unconfigured mail is log-only |
| Cache | Next's default cache handler (`.next/cache` plus memory). No edge HTML cache. OG and embed render from origin every time |

## Team availability

| Capability | Condition |
|---|---|
| Create team / roles / username invite / Teamboard / Team·Group columns | Database at 0027 and the web process up |
| Email invites actually send | Needs SMTP or Resend and `EMAIL_FROM`. Otherwise the invite is stored and the recipient gets nothing |
| Accepting an email invite | Requires the invitee's `emailVerifiedAt`. Without a verification mail this returns 403 |
| Invite expiry | A system cron must call the maintenance endpoint above |

## Verified / not verified

**Verified (2026-09-16, local Compose Postgres)**

- `bun run lint`, `bun run typecheck` (plain `tsc --noEmit`), and `bun run build` (no `DATABASE_URL`) were green.
- `next start` against a live database: core pages 200; `POST /api/submit` with a forged token returned 401 (it queried the database). Against a dead database (closed port) the same request returned 500. The production path uses only `DATABASE_URL`.
- Compose `next dev` (no Cloudflare env) still works.
- `test:migrations` and `test:teams` passed. Playwright regression was 10/10 (`tests/e2e/reports/html/playwright-report-self-host-cutover-*`).
- Rate limit checked: the 11th login request from the same IP returned 429.

**Not verified**

- Public HTTPS, a real domain, and an external CLI end to end. That can only be checked at go-live.

## Go-live order

1. Install Postgres 16 on the server, create the database and role. Do not reuse the Compose `tokens/tokens` password.
2. Migrate this repo's schema to 0027. **On the production database run only `DATABASE_URL=… bun run db:migrate` (`drizzle-kit migrate`).** Do not run `bun run test:migrations` against the cloud database. That runs `scripts/check-migrations.ts`, which inserts replay rows inside a transaction. It rolls back, but it takes locks and runs assertions. It is a checker, not a migrator. Run `test:migrations` only against local Compose or a throwaway database.
3. Put HTTPS in front. Set `NODE_ENV=production`, `NEXT_PUBLIC_URL=https://your-domain`, `DATABASE_URL=…`, `DATABASE_SSL` to match the real TLS setup (`disable` if there is no TLS), and `CRON_SECRET` (a long random string). The proxy must overwrite `X-Forwarded-For`. Optional: `CONTACT_EMAIL` (legal-page contact; if unset, legal pages show the site link and do not render a mailto), and SMTP or `RESEND_API_KEY`, and `EMAIL_FROM` (verification and invite mail).
4. `next build && next start`, or the compose stack in `docs/deploy/docker/prod/` (`up -d --build`, then `bun run --cwd web db:migrate` inside the web container). The runbook in that directory is Chinese.
5. System cron on the same host, loopback only: `curl -fsS -X POST http://127.0.0.1:3000/api/cron/refresh-social-links -H "Authorization: Bearer $CRON_SECRET"`. Alert or retry on non-2xx.
6. External acceptance, below.

## Acceptance (public network, not localhost)

- [ ] `TOKENS_API_URL=https://domain tokens login` prints an `https://domain/device` link and a user code. After the browser submits the code, the CLI holds a `tt_` token from this database.
- [ ] `TOKENS_API_URL=https://domain tokens submit` succeeds, and this site's Leaderboard shows that user's usage. If login and submit share a shell, export the variable for the whole shell. CLI credentials do not store the API base.
- [ ] An unverified user invited by email is rejected on accept (403). After verification, accept succeeds (this needs SMTP or Resend).
- [ ] Username invite works end to end: create team, invite, accept, pick the person on Teamboard, and the board columns show Team/Group.
- [ ] The scheduled job marks an expired invite expired (cron returns 200 and `expiredInvitations` counts correctly).
- [ ] A `tokens.ci` user who submits without logout gets 401 from this site. That confirms rejection, not accidental ingestion of upstream data.
- [ ] The 11th login request from the same IP returns 429.

## Not a deploy task (known gap)

1. **CLI endpoint profile / `TOKENS_CONFIG_DIR` dual-site setup**: allow tokens.ci and this site to be used together. Today there is one credential store and one API base.

### SMTP mail

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, and `EMAIL_FROM`. For authentication, set both `SMTP_USER` and `SMTP_PASS`. QQ Mail uses `smtp.qq.com` on port 465. Its `SMTP_PASS` is an authorization code, not the login password. QQ Mail rejects messages when `EMAIL_FROM` differs from `SMTP_USER`. Port 465 requires `SMTP_SECURE=true`. With `SMTP_SECURE=false`, credentials travel in plaintext if the server does not offer STARTTLS. Run `nc -z smtp.qq.com 465` to check outbound access. Personal QQ accounts have a daily sending limit.
