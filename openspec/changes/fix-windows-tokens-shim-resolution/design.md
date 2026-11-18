## Context

`pre-install-tokens.ps1` 与 `register-tokens-submit-task.ps1` 用同一模式解析 `tokens` 路径：`Get-Command tokens -CommandType Application`。npm 在 Windows 上全局安装会生成三个入口（`tokens.cmd`、无扩展名 Unix shim、`tokens.ps1`），`Get-Command` 返回多个 ApplicationInfo。`$tokensCmd.Source` 是数组，字符串插值时以空格拼接：

- pre-install 把拼接串写进 `$PROFILE` 的 `function tokens`，每个新窗口调用 `tokens` 都报「无法将"C:\...\tokens.cmd C:\...\tokens"项识别为 cmdlet」。`& $tokensCmd.Source logout` 裹在 `try {} catch {}` 里，多值时实际是错误调用，异常被吞后照样打印成功——旧登录清理静默失败。
- register 把拼接串经 `.Replace` 转义后写进计划任务 runner，任务每次触发都失败。

pre-install 在 `npm i -g` 之后还会复检一次 `Get-Command`（pre-install-tokens.ps1:56），结果同样是多值。所以每个 Windows 全新安装都产出坏的 function，不是重装才触发的边角情况。站方接入指南 §5.1 记录了真实报错，目前用人工步骤补救。

相关现状：ps1 无法在本机（macOS、无 pwsh）实跑，`tests/scripts/install-via-npm.test.ts` 对 ps1 一律机械文本断言。`web/public/` 的脚本副本由 `web/package.json` 的 build 步骤从仓库根拷贝（design D7 of npm-install-tokens-cli），`web/.gitignore` 不跟踪副本。指南 `接入Tokens排行榜操作指南.md` 是未入库的站方文档，不在 cli-install spec 的扫描范围。

## Goals / Non-Goals

**Goals:**

- 两个 ps1 把 `Get-Command` 多结果收敛为单一可执行路径，Windows 上优先 `tokens.cmd`。
- Profile function、计划任务 runner、`tokens logout` 调用只用收敛后的单一路径；logout 不再静默走错。
- 仓库根与 `web/public/` 副本的一致性有机械断言守护。
- 指南 §5.1 增加「重跑即自愈」提示，保留手工修复步骤。

**Non-Goals:**

- 不改 CLI 本体、sh 脚本、docs 页、settings 提示（cli-install spec 既有约束不触碰）。
- 不改计划任务行为、提交间隔、runner 的调用结构（`powershell.exe -NoProfile -File`）。
- 不改 Profile function 的幂等替换正则与 runner 的整体重写逻辑。
- 不在 Windows 环境实机验证（本机无 Windows/pwsh），留待有环境时补验。
- 不动指南的预装脚本路线（用户已裁定保留）。

## Decisions

**D1 收敛规则：数组化 → 优先 `*.cmd` → 回退首项。**
`Get-Command` 结果先 `@()` 包成数组，再取 `$_.Name -like '*.cmd'` 的第一项；未命中取 `[0]`。备选「直接取 `[0]`」依赖 Get-Command 的排序契约，5.1 与 7 无稳定性承诺，弃用。备选「直接拼 `%APPDATA%\npm\tokens.cmd`」在 nvm-windows 与自定义 prefix 下失效，且 register 不能引入 npm 依赖（spec 明文「tokens 已存在时不要求 npm」），弃用。回退首项同时覆盖 Linux 与 macOS 的 pwsh 环境（npm 不生成 `.cmd` shim），非 Windows 平台行为不变；该收益是设计理由，不作运行时断言（本机无 pwsh）。

**D2 每脚本内联一个单选函数，两个解析点都过它。**
pre-install 有两个 `Get-Command` 解析点（初始检测、安装后复检），register 有一个。三处统一接同一函数。函数名定为 `Select-TokensCommand`：入参命令集合，返回单值或 `$null`。调用形态统一为 `$tokensCmd = Select-TokensCommand (Get-Command tokens -CommandType Application -ErrorAction SilentlyContinue)`，机械断言以此形态为锚点。备选「在每个解析点后内联三行收敛」重复三份、易漏改，弃用。不抽公共外链文件：两个脚本从站点独立分发（`iex (irm …)`），必须自包含。

**D3 选 `.cmd`，不选 `.ps1` shim，保持 5.1 兼容语法。**
`.ps1` shim 不在 `-CommandType Application` 结果里，无需处理。`.cmd` 包装在 Windows PowerShell 5.1、PowerShell 7 与 cmd 下都能被 `&` 调用，与指南 §5.1 手工修复口径一致。脚本现由 `powershell.exe`（5.1）运行计划任务与用户手动执行，收敛逻辑只用 5.1 可用语法，不引入 PS7-only 语法。`Name` 是 CommandInfo 基类属性，筛选不依赖 `Extension` 的可用性。

**D4 logout 的 `try/catch` 结构保留。**
`tokens logout` 在未登录时本就报错，catch 是预期形态。本次只让调用拿到单一路径从而真实生效；不新增失败提示，行为面最小化。

**D5 副本一致性沿用构建拷贝机制，断言只在两份都存在时生效。**
`web/public/` 副本由 build 从仓库根 `cp`，Git 不跟踪。测试逐字节比较两对文件；任一副本缺失（如未构建的 fresh clone）跳过该对，构建后副本存在即生效。不引入新的同步步骤，不把副本纳入版本控制。

**D6 ps1 验证沿用机械文本断言，断言选稳定标记。**
断言三件事：单选函数含数组化与 `-like '*.cmd'` 筛选、含 `[0]` 回退；`Get-Command tokens -CommandType Application` 的出现次数等于 `Select-TokensCommand` 的调用次数（pre-install 两处、register 一处）；`$targetBinary` 与 `$escapedTokensPath` 的赋值行引用 `$tokensCmd.Source`（收敛后单值）。`$tokensCmd.Source` 这类调用在收敛后合法保留，不做字符串缺席断言（实现后该字面串仍存在，缺席断言会误报）。场景与测试 1:1，覆盖账本进 test-plan。

**D7 指南 §5.1 加自愈提示。**
修复后的脚本幂等：pre-install 用正则整块替换既有 `function tokens`，register 整文件重写 runner。重跑指南 3.1/3.3 通常直接修复存量坏机器；§5.1 顶部加此提示，手工步骤保留给特殊环境。指南文件随本 change 更新，不入 spec 扫描范围。

## Risks / Trade-offs

- [ps1 无实机验证] → 机械断言覆盖文本契约；风险接受，Windows 行为留待补验（与既有 change 同口径）。
- [机械断言与实现文本耦合] → 断言只锚定筛选表达式与回退形态等稳定标记，不做整段文本比对；实现形态变化时同步更新断言。
- [副本一致性断言在未构建的 fresh clone 上跳过，且 CI 不运行它] → `.github/workflows/ci.yml` 不跑 `bun test`，该护栏只在本地验证时生效；部署副本的一致性由 build 的 `cp`（源自仓库根）在构造上保证，护栏兜的是本地工作区漂移。
- [存量坏机器不止 Profile 与 runner 两处损伤] → 自愈提示覆盖这两处；若用户环境有其他手工改动，仍走 §5.1 手工步骤。

## Migration Plan

纯脚本修复，无数据与接口迁移。合入后随下次站点部署，新下载的脚本即修复版；已在站点根分发的脚本由部署更新。存量受影响机器重跑指南 3.1/3.3 自愈。回滚方式是 revert 提交并重新部署。

## Open Questions

无。指南路线由用户裁定（保留预装脚本路线），收敛规则与验证形态在探索阶段已定。
