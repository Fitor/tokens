import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CONTAINER } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { buttonVariants } from "@/components/ui/button";

import { Card, CardContent } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { LOCALE_COOKIE, parseLocale, t } from "@/lib/i18n";
import { loadPendingInvitations, loadTeamsPageData } from "@/lib/teams/pageData";
import { cn } from "@/lib/utils";
import { TeamsClient } from "@/components/teams/TeamsClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Teams - Tokens",
  description: "Create a team, group its members, and manage who can do what.",
};

export default async function TeamsPage() {
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const session = await getSession();

  if (!session) {
    return (
      <main className={cn(CONTAINER, "pb-24 pt-10 sm:pt-14")} id="main-content">
        <div className="mx-auto w-full max-w-[860px]">
          <PageHeader
            title={t(locale, "teams.title")}
            description={t(locale, "teams.desc")}
          />
          <Card>
            <CardContent className="flex flex-col items-start gap-4">
              <p className="text-sm text-muted-foreground">
                {t(locale, "teams.gateDesc")}
              </p>
              <a
                href={`/login?returnTo=${encodeURIComponent("/teams")}`}
                className={buttonVariants()}
              >
                {t(locale, "nav.signIn")}
              </a>


            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const initialData = await loadTeamsPageData(session.id);
  const invitations = await loadPendingInvitations(session.id);
  return (
    <main className={cn(CONTAINER, "pb-24 pt-10 sm:pt-14")} id="main-content">
      <div className="mx-auto w-full max-w-[860px]">
        <TeamsClient
          initialData={initialData}
          selfId={session.id}
          invitations={invitations}
        />
      </div>
    </main>
  );
}
