"use client";

import { useState, useEffect, useCallback, useId, useRef } from "react";
import { useRouter } from "nextjs-toploader/app";
import { KeyIcon } from "lucide-react";
import { toast } from "react-toastify";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { avatarUrlFor } from "@/lib/avatar";
import { groupCloudDevices, isReservedCloudDeviceKey } from "@/lib/devices/cloud";
import { deviceDisplayLabel } from "@/lib/devices/shared";
import { tw } from "@/lib/tw";
import { cn, formatNumber, formatCurrency } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/formatRelativeTime";
import { intlTag, useI18n, type Translate } from "@/lib/i18n";
import PrivacySection from "./PrivacySection";

interface User {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  email: string | null;
}

interface ApiToken {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface CreatedApiToken extends ApiToken {
  token: string;
}

// Subset of GET /api/users/[username]/devices we render here. That public
// endpoint already aggregates usage per device, so settings reuses it with
// the session user's username instead of adding a private listing route.
interface SettingsDevice {
  id: string;
  deviceKey: string;
  /** Resolved label (custom name or fallback) — what we render. */
  displayName: string;
  /** Raw user-set name (null = never renamed) — what we edit. */
  customName: string | null;
  lastSubmittedAt: string | null;
  totalTokens: number;
  totalCost: number;
  activeDays: number;
  /** Cloud session devices only: active days across the provider's sessions. */
  cloudGroupActiveDays?: number;
}

// Mirror the server-side RenameBodySchema in
// /api/settings/devices/[deviceId]/route.ts (varchar(120), no control chars).
const DEVICE_NAME_MAX_LENGTH = 120;
const DEVICE_NAME_CONTROL_CHARS = /\p{C}/u;

function validateDeviceName(name: string, t: Translate): string | null {
  if (name.length > DEVICE_NAME_MAX_LENGTH) {
    return t("settings.devices.nameTooLong", { max: DEVICE_NAME_MAX_LENGTH });
  }
  if (DEVICE_NAME_CONTROL_CHARS.test(name)) {
    return t("settings.devices.nameControl");
  }
  return null;
}

// ============================================================================
// Shared UI primitives
// ============================================================================
//
// These were styled-components. The shared `tw` helper keeps the same
// ergonomics — a named element with baked-in classes that still forwards every
// DOM prop, `ref` included — so the markup below is unchanged.
//
// Colours come from the shared palette, with two deliberate exceptions:
// --danger and --success are semantic colours carrying meaning, not neutrals
// that drifted, and shadcn's --destructive is a visibly softer red (#C84941
// against #B42318 in light), so folding them into it would restyle every
// destructive control on the page.

const PageWrapper = tw(
  "div",
  "flex min-h-[calc(100dvh-56px)] flex-col bg-background text-foreground"
);

// Matches `CONTAINER` in components/layout/Container.tsx — every other route
// lays out at 1200px with the same gutters, and a narrower Settings page reads
// as a different site.
const MainContent = tw(
  "main",
  "mx-auto w-full max-w-[1200px] flex-1 px-4 pb-24 pt-10 sm:px-6 sm:pt-14"
);

// Mirrors PageHeader: 2xl/3xl semibold, not a one-off 1.75rem bold.
const Title = tw(
  "h1",
  "text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
);

// PageHeader's description: muted *foreground*, relaxed leading, and the same
// separator gap the other routes put between the header and the first section.
const Subtitle = tw(
  "p",
  "mb-7 mt-1.5 max-w-[72ch] text-sm leading-relaxed text-muted-foreground"
);

const Section = tw("section", "mb-6 rounded-xl border bg-card p-6");
const SectionTitle = tw("h2", "mb-4 text-lg font-semibold");
const ProfileWrapper = tw("div", "flex items-center gap-4");
const ProfileText = tw("p", "font-medium");
const SmallText = tw("p", "text-sm");
const CodeText = tw("code", "rounded px-1 py-0.5 text-xs");
const Description = tw("p", "mb-4 text-sm");
const FieldLabel = tw("label", "mb-2 block text-[13px] font-semibold");

const ActionRow = tw(
  "div",
  "mb-4 grid grid-cols-[1fr_auto] gap-3 max-[560px]:grid-cols-1"
);

const TextInput = tw(
  "input",
  "h-10 rounded-md border bg-background px-3 text-sm text-foreground"
);

const PrimaryButton = tw(
  "button",
  "h-10 cursor-pointer rounded-md border border-primary bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-opacity duration-150 disabled:cursor-not-allowed disabled:opacity-60"
);

const TokenReveal = tw(
  "div",
  "mb-4 rounded-md border border-[var(--success)] bg-[color-mix(in_srgb,var(--success)_8%,transparent)] p-3"
);

const TokenCodeRow = tw(
  "div",
  "mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2 max-[560px]:grid-cols-1"
);

const TokenCode = tw(
  "code",
  "block overflow-x-auto whitespace-nowrap rounded-md bg-background px-3 py-2.5 text-[13px]"
);

const SecondaryButton = tw(
  "button",
  "h-[38px] cursor-pointer rounded-md border bg-background px-3 text-[13px] font-semibold text-foreground"
);

const EmptyState = tw("div", "py-8 text-center");
const EmptyIcon = tw("div", "mx-auto mb-3 opacity-50");
const EmptyText = tw("p", "mt-2 text-sm");
const TokenList = tw("div", "flex flex-col gap-3");

// Token names run to 100 characters and device names to 120, so the text
// column has to be allowed to shrink (min-w-0) and truncate — without it a
// long name pushes Revoke/Rename off the right edge at 375px. Below 560px the
// row stacks, matching DeviceEditRow.
const TokenItem = tw(
  "div",
  "flex items-center justify-between gap-3 rounded-xl border bg-muted p-4 max-[560px]:flex-col max-[560px]:items-stretch"
);

const TokenInfo = tw("div", "flex min-w-0 items-center gap-3");
const IconWrapper = tw("div", "text-muted-foreground");

const DeviceEditRow = tw(
  "div",
  "grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 max-[560px]:grid-cols-1"
);

const DangerButton = tw(
  "button",
  "cursor-pointer rounded-md border border-[var(--danger)] bg-transparent px-3 py-1 text-xs font-medium text-[var(--danger)] transition-all duration-150 hover:bg-[var(--danger-solid)] hover:text-white"
);

const InfoBanner = tw(
  "div",
  "rounded-md border bg-muted px-4 py-3 text-sm text-muted-foreground"
);

const AvatarImg = tw(
  "img",
  "flex-shrink-0 rounded-md object-cover ring-1 ring-border"
);

const TokenName = tw("p", "truncate font-medium");

// ============================================================================
// Danger Zone
// ============================================================================

const DangerSection = tw(
  "section",
  "mb-6 rounded-xl border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-card p-6"
);

const DangerSectionTitle = tw(
  "h2",
  "mb-4 text-lg font-semibold text-[var(--danger)]"
);

const DangerActionRow = tw(
  "div",
  "flex items-center justify-between gap-4 py-4 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border"
);

const DangerActionInfo = tw("div", "min-w-0 flex-1");
const DangerActionTitle = tw("p", "mb-1 text-sm font-medium text-foreground");
const DangerActionDescription = tw("p", "text-[13px] text-muted-foreground");

const DangerActionButton = tw(
  "button",
  "flex-shrink-0 cursor-pointer rounded-md border border-[var(--danger)] bg-transparent px-4 py-1.5 text-[13px] font-medium text-[var(--danger)] transition-all duration-150 hover:bg-[var(--danger-solid)] hover:text-white"
);

// ============================================================================
// Confirmation modal
// ============================================================================

const ModalOverlay = tw(
  "div",
  "fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-[4px]"
);

// Capped to the viewport and scrollable: on a short window, or at high browser
// zoom, the delete-account bullets are tall enough to push Cancel/Confirm off
// the bottom of an unbounded card with nothing to scroll.
const ModalCard = tw(
  "div",
  "max-h-[calc(100dvh-2rem)] w-[calc(100%-32px)] max-w-[480px] overflow-y-auto rounded-2xl border bg-background p-6 shadow-[0_16px_48px_rgba(0,0,0,0.35)] outline-none"
);

const ModalTitle = tw("h3", "mb-3 text-base font-semibold text-[var(--danger)]");
const ModalBody = tw("p", "mb-5 text-sm leading-normal text-muted-foreground");

const ModalBulletList = tw(
  "ul",
  "mb-5 list-disc pl-5 text-sm leading-relaxed text-muted-foreground"
);

const ModalInput = tw(
  "input",
  "mb-4 box-border w-full rounded-md border bg-muted px-3 py-2 text-sm text-foreground outline-none focus:border-[var(--danger)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--danger)_20%,transparent)]"
);

const ModalActions = tw("div", "flex justify-end gap-2");

const CancelButton = tw(
  "button",
  "cursor-pointer rounded-md border bg-transparent px-4 py-1.5 text-[13px] font-medium text-foreground transition-all duration-150 hover:bg-muted"
);

const ConfirmDangerButton = ({
  $disabled,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"button"> & { $disabled?: boolean }) => (
  <button
    {...props}
    className={cn(
      "rounded-md border border-[var(--danger)] px-4 py-1.5 text-[13px] font-medium transition-all duration-150",
      $disabled
        ? "cursor-not-allowed bg-transparent text-[var(--danger)] opacity-50"
        : "cursor-pointer bg-[var(--danger-solid)] text-white hover:bg-[#8f1d14]",
      className
    )}
  />
);

const StepIndicator = tw("div", "mb-4 flex gap-1.5");

const StepDot = ({ $active }: { $active: boolean }) => (
  <div
    className={cn(
      "size-1.5 rounded-full transition-colors duration-150",
      $active ? "bg-[var(--danger)]" : "bg-border"
    )}
  />
);

/**
 * The dialog shell every modal on this page renders into.
 *
 * Same semantics as ProfileEmbedDialog: labelled `role="dialog"` with
 * `aria-modal`, focus moved into the card on open, Tab trapped inside it,
 * Escape to dismiss, and focus restored to whatever opened it. These are the
 * most destructive controls in the product, so a keyboard or screen-reader
 * user has to be able to tell the dialog is there and get back out of it.
 */
function ModalShell({
  labelledBy,
  dismissable,
  onClose,
  children,
}: {
  labelledBy: string;
  /** False while a request is in flight — the action can no longer be cancelled. */
  dismissable: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // Read through a ref so the trap is installed once per open rather than
  // torn down and rebuilt — and focus restored — every time `dismissable`
  // flips as the request starts.
  const dismissableRef = useRef(dismissable);
  useEffect(() => {
    dismissableRef.current = dismissable;
  }, [dismissable]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusDialog = window.requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!dismissableRef.current) return;
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.getClientRects().length > 0);

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (
        event.shiftKey &&
        (activeElement === firstElement ||
          activeElement === dialogRef.current ||
          !dialogRef.current.contains(activeElement))
      ) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === lastElement ||
          !dialogRef.current.contains(activeElement))
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(focusDialog);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <ModalOverlay onClick={dismissable ? onClose : undefined}>
      <ModalCard
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </ModalCard>
    </ModalOverlay>
  );
}

// ============================================================================
// Confirmation modal component
// ============================================================================

type DangerAction = "delete-data" | "delete-account";

interface ConfirmationConfig {
  title: string;
  steps: Array<{
    body: React.ReactNode;
    confirmLabel: string;
  }>;
  typedConfirmation: string;
  onConfirm: () => Promise<void>;
}

function confirmationConfigs(t: Translate): Record<DangerAction, ConfirmationConfig> {
  return {
    "delete-data": {
      title: t("settings.danger.deleteDataTitle"),
      steps: [
        {
          body: (
            <>
              <ModalBody>{t("settings.danger.dataStep1")}</ModalBody>
              <ModalBulletList>
                <li>{t("settings.danger.dataBullet1")}</li>
                <li>{t("settings.danger.dataBullet2")}</li>
                <li>{t("settings.danger.dataBullet3")}</li>
              </ModalBulletList>
              <ModalBody style={{ marginBottom: 0 }}>
                {t("settings.danger.dataStep1End")}
              </ModalBody>
            </>
          ),
          confirmLabel: t("settings.danger.dataConfirm"),
        },
        {
          body: (
            <ModalBody>
              {t("settings.danger.dataStep2A")}{" "}
              <strong>{t("settings.danger.dataStep2B")}</strong>
              {t("settings.danger.dataStep2C")}
            </ModalBody>
          ),
          confirmLabel: t("settings.danger.continue"),
        },
      ],
      typedConfirmation: t("settings.danger.dataTyped"),
      onConfirm: async () => {
        const res = await fetch("/api/settings/submitted-data", { method: "DELETE" });
        if (!res.ok) throw new Error(t("settings.danger.dataFailedToast"));
      },
    },
    "delete-account": {
      title: t("settings.danger.deleteAccountTitle"),
      steps: [
        {
          body: (
            <>
              <ModalBody>{t("settings.danger.accountStep1")}</ModalBody>
              <ModalBulletList>
                <li>{t("settings.danger.accountBullet1")}</li>
                <li>{t("settings.danger.accountBullet2")}</li>
                <li>{t("settings.danger.accountBullet3")}</li>
                <li>{t("settings.danger.accountBullet4")}</li>
              </ModalBulletList>
              <ModalBody style={{ marginBottom: 0 }}>
                {t("settings.danger.accountStep1End")}
              </ModalBody>
            </>
          ),
          confirmLabel: t("settings.danger.accountConfirm"),
        },
        {
          body: (
            <ModalBody>
              {t("settings.danger.accountStep2A")}{" "}
              <strong>{t("settings.danger.accountStep2B")}</strong>
              {t("settings.danger.accountStep2C")}
            </ModalBody>
          ),
          confirmLabel: t("settings.danger.continue"),
        },
      ],
      typedConfirmation: t("settings.danger.accountTyped"),
      onConfirm: async () => {
        const res = await fetch("/api/settings/account", { method: "DELETE" });
        if (!res.ok) throw new Error(t("settings.danger.accountFailedToast"));
      },
    },
  };
}

function DangerConfirmationModal({
  action,
  onClose,
  onSuccess,
}: {
  action: DangerAction;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useI18n();
  const config = confirmationConfigs(t)[action];
  const totalSteps = config.steps.length + 1; // +1 for typed confirmation step
  const titleId = useId();
  const [step, setStep] = useState(0);
  const [typedValue, setTypedValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isTypedStep = step === config.steps.length;
  const typedMatch = typedValue.toLowerCase().trim() === config.typedConfirmation;

  const handleConfirm = useCallback(async () => {
    if (isTypedStep) {
      if (!typedMatch || isSubmitting) return;
      setIsSubmitting(true);
      try {
        await config.onConfirm();
        onSuccess();
      } catch {
        toast.error(
          action === "delete-data"
            ? t("settings.danger.dataFailedToast")
            : t("settings.danger.accountFailedToast")
        );
        setIsSubmitting(false);
      }
    } else {
      setStep((s) => s + 1);
    }
  }, [isTypedStep, typedMatch, isSubmitting, config, onSuccess, action, t]);

  return (
    <ModalShell
      labelledBy={titleId}
      dismissable={!isSubmitting}
      onClose={onClose}
    >
      <StepIndicator>
        {["step-1", "step-2", "step-3"].slice(0, totalSteps).map((id, i) => (
          <StepDot key={id} $active={i <= step} />
        ))}
      </StepIndicator>

      <ModalTitle id={titleId}>⚠ {config.title}</ModalTitle>

      {isTypedStep ? (
        <>
          <ModalBody>
            {t("settings.danger.typePrefix")}{" "}
            <strong>{config.typedConfirmation}</strong>{" "}
            {t("settings.danger.typeSuffix")}
          </ModalBody>
          <ModalInput
            autoFocus
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            placeholder={config.typedConfirmation}
            onKeyDown={(e) => {
              if (e.key === "Enter" && typedMatch && !isSubmitting) {
                handleConfirm();
              }
            }}
          />
        </>
      ) : (
        config.steps[step].body
      )}

      <ModalActions>
        <CancelButton onClick={onClose} disabled={isSubmitting}>
          {t("settings.cancel")}
        </CancelButton>
        <ConfirmDangerButton
          $disabled={isTypedStep ? !typedMatch : false}
          disabled={(isTypedStep && !typedMatch) || isSubmitting}
          onClick={handleConfirm}
        >
          {isSubmitting
            ? t("settings.danger.deleting")
            : isTypedStep
              ? t("settings.danger.deletePermanently")
              : config.steps[step].confirmLabel}
        </ConfirmDangerButton>
      </ModalActions>
    </ModalShell>
  );
}

/**
 * Revoking a token is destructive and cannot be undone, so it keeps a
 * confirmation step — but through the same accessible dialog as everything
 * else on the page rather than a native `confirm()`.
 */
function RevokeTokenModal({
  token,
  onClose,
  onConfirm,
}: {
  token: ApiToken;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const titleId = useId();
  const { t } = useI18n();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell
      labelledBy={titleId}
      dismissable={!isSubmitting}
      onClose={onClose}
    >
      <ModalTitle id={titleId}>⚠ {t("settings.tokens.revokeTitle")}</ModalTitle>
      <ModalBody>
        <strong>{token.name}</strong> {t("settings.tokens.revokeBodyA")}{" "}
        <code>tokens serve</code>{" "}
        {t("settings.tokens.revokeBodyB")}
      </ModalBody>
      <ModalActions>
        <CancelButton onClick={onClose} disabled={isSubmitting}>
          {t("settings.cancel")}
        </CancelButton>
        <ConfirmDangerButton disabled={isSubmitting} onClick={handleConfirm}>
          {isSubmitting ? t("settings.tokens.revoking") : t("settings.tokens.revokeTitle")}
        </ConfirmDangerButton>
      </ModalActions>
    </ModalShell>
  );
}

function apiTokenListItem(token: CreatedApiToken): ApiToken {
  return {
    id: token.id,
    name: token.name,
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt,
  };
}

function prependApiToken(tokens: ApiToken[], token: ApiToken): ApiToken[] {
  return [token, ...tokens.filter((item) => item.id !== token.id)];
}

function mergeApiTokenList(
  serverTokens: ApiToken[],
  currentTokens: ApiToken[]
): ApiToken[] {
  const serverTokenIds = new Set(serverTokens.map((token) => token.id));
  const localTokens = currentTokens.filter(
    (token) => !serverTokenIds.has(token.id)
  );
  return [...localTokens, ...serverTokens];
}

// Both listings throw on failure rather than resolving to []. An empty array is
// a real answer — "you have no tokens" — and collapsing a 500 into it told
// users their credentials were gone when they were not.
async function fetchApiTokens(): Promise<ApiToken[]> {
  const tokensResponse = await fetch("/api/settings/tokens");
  if (!tokensResponse.ok) throw new Error("Failed to load API tokens");
  const tokensData = await tokensResponse.json();
  return Array.isArray(tokensData.tokens) ? tokensData.tokens : [];
}

async function fetchDevices(username: string): Promise<SettingsDevice[]> {
  const devicesResponse = await fetch(
    `/api/users/${encodeURIComponent(username)}/devices`
  );
  if (!devicesResponse.ok) throw new Error("Failed to load devices");
  const devicesData = await devicesResponse.json();
  return Array.isArray(devicesData.devices) ? devicesData.devices : [];
}

// ============================================================================
// Main component
// ============================================================================

export default function SettingsClient() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const createTokenErrorId = useId();
  const deviceErrorId = useId();
  // CLI hints must point at the deployment actually serving the page; the
  // commands render client-side only (after auth + data load), so
  // window.location.origin is the deployment origin here.
  const siteOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dangerAction, setDangerAction] = useState<DangerAction | null>(null);
  const [tokenName, setTokenName] = useState(t("settings.tokens.defaultName"));
  const [createdToken, setCreatedToken] = useState<CreatedApiToken | null>(null);
  const [isCreatingToken, setIsCreatingToken] = useState(false);
  const [createTokenError, setCreateTokenError] = useState<string | null>(null);
  const [devices, setDevices] = useState<SettingsDevice[]>([]);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState("");
  const [isSavingDeviceName, setIsSavingDeviceName] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  // Per-list load failures, kept apart from the empty state so a 500 reads as
  // "we could not load these" rather than "you have none".
  const [tokensLoadFailed, setTokensLoadFailed] = useState(false);
  const [devicesLoadFailed, setDevicesLoadFailed] = useState(false);
  const [revokingToken, setRevokingToken] = useState<ApiToken | null>(null);
  const [revokingTokenId, setRevokingTokenId] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    setTokensLoadFailed(false);
    try {
      const loadedTokens = await fetchApiTokens();
      setTokens((current) => mergeApiTokenList(loadedTokens, current));
    } catch {
      setTokensLoadFailed(true);
    }
  }, []);

  const loadDevices = useCallback(async (username: string) => {
    setDevicesLoadFailed(false);
    try {
      setDevices(await fetchDevices(username));
    } catch {
      setDevicesLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const sessionResponse = await fetch("/api/auth/session");
        const sessionData = await sessionResponse.json();
        if (cancelled) return;

        if (!sessionData.user) {
          router.push("/login?returnTo=/settings");
          return;
        }

        setUser(sessionData.user);
        setIsLoading(false);

        await Promise.all([
          loadTokens(),
          loadDevices(sessionData.user.username),
        ]);
      } catch {
        if (!cancelled) {
          router.push("/leaderboard");
        }
      }
    }

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [router, loadTokens, loadDevices]);

  const handleRevokeToken = async (token: ApiToken) => {
    setRevokingTokenId(token.id);
    try {
      const response = await fetch(`/api/settings/tokens/${token.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to revoke token");

      setTokens((current) => current.filter((t) => t.id !== token.id));
      setRevokingToken(null);
      toast.success(t("settings.tokens.revoked", { name: token.name }));
    } catch {
      toast.error(t("settings.tokens.revokeError"));
    } finally {
      setRevokingTokenId(null);
    }
  };

  const handleDangerSuccess = useCallback(() => {
    if (dangerAction === "delete-account") {
      // Account is gone — redirect to home.
      window.location.href = "/";
    } else {
      // Data deleted — close modal and stay.
      setDangerAction(null);
      toast.success(t("settings.danger.dataDeleted"));
    }
  }, [dangerAction, t]);

  const handleCreateToken = async () => {
    setIsCreatingToken(true);
    setCreateTokenError(null);

    try {
      const response = await fetch("/api/settings/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tokenName }),
      });

      const data = await response.json();
      if (!response.ok || !data.token) {
        throw new Error(data.error || t("settings.tokens.createError"));
      }

      setCreatedToken(data.token);
      setTokens((current) =>
        prependApiToken(current, apiTokenListItem(data.token))
      );
    } catch (error) {
      setCreateTokenError(error instanceof Error ? error.message : t("settings.tokens.createError"));
    } finally {
      setIsCreatingToken(false);
    }
  };

  const startEditingDevice = (device: SettingsDevice) => {
    setEditingDeviceId(device.id);
    setDeviceError(null);
    // Pre-fill from the raw custom name, not the resolved display label, so
    // an unnamed device starts empty and a custom name that happens to equal
    // the fallback label ("Unnamed device" etc.) is preserved.
    setEditingDeviceName(device.customName ?? "");
  };

  const cancelEditingDevice = () => {
    setEditingDeviceId(null);
    setEditingDeviceName("");
    setDeviceError(null);
  };

  const handleSaveDeviceName = async (device: SettingsDevice) => {
    const trimmed = editingDeviceName.trim();
    const validationError = validateDeviceName(trimmed, t);
    if (validationError) {
      setDeviceError(validationError);
      return;
    }

    setIsSavingDeviceName(true);
    setDeviceError(null);

    try {
      const response = await fetch(`/api/settings/devices/${device.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Empty input clears the custom name; server stores null and the
        // display label falls back via deviceDisplayLabel.
        body: JSON.stringify({ name: trimmed === "" ? null : trimmed }),
      });

      const data = await response.json();
      if (!response.ok || !data.device) {
        throw new Error(data.error || t("settings.devices.renameFailed"));
      }

      setDevices((current) =>
        current.map((item) =>
          item.id === device.id
            ? {
                ...item,
                displayName: deviceDisplayLabel(
                  data.device.deviceKey,
                  data.device.displayName
                ),
                customName: data.device.displayName ?? null,
              }
            : item
        )
      );
      setEditingDeviceId(null);
      setEditingDeviceName("");
    } catch (error) {
      setDeviceError(
        error instanceof Error ? error.message : t("settings.devices.renameFailed")
      );
    } finally {
      setIsSavingDeviceName(false);
    }
  };

  const handleCopyCreatedToken = async () => {
    if (!createdToken) return;
    await navigator.clipboard.writeText(createdToken.token);
    // The raw token is shown once and only once. After the user has copied
    // it we drop it from React state so it no longer lives in the component
    // tree (and thus no longer in any DevTools / extension snapshot of it).
    // Users who haven't copied yet still have the value in the reveal panel
    // until they navigate away.
    setCreatedToken(null);
  };

  if (isLoading) {
    // Mirrors the loaded page — same container, same top alignment, same
    // section boxes. The previous centred "Loading..." sat in the middle of a
    // full-height wrapper, so arriving content jumped a whole viewport.
    return (
      <PageWrapper style={{ backgroundColor: "var(--background)" }}>
        <MainContent aria-busy="true" aria-label={t("settings.loadingAria")}>
          <Skeleton className="h-8 w-40 sm:h-9" />
          <Skeleton className="mb-7 mt-1.5 h-5 w-full max-w-[28rem]" />
          {[0, 1, 2].map((section) => (
            <Section key={section}>
              <Skeleton className="mb-4 h-6 w-32" />
              <Skeleton className="h-4 w-full max-w-[32rem]" />
              <Skeleton className="mt-4 h-20 w-full" />
            </Section>
          ))}
        </MainContent>
      </PageWrapper>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <PageWrapper style={{ backgroundColor: "var(--background)" }}>
      <MainContent>
        <Title style={{ color: "var(--foreground)" }}>
          {t("settings.title")}
        </Title>
        <Subtitle>{t("settings.desc")}</Subtitle>

        <Section>
          <SectionTitle style={{ color: "var(--foreground)" }}>
            {t("nav.profile")}
          </SectionTitle>
          <ProfileWrapper>
            <AvatarImg
              src={avatarUrlFor(user)}
              alt={user.username}
              width={64}
              height={64}
            />
            <div>
              <ProfileText style={{ color: "var(--foreground)" }}>
                {user.displayName || user.username}
              </ProfileText>
              <SmallText style={{ color: "var(--muted-foreground)" }}>
                @{user.username}
              </SmallText>
              {user.email && (
                <SmallText style={{ color: "var(--muted-foreground)" }}>
                  {user.email}
                </SmallText>
              )}
            </div>
          </ProfileWrapper>
          <InfoBanner style={{ marginTop: 16 }}>
            {t("settings.profileLocked")}
          </InfoBanner>
        </Section>

        <Section>
          <SectionTitle style={{ color: "var(--foreground)" }}>
            {t("settings.tokens.title")}
          </SectionTitle>
          <Description style={{ color: "var(--muted-foreground)" }}>
            {t("settings.tokens.descA")}{" "}
            <CodeText
              style={{ backgroundColor: "var(--muted)" }}
            >
              {`TOKENS_API_URL=${siteOrigin || "<site-origin>"} tokens login`}
            </CodeText>{" "}
            {t("settings.tokens.descB")}
          </Description>

          <FieldLabel
            htmlFor="token-name"
            style={{ color: "var(--foreground)" }}
          >
            {t("settings.tokens.name")}
          </FieldLabel>
          <ActionRow>
            <TextInput
              id="token-name"
              value={tokenName}
              onChange={(event) => setTokenName(event.target.value)}
              maxLength={100}
              aria-invalid={createTokenError ? true : undefined}
              aria-describedby={createTokenError ? createTokenErrorId : undefined}
            />
            <PrimaryButton
              type="button"
              disabled={isCreatingToken}
              onClick={handleCreateToken}
            >
              {isCreatingToken ? t("settings.tokens.creating") : t("settings.tokens.create")}
            </PrimaryButton>
          </ActionRow>

          {createTokenError && (
            <Alert
              id={createTokenErrorId}
              variant="destructive"
              className="mb-4"
            >
              <AlertTitle>{t("settings.tokens.createFailed")}</AlertTitle>
              <AlertDescription>{createTokenError}</AlertDescription>
            </Alert>
          )}

          {createdToken && (
            <TokenReveal>
              <SmallText style={{ color: "var(--foreground)", fontWeight: 600 }}>
                {t("settings.tokens.copyNow")}
              </SmallText>
              <TokenCodeRow>
                <TokenCode style={{ color: "var(--foreground)" }}>
                  {createdToken.token}
                </TokenCode>
                <SecondaryButton type="button" onClick={handleCopyCreatedToken}>
                  {t("settings.tokens.copy")}
                </SecondaryButton>
              </TokenCodeRow>
            </TokenReveal>
          )}

          {tokensLoadFailed ? (
            <Alert variant="destructive">
              <AlertTitle>{t("settings.tokens.loadFailedTitle")}</AlertTitle>
              <AlertDescription>
                {t("settings.tokens.loadFailedBody")}{" "}
                <SecondaryButton
                  type="button"
                  className="ml-1 h-7 px-2 text-xs"
                  onClick={loadTokens}
                >
                  {t("error.retry")}
                </SecondaryButton>
              </AlertDescription>
            </Alert>
          ) : tokens.length === 0 ? (
            <EmptyState style={{ color: "var(--muted-foreground)" }}>
              <EmptyIcon>
                <KeyIcon size={32} />
              </EmptyIcon>
              <p>{t("settings.tokens.empty")}</p>
              <EmptyText>
                {t("settings.tokens.emptyHintA")}{" "}
                <CodeText
                  style={{ backgroundColor: "var(--muted)" }}
                >
                  {`TOKENS_API_URL=${siteOrigin || "<site-origin>"} tokens login`}
                </CodeText>{" "}
                {t("settings.tokens.descB")}
              </EmptyText>
            </EmptyState>
          ) : (
            <TokenList>
              {tokens.map((token) => (
                <TokenItem key={token.id}>
                  <TokenInfo>
                    <IconWrapper>
                      <KeyIcon size={20} />
                    </IconWrapper>
                    <div className="min-w-0">
                      <TokenName style={{ color: "var(--foreground)" }}>
                        {token.name}
                      </TokenName>
                      <SmallText style={{ color: "var(--muted-foreground)" }}>
                        {t("settings.tokens.created", { date: new Date(token.createdAt).toLocaleDateString(intlTag(locale)) })}
                        {token.lastUsedAt &&
                          t("settings.tokens.lastUsed", { date: new Date(token.lastUsedAt).toLocaleDateString(intlTag(locale)) })}
                      </SmallText>
                    </div>
                  </TokenInfo>
                  <DangerButton
                    type="button"
                    disabled={revokingTokenId === token.id}
                    className="disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => setRevokingToken(token)}
                  >
                    {revokingTokenId === token.id ? t("settings.tokens.revoking") : t("settings.tokens.revoke")}
                  </DangerButton>
                </TokenItem>
              ))}
            </TokenList>
          )}
        </Section>

        <Section>
          <SectionTitle style={{ color: "var(--foreground)" }}>
            {t("settings.devices.title")}
          </SectionTitle>
          <Description style={{ color: "var(--muted-foreground)" }}>
            {t("settings.devices.desc")}
          </Description>

          {deviceError && (
            <Alert id={deviceErrorId} variant="destructive" className="mb-4">
              <AlertTitle>{t("settings.devices.renameFailedTitle")}</AlertTitle>
              <AlertDescription>{deviceError}</AlertDescription>
            </Alert>
          )}

          {devicesLoadFailed ? (
            <Alert variant="destructive">
              <AlertTitle>{t("settings.devices.loadFailedTitle")}</AlertTitle>
              <AlertDescription>
                {t("settings.devices.loadFailedBody")}{" "}
                <SecondaryButton
                  type="button"
                  className="ml-1 h-7 px-2 text-xs"
                  onClick={() => user && loadDevices(user.username)}
                >
                  {t("error.retry")}
                </SecondaryButton>
              </AlertDescription>
            </Alert>
          ) : devices.length === 0 ? (
            <EmptyState style={{ color: "var(--muted-foreground)" }}>
              <p>{t("settings.devices.empty")}</p>
              <EmptyText>
                {t("settings.devices.emptyHintA")}{" "}
                <CodeText
                  style={{ backgroundColor: "var(--muted)" }}
                >
                  {`TOKENS_API_URL=${siteOrigin || "<site-origin>"} tokens submit`}
                </CodeText>{" "}
                {t("settings.devices.emptyHintB")}
              </EmptyText>
            </EmptyState>
          ) : (
            <TokenList>
              {/* One row per cloud provider, as on the profile: each cloud
                  session is its own device, with a fixed label and no rename. */}
              {groupCloudDevices(devices).map((device) => (
                <TokenItem key={device.id}>
                  {editingDeviceId === device.id ? (
                    <DeviceEditRow>
                      <TextInput
                        aria-label={t("settings.devices.nameAria")}
                        value={editingDeviceName}
                        maxLength={DEVICE_NAME_MAX_LENGTH}
                        placeholder={t("settings.devices.placeholder")}
                        autoFocus
                        disabled={isSavingDeviceName}
                        aria-invalid={deviceError ? true : undefined}
                        aria-describedby={deviceError ? deviceErrorId : undefined}
                        onChange={(event) =>
                          setEditingDeviceName(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleSaveDeviceName(device);
                          } else if (event.key === "Escape") {
                            cancelEditingDevice();
                          }
                        }}
                      />
                      <PrimaryButton
                        type="button"
                        disabled={isSavingDeviceName}
                        onClick={() => handleSaveDeviceName(device)}
                      >
                        {isSavingDeviceName ? t("settings.devices.saving") : t("settings.devices.save")}
                      </PrimaryButton>
                      <SecondaryButton
                        type="button"
                        disabled={isSavingDeviceName}
                        onClick={cancelEditingDevice}
                      >
                        {t("settings.cancel")}
                      </SecondaryButton>
                    </DeviceEditRow>
                  ) : (
                    <>
                      <TokenInfo>
                        <div className="min-w-0">
                          <TokenName style={{ color: "var(--foreground)" }}>
                            {device.displayName}
                          </TokenName>
                          <SmallText style={{ color: "var(--muted-foreground)" }}>
                            {device.cloudSessions != null &&
                              `${t(device.cloudSessions === 1 ? "devices.cloud.session" : "devices.cloud.sessions", {
                                n: device.cloudSessions.toLocaleString(intlTag(locale)),
                              })} · `}
                            {t("settings.devices.tokens", { n: formatNumber(device.totalTokens, locale) })}
                            {" · "}
                            {formatCurrency(device.totalCost, locale)}
                            {" · "}
                            {device.activeDays === 1
                              ? t("settings.devices.activeDay", { n: device.activeDays })
                              : t("settings.devices.activeDays", { n: device.activeDays })}
                            {" · "}
                            {t("settings.devices.lastSubmit", { time: formatRelativeTime(device.lastSubmittedAt, undefined, locale) })}
                          </SmallText>
                        </div>
                      </TokenInfo>
                      {/* Cloud session devices are named by the server. */}
                      {!isReservedCloudDeviceKey(device.deviceKey) && (
                        <SecondaryButton
                          type="button"
                          onClick={() => startEditingDevice(device)}
                        >
                          {t("settings.devices.rename")}
                        </SecondaryButton>
                      )}
                    </>
                  )}
                </TokenItem>
              ))}
            </TokenList>
          )}
        </Section>

        <PrivacySection />

        <DangerSection>
          <DangerSectionTitle>
            {t("settings.danger.title")}
          </DangerSectionTitle>

          <DangerActionRow>
            <DangerActionInfo>
              <DangerActionTitle>{t("settings.danger.deleteDataTitle")}</DangerActionTitle>
              <DangerActionDescription>
                {t("settings.danger.deleteDataDesc")}
              </DangerActionDescription>
            </DangerActionInfo>
            <DangerActionButton onClick={() => setDangerAction("delete-data")}>
              {t("settings.danger.deleteDataButton")}
            </DangerActionButton>
          </DangerActionRow>

          <DangerActionRow>
            <DangerActionInfo>
              <DangerActionTitle>{t("settings.danger.deleteAccountTitle")}</DangerActionTitle>
              <DangerActionDescription>
                {t("settings.danger.deleteAccountDesc")}
              </DangerActionDescription>
            </DangerActionInfo>
            <DangerActionButton onClick={() => setDangerAction("delete-account")}>
              {t("settings.danger.deleteAccountButton")}
            </DangerActionButton>
          </DangerActionRow>
        </DangerSection>

      </MainContent>

      {revokingToken && (
        <RevokeTokenModal
          token={revokingToken}
          onClose={() => setRevokingToken(null)}
          onConfirm={() => handleRevokeToken(revokingToken)}
        />
      )}

      {dangerAction && (
        <DangerConfirmationModal
          action={dangerAction}
          onClose={() => setDangerAction(null)}
          onSuccess={handleDangerSuccess}
        />
      )}
    </PageWrapper>
  );
}
