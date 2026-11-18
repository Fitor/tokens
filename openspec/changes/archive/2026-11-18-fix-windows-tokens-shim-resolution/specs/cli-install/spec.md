## ADDED Requirements

### Requirement: 脚本解析 tokens 路径必须收敛为单一路径

`pre-install-tokens.ps1` 与 `register-tokens-submit-task.ps1` 解析 `tokens` 可执行路径时，必须把 `Get-Command` 返回的多个结果收敛为一个：结果先转数组，优先选取文件名以 `.cmd` 结尾的项；没有 `.cmd` 项时取数组第一项。每个 `Get-Command` 解析点之后、任何使用路径的动作（展示、`tokens logout` 调用、Profile function 路径、计划任务 runner 路径）之前，都必须完成收敛，后续动作只引用收敛后的单值。仓库根的两个脚本与 `web/public/` 下的分发副本必须保持内容一致；副本由 web 构建从仓库根拷贝，Git 不跟踪。本机无 Windows 环境时，ps1 行为用机械文本断言验证。

#### Scenario: 两份 ps1 含优先 .cmd 与回退首项的单选逻辑（机械检查）

- **GIVEN** 仓库根 `pre-install-tokens.ps1` 与 `register-tokens-submit-task.ps1` 的文本
- **WHEN** 检查 `tokens` 路径的单选逻辑
- **THEN** 两份文本都含 `Get-Command` 结果的数组化，都含 `*.cmd` 优先筛选，都含筛选未命中时取数组第一项的回退分支

#### Scenario: 回退分支覆盖无 .cmd 的环境（机械检查）

- **GIVEN** 两份 ps1 的单选逻辑文本
- **WHEN** 检查 `.cmd` 筛选未命中时的分支
- **THEN** 文本含取数组第一项的回退分支

#### Scenario: 每个 Get-Command 解析点都完成收敛（机械检查）

- **GIVEN** 两份 ps1 的文本
- **WHEN** 统计 `Get-Command tokens -CommandType Application` 的出现次数与单选收敛的接入次数，并检查 `$targetBinary`、`$escapedTokensPath` 的赋值来源
- **THEN** 两个次数相等，每个解析点在展示、`logout` 调用或写 Profile function、写 runner 之前已收敛为单值

#### Scenario: 根目录副本与 web/public 分发副本一致

- **GIVEN** 仓库根与 `web/public/` 下的同名两个 ps1
- **WHEN** 逐字节比较每对文件（任一副本缺失时跳过该对）
- **THEN** 存在的每对文件内容一致，出现差异时机械断言失败
