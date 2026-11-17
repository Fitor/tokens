import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// 护栏：TOKENS_SCRIPTS_REF 覆盖的 fail-closed 语义保持不变。
// 非法 ref（分支名等）必须回退 PINNED_SCRIPTS_REF 并告警，绝不生成畸形
// 或指向他处的链接。scriptsRef 模块在导入期读 env，因此用带 query 的
// 动态导入拿到新模块实例，并在结束时恢复 env。

describe("scriptsRef 非法 ref 覆盖回退钉版", () => {
  const original = process.env.TOKENS_SCRIPTS_REF;

  beforeEach(() => {
    process.env.TOKENS_SCRIPTS_REF = "main";
  });

  afterEach(() => {
    if (original === undefined) delete process.env.TOKENS_SCRIPTS_REF;
    else process.env.TOKENS_SCRIPTS_REF = original;
  });

  test("非法 ref 覆盖回退钉版", async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg?: unknown) => {
      warnings.push(String(msg));
    };
    try {
      const mod = await import(`./scriptsRef.ts?v=${Date.now()}`);
      expect(mod.SCRIPTS_REF).toBe(mod.PINNED_SCRIPTS_REF);
      expect(warnings.join("\n")).toContain("invalid TOKENS_SCRIPTS_REF");
    } finally {
      console.warn = originalWarn;
    }
  });
});
