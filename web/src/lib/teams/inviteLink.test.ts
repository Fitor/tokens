import { expect, test } from "bun:test";
import * as service from "./service";

// specs/team-invitation-inbox/spec.md → Requirement: 邀请邮件链接携带回跳参数。
// buildInviteLink(hasAccount) 的链接主机取 process.env.NEXT_PUBLIC_URL，未设置
// 时回退 http://localhost:3000；已注册账号拼 /login，未注册邮箱拼 /register；
// 两种路径都追加 returnTo=%2Fteams。
// 用 namespace import（而非具名导入）让改动前的失败停在运行时断言
// （buildInviteLink is not a function），不停在 ESM 链接错误。

const ENV_KEY = "NEXT_PUBLIC_URL";

/** 注入（undefined 表示删除）环境变量，返回恢复函数。每条用例自管自恢复。 */
function injectEnv(value: string | undefined): () => void {
  const saved = process.env[ENV_KEY];
  if (value === undefined) {
    delete process.env[ENV_KEY];
  } else {
    process.env[ENV_KEY] = value;
  }
  return () => {
    if (saved === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = saved;
    }
  };
}

test("invite link: registered account -> /login?returnTo=%2Fteams", () => {
  const restore = injectEnv("https://tokens.example.com");
  try {
    expect(service.buildInviteLink(true)).toBe(
      "https://tokens.example.com/login?returnTo=%2Fteams"
    );
  } finally {
    restore();
  }
});

test("invite link: unregistered email -> /register?returnTo=%2Fteams", () => {
  const restore = injectEnv("https://tokens.example.com");
  try {
    expect(service.buildInviteLink(false)).toBe(
      "https://tokens.example.com/register?returnTo=%2Fteams"
    );
  } finally {
    restore();
  }
});

test("invite link: NEXT_PUBLIC_URL fallback keeps path and query", () => {
  const restore = injectEnv(undefined);
  try {
    expect(service.buildInviteLink(true)).toBe(
      "http://localhost:3000/login?returnTo=%2Fteams"
    );
    expect(service.buildInviteLink(false)).toBe(
      "http://localhost:3000/register?returnTo=%2Fteams"
    );
  } finally {
    restore();
  }
});
