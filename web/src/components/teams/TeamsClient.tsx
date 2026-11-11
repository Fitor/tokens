"use client";

import { useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import { toast } from "react-toastify";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { avatarUrlFor } from "@/lib/avatar";
import { intlTag, useI18n, type TranslationKey } from "@/lib/i18n";
import type { TeamMemberRole, TeamStatus, TeamVisibility } from "@/lib/teams/types";
import type {
  TeamsPageData,
  TeamsPageGroup,
  TeamsPageInvitation,
  TeamsPageMember,
} from "@/lib/teams/pageData";
import { cn } from "@/lib/utils";
import { teamApi } from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import { InviteDialog } from "./InviteDialog";

const ROLE_RANK: Record<string, number> = { admin: 0, subadmin: 1, member: 2 };

const TEAM_ROLE_KEYS: Record<TeamMemberRole, TranslationKey> = {
  admin: "teams.role.admin",
  subadmin: "teams.role.subadmin",
  member: "teams.role.member",
};
const TEAM_STATUS_KEYS: Record<TeamStatus, TranslationKey> = {
  active: "teams.status.active",
  disbanded: "teams.status.disbanded",
};
const TEAM_VISIBILITY_KEYS: Record<TeamVisibility, TranslationKey> = {
  public: "teams.public",
  private: "teams.private",
};
const TEAM_VIS_HINT_KEYS: Record<TeamVisibility, TranslationKey> = {
  public: "teams.visHint.public",
  private: "teams.visHint.private",
};

export function TeamsClient({
  initialData,
  selfId,
  invitations = [],
}: {
  initialData: TeamsPageData | null;
  selfId: string;
  invitations?: TeamsPageInvitation[];
}) {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t("teams.title")} description={t("teams.desc")} />
      {invitations.length > 0 && <InviteInbox invitations={invitations} />}
      {initialData ? (
        <TeamDashboard data={initialData} selfId={selfId} />
      ) : (
        <CreateTeamCard />
      )}
    </>
  );
}

/**
 * 受邀人查看待处理邀请: one container at the top of TeamsClient with a row
 * per pending invitation (D1), shown regardless of team membership. Accept
 * is the only action (D3) — no decline control; expired invites never reach
 * this component because the server filters them.
 */
function InviteInbox({ invitations }: { invitations: TeamsPageInvitation[] }) {
  const { t } = useI18n();
  return (
    <Card className="mb-6" data-testid="invite-inbox">
      <div className="flex items-center justify-between border-b border-border bg-muted/55 px-4 py-2.5">
        <h2 className="text-sm font-semibold">{t("teams.invites.title")}</h2>
        <Badge variant="outline" className="tabular">
          {invitations.length}
        </Badge>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {invitations.map((invite) => (
          <InviteRow key={invite.id} invite={invite} />
        ))}
      </div>
    </Card>
  );
}

function InviteRow({ invite }: { invite: TeamsPageInvitation }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const expiryDate = new Date(invite.expiresAt).toLocaleDateString(
    intlTag(locale)
  );

  /** Accept via the existing endpoint; failures toast the existing
   *  locale-mapped server error (D5), success refreshes SSR data (D6). */
  const accept = async () => {
    setBusy(true);
    const error = await teamApi(`/api/invitations/${invite.id}/accept`, {
      method: "POST",
    });
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5 px-4 py-2.5">
      <div className="min-w-0">
        <span className="block truncate text-sm font-medium">
          {invite.teamName}
        </span>
        <span
          className="block text-xs text-muted-foreground tabular"
          data-testid="invite-expires"
          data-expires={invite.expiresAt.slice(0, 10)}
        >
          {t("teams.invites.expires", { date: expiryDate })}
        </span>
      </div>
      <div className="ml-auto">
        <Button size="sm" disabled={busy} onClick={() => void accept()}>
          {t("teams.invites.accept")}
        </Button>
      </div>
    </div>
  );
}

/** Shown when the signed-in user belongs to no team (and has no disbanded
 *  team left to delete). Visibility is a deliberate choice — the form cannot
 *  be submitted without one even though the DB defaults to private. */
function CreateTeamCard() {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private" | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const error = await teamApi("/api/teams", {
      body: { name: name.trim(), visibility },
    });
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    router.refresh();
  };

  return (
    <Card className="max-w-[560px]">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold">{t("teams.createTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("teams.createDesc")}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="create-team-name">{t("teams.nameLabel")}</Label>
          <Input
            id="create-team-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>{t("teams.visibilityLabel")}</Label>
          <Select
            value={visibility}
            onValueChange={(value) => {
              if (value === "public" || value === "private") {
                setVisibility(value);
              }
            }}
          >
            <SelectTrigger aria-label={t("teams.visibilityLabel")}>
              <SelectValue>
                {(value) =>
                  value === "public"
                    ? t("teams.public")
                    : value === "private"
                      ? t("teams.private")
                      : t("teams.visibilityPh")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">{t("teams.public")}</SelectItem>
              <SelectItem value="private">{t("teams.private")}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t("teams.visibilityHint")}
          </p>
        </div>
        <div>
          <Button
            disabled={busy || !name.trim() || visibility === null}
            onClick={() => void submit()}
          >
            {t("teams.create")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TeamDashboard({
  data,
  selfId,
}: {
  data: TeamsPageData;
  selfId: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { team, myRole, isCreator, members, groups } = data;

  const isAdmin = myRole === "admin";
  const canManage = (isAdmin || myRole === "subadmin") && team.status === "active";

  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<TeamsPageMember | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamsPageMember | null>(null);
  const [disbandOpen, setDisbandOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const [groupRename, setGroupRename] = useState<TeamsPageGroup | null>(null);
  const [groupDisband, setGroupDisband] = useState<TeamsPageGroup | null>(null);
  const [groupDelete, setGroupDelete] = useState<TeamsPageGroup | null>(null);

  /** Runs a mutation, toasts the failure if any, refreshes server data. */
  const run = async (action: () => Promise<string | null>) => {
    const error = await action();
    if (error) {
      toast.error(error);
      return error;
    }
    router.refresh();
    return null;
  };

  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const sortedMembers = [...members].sort(
    (a, b) =>
      (ROLE_RANK[a.role] ?? 3) - (ROLE_RANK[b.role] ?? 3) ||
      a.username.localeCompare(b.username)
  );
  const visibleMembers =
    groupFilter === null
      ? sortedMembers
      : sortedMembers.filter((m) => m.groupId === groupFilter);
  const selectedGroup =
    groupFilter === null
      ? null
      : (groups.find((g) => g.id === groupFilter) ?? null);

  const activeGroupCount = groups.filter((g) => g.status === "active").length;
  const createdDate = new Date(team.createdAt).toLocaleDateString(
    intlTag(locale)
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Team header */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <Avatar className="size-11 rounded-lg">
              <AvatarImage
                src={avatarUrlFor({
                  username: team.name,
                  avatarUrl: team.avatarUrl,
                })}
                alt=""
              />
              <AvatarFallback className="rounded-lg">
                {team.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-[17px]">{team.name}</strong>
                {myRole && <Badge>{t(TEAM_ROLE_KEYS[myRole])}</Badge>}
                <Badge variant={team.status === "active" ? "secondary" : "destructive"}>
                  {t(TEAM_STATUS_KEYS[team.status])}
                </Badge>
                <Badge variant="outline" title={t(TEAM_VIS_HINT_KEYS[team.visibility])}>
                  {t(TEAM_VISIBILITY_KEYS[team.visibility])}
                </Badge>
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground tabular">
                {t("teams.meta", {
                  members: members.length,
                  groups: activeGroupCount,
                  date: createdDate,
                })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <>
                <Button
                  variant="outline"
                  onClick={() =>
                    void run(() =>
                      teamApi(`/api/teams/${team.id}`, {
                        method: "PATCH",
                        body: {
                          visibility:
                            team.visibility === "public" ? "private" : "public",
                        },
                      })
                    )
                  }
                >
                  {team.visibility === "public"
                    ? t("teams.setPrivate")
                    : t("teams.setPublic")}
                </Button>
                <Button variant="outline" onClick={() => setRenameOpen(true)}>
                  {t("teams.rename")}
                </Button>
                <Button onClick={() => setInviteOpen(true)}>
                  {t("teams.invite")}
                </Button>
              </>
            )}
            {myRole && myRole !== "admin" && team.status === "active" && (
              <Button variant="outline" onClick={() => setLeaveOpen(true)}>
                {t("teams.leave")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {team.status === "active" && (
        <>
          {/* Group filter chips */}
          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{t("teams.groupsTitle")}</h2>
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGroupCreateOpen(true)}
                >
                  {t("teams.newGroup")}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterChip
                pressed={groupFilter === null}
                onClick={() => setGroupFilter(null)}
                label={t("teams.allMembers")}
                count={members.length}
              />
              {groups.map((g) => (
                <FilterChip
                  key={g.id}
                  pressed={groupFilter === g.id}
                  onClick={() =>
                    setGroupFilter(groupFilter === g.id ? null : g.id)
                  }
                  label={g.name}
                  count={g.memberCount}
                  muted={g.status !== "active"}
                />
              ))}
            </div>
            {selectedGroup && canManage && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setGroupRename(selectedGroup)}
                >
                  {t("teams.renameGroup")}
                </Button>
                {selectedGroup.status === "active" ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setGroupDisband(selectedGroup)}
                  >
                    {t("teams.disbandGroup")}
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={selectedGroup.memberCount > 0}
                    onClick={() => setGroupDelete(selectedGroup)}
                  >
                    {t("teams.deleteGroup")}
                  </Button>
                )}
              </div>
            )}
          </section>

          {/* Members */}
          <Card>
            <div className="flex items-center justify-between border-b border-border bg-muted/55 px-4 py-2.5">
              <h2 className="text-sm font-semibold">{t("teams.membersTitle")}</h2>
              <Badge variant="outline" className="tabular">
                {visibleMembers.length}
              </Badge>
            </div>
            <div className="flex flex-col divide-y divide-border">
              {visibleMembers.map((m) => (
                <MemberRow
                  key={m.userId}
                  member={m}
                  teamId={team.id}
                  groups={groups}
                  groupNameById={groupNameById}
                  canManage={canManage}
                  isAdmin={isAdmin}
                  myRole={myRole}
                  isSelf={m.userId === selfId}
                  run={run}
                  onTransfer={() => setTransferTarget(m)}
                  onRemove={() => setRemoveTarget(m)}
                />
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Danger zone */}
      {(isAdmin || isCreator) && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">{t("teams.dangerZone")}</h2>
          <Card className="border-destructive/35">
            <CardContent className="flex flex-col gap-4">
              {team.status === "active" && isAdmin && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <strong className="text-sm">{t("teams.disbandTitle")}</strong>
                    <p className="mt-1 max-w-[52ch] text-xs text-muted-foreground">
                      {t("teams.disbandDesc")}
                    </p>
                  </div>
                  <Button variant="destructive" onClick={() => setDisbandOpen(true)}>
                    {t("teams.disband")}
                  </Button>
                </div>
              )}
              {isCreator && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <strong className="text-sm">{t("teams.deleteTitle")}</strong>
                    <p className="mt-1 max-w-[52ch] text-xs text-muted-foreground">
                      {t("teams.deleteDesc")}
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    disabled={
                      team.status !== "disbanded" || members.length > 0
                    }
                    onClick={() => setDeleteOpen(true)}
                  >
                    {t("teams.delete")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Dialogs */}
      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        currentName={team.name}
        title={t("dlgRename.title")}
        description={t("dlgRename.desc")}
        label={t("dlgRename.label")}
        onSave={(name) =>
          teamApi(`/api/teams/${team.id}`, { method: "PATCH", body: { name } })
        }
        onSaved={() => router.refresh()}
      />
      <InviteDialog
        teamId={team.id}
        memberUsernames={members.map((m) => m.username)}
        groups={groups
          .filter((g) => g.status === "active")
          .map(({ id, name }) => ({ id, name }))}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title={t("dlgLeave.title")}
        description={t("dlgLeave.desc")}
        confirmLabel={t("dlgLeave.confirm")}
        onConfirm={() =>
          run(() =>
            teamApi(`/api/teams/${team.id}/members/me`, { method: "DELETE" })
          )
        }
      />
      <ConfirmDialog
        open={transferTarget !== null}
        onOpenChange={(open) => !open && setTransferTarget(null)}
        title={t("dlgTransfer.title")}
        description={
          transferTarget
            ? t("dlgTransfer.desc", {
                name: transferTarget.displayName ?? transferTarget.username,
              })
            : undefined
        }
        confirmLabel={t("dlgTransfer.confirm")}
        destructive={false}
        onConfirm={() =>
          transferTarget
            ? run(() =>
                teamApi(
                  `/api/teams/${team.id}/members/${transferTarget.userId}`,
                  { method: "PATCH", body: { role: "admin" } }
                )
              )
            : Promise.resolve(null)
        }
      />
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title={t("dlgRemove.title")}
        description={t("dlgRemove.desc")}
        confirmName={removeTarget?.username ?? ""}
        confirmLabel={t("dlgRemove.confirm")}
        onConfirm={() =>
          removeTarget
            ? run(() =>
                teamApi(
                  `/api/teams/${team.id}/members/${removeTarget.userId}`,
                  { method: "DELETE" }
                )
              )
            : Promise.resolve(null)
        }
      />
      <ConfirmDialog
        open={disbandOpen}
        onOpenChange={setDisbandOpen}
        title={t("dlgDisband.title")}
        description={t("dlgDisband.desc")}
        confirmName={team.name}
        confirmLabel={t("dlgDisband.confirm")}
        onConfirm={() =>
          run(() => teamApi(`/api/teams/${team.id}/disband`, { method: "POST" }))
        }
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("dlgDelete.title")}
        description={t("dlgDelete.desc")}
        confirmName={team.name}
        confirmLabel={t("dlgDelete.confirm")}
        onConfirm={() =>
          run(() => teamApi(`/api/teams/${team.id}`, { method: "DELETE" }))
        }
      />
      <RenameDialog
        open={groupCreateOpen}
        onOpenChange={setGroupCreateOpen}
        currentName=""
        title={t("dlgGroup.title")}
        description={t("dlgGroup.desc")}
        label={t("dlgGroup.label")}
        placeholder={t("dlgGroup.ph")}
        saveLabel={t("dlg.create")}
        onSave={(name) =>
          teamApi(`/api/teams/${team.id}/groups`, { body: { name } })
        }
        onSaved={() => router.refresh()}
      />
      <RenameDialog
        open={groupRename !== null}
        onOpenChange={(open) => !open && setGroupRename(null)}
        currentName={groupRename?.name ?? ""}
        title={t("dlgGroupRename.title")}
        label={t("dlgGroup.label")}
        onSave={(name) =>
          groupRename
            ? teamApi(`/api/teams/${team.id}/groups/${groupRename.id}`, {
                method: "PATCH",
                body: { name },
              })
            : Promise.resolve(null)
        }
        onSaved={() => router.refresh()}
      />
      <ConfirmDialog
        open={groupDisband !== null}
        onOpenChange={(open) => !open && setGroupDisband(null)}
        title={t("dlgGroupDisband.title")}
        description={t("dlgGroupDisband.desc")}
        confirmName={groupDisband?.name ?? ""}
        confirmLabel={t("dlgGroupDisband.confirm")}
        onConfirm={() =>
          groupDisband
            ? run(() =>
                teamApi(
                  `/api/teams/${team.id}/groups/${groupDisband.id}/disband`,
                  { method: "POST" }
                )
              )
            : Promise.resolve(null)
        }
      />
      <ConfirmDialog
        open={groupDelete !== null}
        onOpenChange={(open) => !open && setGroupDelete(null)}
        title={t("dlgGroupDelete.title")}
        description={t("dlgGroupDelete.desc")}
        confirmName={groupDelete?.name ?? ""}
        confirmLabel={t("dlgGroupDelete.confirm")}
        onConfirm={() =>
          groupDelete
            ? run(() =>
                teamApi(`/api/teams/${team.id}/groups/${groupDelete.id}`, {
                  method: "DELETE",
                })
              )
            : Promise.resolve(null)
        }
      />
    </div>
  );
}

function FilterChip({
  pressed,
  onClick,
  label,
  count,
  muted = false,
}: {
  pressed: boolean;
  onClick: () => void;
  label: string;
  count: number;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
        pressed
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
        muted && "opacity-60"
      )}
    >
      {label}
      <span className="tabular opacity-70">{count}</span>
    </button>
  );
}

function MemberRow({
  member,
  teamId,
  groups,
  groupNameById,
  canManage,
  isAdmin,
  myRole,
  isSelf,
  run,
  onTransfer,
  onRemove,
}: {
  member: TeamsPageMember;
  teamId: string;
  groups: TeamsPageGroup[];
  groupNameById: Map<string, string>;
  canManage: boolean;
  isAdmin: boolean;
  myRole: TeamsPageData["myRole"];
  isSelf: boolean;
  run: (action: () => Promise<string | null>) => Promise<string | null>;
  onTransfer: () => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const activeGroups = groups.filter((g) => g.status === "active");
  // The demo locks the admin row: role changes and removal of the team's
  // single admin all go through transfer/disband, not member actions.
  const locked = member.role === "admin";
  const showRemove =
    canManage &&
    !locked &&
    !(myRole === "subadmin" && member.role === "subadmin");

  const assignGroup = (groupId: string | null) =>
    void run(() => {
      if (groupId) {
        return teamApi(
          `/api/teams/${teamId}/groups/${groupId}/members/${member.userId}`,
          { method: "PUT" }
        );
      }
      return member.groupId
        ? teamApi(
            `/api/teams/${teamId}/groups/${member.groupId}/members/${member.userId}`,
            { method: "DELETE" }
          )
        : Promise.resolve(null);
    });

  return (
    <div className="flex flex-wrap items-center gap-2.5 px-4 py-2.5">
      <Avatar className="size-8">
        <AvatarImage
          src={avatarUrlFor({
            username: member.username,
            avatarUrl: member.avatarUrl,
          })}
          alt=""
        />
        <AvatarFallback>
          {member.username.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <span className="block truncate text-sm font-medium">
          {member.displayName ?? member.username}
          {isSelf && (
            <span className="ml-1.5 text-xs text-muted-foreground">
              {t("teams.you")}
            </span>
          )}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          @{member.username}
        </span>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn(!member.groupId && "opacity-50")}>
          {member.groupId
            ? (groupNameById.get(member.groupId) ?? t("teams.ungrouped"))
            : t("teams.ungrouped")}
        </Badge>
        <Badge
          variant={
            member.role === "admin"
              ? "default"
              : member.role === "subadmin"
                ? "secondary"
                : "outline"
          }
        >
          {t(TEAM_ROLE_KEYS[member.role])}
        </Badge>
        {canManage && !locked && (
          <>
            {activeGroups.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" size="sm" />}
                >
                  {t("teams.assignGroup")}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => assignGroup(null)}>
                      {t("teams.ungrouped")}
                    </DropdownMenuItem>
                    {activeGroups.map((g) => (
                      <DropdownMenuItem
                        key={g.id}
                        onClick={() => assignGroup(g.id)}
                      >
                        {g.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void run(() =>
                      teamApi(`/api/teams/${teamId}/members/${member.userId}`, {
                        method: "PATCH",
                        body: {
                          role:
                            member.role === "subadmin" ? "member" : "subadmin",
                        },
                      })
                    )
                  }
                >
                  {member.role === "subadmin"
                    ? t("teams.revokeSubadmin")
                    : t("teams.makeSubadmin")}
                </Button>
                <Button variant="outline" size="sm" onClick={onTransfer}>
                  {t("teams.transferAdmin")}
                </Button>
              </>
            )}
            {showRemove && (
              <Button variant="destructive" size="sm" onClick={onRemove}>
                {t("teams.remove")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Shared single-name dialog: team rename, group create, group rename. */
function RenameDialog({
  open,
  onOpenChange,
  currentName,
  title,
  description,
  label,
  placeholder,
  saveLabel,
  onSave,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  saveLabel?: string;
  onSave: (name: string) => Promise<string | null>;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    // Reset the draft each time the dialog opens (render-phase set-state).
    setLastOpen(open);
    if (open) setValue(currentName);
  }

  const submit = async () => {
    setBusy(true);
    const error = await onSave(value.trim());
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={busy ? () => {} : onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rename-input">{label}</Label>
          <Input
            id="rename-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            maxLength={100}
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={busy} />}>
            {t("dlg.cancel")}
          </DialogClose>
          <Button
            disabled={busy || !value.trim() || value.trim() === currentName}
            onClick={() => void submit()}
          >
            {saveLabel ?? t("dlg.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
