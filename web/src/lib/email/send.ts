

/**
 * Transactional email through Resend's HTTP API — no SDK, one fetch.
 *
 * Delivery is deliberately decoupled from the request that triggered it: a
 * failed send (or a missing secret) logs and resolves, it never rolls back
 * the user or token rows the caller already committed. A lost verification
 * email is recoverable through POST /api/auth/resend-verification after sign-in.
 * Forgot-password only issues reset_password tokens and cannot verify email.
 */
const RESEND_API_URL = "https://api.resend.com/emails";

type EmailTransport =
  | { type: "smtp"; host: string; port: number; secure: boolean; auth?: { user: string; pass: string } }
  | { type: "resend"; apiKey: string }
  | { type: "skip" };

export function resolveEmailTransport(env: Record<string, string | undefined>): EmailTransport {
  if (env.SMTP_HOST) {
    const parsedPort = Number(env.SMTP_PORT);
    const port = Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? parsedPort : 587;
    const auth = env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined;
    return { type: "smtp", host: env.SMTP_HOST, port, secure: env.SMTP_SECURE?.toLowerCase() === "true", ...(auth ? { auth } : {}) };
  }
  return env.RESEND_API_KEY ? { type: "resend", apiKey: env.RESEND_API_KEY } : { type: "skip" };
}

let cachedKey: string | undefined;
let cachedTransport: EmailTransport;
let smtpTransport: Promise<import("nodemailer").Transporter> | undefined;

function getTransport(): EmailTransport {
  const env = process.env;
  const key = JSON.stringify([env.SMTP_HOST, env.SMTP_PORT, env.SMTP_SECURE, env.SMTP_USER, env.SMTP_PASS, env.RESEND_API_KEY]);
  if (key !== cachedKey) {
    cachedKey = key;
    smtpTransport = undefined;
    cachedTransport = resolveEmailTransport(env);
  }
  return cachedTransport;
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  subject = subject.replace(/[\r\n]/g, " ");
  const transport = getTransport();
  const from = process.env.EMAIL_FROM;
  if (transport.type === "skip" || !from) {
    console.error(`[email] SMTP_HOST/RESEND_API_KEY/EMAIL_FROM not configured; skipped "${subject}" to ${to}`);
    return;
  }
  if (transport.type === "smtp") {
    try {
      smtpTransport ??= import("nodemailer").then(({ default: nodemailer }) => nodemailer.createTransport({
        host: transport.host, port: transport.port, secure: transport.secure,
        ...(transport.auth ? { auth: transport.auth } : {}),
        connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
      }));
      await (await smtpTransport).sendMail({ from, to, subject, text });
    } catch (error) {
      console.error("[email] SMTP send failed", error);
    }
    return;
  }
  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${transport.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    if (!response.ok) console.error(`[email] Resend rejected "${subject}" to ${to}: ${response.status}`);
  } catch (error) {
    console.error("[email] send failed", error);
  }
}

/**
 * Fire-and-forget: a failed send logs and resolves, it never rolls back the
 * user or token rows the caller already committed. The floating promise
 * settles on its own in a long-lived Node process.
 */
function sendInBackground(work: Promise<void>): void {
  void work.catch((error: unknown) => {
    console.error("[email] send failed", error);
  });
}


export function sendVerificationEmail(to: string, link: string): void {
  sendInBackground(
    sendEmail(
      to,
      "Verify your Tokens email",
      [
        "Welcome to Tokens.",
        "",
        "Confirm this email address by opening the link below (valid for 24 hours):",
        link,
        "",
        "If you did not create an account, you can ignore this message.",
      ].join("\n")
    )
  );
}

export function sendPasswordResetEmail(to: string, link: string): void {
  sendInBackground(
    sendEmail(
      to,
      "Reset your Tokens password",
      [
        "A password reset was requested for your Tokens account.",
        "",
        "Choose a new password by opening the link below (valid for 1 hour):",
        link,
        "",
        "If you did not request this, you can ignore this message — your password stays unchanged.",
      ].join("\n")
    )
  );
}

export function sendTeamInviteEmail(to: string, teamName: string, link: string): void {
  sendInBackground(
    sendEmail(
      to,
      `You're invited to ${teamName} on Tokens`,
      [
        `You've been invited to join ${teamName} on Tokens.`,
        "",
        "Sign in or register with this email, then open:",
        link,
        "",
        "The invitation expires in 7 days. If you were not expecting this, ignore it.",
      ].join("\n")
    )
  );
}
