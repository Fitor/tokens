"use client";

import { useMemo, useState } from "react";
import { ChevronRightIcon, Code2Icon, Share2Icon } from "lucide-react";
import { toast } from "react-toastify";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CONTAINER } from "@/components/layout/Container";
import { SourceLogo } from "@/components/SourceLogo";
import { ProfileSocialLinks } from "./ProfileSocialLinks";
import { cn } from "@/lib/utils";
import { avatarUrlFor } from "@/lib/avatar";
import { intlTag, useFormat, useI18n, type TranslationKey } from "@/lib/i18n";
import type { ProfileSocialLink } from "./types";

export interface ProfileViewStats {
  totalTokens: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens?: number;
  submissionCount: number;
  activeDays: number;
  sessionCount: number;
}

export interface ProfileViewModel {
  name: string;
  tokens: number;
  cost: number;
}

export interface ProfileViewProps {
  user: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    createdAt: string;
    rank: number | null;
  };
  stats: ProfileViewStats;
  updatedAt: string | null;
  clients: string[];
  models: ProfileViewModel[];
  mcpServers?: string[];
  socialLinks?: ProfileSocialLink[];
  hasBackfill?: boolean;
  period: "all" | "month" | "week";
  onPeriodChange: (period: "all" | "month" | "week") => void;
  onEmbedClick: () => void;
  /**
   * The heavy sections are passed in rather than constructed here, so this
   * file stays a layout. Every one of them is rendered — the page lays its
   * sections out end to end instead of hiding them behind tabs, because on a
   * profile the whole point is seeing the picture at once.
   */
  activity: React.ReactNode;
  /** Today's figures. Sits directly under the headline totals. */
  today?: React.ReactNode;
  usageChart?: React.ReactNode;
  habits?: React.ReactNode;
  breakdown?: React.ReactNode;
  modelsSection?: React.ReactNode;
  devices?: React.ReactNode;
  /** Team/Group affiliation. Omitted entirely when the user has none. */
  membership?: React.ReactNode;
}

const PERIODS = [
  { value: "all", key: "profile.periodAll" },
  { value: "month", key: "profile.periodMonth" },
  { value: "week", key: "profile.periodWeek" },
] as const;

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-xl leading-none tabular-nums sm:text-2xl">
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/**
 * Composition of the token total.
 *
 * Rendered as one proportional bar: the useful question here is "how much of
 * this is cache reads", which the bar answers at a glance. Exact values and
 * shares stay underneath for anyone who wants them.
 */
function TokenComposition({ stats }: { stats: ProfileViewStats }) {
  const { t } = useI18n();
  const { formatNumber, formatPercent } = useFormat();
  const parts = useMemo(() => {
    const nonZero = ([
      { labelKey: "tokens.input", value: stats.inputTokens, className: "bg-chart-1" },
      { labelKey: "tokens.output", value: stats.outputTokens, className: "bg-chart-2" },
      { labelKey: "tokens.cacheRead", value: stats.cacheReadTokens, className: "bg-chart-3" },
      { labelKey: "tokens.cacheWrite", value: stats.cacheWriteTokens, className: "bg-chart-4" },
      { labelKey: "tokens.reasoning", value: stats.reasoningTokens ?? 0, className: "bg-chart-5" },
    ] satisfies ReadonlyArray<{ labelKey: TranslationKey; value: number; className: string }>).filter(
      (p) => p.value > 0
    );
    const total = nonZero.reduce((sum, p) => sum + p.value, 0);
    return nonZero.map((p) => ({ ...p, share: (p.value / total) * 100 }));
  }, [stats]);

  if (parts.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full">
        {parts.map((p) => (
          <div
            key={p.labelKey}
            className={p.className}
            style={{ width: `${p.share}%` }}
            title={t("profile.breakdown.segmentTitle", {
              label: t(p.labelKey),
              tokens: formatNumber(p.value, true),
            })}
          />
        ))}
      </div>
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {parts.map((p) => (
          <div key={p.labelKey} className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", p.className)} aria-hidden="true" />
            <dt className="text-xs text-muted-foreground">{t(p.labelKey)}</dt>
            <dd className="whitespace-nowrap font-mono text-xs tabular-nums">
              {formatNumber(p.value, true)}{" "}
              <span className="text-muted-foreground">{formatPercent(p.share)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

/**
 * A section that starts closed. Used for reference material — content worth
 * having but not worth the vertical space on arrival.
 */
function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group flex flex-col gap-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold tracking-tight">
        <ChevronRightIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
        {title}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}


export function ProfileView({
  user,
  stats,
  updatedAt,
  clients,
  models,
  mcpServers,
  socialLinks,
  hasBackfill,
  period,
  onPeriodChange,
  onEmbedClick,
  activity,
  today,
  usageChart,
  habits,
  breakdown,
  modelsSection,
  devices,
  membership,
}: ProfileViewProps) {
  const { t, locale } = useI18n();
  const { formatNumber, formatCurrency } = useFormat();
  const [copied, setCopied] = useState(false);
  const avatar = avatarUrlFor(user);
  const joined = new Date(user.createdAt).toLocaleDateString(intlTag(locale), {
    month: "short",
    year: "numeric",
  });

  const share = async () => {
    const url = `${window.location.origin}/u/${user.username}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("profile.linkCopied"));
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(t("profile.copyFailed"));
    }
  };

  const topModels = models.slice(0, 12);

  return (
    <main id="main-content" className={cn(CONTAINER, "pb-24 pt-10 sm:pt-14")}>
      {/* ---- Identity -------------------------------------------------- */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar className="size-16 shrink-0 sm:size-20">
            <AvatarImage src={avatar} alt="" />
            <AvatarFallback className="text-lg">
              {user.username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                {user.displayName || user.username}
              </h1>
              {user.rank != null && (
                <Badge variant="secondary" className="font-mono tabular-nums">
                  {t("profile.rank", { n: formatNumber(user.rank, false) })}
                </Badge>
              )}
              {hasBackfill && <Badge variant="outline">{t("profile.backfill")}</Badge>}
            </div>

            <span className="truncate font-mono text-sm text-muted-foreground">
              @{user.username}
            </span>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {/* toLocaleDateString reads the runtime's locale and zone, so the
                  server and the browser can disagree — same reason as Updated
                  below. */}
              <span suppressHydrationWarning>{t("profile.joined", { date: joined })}</span>
              {updatedAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span suppressHydrationWarning>
                    {t("profile.updated", {
                      date: new Date(updatedAt).toLocaleString(intlTag(locale), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    })}
                  </span>
                </>
              )}
            </div>

            {socialLinks && socialLinks.length > 0 && (
              <ProfileSocialLinks links={socialLinks} />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onEmbedClick}>
            <Code2Icon data-icon="inline-start" />
            {t("profile.embed")}
          </Button>
          <Button variant="outline" size="sm" onClick={share}>
            <Share2Icon data-icon="inline-start" />
            {copied ? t("profile.copied") : t("profile.share")}
          </Button>
        </div>
      </header>
      {membership}

      <Separator className="my-7" />

      {/* ---- Headline figures ------------------------------------------ */}
      <section className="grid grid-cols-2 gap-6 sm:grid-cols-4" aria-label={t("leaderboard.totalsAria")}>
        <Stat label={t("profile.tokens")} value={formatNumber(stats.totalTokens, true)} />
        <Stat label={t("profile.cost")} value={formatCurrency(stats.totalCost, true)} />
        <Stat
          label={t("profile.activeDays")}
          value={formatNumber(stats.activeDays, false)}
          hint={
            period === "all"
              ? t("profile.sessions", { n: formatNumber(stats.sessionCount, false) })
              : undefined
          }
        />
        <Stat
          label={t("profile.submissions")}
          value={formatNumber(stats.submissionCount, false)}
          hint={period !== "all" ? t("profile.periodAll") : undefined}
        />
      </section>

      {/* The composition bar belongs to the figures above it. Putting the day
          card between them made it read as the day's split, and left two
          unexplained bars on the page. */}
      <div className="mt-5">
        <TokenComposition stats={stats} />
      </div>

      {today && <div className="mt-8">{today}</div>}

      {/* ---- Sections ---------------------------------------------------- */}
      {/* Period applies to everything below it, so the control sits here
          rather than inside any one section. */}
      <div className="mt-9 flex items-center justify-between gap-3 border-b pb-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("profile.usageDetail")}
        </span>
        {/* Same primitive and the same shape as the leaderboard's period
            control, so the two pages do not offer the identical choice through
            two different-looking widgets. */}
        <ToggleGroup
          value={[period]}
          onValueChange={(value) => {
            const next = value[0] as ProfileViewProps["period"] | undefined;
            if (next) onPeriodChange(next);
          }}
          variant="outline"
          aria-label={t("profile.periodAria")}
          className="[&>*]:h-8 [&>*]:px-2.5 [&>*]:text-xs"
        >
          {PERIODS.map((p) => (
            <ToggleGroupItem key={p.value} value={p.value}>
              {t(p.key)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="mt-8 flex flex-col gap-12">
        <Section title={t("profile.contributions")}>{activity}</Section>

        {usageChart && <Section title={t("profile.usage")}>{usageChart}</Section>}

        {breakdown && <Section title={t("profile.tokenBreakdown")}>{breakdown}</Section>}

        {habits && <Section title={t("profile.habits")}>{habits}</Section>}

        <CollapsibleSection title={t("profile.models")}>
          {modelsSection ?? (
            topModels.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("profile.noModels")}
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4 sm:pl-6">{t("profile.model")}</TableHead>
                      <TableHead className="text-right">{t("profile.tokens")}</TableHead>
                      <TableHead className="pr-4 text-right sm:pr-6">{t("profile.cost")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topModels.map((model) => (
                      <TableRow key={model.name}>
                        <TableCell className="pl-4 font-mono text-sm sm:pl-6">
                          {model.name}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          {formatNumber(model.tokens, true)}
                        </TableCell>
                        <TableCell className="pr-4 text-right font-mono text-sm tabular-nums sm:pr-6">
                          {formatCurrency(model.cost, true)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          )}
        </CollapsibleSection>

        <Section title={t("profile.clients")}>
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap gap-2">
              {clients.length === 0 ? (
                <span className="text-sm text-muted-foreground">{t("profile.noneRecorded")}</span>
              ) : (
                clients.map((client) => (
                  <span
                    key={client}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm"
                  >
                    <SourceLogo sourceId={client} height={14} decorative />
                    {client}
                  </span>
                ))
              )}
            </div>

            {mcpServers && mcpServers.length > 0 && (
              <div>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("profile.mcp")}
                </span>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {mcpServers.map((server) => (
                    <Badge key={server} variant="outline" className="font-mono">
                      {server}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* ProfileDevices carries its own "Devices · all-time" heading, so no
            Section wrapper here — one would give the block two headings, and an
            empty device list (ProfileDevices returns null) a bare one. */}
        {devices}
      </div>
    </main>
  );
}
