import { expect, test } from "@playwright/test";
import { banFixtureUser, deleteFixtureUsers, fixtureUser, registerUser } from "./users";

test("/shame is 404 and Hall of Shame is gone from the nav", async ({ page }) => {
  const response = await page.goto("/shame");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Hall of Shame" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Teamboard" })).toBeVisible();
});

test("未登录导航 Sign in 是带回跳的登录链接", async ({ page }) => {
  await page.goto("/leaderboard");
  await expect(
    page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Sign in" })
  ).toHaveAttribute("href", `/login?returnTo=${encodeURIComponent("/leaderboard")}`);
});



// 安装引导契约：npm 安装命令 + 站点指向首行（specs/cli-install/spec.md）。
// 本站源在本地 e2e 环境是部署 origin http://localhost:3000。
const SITE_ORIGIN = "http://localhost:3000";
const NPM_INSTALL = "npm i -g @fitor/tokens-cli";
const MANUAL_HREF_PATTERN =
  /^https:\/\/github\.com\/Fitor\/tokens\/blob\/(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?|[0-9a-f]{40})\/docs\/deploy\/tokens-cli-usage\.md$/;

test("docs 页各平台页签给出 npm 安装命令", async ({ page }) => {
  const response = await page.goto("/docs");
  expect(response?.status()).toBe(200);
  const html = await page.content();
  expect(html).not.toContain("brew install");
  expect(html).not.toContain("install.sh | sh");
  expect(html).not.toContain("npm i -g tokens-cli");

  // macOS 页签（默认打开）：首行 export TOKENS_API_URL，块内含 npm 安装命令。
  const macosPanel = page.getByRole("tabpanel", { name: /macos/i });
  await expect(macosPanel.getByRole("code").first()).toContainText(
    `export TOKENS_API_URL=${SITE_ORIGIN}`
  );
  await expect(
    macosPanel.getByRole("code").filter({ hasText: NPM_INSTALL }).first()
  ).toBeVisible();

  // Linux 页签：同样的首行与 npm 安装命令。
  await page.getByRole("tab", { name: /linux/i }).click();
  const linuxPanel = page.getByRole("tabpanel", { name: /linux/i });
  await expect(linuxPanel.getByRole("code").first()).toContainText(
    `export TOKENS_API_URL=${SITE_ORIGIN}`
  );
  await expect(
    linuxPanel.getByRole("code").filter({ hasText: NPM_INSTALL }).first()
  ).toBeVisible();

  // Windows 页签：首行 $env:TOKENS_API_URL，块内含 npm 安装命令。
  await page.getByRole("tab", { name: /windows/i }).click();
  const windowsPanel = page.getByRole("tabpanel", { name: /windows/i });
  await expect(windowsPanel.getByRole("code").first()).toContainText(
    `$env:TOKENS_API_URL='${SITE_ORIGIN}'`
  );
  await expect(
    windowsPanel.getByRole("code").filter({ hasText: NPM_INSTALL }).first()
  ).toBeVisible();

  // 保留区块：private mode 与 Everyday use 的既有结构不随安装通道改动。
  await expect(page.getByRole("heading", { name: "Private mode" })).toBeVisible();
  await expect(page.getByRole("code").filter({ hasText: "tokens login --private" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy in Settings" })).toHaveAttribute("href", "/settings");
  expect(html).toContain("These five cover submitting usage.");
});

test("docs 页不含旧链接", async ({ page }) => {
  const response = await page.goto("/docs");
  expect(response?.status()).toBe(200);
  const html = await page.content();
  expect(html).not.toContain("raw.githubusercontent.com");
  expect(html).not.toContain("KunoLu");
  expect(html).not.toContain("brew install");
  expect(html).not.toContain("install.sh | sh");
  expect(html).not.toContain("npm i -g tokens-cli");
});

test("docs 页无脚本下载命令", async ({ page }) => {
  const response = await page.goto("/docs");
  expect(response?.status()).toBe(200);
  const html = await page.content();
  // pre-install 脚本不再以任何下载命令出现：无路径引用，无 curl / iex 组合。
  expect(html).not.toContain("/pre-install-tokens.sh");
  expect(html).not.toContain("/pre-install-tokens.ps1");
  expect(html).not.toMatch(/curl[^<]{0,300}pre-install-tokens/i);
  expect(html).not.toMatch(/iex[^<]{0,300}pre-install-tokens/i);
});

test("手册链接指向新仓库钉版 ref", async ({ page }) => {
  const response = await page.goto("/docs");
  expect(response?.status()).toBe(200);
  const links = page.locator('a[href*="/docs/deploy/tokens-cli-usage.md"]');
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute("href");
    expect(href).toMatch(MANUAL_HREF_PATTERN);
  }
});

test("settings 提示命令带站点绑定", async ({ page }) => {
  const user = fixtureUser(`t9set${Date.now().toString(36)}`, "c");
  try {
    await registerUser(page, user);
    const response = await page.goto("/settings");
    expect(response?.status()).toBe(200);

    // 两处 tokens login 提示（tokens 区描述 + tokens 空态）都带站点绑定。
    const loginHints = page
      .getByRole("code")
      .filter({ hasText: `TOKENS_API_URL=${SITE_ORIGIN} tokens login` });
    await expect(loginHints.first()).toBeVisible();
    expect(await loginHints.count()).toBe(2);

    // devices 空态提示：TOKENS_API_URL=<origin> tokens submit。
    await expect(
      page
        .getByRole("code")
        .filter({ hasText: `TOKENS_API_URL=${SITE_ORIGIN} tokens submit` })
    ).toBeVisible();

    // 旧上游包引导消失。
    expect(await page.content()).not.toContain("bunx tokens-cli");
  } finally {
    await deleteFixtureUsers([user.username]);
  }
});

test("/local 页安装引导显示 npm 命令", async ({ page }) => {
  const response = await page.goto("/local");
  expect(response?.status()).toBe(200);
  const html = await page.content();
  expect(html).toContain(NPM_INSTALL);
  expect(html).not.toContain("brew install");
});

test("页脚只保留版权与署名行", async ({ page }) => {
  await page.goto("/leaderboard");
  const footer = page.locator("footer");
  await expect(footer.getByText("Built on Tokscale")).toBeVisible();
  await expect(footer.getByText("Workers")).toHaveCount(0);
  await expect(footer.getByText("V.PS")).toHaveCount(0);
  await expect(footer.getByText("Neon")).toHaveCount(0);
});


test("Leaderboard column order is # Developer Team Group Tokens Cost", async ({
  page,
}) => {
  await page.goto("/leaderboard");
  // Desktop Chrome (≥ sm): Usage is sm:hidden; Tokens/Cost are sm:table-cell.
  // Assert visible headers only — do not drop the mobile cell from the DOM.
  await expect(page.locator("thead th:visible")).toHaveText([
    "#",
    "Developer",
    "Team",
    "Group",
    "Tokens",
    "Cost",
  ]);
});

test("Docs keeps Install / Everyday / Supported clients and drops removed sections", async ({
  page,
}) => {
  const response = await page.goto("/docs");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Install the CLI" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Everyday use" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Supported clients" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "iOS app" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Architecture" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Sponsors" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "The verified badge" })).toHaveCount(0);
});

test("Privacy, Terms, Settings, embed and badge still respond", async ({ page }) => {
  const privacy = await page.goto("/privacy");
  expect(privacy?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  const terms = await page.goto("/terms");
  expect(terms?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
  const settings = await page.goto("/settings");
  expect(settings?.status()).toBe(200);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  const embed = await page.goto("/api/embed/tokens/svg");
  expect(embed?.status()).toBe(200);
  expect(embed?.headers()["content-type"] ?? "").toContain("image/svg+xml");
  const badge = await page.goto("/api/badge/tokens/svg");
  expect(badge?.status()).toBe(200);
  expect(badge?.headers()["content-type"] ?? "").toContain("image/svg+xml");
  const archive = await page.request.post("/api/archive", { data: {} });
  expect(archive.status()).toBe(401);
  expect(await archive.json()).toEqual({ error: "Not authenticated" });
});


test("banned profile still renders and login is 403", async ({ page }) => {
  const user = fixtureUser(`t9${Date.now().toString(36)}`, "a");
  try {
    await registerUser(page, user);
    await banFixtureUser(user.username, "t9 e2e ban");

    const login = await page.request.post("/api/auth/login", {
      headers: { Origin: "http://localhost:3000" },
      data: { email: user.email, password: user.password },
    });
    expect(login.status()).toBe(403);
    expect(await login.json()).toEqual({ error: "Account banned" });

    await page.goto(`/u/${user.username}`);
    await expect(page.getByText("Account banned", { exact: false })).toBeVisible();
    await expect(page.getByText("Banned", { exact: true })).toBeVisible();
  } finally {
    await deleteFixtureUsers([user.username]);
  }
});
