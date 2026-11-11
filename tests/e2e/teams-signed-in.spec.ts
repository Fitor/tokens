import { expect, test } from "@playwright/test";
import { deleteFixtureUsers, fixtureUser, registerUser } from "./users";

// T5 signed-in /teams journey against the local dev stack. Traces
// web/features/team-management.feature scenarios: 创建团队 / 建团时选择公开 /
// 从下拉列表勾选一位已注册用户 / 下拉列表不展示成员的绑定邮箱 /
// 邀请对话框可选择自动归入分组 / 解散会清空全部成员.
// The invite uses the username path, so no email verification gate applies
// (acceptInvitation only requires it for invitedEmail invitations, and accept
// is out of scope here). afterAll deletes the fixture users; cascades remove
// the team, memberships, invitations and sessions.

const runId = Date.now().toString(36);
const admin = fixtureUser(runId, "a");
const invitee = fixtureUser(runId, "b");
const teamName = `t5e2e-team-${runId}`;
const groupName = `t5e2e-g-${runId}`;

test.afterAll(async () => {
  await deleteFixtureUsers([admin.username, invitee.username]);
});

// Cold `next dev` compiles each route on first hit; with the suite running in
// parallel workers that can exceed the default 60s budget across register ×2,
// /teams, /api/teams and /api/users/search.
test.setTimeout(180_000);

test("已登录 /teams: 创建团队(可见性必选) → 新建分组 → 邀请归入分组 → 输入队名解散", async ({
  page,
}) => {
  await test.step("创建团队: 未选可见性不能提交，选 Public 后创建成功", async () => {
    // Both fixture accounts register up front; admin last so this context's
    // tt_session ends up as the admin's (registration sets the cookie).
    await registerUser(page, invitee);
    await registerUser(page, admin);
    await page.goto("/teams");

    await expect(
      page.getByRole("heading", { name: "Create a team" })
    ).toBeVisible();
    await page.locator("#create-team-name").fill(teamName);

    // Visibility is a deliberate choice: no default, submit stays disabled.
    const createButton = page.getByRole("button", { name: "Create team" });
    await expect(createButton).toBeDisabled();
    await page.getByLabel("Visibility").click();
    await page.getByRole("option", { name: "Public" }).click();
    await expect(createButton).toBeEnabled();

    await createButton.click();
    await expect(page.getByText(teamName, { exact: true })).toBeVisible();
    await expect(page.getByText("active", { exact: true })).toBeVisible();
    await expect(page.getByText("Public", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Invite members" })
    ).toBeVisible();
  });

  await test.step("分组: 页面创建分组，供邀请时归入", async () => {
    await page.getByRole("button", { name: "+ New group" }).click();
    const dialog = page.getByRole("dialog", { name: "New group" });
    await expect(dialog).toBeVisible();
    await dialog.locator("#rename-input").fill(groupName);
    await dialog.getByRole("button", { name: "Create" }).click();
    // Chip appears after router.refresh(); cold dev compiles the groups POST.
    await expect(
      page.getByRole("button", { name: groupName })
    ).toBeVisible({ timeout: 60_000 });
  });

  await test.step("邀请: 搜索用户名、勾选、计数、不回显邮箱", async () => {
    await page.getByRole("button", { name: "Invite members" }).click();
    const dialog = page.getByRole("dialog", { name: "Invite members" });
    await expect(dialog).toBeVisible();

    // 邀请对话框可选择自动归入分组: with an active group the dialog must
    // offer the auto-assign select listing it; default is none, pick ours.
    const autoAssign = dialog.getByLabel(
      "Auto-assign to group on join (optional)"
    );
    await expect(autoAssign).toBeVisible();
    await expect(autoAssign).toContainText("No group");
    await autoAssign.click();
    const groupOption = page.getByRole("option", { name: groupName });
    await expect(groupOption).toBeVisible();
    await groupOption.click();
    await expect(autoAssign).toContainText(groupName);

    await dialog.getByPlaceholder("Search username").fill(invitee.username);
    const row = dialog.getByRole("button", {
      name: `@${invitee.username}`,
    });
    // First hit compiles /api/users/search on a cold dev server — allow it.
    await expect(row).toBeVisible({ timeout: 60_000 });
    // Options never echo the bound email.
    await expect(dialog.getByText(invitee.email)).toHaveCount(0);

    await row.click();
    await expect(dialog.getByText("1 selected")).toBeVisible();

    const send = dialog.getByRole("button", { name: "Send invites" });
    await expect(send).toBeEnabled();
    await send.click();

    await expect(page.getByText("1 invitation(s) sent")).toBeVisible();
    await expect(dialog).toHaveCount(0);
  });

  await test.step("解散: 输入队名才能确认，解散后进入 disbanded", async () => {
    await page
      .getByRole("button", { name: "Disband", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Disband team?" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(`Type ${teamName} to confirm`)
    ).toBeVisible();

    const confirm = dialog.getByRole("button", { name: "Disband team" });
    const input = dialog.locator("#confirm-name-input");
    await input.fill(`${teamName}-nope`);
    await expect(confirm).toBeDisabled();
    await input.fill(teamName);
    await expect(confirm).toBeEnabled();

    await confirm.click();
    await expect(page.getByText("disbanded", { exact: true })).toBeVisible();
    // Disbanded teams no longer offer management actions.
    await expect(
      page.getByRole("button", { name: "Invite members" })
    ).toHaveCount(0);
  });
});
