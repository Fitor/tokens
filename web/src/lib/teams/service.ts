import { and, eq, ilike, isNull, lt, or, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import {
  db,
  groupMembers,
  groups,
  teamInvitations,
  teamMembers,
  teams,
  users,
} from "@/lib/db";
import { generateRandomString, hashToken } from "@/lib/auth/utils";
import { sendTeamInviteEmail } from "@/lib/email/send";
import { TeamError, postgresErrorCode } from "./errors";
import { canViewTeam, isTeamVisibility } from "./visibility";
import type { TeamMemberRole } from "./types";
import { normalizeUsernameCacheKey } from "@/lib/db/usernameLookup";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUBADMIN_CAP = 2;

function inviteGroupId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new TeamError("Group is not available for auto-assign", 400);
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function revalidateTagSafe(tag: string): void {
  try {
    revalidateTag(tag, "max");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("static generation store missing")) {
      return;
    }
    console.error(`Failed to revalidate ${tag}`, error);
  }
}

function bumpLeaderboard(): void {
  revalidateTagSafe("leaderboard");
}

/**
 * /u/* and /api/users/* are cached under the `user:<username>` tag, so a
 * leave must flush the leaver's profile too — otherwise the cached page can
 * keep showing the membership for up to a minute. The username is looked up
 * by userId server-side, never accepted from the client.
 */
async function bumpUserProfile(userId: string): Promise<void> {
  const rows = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const username = rows[0]?.username;
  if (username) {
    revalidateTagSafe(`user:${normalizeUsernameCacheKey(username)}`);
  }
}

function slugFromName(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "team";
  return `${base}-${generateRandomString(8)}`;
}

async function loadTeam(teamId: string) {
  const rows = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  return rows[0] ?? null;
}

async function membership(teamId: string, userId: string) {
  const rows = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

async function requireVisibleTeam(teamId: string, viewerId: string | null) {
  const team = await loadTeam(teamId);
  if (!team) throw new TeamError("Not found", 404);
  const member = viewerId ? await membership(teamId, viewerId) : null;
  if (!canViewTeam(team, Boolean(member))) {
    throw new TeamError("Not found", 404);
  }
  return { team, member };
}

async function requireAdminOrSub(teamId: string, userId: string) {
  const { team, member } = await requireVisibleTeam(teamId, userId);
  if (team.status !== "active") throw new TeamError("Team is not active", 409);
  if (!member || (member.role !== "admin" && member.role !== "subadmin")) {
    throw new TeamError("Forbidden", 403);
  }
  return { team, member };
}

async function requireAdmin(teamId: string, userId: string) {
  const { team, member } = await requireVisibleTeam(teamId, userId);
  if (team.status !== "active") throw new TeamError("Team is not active", 409);
  if (!member || member.role !== "admin") {
    throw new TeamError("Forbidden", 403);
  }
  return { team, member };
}

export async function listTeams(viewerId: string | null) {
  const publicRows = await db
    .select()
    .from(teams)
    .where(and(eq(teams.visibility, "public"), eq(teams.status, "active")));
  if (!viewerId) return publicRows;
  const mine = await db
    .select({ team: teams })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, viewerId));
  const byId = new Map(publicRows.map((t) => [t.id, t]));
  for (const row of mine) byId.set(row.team.id, row.team);
  return [...byId.values()];
}

export async function createTeam(
  userId: string,
  input: { name?: unknown; visibility?: unknown; avatarUrl?: unknown }
) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 100) {
    throw new TeamError("Name is required (max 100 characters)", 400);
  }
  const visibility =
    typeof input.visibility === "string" && isTeamVisibility(input.visibility)
      ? input.visibility
      : "private";
  const avatarUrl =
    typeof input.avatarUrl === "string" && input.avatarUrl.trim()
      ? input.avatarUrl.trim()
      : null;

  const existing = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .limit(1);
  if (existing[0]) {
    throw new TeamError("Leave your current team before creating another", 409);
  }

  try {
    const team = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(teams)
        .values({
          name,
          slug: slugFromName(name),
          visibility,
          avatarUrl,
          createdBy: userId,
        })
        .returning();
      const created = inserted[0];
      await tx.insert(teamMembers).values({
        teamId: created.id,
        userId,
        role: "admin",
      });
      return created;
    });
    bumpLeaderboard();
    return team;
  } catch (err) {
    if (postgresErrorCode(err) === "23505") {
      const still = await db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(eq(teamMembers.userId, userId))
        .limit(1);
      if (still[0]) {
        throw new TeamError("Leave your current team before creating another", 409);
      }
      throw new TeamError("Could not create team", 409);
    }
    throw err;
  }
}

export async function getTeam(teamId: string, viewerId: string | null) {
  const { team, member } = await requireVisibleTeam(teamId, viewerId);
  return { ...team, role: member?.role ?? null };
}

export async function patchTeam(
  teamId: string,
  userId: string,
  input: { name?: unknown; avatarUrl?: unknown; visibility?: unknown }
) {
  await requireAdminOrSub(teamId, userId);
  const patch: {
    name?: string;
    avatarUrl?: string | null;
    visibility?: "public" | "private";
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (typeof input.name === "string") {
    const name = input.name.trim();
    if (!name || name.length > 100) {
      throw new TeamError("Name is required (max 100 characters)", 400);
    }
    patch.name = name;
  }
  if (input.avatarUrl === null) patch.avatarUrl = null;
  if (typeof input.avatarUrl === "string") patch.avatarUrl = input.avatarUrl.trim() || null;
  if (typeof input.visibility === "string") {
    if (!isTeamVisibility(input.visibility)) {
      throw new TeamError("visibility must be public or private", 400);
    }
    patch.visibility = input.visibility;
  }
  const rows = await db
    .update(teams)
    .set(patch)
    .where(eq(teams.id, teamId))
    .returning();
  bumpLeaderboard();
  return rows[0];
}

export async function disbandTeam(teamId: string, userId: string) {
  await requireAdmin(teamId, userId);
  await db.transaction(async (tx) => {
    const teamRows = await tx
      .select({ id: teams.id, status: teams.status })
      .from(teams)
      .where(eq(teams.id, teamId))
      .for("update");
    if (!teamRows[0] || teamRows[0].status !== "active") {
      throw new TeamError("Team is not active", 409);
    }
    const locked = await tx
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .for("update");
    const self = locked.find((row) => row.userId === userId);
    if (!self || self.role !== "admin") {
      throw new TeamError("Forbidden", 403);
    }
    const userIds = locked.map((row) => row.userId);
    if (userIds.length > 0) {
      const groupRows = await tx
        .select({ id: groups.id })
        .from(groups)
        .where(eq(groups.teamId, teamId));
      const groupIds = groupRows.map((row) => row.id);
      if (groupIds.length > 0) {
        await tx.delete(groupMembers).where(
          sql`${groupMembers.groupId} in (${sql.join(
            groupIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        );
      }
    }
    await tx.delete(teamMembers).where(eq(teamMembers.teamId, teamId));
    await tx
      .update(teams)
      .set({ status: "disbanded", disbandedAt: new Date(), updatedAt: new Date() })
      .where(eq(teams.id, teamId));
  });
  bumpLeaderboard();
}

export async function deleteTeam(teamId: string, userId: string) {
  const team = await loadTeam(teamId);
  if (!team) throw new TeamError("Not found", 404);
  if (team.createdBy !== userId) {
    const member = await membership(teamId, userId);
    if (!canViewTeam(team, Boolean(member))) {
      throw new TeamError("Not found", 404);
    }
    throw new TeamError("Forbidden", 403);
  }
  if (team.status !== "disbanded") {
    throw new TeamError("Disband the team before deleting it", 409);
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, teamId));
  if (count > 0) {
    throw new TeamError("Team still has members", 409);
  }
  await db.delete(teams).where(eq(teams.id, teamId));
  bumpLeaderboard();
}

export async function listMembers(teamId: string, viewerId: string | null) {
  await requireVisibleTeam(teamId, viewerId);
  return db
    .select({
      userId: teamMembers.userId,
      role: teamMembers.role,
      joinedAt: teamMembers.joinedAt,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId));
}

type InviteInput = { username?: unknown; email?: unknown; groupId?: unknown };

/**
 * Invitation email link with the returnTo deep link back to /teams (D4).
 * Host comes from NEXT_PUBLIC_URL with a localhost dev fallback; registered
 * accounts get the login path, bare emails the register path.
 */
export function buildInviteLink(hasAccount: boolean): string {
  const base = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
  const path = hasAccount ? "/login" : "/register";
  return `${base}${path}?returnTo=${encodeURIComponent("/teams")}`;
}

export async function inviteMembers(
  teamId: string,
  actorId: string,
  items: InviteInput[]
) {
  const { team } = await requireAdminOrSub(teamId, actorId);
  if (!Array.isArray(items) || items.length === 0) {
    throw new TeamError("Invite at least one person", 400);
  }
  const created: { id: string; skipped?: boolean }[] = [];
  const details: string[] = [];

  for (const item of items) {
    const username =
      typeof item.username === "string" ? item.username.trim() : "";
    const email =
      typeof item.email === "string" ? item.email.trim().toLowerCase() : "";
    try {
      const groupId = inviteGroupId(item.groupId);
      const row = await db.transaction(async (tx) => {
        if (groupId) {
          const target = UUID_PATTERN.test(groupId)
            ? await tx
                .select({ id: groups.id })
                .from(groups)
                .where(
                  and(
                    eq(groups.id, groupId),
                    eq(groups.teamId, teamId),
                    eq(groups.status, "active")
                  )
                )
                .limit(1)
            : [];
          if (!target[0]) {
            throw new TeamError("Group is not available for auto-assign", 400);
          }
        }
        let invitedUserId: string | null = null;
        let invitedEmail: string | null = null;
        let invitedUsername: string | null = username || null;
        let notifyEmail: string | null = null;
        if (username) {
          const found = await tx
            .select()
            .from(users)
            .where(sql`lower(${users.username}) = ${username.toLowerCase()}`)
            .limit(2);
          if (found.length !== 1) {
            throw new TeamError(`Unknown username: ${username}`, 400);
          }
          invitedUserId = found[0].id;
          invitedUsername = found[0].username;
          notifyEmail = found[0].email?.toLowerCase() ?? null;
        } else if (email && EMAIL_PATTERN.test(email)) {
          const found = await tx
            .select()
            .from(users)
            .where(sql`lower(${users.email}) = ${email}`)
            .limit(1);
          if (found[0]) {
            invitedUserId = found[0].id;
            invitedUsername = found[0].username;
            invitedEmail = found[0].email?.toLowerCase() ?? email;
          } else {
            invitedEmail = email;
          }
        } else {
          throw new TeamError("Each invite needs a username or email", 400);
        }

        if (invitedUserId) {
          const already = await tx
            .select({ id: teamMembers.id })
            .from(teamMembers)
            .where(
              and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, invitedUserId))
            )
            .limit(1);
          if (already[0]) {
            throw new TeamError("User is already a member", 409);
          }
        }

        const token = generateRandomString(64);
        const inserted = await tx
          .insert(teamInvitations)
          .values({
            teamId,
            invitedEmail,
            invitedUsername,
            invitedUserId,
            invitedBy: actorId,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
            groupId,
          })
          .returning();
        return { row: inserted[0], notifyEmail: invitedEmail ?? notifyEmail };
      });
      created.push({ id: row.row.id });
      if (row.notifyEmail) {
        const dest = buildInviteLink(Boolean(row.row.invitedUserId));
        sendTeamInviteEmail(row.notifyEmail, team.name, dest);
      }
    } catch (err) {
      if (postgresErrorCode(err) === "23505") {
        created.push({ id: "", skipped: true });
        continue;
      }
      if (err instanceof TeamError) {
        details.push(err.message);
        continue;
      }
      throw err;
    }
  }

  const succeeded = created.filter((row) => row.id);
  if (succeeded.length === 0 && details.length > 0) {
    throw new TeamError("Invite failed", 400, details);
  }
  return { created, details };
}

export async function patchMemberRole(
  teamId: string,
  actorId: string,
  targetUserId: string,
  role: unknown
) {
  await requireAdmin(teamId, actorId);
  if (role !== "admin" && role !== "subadmin" && role !== "member") {
    throw new TeamError("Invalid role", 400);
  }
  const nextRole = role as TeamMemberRole;
  if (targetUserId === actorId && nextRole !== "admin") {
    throw new TeamError("Transfer admin before changing your own role", 409);
  }

  await db.transaction(async (tx) => {
    await tx
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .for("update");
    const target = await tx
      .select()
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId))
      )
      .limit(1);
    if (!target[0]) throw new TeamError("Member not found", 404);
    if (target[0].role === nextRole) return;

    if (nextRole === "admin") {
      await tx
        .update(teamMembers)
        .set({ role: "member" })
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "admin")));
      await tx
        .update(teamMembers)
        .set({ role: "admin" })
        .where(
          and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId))
        );
      return;
    }

    if (nextRole === "subadmin") {
      const updated = await tx.execute(sql`
        UPDATE "team_members"
        SET "role" = 'subadmin'
        WHERE "team_id" = ${teamId}
          AND "user_id" = ${targetUserId}
          AND (
            SELECT count(*) FROM "team_members"
            WHERE "team_id" = ${teamId} AND "role" = 'subadmin'
          ) < ${SUBADMIN_CAP}
        RETURNING "id"
      `);
      const rowCount = Array.isArray(updated) ? updated.length : 0;
      if (rowCount === 0) {
        throw new TeamError("Subadmin limit reached", 409);
      }
      return;
    }

    await tx
      .update(teamMembers)
      .set({ role: "member" })
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId))
      );
  });
  bumpLeaderboard();
}

export async function removeMember(
  teamId: string,
  actorId: string,
  targetUserId: string
) {
  await requireAdminOrSub(teamId, actorId);
  await db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .for("update");
    const actor = locked.find((row) => row.userId === actorId);
    const target = locked.find((row) => row.userId === targetUserId);
    if (!actor || (actor.role !== "admin" && actor.role !== "subadmin")) {
      throw new TeamError("Forbidden", 403);
    }
    if (!target) throw new TeamError("Member not found", 404);
    if (target.role === "admin") throw new TeamError("Cannot remove the admin", 403);
    if (actor.role === "subadmin" && target.role === "subadmin") {
      throw new TeamError("Forbidden", 403);
    }
    await tx.delete(groupMembers).where(eq(groupMembers.userId, targetUserId));
    await tx
      .delete(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId))
      );
  });
  bumpLeaderboard();
}

export async function leaveTeam(teamId: string, userId: string) {
  const { team, member } = await requireVisibleTeam(teamId, userId);
  if (!member) throw new TeamError("Forbidden", 403);
  if (team.status !== "active") throw new TeamError("Team is not active", 409);
  await db.transaction(async (tx) => {
    const locked = await tx
      .select()
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .for("update");
    const self = locked.find((row) => row.userId === userId);
    if (!self) throw new TeamError("Forbidden", 403);
    if (self.role === "admin") {
      throw new TeamError("Transfer admin or disband the team before leaving", 409);
    }
    await tx.delete(groupMembers).where(eq(groupMembers.userId, userId));
    await tx
      .delete(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  });
  bumpLeaderboard();
  await bumpUserProfile(userId);
}

export async function listGroups(teamId: string, viewerId: string | null) {
  await requireVisibleTeam(teamId, viewerId);
  return db.select().from(groups).where(eq(groups.teamId, teamId));
}

export async function createGroup(
  teamId: string,
  userId: string,
  input: { name?: unknown }
) {
  await requireAdminOrSub(teamId, userId);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 100) {
    throw new TeamError("Name is required (max 100 characters)", 400);
  }
  try {
    const rows = await db
      .insert(groups)
      .values({ teamId, name, createdBy: userId })
      .returning();
    bumpLeaderboard();
    return rows[0];
  } catch (err) {
    if (postgresErrorCode(err) === "23505") {
      throw new TeamError("A group with that name already exists", 409);
    }
    throw err;
  }
}

export async function patchGroup(
  teamId: string,
  groupId: string,
  userId: string,
  input: { name?: unknown }
) {
  await requireAdminOrSub(teamId, userId);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 100) {
    throw new TeamError("Name is required (max 100 characters)", 400);
  }
  try {
    const rows = await db
      .update(groups)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(groups.id, groupId), eq(groups.teamId, teamId)))
      .returning();
    if (!rows[0]) throw new TeamError("Not found", 404);
    bumpLeaderboard();
    return rows[0];
  } catch (err) {
    if (err instanceof TeamError) throw err;
    if (postgresErrorCode(err) === "23505") {
      throw new TeamError("A group with that name already exists", 409);
    }
    throw err;
  }
}

export async function disbandGroup(
  teamId: string,
  groupId: string,
  userId: string
) {
  await requireAdminOrSub(teamId, userId);
  await db.transaction(async (tx) => {
    const group = await tx
      .select()
      .from(groups)
      .where(and(eq(groups.id, groupId), eq(groups.teamId, teamId)))
      .for("update")
      .limit(1);
    if (!group[0]) throw new TeamError("Not found", 404);
    await tx.delete(groupMembers).where(eq(groupMembers.groupId, groupId));
    await tx
      .update(groups)
      .set({ status: "disbanded", disbandedAt: new Date(), updatedAt: new Date() })
      .where(eq(groups.id, groupId));
  });
  bumpLeaderboard();
}

export async function deleteGroup(
  teamId: string,
  groupId: string,
  userId: string
) {
  await requireAdminOrSub(teamId, userId);
  const group = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.teamId, teamId)))
    .limit(1);
  if (!group[0]) throw new TeamError("Not found", 404);
  if (group[0].status !== "disbanded") {
    throw new TeamError("Disband the group before deleting it", 409);
  }
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(groupMembers)
    .where(eq(groupMembers.groupId, groupId));
  if (count > 0) throw new TeamError("Group still has members", 409);
  await db.delete(groups).where(eq(groups.id, groupId));
  bumpLeaderboard();
}

export async function addGroupMember(
  teamId: string,
  groupId: string,
  actorId: string,
  targetUserId: string
) {
  await requireAdminOrSub(teamId, actorId);
  await db.transaction(async (tx) => {
    const onTeam = await tx
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(
        and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId))
      )
      .for("update")
      .limit(1);
    if (!onTeam[0]) throw new TeamError("User must be a team member first", 409);
    const group = await tx
      .select()
      .from(groups)
      .where(
        and(
          eq(groups.id, groupId),
          eq(groups.teamId, teamId),
          eq(groups.status, "active")
        )
      )
      .limit(1);
    if (!group[0]) throw new TeamError("Not found", 404);
    await tx.delete(groupMembers).where(eq(groupMembers.userId, targetUserId));
    await tx.insert(groupMembers).values({ groupId, userId: targetUserId });
  });
  bumpLeaderboard();
}

export async function removeGroupMember(
  teamId: string,
  groupId: string,
  actorId: string,
  targetUserId: string
) {
  await requireAdminOrSub(teamId, actorId);
  const owned = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.teamId, teamId)))
    .limit(1);
  if (!owned[0]) throw new TeamError("Not found", 404);
  await db
    .delete(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, targetUserId))
    );
  bumpLeaderboard();
}

export async function leaveGroup(
  teamId: string,
  groupId: string,
  userId: string
) {
  await requireVisibleTeam(teamId, userId);
  const owned = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.teamId, teamId)))
    .limit(1);
  if (!owned[0]) throw new TeamError("Not found", 404);
  await db
    .delete(groupMembers)
    .where(
      and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId))
    );
  bumpLeaderboard();
  await bumpUserProfile(userId);
}

export async function listMyInvitations(userId: string, email: string | null) {
  const emailClause =
    email != null
      ? and(
          isNull(teamInvitations.invitedUserId),
          sql`lower(${teamInvitations.invitedEmail}) = ${email.toLowerCase()}`
        )
      : sql`false`;
  return db
    .select({
      id: teamInvitations.id,
      teamId: teamInvitations.teamId,
      teamName: teams.name,
      status: teamInvitations.status,
      expiresAt: teamInvitations.expiresAt,
      createdAt: teamInvitations.createdAt,
    })
    .from(teamInvitations)
    .innerJoin(teams, eq(teams.id, teamInvitations.teamId))
    .where(
      and(
        eq(teamInvitations.status, "pending"),
        sql`${teamInvitations.expiresAt} > now()`,
        or(eq(teamInvitations.invitedUserId, userId), emailClause)
      )
    );
}

async function assertInvitee(
  query: Pick<typeof db, "select">,
  invite: { invitedUserId: string | null; invitedEmail: string | null },
  userId: string
): Promise<{ emailVerifiedAt: Date | null }> {
  const rows = await query
    .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const email = rows[0]?.email?.toLowerCase() ?? "";

  if (invite.invitedUserId) {
    if (invite.invitedUserId !== userId) throw new TeamError("Forbidden", 403);
  } else if (
    !invite.invitedEmail ||
    email !== invite.invitedEmail.toLowerCase()
  ) {
    throw new TeamError("Forbidden", 403);
  }

  if (invite.invitedEmail && email !== invite.invitedEmail.toLowerCase()) {
    throw new TeamError("Forbidden", 403);
  }

  return { emailVerifiedAt: rows[0]?.emailVerifiedAt ?? null };
}

export async function acceptInvitation(invitationId: string, userId: string) {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(teamInvitations)
      .where(eq(teamInvitations.id, invitationId))
      .limit(1);
    const invite = rows[0];
    if (!invite) throw new TeamError("Not found", 404);
    const { emailVerifiedAt } = await assertInvitee(tx, invite, userId);
    if (invite.invitedEmail && !emailVerifiedAt) {
      throw new TeamError("Verify your email before accepting this invitation", 403);
    }
    if (invite.status === "expired" || invite.expiresAt <= new Date()) {
      throw new TeamError("Invitation has expired", 409);
    }
    if (invite.status !== "pending") {
      throw new TeamError("Invitation is no longer pending", 409);
    }
    const teamRows = await tx
      .select()
      .from(teams)
      .where(eq(teams.id, invite.teamId))
      .for("update");
    if (!teamRows[0] || teamRows[0].status !== "active") {
      throw new TeamError("Team is not active", 409);
    }
    const updated = await tx
      .update(teamInvitations)
      .set({ status: "accepted", respondedAt: new Date(), invitedUserId: userId })
      .where(
        and(
          eq(teamInvitations.id, invitationId),
          eq(teamInvitations.status, "pending"),
          sql`${teamInvitations.expiresAt} > now()`
        )
      )
      .returning();
    if (!updated[0]) {
      throw new TeamError("Invitation is no longer pending", 409);
    }
    try {
      await tx.insert(teamMembers).values({
        teamId: invite.teamId,
        userId,
        role: "member",
        invitedBy: invite.invitedBy,
      });
    } catch (err) {
      if (postgresErrorCode(err) === "23505") {
        throw new TeamError("Leave your current team before accepting", 409);
      }
      throw err;
    }
    // INV-2: the invite's auto-assign group applies only while it is still an
    // active group on this team. A disbanded group (or a deleted row, nulled
    // by ON DELETE SET NULL) leaves the new member team-only.
    if (invite.groupId) {
      const target = await tx
        .select({ id: groups.id, status: groups.status })
        .from(groups)
        .where(
          and(eq(groups.id, invite.groupId), eq(groups.teamId, invite.teamId))
        )
        .for("update")
        .limit(1);
      if (target[0]?.status === "active") {
        await tx.delete(groupMembers).where(eq(groupMembers.userId, userId));
        await tx.insert(groupMembers).values({
          groupId: invite.groupId,
          userId,
        });
      }
    }
  });
  bumpLeaderboard();
}

export async function declineInvitation(invitationId: string, userId: string) {
  const rows = await db
    .select()
    .from(teamInvitations)
    .where(eq(teamInvitations.id, invitationId))
    .limit(1);
  const invite = rows[0];
  if (!invite) throw new TeamError("Not found", 404);
  await assertInvitee(db, invite, userId);
  const updated = await db
    .update(teamInvitations)
    .set({ status: "declined", respondedAt: new Date() })
    .where(
      and(
        eq(teamInvitations.id, invitationId),
        eq(teamInvitations.status, "pending")
      )
    )
    .returning();
  if (!updated[0]) throw new TeamError("Invitation is no longer pending", 409);
}

export async function revokeInvitation(
  teamId: string,
  invitationId: string,
  userId: string
) {
  await requireAdminOrSub(teamId, userId);
  const updated = await db
    .update(teamInvitations)
    .set({ status: "revoked", respondedAt: new Date() })
    .where(
      and(
        eq(teamInvitations.id, invitationId),
        eq(teamInvitations.teamId, teamId),
        eq(teamInvitations.status, "pending")
      )
    )
    .returning();
  if (!updated[0]) throw new TeamError("Invitation is no longer pending", 409);
}

export async function searchUsers(actorId: string, q: string) {
  const adminRows = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, actorId),
        or(eq(teamMembers.role, "admin"), eq(teamMembers.role, "subadmin"))
      )
    )
    .limit(1);
  if (!adminRows[0]) throw new TeamError("Forbidden", 403);

  const query = q.trim();
  if (!query) return [];

  if (EMAIL_PATTERN.test(query)) {
    const rows = await db
      .select({
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${query.toLowerCase()}`, eq(users.isPrivate, false)))
      .limit(1);
    return rows;
  }

  const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  return db
    .select({
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(
      and(
        eq(users.isPrivate, false),
        or(ilike(users.username, pattern), ilike(users.displayName, pattern)),
      ),
    )
    .limit(10);
}

export async function expireInvitations(): Promise<number> {
  const updated = await db
    .update(teamInvitations)
    .set({ status: "expired", respondedAt: new Date() })
    .where(
      and(eq(teamInvitations.status, "pending"), lt(teamInvitations.expiresAt, new Date()))
    )
    .returning({ id: teamInvitations.id });
  return updated.length;
}

export async function linkPendingInvitationsForEmail(
  userId: string,
  email: string
): Promise<void> {
  const normalized = email.toLowerCase();
  const pending = await db
    .select()
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.status, "pending"),
        sql`${teamInvitations.expiresAt} > now()`,
        or(
          eq(teamInvitations.invitedUserId, userId),
          and(
            isNull(teamInvitations.invitedUserId),
            sql`lower(${teamInvitations.invitedEmail}) = ${normalized}`
          )
        )
      )
    );
  const byTeam = new Map<string, typeof pending>();
  for (const row of pending) {
    const list = byTeam.get(row.teamId) ?? [];
    list.push(row);
    byTeam.set(row.teamId, list);
  }

  for (const [teamId] of byTeam) {
    await db.transaction(async (tx) => {
      const locked = await tx
        .select()
        .from(teamInvitations)
        .where(
          and(
            eq(teamInvitations.teamId, teamId),
            eq(teamInvitations.status, "pending"),
            sql`${teamInvitations.expiresAt} > now()`,
            or(
              eq(teamInvitations.invitedUserId, userId),
              and(
                isNull(teamInvitations.invitedUserId),
                sql`lower(${teamInvitations.invitedEmail}) = ${normalized}`
              )
            )
          )
        )
        .for("update");
      if (locked.length === 0) return;
      locked.sort((a, b) => {
        const t = a.createdAt.getTime() - b.createdAt.getTime();
        if (t !== 0) return t;
        return a.id < b.id ? -1 : 1;
      });
      const [winner, ...losers] = locked;
      for (const loser of losers) {
        await tx
          .update(teamInvitations)
          .set({ status: "superseded", respondedAt: new Date() })
          .where(eq(teamInvitations.id, loser.id));
      }
      if (!winner.invitedUserId) {
        await tx
          .update(teamInvitations)
          .set({ invitedUserId: userId })
          .where(eq(teamInvitations.id, winner.id));
      }
    });
  }
}
