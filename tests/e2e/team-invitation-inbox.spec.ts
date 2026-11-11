import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import {
  deleteFixtureUsers,
  fixtureUser,
  registerUser,
  requireLoopbackPostgresUrl,
  type FixtureUser,
} from "./users";

// team-invitation-inbox E2E: traces the specs/team-invitation-inbox/spec.md
// scenarios against the local dev stack — 受邀人查看待处理邀请 (inbox group),
// 受邀人接受邀请 (accept group), 邀请邮件链接携带回跳参数 (deep link group).
// Synthetic `t5e2e-*` accounts only; afterAll deletes them and the cascades
// remove teams, memberships, invitations and sessions.
// The local dev stack has no email transport, so registrations keep
// emailVerifiedAt null — that is what the unverified-acceptee scenarios pin.

const runId = Date.now().toString(36);

// Bucket for browser-driven form posts (deep-link login/register). API-helper
// auth calls override this per test with authIp().
test.use({ extraHTTPHeaders: { "x-real-ip": "10.73.0.2" } });

// Allow cold `next dev` on-demand compilation of /teams, /login, /register
// and every API route this spec touches across parallel-fresh contexts.
test.setTimeout(180_000);

const allFixtureUsernames: string[] = [];
function track(user: FixtureUser): FixtureUser {
  allFixtureUsernames.push(user.username);
  return user;
}

test.afterAll(async () => {
  await deleteFixtureUsers(allFixtureUsernames);
});

const ORIGIN = { Origin: "http://localhost:3000" };

/**
 * Synthetic per-test client IP. The auth endpoints (register / login) are
 * rate-limited to 10 requests per 60 s per client IP; this suite registers
 * ~17 fixture accounts per file, which one shared bucket can never absorb.
 * Under TRUST_PROXY=1 the limiter reads x-real-ip, so each test gets its own
 * bucket and the limiter still runs. Only auth calls need it — team API
 * mutations are not rate-limited.
 */
function authIp(lastOctet: number): Record<string, string> {
  return { "x-real-ip": `10.73.0.${lastOctet}` };
}

/** Create a team as the context's current session user; returns its id. */
async function createTeamViaApi(page: Page, name: string): Promise<string> {
  const res = await page.request.post("/api/teams", {
    headers: ORIGIN,
    data: { name, visibility: "public" },
  });
  expect(res.status(), await res.text()).toBe(201);
  const team = (await res.json()) as { id: string };
  return team.id;
}

/** Invite one member (username or email item) as the current session user. */
async function inviteViaApi(
  page: Page,
  teamId: string,
  item: { username: string } | { email: string }
): Promise<void> {
  const res = await page.request.post(`/api/teams/${teamId}/members`, {
    headers: ORIGIN,
    data: { items: [item] },
  });
  expect(res.ok(), await res.text()).toBe(true);
}

/** Switch the context's session to an existing fixture account. */
async function loginViaApi(
  page: Page,
  user: FixtureUser,
  ipHeaders: Record<string, string>
): Promise<void> {
  const res = await page.request.post("/api/auth/login", {
    headers: { ...ORIGIN, ...ipHeaders },
    data: { email: user.email, password: user.password },
  });
  expect(
    res.ok(),
    `login ${user.username} failed: ${res.status()} ${await res.text()}`
  ).toBe(true);
}

/**
 * Backfill one invitation's expires_at (future or past) and return the exact
 * stored value. The assertion derives from this read-back, never from a
 * calendar literal. Same loopback + prefix gates as the users.ts fixtures.
 */
async function setInvitationExpiry(opts: {
  teamName: string;
  invitee: FixtureUser;
  expiresAt: Date;
}): Promise<Date> {
  const target = requireLoopbackPostgresUrl(
    process.env.DATABASE_URL ?? "postgresql://tokens:tokens@127.0.0.1:5433/tokens"
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
      update team_invitations i
      set expires_at = ${opts.expiresAt.toISOString()}
      from teams t
      where i.team_id = t.id
        and t.name = ${opts.teamName}
        and (i.invited_username = ${opts.invitee.username}
             or lower(i.invited_email) = ${opts.invitee.email})
      returning i.expires_at
    `;
    if (updated.count !== 1) {
      throw new Error(
        `expiry backfill matched ${updated.count} invitations, expected 1`
      );
    }
    return updated[0].expires_at as Date;
  } finally {
    await sql.end();
  }
}

// ---------------------------------------------------------------------------
// Group 2: 受邀人查看待处理邀请 (specs → Requirement 1)
// ---------------------------------------------------------------------------

const inboxAdmin = track(fixtureUser(`${runId}-inb`, "a"));
const inboxInvitee = track(fixtureUser(`${runId}-inb`, "b"));
const INBOX_TEAM_NAME = "Neon Ravens";

test("inbox: pending invite renders card with ISO expiry", async ({ page }) => {
  await registerUser(page, inboxInvitee, authIp(11)); // invitee must exist for the username invite
  await registerUser(page, inboxAdmin, authIp(11)); // session = admin

  const teamId = await createTeamViaApi(page, INBOX_TEAM_NAME);
  await inviteViaApi(page, teamId, { username: inboxInvitee.username });

  // Backfill now + 3 days and read the exact stored value; the expected
  // data-expires comes from this read-back (RC1 recipe — no calendar literal).
  const storedExpiresAt = await setInvitationExpiry({
    teamName: INBOX_TEAM_NAME,
    invitee: inboxInvitee,
    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  });
  const expectedIsoDate = storedExpiresAt.toISOString().slice(0, 10);

  await loginViaApi(page, inboxInvitee, authIp(11)); // session = invitee
  await page.goto("/teams");

  // Team name visible in the invite area.
  await expect(page.getByText(INBOX_TEAM_NAME)).toBeVisible();
  // Expiry marker carries the stored ISO UTC date.
  await expect(page.getByTestId("invite-expires")).toHaveAttribute(
    "data-expires",
    expectedIsoDate
  );
  // Accept offered, Decline never rendered.
  await expect(
    page.getByRole("button", { name: "Accept", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Decline", exact: true })
  ).toHaveCount(0);
});

const dashAdmin = track(fixtureUser(`${runId}-dsh`, "a"));
const dashInvitee = track(fixtureUser(`${runId}-dsh`, "b"));
const DASH_INVITE_TEAM_NAME = "Sky Wolves";
const DASH_OWN_TEAM_NAME = `t5e2e-dash-team-${runId}`;

test("inbox: card renders alongside existing team dashboard", async ({
  page,
}) => {
  await registerUser(page, dashInvitee, authIp(12)); // invitee must exist for the username invite
  await registerUser(page, dashAdmin, authIp(12)); // session = admin

  const invitedTeamId = await createTeamViaApi(page, DASH_INVITE_TEAM_NAME);
  await inviteViaApi(page, invitedTeamId, { username: dashInvitee.username });

  await loginViaApi(page, dashInvitee, authIp(12)); // session = invitee
  const ownTeamId = await createTeamViaApi(page, DASH_OWN_TEAM_NAME);
  expect(ownTeamId).toBeTruthy();

  await page.goto("/teams");

  // Own team dashboard still renders...
  await expect(page.getByText(DASH_OWN_TEAM_NAME, { exact: true })).toBeVisible();
  // ...and the invite area coexists with it.
  await expect(page.getByText(DASH_INVITE_TEAM_NAME)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept", exact: true })
  ).toBeVisible();
});

const expiredAdmin = track(fixtureUser(`${runId}-exp`, "a"));
const expiredInvitee = track(fixtureUser(`${runId}-exp`, "b"));
const EXPIRED_TEAM_NAME = `t5e2e-exp-team-${runId}`;

test("inbox: expired invitation is not rendered", async ({ page }) => {
  await registerUser(page, expiredInvitee, authIp(13));
  await registerUser(page, expiredAdmin, authIp(13)); // session = admin

  const teamId = await createTeamViaApi(page, EXPIRED_TEAM_NAME);
  await inviteViaApi(page, teamId, { username: expiredInvitee.username });

  // Expire the invitation in the DB before the invitee ever loads the page.
  await setInvitationExpiry({
    teamName: EXPIRED_TEAM_NAME,
    invitee: expiredInvitee,
    expiresAt: new Date(Date.now() - 60_000),
  });

  await loginViaApi(page, expiredInvitee, authIp(13)); // session = invitee
  await page.goto("/teams");

  // Sanity control: the page itself rendered (team-less user sees the
  // create-team card)...
  await expect(
    page.getByRole("heading", { name: "Create a team" })
  ).toBeVisible();
  // ...and the expired invitation renders nothing.
  await expect(page.getByTestId("invite-inbox")).toHaveCount(0);
  await expect(page.getByText(EXPIRED_TEAM_NAME)).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Group 3: 受邀人接受邀请 (specs → Requirement 2)
// ---------------------------------------------------------------------------

/**
 * Number of team_members rows a fixture user holds in a named team. Same
 * loopback gate as the other DB helpers; backs the 「team_members 表不新增行」
 * assertions.
 */
async function countTeamMemberships(
  username: string,
  teamName: string
): Promise<number> {
  const target = requireLoopbackPostgresUrl(
    process.env.DATABASE_URL ?? "postgresql://tokens:tokens@127.0.0.1:5433/tokens"
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
    const rows = await sql`
      select count(*)::int as n
      from team_members m
      join teams t on m.team_id = t.id
      join users u on m.user_id = u.id
      where u.username = ${username} and t.name = ${teamName}
    `;
    return rows[0].n as number;
  } finally {
    await sql.end();
  }
}

/** Disband a team as the context's current session user (its admin). */
async function disbandTeamViaApi(page: Page, teamId: string): Promise<void> {
  const res = await page.request.post(`/api/teams/${teamId}/disband`, {
    headers: ORIGIN,
  });
  expect(res.ok(), await res.text()).toBe(true);
}

const accAdmin = track(fixtureUser(`${runId}-acc`, "a"));
const accInvitee = track(fixtureUser(`${runId}-acc`, "b"));
const ACC_TEAM_NAME = "Neon Ravens";

test("accept: success joins team and card disappears", async ({ page }) => {
  await registerUser(page, accInvitee, authIp(21));
  await registerUser(page, accAdmin, authIp(21)); // session = admin

  const teamId = await createTeamViaApi(page, ACC_TEAM_NAME);
  await inviteViaApi(page, teamId, { username: accInvitee.username });

  await loginViaApi(page, accInvitee, authIp(21)); // session = invitee, no other invites
  await page.goto("/teams");
  await expect(page.getByTestId("invite-inbox")).toBeVisible();

  await page
    .getByRole("button", { name: "Accept", exact: true })
    .click();

  // 200 → refresh → team panel, and with no remaining invitations the whole
  // area disappears. Inbox first, so the team-name visibility below can only
  // be the dashboard header, never the invite row.
  await expect(page.getByTestId("invite-inbox")).toHaveCount(0);
  await expect(page.getByText(ACC_TEAM_NAME, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept", exact: true })
  ).toHaveCount(0);
});

const blkAdmin = track(fixtureUser(`${runId}-blk`, "a"));
const blkInvitee = track(fixtureUser(`${runId}-blk`, "b"));
const BLK_INVITE_TEAM_NAME = "Neon Ravens";
const BLK_OWN_TEAM_NAME = `t5e2e-blk-team-${runId}`;

test("accept: blocked when already in a team (409 toast)", async ({ page }) => {
  await registerUser(page, blkInvitee, authIp(22));
  await registerUser(page, blkAdmin, authIp(22)); // session = admin

  const invitedTeamId = await createTeamViaApi(page, BLK_INVITE_TEAM_NAME);
  await inviteViaApi(page, invitedTeamId, { username: blkInvitee.username });

  await loginViaApi(page, blkInvitee, authIp(22)); // session = invitee
  const ownTeamId = await createTeamViaApi(page, BLK_OWN_TEAM_NAME);
  expect(ownTeamId).toBeTruthy();

  await page.goto("/teams");
  await expect(page.getByText(BLK_INVITE_TEAM_NAME)).toBeVisible();

  await page
    .getByRole("button", { name: "Accept", exact: true })
    .click();

  // 409 → teams.err.leaveBeforeAccept, the invitation item stays.
  await expect(
    page.getByText("Leave your current team before accepting")
  ).toBeVisible();
  await expect(page.getByText(BLK_INVITE_TEAM_NAME)).toBeVisible();
});

const verAdmin = track(fixtureUser(`${runId}-ver`, "a"));
const verInvitee = track(fixtureUser(`${runId}-ver`, "b"));
const VER_TEAM_NAME = "Neon Ravens";

test("accept: blocked for unverified email invitee (403 toast)", async ({
  page,
}) => {
  // Dev stack has no email transport, so this registration keeps
  // emailVerifiedAt null — the state the scenario needs.
  await registerUser(page, verInvitee, authIp(23));
  await registerUser(page, verAdmin, authIp(23)); // session = admin

  const teamId = await createTeamViaApi(page, VER_TEAM_NAME);
  // Email-path invite to a registered user sets invitedUserId AND invitedEmail,
  // so acceptInvitation applies the verification gate.
  await inviteViaApi(page, teamId, { email: verInvitee.email });

  await loginViaApi(page, verInvitee, authIp(23)); // session = invitee
  await page.goto("/teams");
  await expect(page.getByText(VER_TEAM_NAME)).toBeVisible();

  await page
    .getByRole("button", { name: "Accept", exact: true })
    .click();

  // 403 → teams.err.verifyEmailFirst, no membership row appears.
  await expect(
    page.getByText("Verify your email before accepting this invitation")
  ).toBeVisible();
  expect(await countTeamMemberships(verInvitee.username, VER_TEAM_NAME)).toBe(0);
});

const expAccAdmin = track(fixtureUser(`${runId}-acx`, "a"));
const expAccInvitee = track(fixtureUser(`${runId}-acx`, "b"));
const EXP_ACC_TEAM_NAME = "Neon Ravens";

test("accept: invitation expiring after render shows expired toast", async ({
  page,
}) => {
  await registerUser(page, expAccInvitee, authIp(24));
  await registerUser(page, expAccAdmin, authIp(24)); // session = admin

  const teamId = await createTeamViaApi(page, EXP_ACC_TEAM_NAME);
  await inviteViaApi(page, teamId, { username: expAccInvitee.username });

  await loginViaApi(page, expAccInvitee, authIp(24)); // session = invitee
  await page.goto("/teams");
  await expect(page.getByText(EXP_ACC_TEAM_NAME)).toBeVisible();

  // The invitation expires while the page stays open...
  await setInvitationExpiry({
    teamName: EXP_ACC_TEAM_NAME,
    invitee: expAccInvitee,
    expiresAt: new Date(Date.now() - 60_000),
  });

  // ...and the click hits the server-side expiry gate (409).
  await page
    .getByRole("button", { name: "Accept", exact: true })
    .click();
  await expect(page.getByText("Invitation has expired")).toBeVisible();
  expect(
    await countTeamMemberships(expAccInvitee.username, EXP_ACC_TEAM_NAME)
  ).toBe(0);
});

const disAdmin = track(fixtureUser(`${runId}-dis`, "a"));
const disInvitee = track(fixtureUser(`${runId}-dis`, "b"));
const DIS_TEAM_NAME = "Neon Ravens";

test("accept: disbanded team invitation shows notActive toast", async ({
  page,
}) => {
  await registerUser(page, disInvitee, authIp(25));
  await registerUser(page, disAdmin, authIp(25)); // session = admin

  const teamId = await createTeamViaApi(page, DIS_TEAM_NAME);
  await inviteViaApi(page, teamId, { username: disInvitee.username });
  await disbandTeamViaApi(page, teamId);

  await loginViaApi(page, disInvitee, authIp(25)); // session = invitee
  await page.goto("/teams");
  // The invitation still renders — the inbox does not distinguish disbanded
  // target teams (server-side blocking is what stops the accept).
  await expect(page.getByText(DIS_TEAM_NAME)).toBeVisible();

  await page
    .getByRole("button", { name: "Accept", exact: true })
    .click();
  await expect(page.getByText("Team is not active")).toBeVisible();
  expect(await countTeamMemberships(disInvitee.username, DIS_TEAM_NAME)).toBe(0);
});

const multiAdminA = track(fixtureUser(`${runId}-mlt`, "a"));
const multiAdminB = track(fixtureUser(`${runId}-mlt`, "b"));
const multiInvitee = track(fixtureUser(`${runId}-mlt`, "c"));
const MULTI_TEAM_A = "Neon Ravens";
const MULTI_TEAM_B = "Sky Wolves";

test("accept: accepting one invitation keeps the other card", async ({
  page,
}) => {
  await registerUser(page, multiInvitee, authIp(26)); // invitee must exist for username invites
  await registerUser(page, multiAdminA, authIp(26)); // session = admin A
  const teamAId = await createTeamViaApi(page, MULTI_TEAM_A);
  await inviteViaApi(page, teamAId, { username: multiInvitee.username });
  await registerUser(page, multiAdminB, authIp(26)); // session = admin B
  const teamBId = await createTeamViaApi(page, MULTI_TEAM_B);
  await inviteViaApi(page, teamBId, { username: multiInvitee.username });

  await loginViaApi(page, multiInvitee, authIp(26)); // session = invitee
  await page.goto("/teams");

  const inbox = page.getByTestId("invite-inbox");
  const teamARow = inbox.locator("div.divide-y > div").filter({
    hasText: MULTI_TEAM_A,
  });
  await expect(teamARow).toHaveCount(1);
  await teamARow.getByRole("button", { name: "Accept", exact: true }).click();

  // Team A joined: its item is removed from the inbox, and with the item gone
  // the team-name visibility below can only be the dashboard header. Team B's
  // item stays. No order assertions — listMyInvitations has no ORDER BY.
  await expect(inbox.getByText(MULTI_TEAM_A)).toHaveCount(0);
  await expect(page.getByText(MULTI_TEAM_A, { exact: true })).toBeVisible();
  await expect(inbox.getByText(MULTI_TEAM_B)).toBeVisible();
  await expect(
    inbox.getByRole("button", { name: "Accept", exact: true })
  ).toHaveCount(1);
});

// ---------------------------------------------------------------------------
// Group 4: 邀请邮件链接携带回跳参数 (specs → Requirement 3, deep link half)
// ---------------------------------------------------------------------------

const dlLoginAdmin = track(fixtureUser(`${runId}-dl1`, "a"));
const dlLoginInvitee = track(fixtureUser(`${runId}-dl1`, "b"));
const DL_LOGIN_TEAM_NAME = "Neon Ravens";

test("deep link: login with returnTo=%2Fteams lands on /teams", async ({
  page,
}) => {
  await registerUser(page, dlLoginInvitee, authIp(31)); // registered account
  await registerUser(page, dlLoginAdmin, authIp(31)); // session = admin

  const teamId = await createTeamViaApi(page, DL_LOGIN_TEAM_NAME);
  await inviteViaApi(page, teamId, { username: dlLoginInvitee.username });

  // Drop the admin session so the browser starts the journey from the email
  // link's vantage point: signed out, /login?returnTo=%2Fteams.
  await page.context().clearCookies();

  await page.goto("/login?returnTo=%2Fteams");
  await page.locator("#email").fill(dlLoginInvitee.email);
  await page.locator("#password").fill(dlLoginInvitee.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // Login success navigates to the sanitized returnTo — /teams.
  await expect(page).toHaveURL(/\/teams$/);
  await expect(page.getByTestId("invite-inbox")).toBeVisible();
  await expect(page.getByText(DL_LOGIN_TEAM_NAME)).toBeVisible();
});

const dlRegAdmin = track(fixtureUser(`${runId}-dl2`, "a"));
const dlRegInvitee = track(fixtureUser(`${runId}-dl2`, "b"));
const DL_REG_TEAM_NAME = "Sky Wolves";

test("deep link: register with returnTo=%2Fteams lands on /teams", async ({
  page,
}) => {
  await registerUser(page, dlRegAdmin, authIp(32)); // session = admin

  const teamId = await createTeamViaApi(page, DL_REG_TEAM_NAME);
  // The invitee address is not registered yet — the email-only invitation
  // becomes visible once this address registers (listMyInvitations email
  // match with invited_user_id null).
  await inviteViaApi(page, teamId, { email: dlRegInvitee.email });

  await page.context().clearCookies();

  await page.goto("/register?returnTo=%2Fteams");
  await page.locator("#email").fill(dlRegInvitee.email);
  await page.locator("#username").fill(dlRegInvitee.username);
  await page.locator("#password").fill(dlRegInvitee.password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();

  // Registration succeeds and lands on /teams; no email transport locally,
  // so the fresh account is unverified — the accept must hit the 403 gate.
  await expect(page).toHaveURL(/\/teams$/);
  await expect(page.getByTestId("invite-inbox")).toBeVisible();
  await expect(page.getByText(DL_REG_TEAM_NAME)).toBeVisible();

  await page
    .getByRole("button", { name: "Accept", exact: true })
    .click();
  await expect(
    page.getByText("Verify your email before accepting this invitation")
  ).toBeVisible();
  expect(await countTeamMemberships(dlRegInvitee.username, DL_REG_TEAM_NAME)).toBe(0);
});
