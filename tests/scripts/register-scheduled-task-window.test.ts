/**
 * Windows 计划任务隐藏窗口修复的契约测试（specs/cli-install/spec.md →
 * 「计划任务触发不得创建可见窗口」）。本机无 Windows 环境，ps1 与 vbs
 * 行为用机械文本断言（text/regex/byte-only，对齐前次 change 评审的 F1 标准），
 * 实机行为留 test-plan 的人工门禁行。断言锚点见 test-plan Coverage Notes。
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../..");
const REGISTER_PS1 = path.join(ROOT, "register-tokens-submit-task.ps1");
const ps1Text = () => readFileSync(REGISTER_PS1, "utf8");

// launcher 写入内容区（ps1 里赋给 $launcher 的 here-string）。断言锚点要在
// 该区内命中，防止把脚本其他位置的同名词串误判为 launcher 内容。
function launcherBlock(text: string): string {
  const m = text.match(/\$launcher\s*=\s*@(['"])\r?\n([\s\S]*?)\r?\n\1@/);
  if (!m) throw new Error("未找到 $launcher here-string：脚本尚无 launcher 写入内容");
  return m[2];
}

describe("计划任务触发不得创建可见窗口（机械检查）", () => {
  test("Action 由 wscript 启动（机械检查）", () => {
    const text = ps1Text();
    // Action 的 Execute 是 wscript.exe，不再是 powershell.exe。
    expect(text).toMatch(/-Execute\s+['"]wscript\.exe['"]/);
    expect(text).not.toMatch(/-Execute\s+['"]powershell\.exe['"]/);
    // 参数含 //B //Nologo（抑制脚本错误对话框与横幅，design D6）。
    expect(text).toContain("//B //Nologo");
    // launcher 路径在 Action 参数中以双引号包裹（用户名含空格时正确）。
    expect(text).toMatch(/\/\/B \/\/Nologo\s+`"\$LauncherPath`"/);
    // launcher 文件名在脚本里有定义（$LauncherPath 来源）。
    expect(text).toContain("tokens-submit-hidden.vbs");
  });

  test("launcher 内容以隐藏窗口启动 runner（机械检查）", () => {
    const text = ps1Text();
    // launcher 的写入动作：文件名、WriteAllText、UTF-16 LE with BOM 编码
    // （WSH 只认 ANSI 或带 BOM 的 UTF-16 LE）。
    expect(text).toContain("tokens-submit-hidden.vbs");
    expect(text).toContain("[System.IO.File]::WriteAllText($LauncherPath");
    expect(text).toContain("UnicodeEncoding]::new($false, $true)");
    // 写入内容含隐藏窗口转启 runner 的字面锚点与 runner 路径变量。
    const block = launcherBlock(text);
    expect(block).toContain("WshShell.Run");
    expect(block).toContain(", 0, True");
    expect(block).toContain("powershell.exe");
    expect(block).toContain("$RunnerPath");
  });

  test("退出码回传任务历史（机械检查）", () => {
    const block = launcherBlock(ps1Text());
    // WshShell.Run 返回值赋给变量，WScript.Quit 以同一变量为参数。
    const run = block.match(/(\w+)\s*=\s*WshShell\.Run\(/);
    const quit = block.match(/WScript\.Quit\s+(\w+)/);
    expect(run).not.toBeNull();
    expect(quit).not.toBeNull();
    expect(run![1]).toBe(quit![1]);
  });

  test("路径含空格时命令行仍正确（机械检查）", () => {
    const block = launcherBlock(ps1Text());
    // Run 命令行把 powershell.exe 与 runner 路径都用双引号包裹。
    // 嵌入 vbs 字符串的双引号做加倍转义（"" 形态）。
    expect(block).toContain('""powershell.exe""');
    expect(block).toContain('""$RunnerPath""');
  });
});

describe("-Remove 与 -DryRun（机械检查）", () => {
  test("-Remove 同步清理 launcher（机械检查）", () => {
    const text = ps1Text();
    const rmStart = text.indexOf("if ($Remove) {");
    const setIdx = text.indexOf("Set-Content");
    expect(rmStart).toBeGreaterThan(-1);
    // launcher 删除动作：Remove-Item 目标是 $LauncherPath。$LauncherPath 的
    // 定义行绑定 tokens-submit-hidden.vbs，两跳核对到文件名。
    const del = text.match(/Remove-Item\s+\$LauncherPath/);
    expect(del).not.toBeNull();
    expect(del!.index).toBeGreaterThan(rmStart);
    // runner 与 launcher 的删除动作都留在 -Remove 分支（注册路径在其后）。
    const runnerDel = text.match(/Remove-Item\s+\$RunnerPath/);
    expect(runnerDel).not.toBeNull();
    expect(runnerDel!.index).toBeGreaterThan(rmStart);
    expect(Math.max(del!.index!, runnerDel!.index!)).toBeLessThan(setIdx);
    expect(text).toMatch(/\$LauncherPath\s*=\s*Join-Path[^\n]*'tokens-submit-hidden\.vbs'/);
  });

  test("注册分支的 -DryRun 不触碰文件系统（机械检查）", () => {
    const text = ps1Text();
    // 注册路径的 -DryRun 分支是文件中最后一个 if ($DryRun)（-Remove 分支的
    // -DryRun 子分支在其前）。
    const regDryIdx = text.lastIndexOf("if ($DryRun)");
    const exitIdx = text.indexOf("exit 0", regDryIdx);
    expect(regDryIdx).toBeGreaterThan(-1);
    expect(exitIdx).toBeGreaterThan(regDryIdx);
    // exit 0 在任何写入动作之前。
    expect(exitIdx).toBeLessThan(text.indexOf("Set-Content"));
    expect(exitIdx).toBeLessThan(text.indexOf("[System.IO.File]::WriteAllText"));
    // 输出含 wscript.exe Action 描述与 launcher 文件名（单跳字面锚点）。
    const dryOut = text.slice(regDryIdx, exitIdx);
    expect(dryOut).toContain("wscript.exe");
    expect(dryOut).toContain("tokens-submit-hidden.vbs");
  });

  test("-Remove 分支的 -DryRun 不触碰文件系统（机械检查）", () => {
    const text = ps1Text();
    // -Remove 分支的 -DryRun 子分支先 exit 0。所有 Remove-Item 都在其后。
    const rmDryIdx = text.indexOf("if ($DryRun)");
    const exitIdx = text.indexOf("exit 0", rmDryIdx);
    expect(rmDryIdx).toBeGreaterThan(-1);
    expect(exitIdx).toBeGreaterThan(rmDryIdx);
    for (const m of text.matchAll(/Remove-Item/g)) {
      expect(m.index!).toBeGreaterThan(exitIdx);
    }
  });
});

describe("收尾提示与双手册（机械检查）", () => {
  test("docs 双手册含链路说明与 GPO 提示（机械检查）", () => {
    for (const rel of ["docs/deploy/tokens-cli-usage.md", "docs/deploy/tokens-cli-usage.en.md"]) {
      const text = readFileSync(path.join(ROOT, rel), "utf8");
      // wscript → vbs → runner 启动链路说明。
      expect(text).toContain("wscript → vbs → runner");
      // GPO 禁用 wscript.exe 的排查提示。
      expect(text).toContain("GPO");
      expect(text).toContain("wscript.exe");
    }
  });

  test("收尾提示不把任务历史当提交成功证据（机械检查）", () => {
    const text = ps1Text();
    // 旧口径缺席。新口径在场，且两处收尾提示各改一次。
    expect(text).not.toContain("以任务历史记录和本站榜单为准");
    const hits = text.match(/任务历史只反映任务退出码；提交成功看榜单/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});
