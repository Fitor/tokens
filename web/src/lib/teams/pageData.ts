import { and, eq, inArray } from "drizzle-orm";
import { db, groupMembers, groups, teamMembers, teams, users } from "@/lib/db";
import { listMyInvitations } from "./service";
import type { TeamMemberRole, TeamStatus, TeamVisibility } from "./types";

export interface TeamsPageMember {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: TeamMemberRole;
  groupId: string | null;
}

export interface TeamsPageGroup {
  id: string;
  name: string;
  status: TeamStatus;
  memberCount: number;
}

export interface TeamsPageData {
  team: {
    id: string;
    name: string;
    avatarUrl: string | null;
    visibility: TeamVisibility;
    status: TeamStatus;
    createdAt: string;
  };
  /** Null when the viewer is the creator of a disbanded team (delete flow). */
  myRole: TeamMemberRole | null;
  isCreator: boolean;
  members: TeamsPageMember[];
  groups: TeamsPageGroup[];
}

export interface TeamsPageInvitation {
  id: string;
  teamName: string;
  /** ISO timestamp of the invitation's expiry. */
  expiresAt: string;
}

/**
 * Pending, unexpired invitations addressed to the viewer — the /teams
 * invitation inbox. `listMyInvitations` matches by user id and by bound
 * email, so email-path invites reach the account before any backfill;
 * expired rows are already filtered server-side.
 */
export async function loadPendingInvitations(
  userId: string
): Promise<TeamsPageInvitation[]> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const invitations = await listMyInvitations(userId, rows[0]?.email ?? null);
  return invitations.map((row) => ({
    id: row.id,
    teamName: row.teamName,
    expiresAt: row.expiresAt.toISOString(),
  }));
}

/**
 * Data for /teams. The viewer's team comes from their membership row; a
 * creator whose team is already disbanded has no membership left but still
 * holds deletion rights, so that team is loaded too.
 *
 * Read path for the signed-in viewer's own team only — it deliberately does
 * not go through `canViewTeam`, which would hide a private/disbanded team
 * from the very member (or creator) this page manages.
 */
export async function loadTeamsPageData(
  userId: string
): Promise<TeamsPageData | null> {
  const membership = await db
    .select({ teamId: teamMembers.teamId, role: teamMembers.role })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .limit(1);

  let teamId: string;
  let myRole: TeamMemberRole | null;
  if (membership[0]) {
    teamId = membership[0].teamId;
    myRole = membership[0].role as TeamMemberRole;
  } else {
    const created = await db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.createdBy, userId), eq(teams.status, "disbanded")))
      .limit(1);
    if (!created[0]) return null;
    teamId = created[0].id;
    myRole = null;
  }

  const teamRows = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  const team = teamRows[0];
  if (!team) return null;

  const groupRows = await db
    .select()
    .from(groups)
    .where(eq(groups.teamId, teamId));

  const groupIds = groupRows.map((g) => g.id);
  const groupMemberRows = groupIds.length
    ? await db
        .select({ groupId: groupMembers.groupId, userId: groupMembers.userId })
        .from(groupMembers)
        .where(inArray(groupMembers.groupId, groupIds))
    : [];

  const groupByUser = new Map(
    groupMemberRows.map((row) => [row.userId, row.groupId])
  );
  const countByGroup = new Map<string, number>();
  for (const row of groupMemberRows) {
    countByGroup.set(row.groupId, (countByGroup.get(row.groupId) ?? 0) + 1);
  }

  const memberRows = await db
    .select({
      userId: teamMembers.userId,
      role: teamMembers.role,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId));

  return {
    team: {
      id: team.id,
      name: team.name,
      avatarUrl: team.avatarUrl,
      visibility: team.visibility as TeamVisibility,
      status: team.status as TeamStatus,
      createdAt: team.createdAt.toISOString(),
    },
    myRole,
    isCreator: team.createdBy === userId,
    members: memberRows.map((row) => ({
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      role: row.role as TeamMemberRole,
      groupId: groupByUser.get(row.userId) ?? null,
    })),
    groups: groupRows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status as TeamStatus,
      memberCount: countByGroup.get(row.id) ?? 0,
    })),
  };
}
