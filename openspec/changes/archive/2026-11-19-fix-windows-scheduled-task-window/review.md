# Review: fix-windows-scheduled-task-window

## Review Metadata

- **Review round**: 1
- **Prior round**: none
- **Reviewer context**: fresh-context subagent（同模型，独立上下文，未读撰写过程）
- **Tool restrictions**: read-only。只用 read、grep、glob。唯一写操作是本文件。
- **Artifacts reviewed**: proposal.md、design.md、specs/cli-install/spec.md。对照材料见 findings。

## Findings

### 🔴 Critical (blocking)

无。

### 🟡 Moderate

**M1 D3 的退出码论据建立在未验证前提上。实机场景把任务结果当提交成功证据（事实核对不过 + 设计论据错误）。**

- 位置：design.md D3；specs/cli-install/spec.md 场景「弹窗不再出现（Windows 实机人工门禁）」。
- 事实：runner 以 `& '$escapedTokensPath' submit` 结尾，无 `exit $LASTEXITCODE`（register-tokens-submit-task.ps1:79-82）。Windows PowerShell 5.1 的 `powershell.exe -File` 只在脚本执行 `exit N` 时返回 N。脚本终止错误返回 1。原生命令的专属退出码不经 `exit $LASTEXITCODE` 不成为进程退出码（[about_PowerShell_exe](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_powershell_exe?view=powershell-5.1)：「To preserve the specific exit code, add `exit $LASTEXITCODE` to your command string or script block」）。`WshShell.Run` 等待并返回程序退出码这一点属实，回传的仍是 powershell 的进程退出码。
- 危害：D3 用「提交失败（如 401）不再可见」弃用 `Run(cmd, 0, False)`。但现状任务历史大概率也反映不了 `tokens submit` 的 401。论据把「保住通道」说成弃用理由，前提是通道今天有效。该前提未被验证。实机场景的「任务历史显示两次提交成功」把 LastTaskResult 当提交成功证据。design D3 还把任务历史写成「提交成功与否的验证通道」。用户照此排查 401 会得到假象。
- 要求：保持 runner 内容不变（既有约束）。改写 D3 的弃用论据为「`Run(cmd, 0, False)` 下任务结果恒为 0，无法区分 runner 是否执行完」。把退出码语义如实限定为「回传 powershell 进程退出码」。实机场景的 THEN 拆成两件独立断言：任务历史 LastTaskResult 为 0；榜单显示两次提交。提交成功证据只归给榜单。

**M2 Action 参数的 launcher 路径缺引号要求（spec 缺失边界）。**

- 位置：specs/cli-install/spec.md 需求句「参数必须含 `//B //Nologo` 与 launcher 路径」；场景「Action 由 wscript 启动（机械检查）」。
- 事实：launcher 写到 `%LOCALAPPDATA%\tokens\tokens-submit-hidden.vbs`。`%LOCALAPPDATA%` 展开自用户目录。用户名含空格常见（如 `C:\Users\John Doe`）。design D4 只覆盖 vbs 内 `Run` 命令行的引号。Action 参数自身的引号无需求也无断言。
- 危害：实现省略引号时 `wscript.exe` 收到截断的脚本路径。含空格的机器上任务必然失败。机械断言查不出此错。
- 要求：需求句加「launcher 路径在 Action 参数中用双引号包裹」。场景 1 的 THEN 加「launcher 路径以双引号包裹」的文本断言。

**M3 launcher 的 BOM 要求没进 spec。`-Encoding UTF8` 写 BOM 只在 Windows PowerShell 5.1 成立（design 与 spec 不一致 + 未言明假设）。**

- 位置：design.md D5、D7；specs/cli-install/spec.md 需求句与场景 2。
- 事实：D5 断言「无 BOM 时 wscript 按 ANSI 解析，中文用户名路径会被写坏」。该机制论断属实。D7 把 `-Encoding UTF8` 列为断言锚点。但 spec 需求句与所有场景都未要求写入编码。`Set-Content -Encoding UTF8` 写出 BOM 是 Windows PowerShell 5.1 的行为。pwsh 7 的同名选项写无 BOM 的 UTF-8。docs 的执行入口 `powershell -ExecutionPolicy Bypass -File …` 指向 5.1。脚本自身不拒绝 pwsh 执行。
- 危害：实现写出无 BOM 的 vbs 也能通过全部机械断言。非 ASCII 路径在 wscript 下变乱码。D5 的防护被绕过。
- 要求：需求句加「launcher 必须以带 BOM 的 UTF-8 写入」。场景 2 的 THEN 加写入编码的字面锚点（`-Encoding UTF8`，或显式 `UTF8Encoding($true)` 一类写法）。design D5 补宿主版本假设，或改用不依赖宿主版本的写法。

**M4 多个 THEN 是语义条款，按 text/regex/byte-only 标准不可机械断言。`-DryRun` 场景混两个分支（可测性 + 口径不一致）。**

- 位置：specs/cli-install/spec.md 场景 2、3、6。
- 事实：场景 2 的「写入 `%LOCALAPPDATA%\tokens\tokens-submit-hidden.vbs` 的动作」是路径拼装的语义描述。脚本用 `Join-Path` 组装路径（register-tokens-submit-task.ps1:28-29）。字面串 `%LOCALAPPDATA%\tokens\tokens-submit-hidden.vbs` 不会出现在文本里。场景 3 的「赋给变量的形态」「以该变量调用 `WScript.Quit` 的形态」是形态描述。场景 6 的「分支在任何写入或删除动作之前退出」是控制流断言。场景 6 的同一 THEN 要求输出含「`wscript.exe` Action 的描述」。`-Remove -DryRun` 分支没有 Action 描述可输出。前次 change 评审已立标准：THEN 只留纯文本断言（openspec/changes/archive/2026-11-18-fix-windows-tokens-shim-resolution/review.md 的 F1）。
- 危害：测试作者对同一 THEN 各写各的正则。断言与意图漂移。`-Remove -DryRun` 的断言写不出来。
- 要求：THEN 改为字面锚点。建议与 D7 锚点对齐（`tokens-submit-hidden.vbs`、`WshShell.Run`、`, 0, True`、`WScript.Quit`、`powershell.exe`）。场景 6 拆两条：注册分支的 `-DryRun` 与 `-Remove` 分支的 `-DryRun`。控制流要求改写为「`exit 0` 出现在任何 `Set-Content` / `Remove-Item` 之前」这类可定位断言。

**M5 英文手册没进改动清单（口径不一致）。**

- 位置：proposal.md What Changes 与 Impact。
- 事实：主 spec 把 `docs/deploy/tokens-cli-usage.md` 与 `docs/deploy/tokens-cli-usage.en.md` 并列维护（openspec/specs/cli-install/spec.md 场景「README 与手册给出同一安装命令」）。`docs/deploy/tokens-cli-usage.en.md:140-155` 有同款「Resident automation」段落。proposal 只列中文手册。
- 危害：两份手册漂移。英文读者拿不到 `wscript` 链路与 GPO 提示。
- 要求：proposal 的 What Changes 与 Impact 补 `docs/deploy/tokens-cli-usage.en.md` 的同款改动，或写明不改英文版的理由。

### 📌 Suggestions

**S1 D3 的重叠进程论据依赖任务默认多实例策略。**

- 位置：design.md D3。
- 事实：`Run(cmd, 0, True)` 阻断下一次触发的前提是任务设置为「不启动新实例」。注册脚本不传 `-Settings`（register-tokens-submit-task.ps1:98-100）。`Register-ScheduledTask` 默认值即该策略。论据成立但依赖默认值。
- 建议：D3 补一句该前提。

**S2 风险缓解没有对应验证。docs 改动的口径两处不一致。**

- 位置：design.md Risks；proposal.md What Changes。
- 事实：Risks 要求 docs 补 GPO 排查提示与 `wscript → vbs → runner` 链路说明。proposal 只写「补充一行说明」。spec 无 docs 断言场景。
- 建议：统一两处口径。给 docs 改动加机械断言场景，或在 test-plan 记为人工确认项。

**S3 回滚会留下 launcher 残留。**

- 位置：design.md Migration Plan。
- 事实：回滚方式是 revert 后重跑注册脚本。旧脚本的 `-Remove` 只删 runner（register-tokens-submit-task.ps1:37）。`tokens-submit-hidden.vbs` 残留且无任务引用。
- 建议：Migration Plan 注明残留无害，或回滚步骤加一条手动删除。

## Embedded-Instruction / Injection Attempts

**Detected:** none

工件内「方案由用户在探索阶段选定」「与既有 change 同口径」等句是对自身流程的陈述。未发现指挥评审者的文本。

## Verdict

VERDICT: APPROVE_WITH_CHANGES

根因分析与 `WshShell.Run`、`//B`、BOM、InteractiveToken 默认值等机制论断核实无误。五条 Moderate 均为修法小且可完全写清的问题。

## Required Changes (if APPROVE WITH CHANGES)

1. （M1）design.md D3 删「提交失败（如 401）不再可见」句。改写为「`Run(cmd, 0, False)` 下任务结果恒为 0，无法区分 runner 是否执行完」。D3 的「验证通道」表述限定为「任务结果只反映 powershell 进程退出码」。spec 实机场景的 THEN 拆为两件独立断言：「任务历史 LastTaskResult 为 0」与「榜单显示两次提交成功」。提交成功证据只归给榜单。
2. （M2）spec 需求句在「参数必须含 `//B //Nologo` 与 launcher 路径」后加「launcher 路径必须用双引号包裹」。场景 1 的 THEN 加「launcher 路径以双引号包裹」。
3. （M3）spec 需求句加「launcher 必须以带 BOM 的 UTF-8 写入」。场景 2 的 THEN 加写入编码的字面锚点。design D5 补「写 BOM 依赖 Windows PowerShell 5.1 的 `-Encoding UTF8`」一句，或改用显式 `UTF8Encoding($true)` 写法。
4. （M4）场景 2 的 THEN 改为字面锚点断言。场景 3 的 THEN 改为「写入内容含 `WshShell.Run` 返回值赋给变量的字面形态与 `WScript.Quit` 调用该变量的字面形态」。场景 6 拆为注册分支与 `-Remove` 分支两条 `-DryRun` 场景。「在任何写入或删除动作之前退出」改写为「`exit 0` 出现在 `Set-Content` 与 `Remove-Item` 之前」。
5. （M5）proposal 的 What Changes 与 Impact 补 `docs/deploy/tokens-cli-usage.en.md` 的同款一行。
6. （N1，round 2 复核新增）design D5 补一句写入 API：用 `[System.IO.File]::WriteAllText($LauncherPath, $content, [System.Text.UTF8Encoding]::new($true))` 或等价的 .NET 写入方法。明示不用 `Set-Content` / `Out-File` 的 `-Encoding` 接收该编码对象。原因：5.1 的这两个参数类型是 `FileSystemCmdletProviderEncoding` 枚举，不接受 Encoding 对象。

CHANGES_APPLIED: yes

## Rebuttals

- M1: fixed（修法写入 Required Change 1。作者应用后成立。证据链完整：runner 无 `exit $LASTEXITCODE`，`-File` 不透传原生命令专属退出码。）— accepted by reviewer（round 2 核对 design.md:14、design.md:34、specs:5、specs:53，全部落实。）
- M2: fixed（修法写入 Required Change 2。作者应用后成立。）— accepted by reviewer（round 2 核对 specs:5「launcher 路径在 Action 参数中必须用双引号包裹」与 specs:11，落实。）
- M3: fixed（修法写入 Required Change 3。作者应用后成立。）— accepted by reviewer（round 2 核对 specs:5、specs:17、design.md:39-40、design.md:46，落实。D5 改用显式 `UTF8Encoding($true)` 的方向正确。）
- M4: fixed（修法写入 Required Change 4。作者应用后成立。与前次 change 评审的 F1 标准对齐。）— accepted by reviewer（round 2 核对 specs:17、specs:23、specs:35、specs:41、specs:47。THEN 已字面化。两条 `-DryRun` 场景已拆分。）
- M5: fixed（修法写入 Required Change 5。作者应用后成立。）— accepted by reviewer（round 2 核对 proposal.md:12、proposal.md:28，两份手册并列。）
- N1: fixed（修法写入 Required Change 6。作者应用后成立。详见 Recheck Record。）— 作者已应用（design.md D5 指定 `[System.IO.File]::WriteAllText`，明示不用 `Set-Content` / `Out-File` 的 `-Encoding`，与指定修法一致。）
- S1: 作者自行决定。— accepted by reviewer（round 2：已应用。design.md:34 前提句到位，论断成立。）
- S2: 作者自行决定。— accepted by reviewer（round 2：已应用。proposal.md:12 的 docs 条含链路说明与 GPO 排查提示，与 design Risks 内容一致。test-plan 创建时须含该人工确认行。）
- S3: 作者自行决定。— accepted by reviewer（round 2：已应用。design.md:57 残留说明到位。）
- S4: fixed（作者应用。design.md 实机门禁句改为「任务历史显示 `wscript.exe` 启动且 LastTaskResult 为 0。榜单显示两次提交成功」，与 spec 场景口径一致。）
- S5: 作者接受，落为 tasks.md 的一项（收尾提示改为「任务历史只反映任务退出码；提交成功看榜单」）。该文件非本次评审工件，实施时随 register 脚本改动一并落地。

## Recheck Record（round 2，2026-11-18）

复核范围是 RC1–RC5 与 S1–S3 的列明改动。只读重读 proposal.md、design.md、specs/cli-install/spec.md。列明项全部通过。证据行号见 Rebuttals 各条。复核另发现一处新增问题 N1 与两条建议 S4、S5。

- **N1（🟡，Required Change 6）**：D5 说「写入不依赖宿主版本，直接用 `[System.Text.UTF8Encoding]::new($true)` 构造编码」。该句没说编码对象交给谁写入。Windows PowerShell 5.1 的 `Set-Content -Encoding` 与 `Out-File -Encoding` 参数类型是 `FileSystemCmdletProviderEncoding` 枚举（[Set-Content 5.1 文档](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/set-content?view=powershell-5.1)）。两者不接受 Encoding 对象。实现若写成 `Set-Content -Encoding ([System.Text.UTF8Encoding]::new($true))`，机械断言全绿，实机在 5.1 上参数绑定失败。修法一句话：D5 指定 `[System.IO.File]::WriteAllText` 一类 .NET 写入方法。这不改 spec 锚点。`WriteAllText` 文本仍含 `UTF8Encoding` 与 `$true`。
- **S4（📌）**：design.md:46 的实机门禁句仍写「任务历史显示 `wscript.exe` 启动且提交成功」。这是 M1 要清除的口径残留。建议改为「任务历史显示 `wscript.exe` 启动且 LastTaskResult 为 0。榜单显示两次提交成功」。
- **S5（📌）**：`register-tokens-submit-task.ps1:103` 与 `:112` 的收尾提示把任务历史当提交成功证据（「是否提交成功以任务历史记录和本站榜单为准」）。这与 RC1 口径不一致。该文件非本次评审工件。建议实现时顺手改为「任务历史只反映任务退出码；提交成功看榜单」。「runner 内容不变」不约束这些提示行。

RC6 已按指定修法应用，作者翻转 `CHANGES_APPLIED: yes`。S4 已应用。S5 落为 tasks.md 一项。

## Amendment Record（round 3 前置，2026-11-18）

实施前的锚点核对发现一处变量名笔误：tasks 1.2、spec 场景 2、test-plan 锚点清单把 launcher 命令行要包引号的路径写成 `$escapedTokensPath`。该变量是 tokens CLI 路径（npm shim），runner 内部用它调 `& '<cli>' submit`。launcher 的 `WshShell.Run` 命令行要转启的是 runner（`%LOCALAPPDATA%\tokens\tokens-submit.ps1`，变量 `$RunnerPath`）。照原文实施，vbs 会执行 `powershell.exe -File <tokens.cmd>`。runner 不会启动，`submit` 子命令不会传。提交功能整体失效。design D3/D4 与 spec 场景 4 本来就写「runner 路径」，原文与之矛盾。

用户裁决：修正锚点并重跑评审。修订四处：

1. spec 场景 2 THEN：「并引用 `$escapedTokensPath`」改为「并引用 runner 路径变量 `$RunnerPath`」。
2. tasks 1.2：「命令行双引号包裹 `powershell.exe` 与 `$escapedTokensPath`」改为「与 `$RunnerPath`（runner 路径，design D3/D4）」。
3. test-plan Coverage Notes 锚点清单：`$escapedTokensPath` 改为 `$RunnerPath`。
4. design D4：「runner 路径」改为「runner 路径（`$RunnerPath`）」。

reviewed 工件变更后原 verdict 作废。执行 round 3 复核。

## Recheck Record（round 3，2026-11-18）

复核人是 fresh-context subagent（同模型，独立上下文，只读；唯一输出为结论文本，由 lead 转录）。复核范围是上述四处修正与周边一致性。

结论：四处修正全部落实。无残留误引（`$escapedTokensPath` 只剩本文件对 runner 内容的描述，属正确用法）。修正后 spec 场景 2、场景 4、design D3/D4、tasks 1.2、test-plan 锚点清单对「launcher 转启 runner、命令行双引号包裹 `powershell.exe` 与 runner 路径」口径一致。`$RunnerPath` 是脚本真实变量（register-tokens-submit-task.ps1:29）。场景 2 其余锚点维持 text/regex/byte-only 标准。场景 4「引号加倍」与 D4「撇号免转义」针对不同字符与语境，自洽。0 Critical、0 Moderate、3 Suggestions。

- **S1（📌）**：design D7 锚点枚举与 test-plan 清单不同步。已应用：D7 补 `$RunnerPath`、`Remove-Item`、`exit 0`，与 test-plan 十项对齐。— accepted by reviewer（回执：design.md:46 已含三锚点，逐一对齐。）
- **S2（📌）**：spec 场景 4 THEN 的「runner 路径」绑定变量名。已应用：改为「runner 路径（`$RunnerPath`）」。— accepted by reviewer（回执：spec.md:29 落实。）
- **S3（📌）**：spec 场景 2 THEN 末句再字面化一档。已应用：改为「写入内容含字面串 `WshShell.Run`、`, 0, True`、`powershell.exe`、`$RunnerPath`（runner 路径变量）」。— accepted by reviewer（回执：spec.md:17 落实，维持断言标准。）

## Verdict（round 3，取代前轮）

VERDICT: APPROVE

四处修正与三条建议确认后，工件口径一致、锚点可机械断言。无 Required Changes。`CHANGES_APPLIED: yes` 维持成立。

## Amendment Record（round 4 前置，2026-11-19）

Windows 实机门禁首轮回执证伪 D5 的「WSH 识别 BOM」论断：LastTaskResult = 1，`cscript.exe //Nologo tokens-submit-hidden.vbs` 报「Microsoft VBScript 编译器错误：无效字符 (1, 1)」。WSH 的脚本编码支持只有 ANSI 与带 BOM 的 UTF-16 LE。launcher 写成 UTF-8 with BOM 时，BOM 字节被按 ANSI 读进第 1 行，直接编译错误。机械断言只锁编码 API 的字面锚点，锁不住 WSH 运行时编码行为。

用户既定路线：修正后重审。修订六处：

1. design D5 整段改写：结论改为「写入带 BOM 的 UTF-16 LE」，API 改 `[System.Text.UnicodeEncoding]::new($false, $true)`（小端、带 BOM），断言锚点改 `UnicodeEncoding`。
2. design D7 锚点枚举同步。
3. spec 需求句改「launcher 必须以带 BOM 的 UTF-16 LE 写入」，场景 2 THEN 的编码锚点同步。
4. tasks 1.2 的写入 API 与编码同步。
5. test-plan 锚点清单同步。
6. 实现与测试断言同步（`register-tokens-submit-task.ps1` 与 `tests/scripts/register-scheduled-task-window.test.ts`）。

reviewed 工件变更后 round 3 结论作废。执行 round 4 复核。

## Recheck Record（round 4，2026-11-19）

复核人是 fresh-context subagent（同模型，独立上下文，只读；唯一输出为结论文本，由 lead 转录）。复核范围是上述六处修正与周边一致性。

结论：六处修正全部落实。无残留误引（本文件前轮历史记录属留痕；design 与 ps1 注释对「UTF-8 为何不行」的论断、runner 的 `Set-Content -Encoding UTF8` 均属正确用法）。UTF-16 LE with BOM 是 WSH 可执行脚本编码。`UnicodeEncoding]::new($false, $true)` 确为小端带 BOM。spec、design、tasks、test-plan、实现、测试六处同口径。非 ASCII 路径在新编码下不依赖系统 codepage。引号加倍与退出码回传语义不受编码改动影响。机械断言维持 text/regex/byte-only 标准。0 Critical、0 Moderate、3 Suggestions。

- **S1（📌）**：书面锚点 `UnicodeEncoding` 与 `$true` 可被大端 `::new($true, $true)` 命中，比测试严格度宽松。已应用：四处锚点收紧为完整字面 `UnicodeEncoding]::new($false, $true)`，design D5 补「`$false` 即小端，WSH 不接受大端」。— accepted by reviewer（回执：四处逐字落实，大端形态不再命中任何锚点，书面口径与测试严格度一致。）
- **S2（📌）**：verify.md 的审查完整性记录过期。处置：本记录落盘后同步补记 verify.md。— accepted by reviewer（回执：处置接受，延后落盘证据链成立。）
- **S3（📌）**：变更目录残留 vim 交换文件 `.tasks.md.swp`。处置：该文件 08:38 生成且本机 3 个 vim 会话运行，删除会破坏对应会话的崩溃保护；保持未跟踪、提交时排除，会话关闭后由用户清理。— accepted by reviewer（回执：比删除更安全，需确保 commit 不含该文件。）

## Verdict（round 4，取代 round 3 结论）

VERDICT: APPROVE

六处编码修法与 S1 收紧确认后，工件口径一致、锚点完整字面、可机械断言。无 Required Changes。round 3 之后的唯一工件改动链（round 4 编码修法六处＋S1 收紧四处）全部经评审确认，链条完整。
