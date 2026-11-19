import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  deleteFixtureUsers,
  fixtureUser,
  registerUser,
  type FixtureUser,
} from "./users";

// /u/[username] header + headline stat hints. Traces
// openspec/changes/profile-period-stats-ui/specs/web-profile-stats-display/spec.md:
// 更新时间显示到时分 (updated time shows hours and minutes without seconds),
// 周期筛选下隐藏不可切片的会话数 (session hint only under all-time),
// 周期筛选下标明提交次数为全量数据 (submission count carries the all-time hint).
// Fixtures are synthetic t5e2e-* accounts on the local dev stack only;
// afterAll deletes them and cascades remove submissions/session rows.

const runId = Date.now().toString(36);
// Per-file infix: two spec files loading in the same millisecond share runId,
// and bare slot names would then collide across files (the winner's afterAll
// deletes the loser's fixtures mid-test). Same trick as team-invitation-inbox.
const submitter = fixtureUser(`${runId}-ps`, "a");
const quiet = fixtureUser(`${runId}-ps`, "b");
const zeroSessions = fixtureUser(`${runId}-ps`, "c");

const BASE_URL = "http://localhost:3000";
const ORIGIN = { Origin: BASE_URL };

test.afterAll(async () => {
  await deleteFixtureUsers([
    submitter.username,
    quiet.username,
    zeroSessions.username,
  ]);
});

// Cold `next dev` compiles each route on first hit; register ×2 plus several
// page loads can exceed the default 60s budget.
test.setTimeout(180_000);

/** Each account gets its own browser context so the sessions never clash. */
async function registerInNewContext(
  browser: Browser,
  user: FixtureUser,
  lastOctet: number
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await registerUser(page, user, authIp(lastOctet));
  return page;
}

/**
 * Synthetic per-test client IP. Register is rate-limited to 10 requests per
 * 60 s per client IP; give each account its own bucket so the limiter still
 * runs (needs TRUST_PROXY=1 on the dev server, the same mechanism
 * team-invitation-inbox.spec.ts uses). 10.74.x is this file's own subnet so
 * parallel workers of other specs never share these buckets.
 */
function authIp(lastOctet: number): Record<string, string> {
  return { "x-real-ip": `10.74.0.${lastOctet}` };
}

/** LocaleToggle writes tt_locale and reloads; seeding the cookie skips the click. */
async function useLocale(page: Page, locale: "zh" | "en"): Promise<void> {
  await page
    .context()
    .addCookies([{ name: "tt_locale", value: locale, url: BASE_URL }]);
}

/** Personal token for POST /api/submit; the plaintext secret is returned once. */
async function createApiToken(page: Page): Promise<string> {
  const res = await page.request.post("/api/settings/tokens", {
    headers: ORIGIN,
    data: { name: "e2e-period-stats" },
  });
  expect(
    res.ok(),
    `create api token failed: ${res.status()} ${await res.text()}`
  ).toBe(true);
  const body = (await res.json()) as { token: { token: string } };
  return body.token.token;
}

const isoDaysAgo = (daysAgo: number): string =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

function contributionDay(date: string, tokens: number) {
  const breakdown = {
    input: tokens,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
  };
  return {
    date,
    totals: { tokens, cost: tokens / 100, messages: 10 },
    intensity: 1,
    tokenBreakdown: breakdown,
    clients: [
      {
        client: "claude",
        modelId: "claude-opus-4",
        tokens: breakdown,
        cost: tokens / 100,
        messages: 10,
      },
    ],
  };
}

/**
 * One submission whose date range spans last month and this week, so the
 * profile has: an updatedAt, cumulative session_count, active days inside the
 * week window and history outside it.
 */
function spanningSubmission(sessionCount: number) {
  const start = isoDaysAgo(40);
  const end = isoDaysAgo(0);
  const days = [
    contributionDay(isoDaysAgo(1), 4000),
    contributionDay(isoDaysAgo(40), 2000),
  ];
  // /api/submit cross-checks summary against the sum of contributions.
  const totalTokens = days.reduce((sum, d) => sum + d.totals.tokens, 0);
  const totalCost = days.reduce((sum, d) => sum + d.totals.cost, 0);
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      version: "1.0.0",
      dateRange: { start, end },
    },
    summary: {
      totalTokens,
      totalCost,
      totalDays: days.length,
      activeDays: days.filter((d) => d.totals.tokens > 0).length,
      averagePerDay: totalCost / days.length,
      maxCostInSingleDay: Math.max(...days.map((d) => d.totals.cost)),
      clients: ["claude"],
      models: ["claude-opus-4"],
    },
    years: [
      {
        year: "2026",
        totalTokens,
        totalCost,
        range: { start, end },
      },
    ],
    timeMetrics: {
      totalActiveTimeMs: 3_600_000,
      longestContinuousMs: 1_800_000,
      maxConcurrentSessions: 1,
      sessionCount,
    },
    contributions: days,
  };
}

async function submitUsage(
  page: Page,
  apiToken: string,
  body: unknown
): Promise<void> {
  const res = await page.request.post("/api/submit", {
    headers: { Authorization: `Bearer ${apiToken}` },
    data: body,
  });
  expect(
    res.ok(),
    `submit usage failed: ${res.status()} ${await res.text()}`
  ).toBe(true);
}

test.beforeAll(async ({ browser }) => {
  const submitterPage = await registerInNewContext(browser, submitter, 1);
  const apiToken = await createApiToken(submitterPage);
  await submitUsage(submitterPage, apiToken, spanningSubmission(12));
  await submitterPage.context().close();

  const quietPage = await registerInNewContext(browser, quiet, 2);
  await quietPage.context().close();

  // One submission, never any sessions: the genuine all-time zero.
  const zeroPage = await registerInNewContext(browser, zeroSessions, 3);
  const zeroToken = await createApiToken(zeroPage);
  await submitUsage(zeroPage, zeroToken, spanningSubmission(0));
  await zeroPage.context().close();
});

test("e2e: updated time shows hours and minutes without seconds", async ({
  page,
}) => {
  await useLocale(page, "en");
  await page.goto(`/u/${submitter.username}`);

  const updated = page.getByText(/^Updated\b/);
  await expect(updated).toBeVisible();
  const text = (await updated.textContent()) ?? "";
  // Clock shape only: the submission happened "now", so no fixed clock value.
  // Both 12h ("6:55 PM") and 24h ("18:55") match; a rendered date-only
  // string ("Updated Nov 19, 2026") has no "\d+:\d+" pair and fails.
  expect(text).toMatch(/\d{1,2}:\d{2}/);
  expect(text).not.toMatch(/\d{2}:\d{2}:\d{2}/);
});

test('e2e: no "Updated" text for user without submissions', async ({ page }) => {
  await useLocale(page, "en");
  await page.goto(`/u/${quiet.username}`);

  await expect(page.getByText(/^(Updated\b|更新于)/)).toHaveCount(0);
  await expect(page.getByText("Invalid Date")).toHaveCount(0);
  // The "·" separator only renders alongside the updated time.
  const metaRow = page.getByText(/^Joined\b/).locator("xpath=..");
  await expect(metaRow.getByText("·")).toHaveCount(0);
});

/** The headline Stat cell (label + value + optional hint) behind a label. */
function statCell(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("xpath=..");
}

test("e2e: session hint hidden under week period", async ({ page }) => {
  await useLocale(page, "zh");
  await page.goto(`/u/${submitter.username}`);
  await page.getByText("本周", { exact: true }).click();
  await expect(page).toHaveURL(/[?&]period=week/);

  // Under a sliced period the server cannot slice sessions, so the hint row
  // must not render at all — "0 个会话" would claim the count is really 0.
  await expect(statCell(page, "活跃天数").getByText(/个会话/)).toHaveCount(0);
});

test("e2e: session hint shown under all-time period", async ({ page }) => {
  await useLocale(page, "zh");
  await page.goto(`/u/${submitter.username}`);

  await expect(statCell(page, "活跃天数").getByText("12 个会话")).toBeVisible();
});

test("e2e: genuine zero session count still displayed under all-time", async ({
  page,
}) => {
  await useLocale(page, "zh");
  await page.goto(`/u/${zeroSessions.username}`);

  // A real zero is data and stays visible; only "not sliceable" hides.
  await expect(statCell(page, "活跃天数").getByText("0 个会话")).toBeVisible();
});

test("e2e: submission count shows 全部时间 hint under month period", async ({
  page,
}) => {
  await useLocale(page, "zh");
  await page.goto(`/u/${submitter.username}`);
  await page.getByText("本月", { exact: true }).click();
  await expect(page).toHaveURL(/[?&]period=month/);

  // The counter cannot be sliced per period; the hint must say the value is
  // the all-time total instead of silently looking like this month's.
  await expect(statCell(page, "提交次数").getByText("全部时间")).toBeVisible();
});

test("e2e: no hint under submissions stat for all-time", async ({ page }) => {
  await useLocale(page, "zh");
  await page.goto(`/u/${submitter.username}`);

  // All-time is the one period where the number is already in-period: the
  // hint would be noise. Scoped to the cell — the period toggle legitimately
  // offers a "全部时间" option elsewhere on the page.
  await expect(
    statCell(page, "提交次数").getByText(/全部时间|All time/)
  ).toHaveCount(0);
});

test('e2e: "All time" hint renders under en locale', async ({ page }) => {
  await useLocale(page, "en");
  await page.goto(`/u/${submitter.username}`);
  await page.getByText("Week", { exact: true }).click();
  await expect(page).toHaveURL(/[?&]period=week/);

  const cell = statCell(page, "Submissions");
  await expect(cell.getByText("All time")).toBeVisible();
  // The i18n key must resolve — never a bare "profile.periodAll" on screen.
  await expect(page.locator("main").getByText(/profile\.periodAll/)).toHaveCount(
    0
  );
});
