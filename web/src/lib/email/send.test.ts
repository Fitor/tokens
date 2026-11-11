import { describe, expect, test, spyOn, mock } from "bun:test";
import * as email from "./send";

// Resolve dynamically so the initial red state is an assertion, not an import error.
const parse = (env: Record<string, string | undefined>) =>
  (email as unknown as { resolveEmailTransport: (env: Record<string, string | undefined>) => any }).resolveEmailTransport(env);

describe("email transport selection", () => {
  test("selection: smtp host alone selects smtp transport", () => {
    expect(parse({ SMTP_HOST: "smtp.example.com" })).toMatchObject({ type: "smtp", host: "smtp.example.com", port: 587, secure: false });
  });
  test("selection: both configured prefers smtp", () => {
    expect(parse({ SMTP_HOST: "smtp.example.com", RESEND_API_KEY: "key" }).type).toBe("smtp");
  });
  test("selection: resend key alone selects resend", () => {
    expect(parse({ RESEND_API_KEY: "key" })).toMatchObject({ type: "resend", apiKey: "key" });
  });
  test("selection: empty smtp host treated as unset", () => {
    expect(parse({ SMTP_HOST: "", RESEND_API_KEY: "key" }).type).toBe("resend");
  });
  test("selection: nothing configured skips send with log", () => {
    expect(parse({}).type).toBe("skip");
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      email.sendTeamInviteEmail("person@example.com", "Team", "https://example.com");
      expect(log).toHaveBeenCalledWith(expect.stringContaining("SMTP_HOST"));
    } finally { log.mockRestore(); }
  });
  test("selection: invalid port falls back to 587", () => {
    for (const port of [undefined, "abc", "0", "70000", ""]) {
      expect(parse({ SMTP_HOST: "smtp.example.com", SMTP_PORT: port }).port).toBe(587);
    }
  });
});

describe("resend transport", () => {
  const call = () => (email as unknown as { sendEmail: (to: string, subject: string, text: string) => Promise<void> }).sendEmail("user@example.com", "Reset", "link");
  test("resend: happy path posts existing payload", async () => {
    const old = { ...process.env }; const fetchOriginal = globalThis.fetch;
    process.env.RESEND_API_KEY = "re_xxx"; process.env.EMAIL_FROM = "Tokens <noreply@example.com>"; delete process.env.SMTP_HOST;
    let args: unknown[] = [];
    globalThis.fetch = (async (...values: unknown[]) => { args = values; return new Response(null, { status: 200 }); }) as unknown as typeof fetch;
    try {
      email.sendPasswordResetEmail("user@example.com", "link");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(args[0]).toBe("https://api.resend.com/emails");
      const options = args[1] as RequestInit;
      expect(options.method).toBe("POST");
      expect(options.headers).toMatchObject({ Authorization: "Bearer re_xxx", "Content-Type": "application/json" });
      expect(JSON.parse(options.body as string)).toMatchObject({ from: "Tokens <noreply@example.com>", to: ["user@example.com"], subject: "Reset your Tokens password", text: expect.stringContaining("link") });
    } finally { process.env = old; globalThis.fetch = fetchOriginal; }
  });
  for (const failure of ["rejection", "network failure"]) {
    test(`resend: ${failure} contained and logged`, async () => {
      const old = { ...process.env }; const fetchOriginal = globalThis.fetch;
      process.env.RESEND_API_KEY = "re_xxx"; process.env.EMAIL_FROM = "from@example.com"; delete process.env.SMTP_HOST;
      const log = spyOn(console, "error").mockImplementation(() => {});
      globalThis.fetch = (async () => { if (failure === "network failure") throw new Error("offline"); return new Response(null, { status: 422 }); }) as unknown as typeof fetch;
      try { await expect(call()).resolves.toBeUndefined(); expect(log).toHaveBeenCalled(); }
      finally { process.env = old; globalThis.fetch = fetchOriginal; log.mockRestore(); }
    });
  }
});


describe("smtp transport", () => {
  let calls: unknown[] = [];
  let failure = false;
  let options: unknown;
  mock.module("nodemailer", () => ({ default: { createTransport: (config: unknown) => {
    options = config;
    return { sendMail: async (message: unknown) => { calls.push(message); if (failure) throw new Error("connection failed"); } };
  } } }));
  const invoke = () => email.sendEmail("user@example.com", "Verify your Tokens email", "https://example.com/verify");
  const setup = () => { const old = { ...process.env }; process.env.SMTP_HOST = "smtp.example.com"; process.env.SMTP_PORT = "465"; process.env.SMTP_SECURE = "true"; process.env.SMTP_USER = "user"; process.env.SMTP_PASS = "pass"; process.env.EMAIL_FROM = "Tokens <noreply@example.com>"; calls = []; failure = false; return old; };
  test("smtp: happy path sends expected envelope", async () => {
    const old = setup();
    try {
      email.sendVerificationEmail("user@example.com", "https://example.com/verify");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(calls).toEqual([{ from: "Tokens <noreply@example.com>", to: "user@example.com", subject: "Verify your Tokens email", text: expect.stringContaining("https://example.com/verify") }]);
      expect(options).toEqual({ host: "smtp.example.com", port: 465, secure: true, auth: { user: "user", pass: "pass" }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
    } finally { process.env = old; }
  });
  test("smtp: failure contained and logged", async () => {
    const old = setup(); failure = true; const log = spyOn(console, "error").mockImplementation(() => {});
    try { await expect(invoke()).resolves.toBeUndefined(); expect(log).toHaveBeenCalled(); }
    finally { process.env = old; log.mockRestore(); }
  });
  test("smtp: missing EMAIL_FROM skips send", async () => {
    const old = setup(); delete process.env.EMAIL_FROM; const log = spyOn(console, "error").mockImplementation(() => {});
    try { await invoke(); expect(calls).toHaveLength(0); expect(log).toHaveBeenCalledWith(expect.stringContaining("EMAIL_FROM")); }
    finally { process.env = old; log.mockRestore(); }
  });
  test("sanitize: smtp path replaces crlf with spaces", async () => {
    const old = setup();
    try {
      email.sendTeamInviteEmail("user@example.com", "Foo\r\nBcc: attacker@example.com", "link");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect((calls[0] as { subject: string }).subject).toBe("You're invited to Foo  Bcc: attacker@example.com on Tokens");
    } finally { process.env = old; }
  });

});


describe("subject sanitization", () => {
  test("sanitize: resend path replaces crlf with spaces", async () => {
    const old = { ...process.env }; const original = globalThis.fetch; let subject = "";
    delete process.env.SMTP_HOST; process.env.RESEND_API_KEY = "key"; process.env.EMAIL_FROM = "from@example.com";
    globalThis.fetch = (async (_url: unknown, init: RequestInit) => { subject = JSON.parse(init.body as string).subject; return new Response(null, { status: 200 }); }) as unknown as typeof fetch;
    try { email.sendTeamInviteEmail("user@example.com", "Foo\r\nBcc: attacker@example.com", "link"); await new Promise((resolve) => setTimeout(resolve, 0)); expect(subject).toBe("You're invited to Foo  Bcc: attacker@example.com on Tokens"); }
    finally { process.env = old; globalThis.fetch = original; }
  });
  test("sanitize: subject without crlf unchanged", async () => {
    const old = { ...process.env }; const original = globalThis.fetch; let subject = "";
    delete process.env.SMTP_HOST; process.env.RESEND_API_KEY = "key"; process.env.EMAIL_FROM = "from@example.com";
    globalThis.fetch = (async (_url: unknown, init: RequestInit) => { subject = JSON.parse(init.body as string).subject; return new Response(null, { status: 200 }); }) as unknown as typeof fetch;
    try { await email.sendEmail("user@example.com", "You're invited to 平台组 on Tokens", "body"); expect(subject).toBe("You're invited to 平台组 on Tokens"); }
    finally { process.env = old; globalThis.fetch = original; }
  });
  test("sanitize: skip log uses sanitized subject", async () => {
    const old = { ...process.env }; delete process.env.SMTP_HOST; delete process.env.RESEND_API_KEY;
    const log = spyOn(console, "error").mockImplementation(() => {});
    try { await email.sendEmail("user@example.com", "Foo\r\nBcc", "body"); expect(log).toHaveBeenCalledWith(expect.stringContaining("Foo  Bcc")); }
    finally { process.env = old; log.mockRestore(); }
  });
});

test("docs: port pairing and plaintext warnings present", async () => {
  const paths = ["../../../../docs/deploy/docker/prod/.env.example", "../../../../docs/deploy/self-host-production.md", "../../../../docs/deploy/self-host-production.en.md"];
  for (const path of paths) {
    const content = await Bun.file(new URL(path, import.meta.url)).text();
    expect(content).toContain("465");
    expect(content).toContain("SMTP_SECURE=true");
    expect(content).toContain("SMTP_SECURE=false");
    expect(content).toContain("STARTTLS");
    expect(content).toMatch(/明文|plaintext/i);
  }
});
