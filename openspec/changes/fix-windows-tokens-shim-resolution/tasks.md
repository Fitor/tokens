## 1. ps1 解析收敛

- [ ] 1.1 Write failing test:「ps1 单选逻辑含数组化与 .cmd 优先筛选（机械检查）」与「ps1 单选逻辑含 .cmd 未命中时取首项的回退分支（机械检查）」（test-plan 前两行）。断言两份 ps1 文本各含 `@()` 数组化、`-like '*.cmd'` 筛选与 `[0]` 回退分支。确认按预期原因失败：现文本无任何单选逻辑。
- [ ] 1.2 Write failing test:「ps1 每个 Get-Command 解析点都过 Select-TokensCommand 且下游只用单值（机械检查）」（test-plan 第三行）。按调用形态计数（排除 `function Select-TokensCommand {` 定义行），断言与 `Get-Command tokens -CommandType Application` 次数相等（合计 3），`$targetBinary` 与 `$escapedTokensPath` 赋值行引用 `$tokensCmd.Source`。确认失败。
- [ ] 1.3 Implement: pre-install-tokens.ps1 新增 `Select-TokensCommand`（design D2 形态），初始检测与安装后复检两个解析点接入；`logout` 调用与 `$targetBinary` 走收敛后单值（design D1/D4）。只用 PS 5.1 兼容语法（design D3）。通过 1.1/1.2 对 pre-install 的断言。
- [ ] 1.4 Implement: register-tokens-submit-task.ps1 加同款函数并接入解析点，`$escapedTokensPath` 走收敛后单值。通过 1.1/1.2 对 register 的断言。
- [ ] 1.5 Refactor: 脚本注释补多路径背景说明；既有 install-via-npm 断言（禁词扫描、npm 安装命令、缺 npm 分支、sh 脚本行为）不回归，本组全绿。

## 2. 副本一致性

- [ ] 2.1 Implement: 同步工作区 `web/public/` 两份副本（与 `web/package.json` build 的 cp 同源拷贝）。根脚本改动后护栏短暂转红，此步回绿。
- [ ] 2.2 Add regression guard:「web/public 分发副本与仓库根一致」（test-plan 第四行，护栏）。逐字节比较每对文件，任一副本缺失跳过该对。确认基线即绿（2.1 之后）。

## 3. 验证汇总

- [ ] 3.1 Run: `bun test tests/scripts/install-via-npm.test.ts` 全绿（新增 4 个命名测试 + 既有 13 个）。
- [ ] 3.2 Run: 仓库根 `bun test` 全量，无回归。
- [ ] 3.3 Run: `openspec validate fix-windows-tokens-shim-resolution` 通过。
- [ ] 3.4 Confirm: 覆盖账本四行全 🟢。
