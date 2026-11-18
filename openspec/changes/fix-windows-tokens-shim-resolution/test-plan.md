## Test Plan

每个 `specs/cli-install/spec.md` 的 Scenario 映射一个命名测试。覆盖账本在实施期逐行由 🔴 翻 🟢。verify 检查全绿。

| Requirement | Scenario | Test File | Test Name | Initial State |
|-------------|----------|-----------|-----------|---------------|
| specs/cli-install/spec.md → 脚本解析 tokens 路径必须收敛为单一路径 | 两份 ps1 含优先 .cmd 与回退首项的单选逻辑（机械检查） | tests/scripts/install-via-npm.test.ts | ps1 单选逻辑含数组化与 .cmd 优先筛选（机械检查） | 🔴 red |
| specs/cli-install/spec.md → 脚本解析 tokens 路径必须收敛为单一路径 | 回退分支覆盖无 .cmd 的环境（机械检查） | tests/scripts/install-via-npm.test.ts | ps1 单选逻辑含 .cmd 未命中时取首项的回退分支（机械检查） | 🔴 red |
| specs/cli-install/spec.md → 脚本解析 tokens 路径必须收敛为单一路径 | 每个 Get-Command 解析点都完成收敛（机械检查） | tests/scripts/install-via-npm.test.ts | ps1 每个 Get-Command 解析点都过 Select-TokensCommand 且下游只用单值（机械检查） | 🔴 red |
| specs/cli-install/spec.md → 脚本解析 tokens 路径必须收敛为单一路径 | 根目录副本与 web/public 分发副本一致 | tests/scripts/install-via-npm.test.ts | web/public 分发副本与仓库根一致 | 🟢 green（护栏） |

## Coverage Notes

- 运行方式。脚本契约用 `bun test tests/scripts/install-via-npm.test.ts` 定向运行；全量回归用仓库根 `bun test`。CI 不运行测试（`.github/workflows/ci.yml` 无 bun test job），本地运行为准。
- 计数锚点排除定义行（review round-2 S2）。解析点计数按调用形态 `= Select-TokensCommand (Get-Command tokens` 统计，不裸数 `Select-TokensCommand` 字符串——`function Select-TokensCommand {` 定义行会混入（pre-install 3≠2 误报）。预期两份合计：3 处调用 = 3 处 `Get-Command tokens -CommandType Application`（pre-install 初始检测与安装后复检各 1，register 1）。
- 副本一致性护栏的跳过语义。任一副本缺失（如未构建的 fresh clone）跳过该对，不算失败；两份都在时逐字节比较，工作区漂移（改根脚本未同步副本）断言失败。1.x 实现中途根脚本改动会使该行短暂转红，任务 2.1 同步副本后回绿；verify 时必须为绿。
- ps1 断言全部为机械文本断言（本机无 Windows 与 pwsh）。运行时行为留待 Windows 环境补验（design Risks 已接受该风险）。
- 非目标回归面。既有断言（禁词扫描、`npm i -g @fitor/tokens-cli`、缺 npm 分支、sh 脚本行为）不受本 change 编辑影响；全量 `bun test` 兜底。
