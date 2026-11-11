import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

/**
 * T5 signed-in E2E fixtures: synthetic `t5e2e-*` accounts on the local dev
 * stack only. Never real emails, never production credentials.
 */

const FIXTURE_PREFIX = "t5e2e-";
const LOCAL_DATABASE_URL = "postgresql://tokens:tokens@127.0.0.1:5433/tokens";
const LOOPBACK_HOSTS: Record<string, true> = {
  "127.0.0.1": true,
  localhost: true,
  "::1": true,
};

export interface FixtureUser {
  email: string;
  username: string;
  password: string;
}

export interface LoopbackPostgresTarget {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

function normalizeHost(host: string): string {
  const trimmed = host.trim().toLowerCase();
  return trimmed.startsWith("[") && trimmed.endsWith("]")
    ? trimmed.slice(1, -1)
    : trimmed;
}

/**
 * Fail closed unless the URL host is loopback. A string-prefix check is not
 * enough (`127.0.0.1.neon.tech` still starts with `127.0.0.1`). Query params
 * `host` / `hostname` / `hostaddr` can override the URL host in some drivers,
 * so those must be loopback too. Callers must use the returned fields — never
 * pass the raw URL to `postgres()`.
 */
export function requireLoopbackPostgresUrl(raw: string): LoopbackPostgresTarget {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(
      "E2E fixture cleanup refused: DATABASE_URL is not a valid URL"
    );
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(
      "E2E fixture cleanup refused: DATABASE_URL is not a postgres URL"
    );
  }
  const host = url.hostname;
  if (!LOOPBACK_HOSTS[normalizeHost(host)]) {
    throw new Error(
      `E2E fixture cleanup refused: DATABASE_URL host is not loopback (got ${JSON.stringify(host)}; allowed: 127.0.0.1, localhost, ::1)`
    );
  }
  for (const key of ["host", "hostname", "hostaddr"] as const) {
    const override = url.searchParams.get(key);
    if (override !== null && !LOOPBACK_HOSTS[normalizeHost(override)]) {
      throw new Error(
        `E2E fixture cleanup refused: DATABASE_URL ${key} query is not loopback (got ${JSON.stringify(override)}; allowed: 127.0.0.1, localhost, ::1)`
      );
    }
  }
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, "")).split(
    "/"
  )[0];
  if (!database) {
    throw new Error(
      "E2E fixture cleanup refused: DATABASE_URL has no database name"
    );
  }
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(
      "E2E fixture cleanup refused: DATABASE_URL has an invalid port"
    );
  }
  return {
    host: normalizeHost(host),
    port,
    database,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

/** Unique-per-run identity: GitHub-username-safe, example.test mailbox. */
export function fixtureUser(runId: string, slot: "a" | "b" | "c"): FixtureUser {
  return {
    email: `${FIXTURE_PREFIX}${runId}-${slot}@example.test`,
    username: `${FIXTURE_PREFIX}${runId}-${slot}`,
    password: "T5e2e-Pass!1",
  };
}

/**
 * Register through the real API so the auth stack (Origin gate, password
 * policy, session) is exercised end to end. The register route 403s mutating
 * requests without an allowlisted Origin, and `page.request` shares the
 * browser context's cookie jar, so the returned httpOnly `tt_session` is
 * stored for subsequent page loads in this test.
 */
export async function registerUser(
  page: Page,
  user: FixtureUser,
  extraHeaders?: Record<string, string>
): Promise<void> {
  const res = await page.request.post("/api/auth/register", {
    headers: { Origin: "http://localhost:3000", ...extraHeaders },
    data: { email: user.email, username: user.username, password: user.password },
  });
  expect(
    res.ok(),
    `register ${user.username} failed: ${res.status()} ${await res.text()}`
  ).toBe(true);
  const cookies = await page.context().cookies("http://localhost:3000");
  expect(
    cookies.some((c) => c.name === "tt_session" && c.httpOnly),
    "register did not set the httpOnly tt_session cookie"
  ).toBe(true);
}

/**
 * afterAll cleanup. Deleting the fixture users cascades (ON DELETE CASCADE)
 * to their sessions, email tokens, team created via `created_by`, memberships
 * and invitations. Refuses any username outside the fixture prefix so a typo
 * can never touch a real account. Refuses to open a postgres client unless
 * DATABASE_URL's host is loopback — prefix filtering is not enough if the
 * URL points at production or staging.
 */
export async function deleteFixtureUsers(usernames: string[]): Promise<void> {
  if (usernames.some((u) => !u.startsWith(FIXTURE_PREFIX))) {
    throw new Error(
      "E2E fixture cleanup refused: username is outside the t5e2e- prefix"
    );
  }
  if (usernames.length === 0) return;
  const target = requireLoopbackPostgresUrl(
    process.env.DATABASE_URL ?? LOCAL_DATABASE_URL
  );
  const sql = postgres({
    host: target.host,
    port: target.port,
    database: target.database,
    username: target.username,
    password: target.password,
    max: 1,
    ssl: false,
  });
  try {
    await sql`delete from users where username = any(${usernames})`;
  } finally {
    await sql.end();
  }
}

/**
 * Mark a fixture user banned so T9 can prove BannedProfileView and login 403
 * still work after Hall of Shame was removed. Same loopback + prefix gates
 * as deleteFixtureUsers.
 */
export async function banFixtureUser(username: string, reason: string): Promise<void> {
  if (!username.startsWith(FIXTURE_PREFIX)) {
    throw new Error(
      "E2E fixture ban refused: username is outside the t5e2e- prefix"
    );
  }
  const target = requireLoopbackPostgresUrl(
    process.env.DATABASE_URL ?? LOCAL_DATABASE_URL
  );
  const sql = postgres({
    host: target.host,
    port: target.port,
    database: target.database,
    username: target.username,
    password: target.password,
    max: 1,
    ssl: false,
  });
  try {
    const updated = await sql`
      update users
      set banned_at = now(), ban_reason = ${reason}
      where username = ${username}
    `;
    if (updated.count !== 1) {
      throw new Error(`E2E fixture ban missed ${username} (count=${updated.count})`);
    }
  } finally {
    await sql.end();
  }
}
