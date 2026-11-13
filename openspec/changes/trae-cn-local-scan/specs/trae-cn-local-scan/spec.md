# trae-cn 本地扫描 — 规格增量

## ADDED Requirements

### Requirement: 发现本地 TRAE CN 数据库

系统必须在三个平台上发现 TRAE CN 安装的 `database.db`。目录布局为 `<平台父目录>/{Trae CN, TRAE SOLO CN}/ModularData/{ai-agent, ai-chat}/database.db`。平台父目录：Windows 为 `%APPDATA%`（缺省 `~/AppData/Roaming`），macOS 为 `~/Library/Application Support`，Linux 为 `$XDG_CONFIG_HOME`（缺省 `~/.config`）。系统必须支持用环境变量 `TOKENS_TRAE_CN_HOME` 覆盖扫描根目录（该变量指向含 `Trae CN`、`TRAE SOLO CN` 子目录的父目录）。系统必须收集所有存在的模块 DB，不是每根只取第一个。目录存在但无权限读取时，系统必须把该目录报告为不可读，不得当作未安装。

#### Scenario: macOS 标准安装被发现

- **GIVEN** `~/Library/Application Support/Trae CN/ModularData/ai-agent/database.db` 存在
- **WHEN** CLI 执行扫描
- **THEN** 该 DB 路径进入 `ScanResult.trae_cn_dbs`

#### Scenario: 环境变量覆盖扫描根目录

- **GIVEN** `TOKENS_TRAE_CN_HOME=/tmp/fake-trae-home` 且 `/tmp/fake-trae-home/Trae CN/ModularData/ai-agent/database.db` 存在
- **WHEN** CLI 在该环境变量下执行扫描
- **THEN** 发现的 DB 路径为 `/tmp/fake-trae-home/Trae CN/ModularData/ai-agent/database.db`，默认路径不被扫描

#### Scenario: 同一根下两个模块 DB 都被收集

- **GIVEN** `Trae CN/ModularData/` 下 `ai-agent/database.db` 与 `ai-chat/database.db` 都存在
- **WHEN** CLI 执行扫描
- **THEN** 两个 DB 路径都进入 `ScanResult.trae_cn_dbs`

#### Scenario: 无权限目录不被静默丢弃

- **GIVEN** `Trae CN/ModularData/ai-agent/database.db` 存在且 `stat` 返回 EACCES
- **WHEN** CLI 执行扫描
- **THEN** 扫描诊断报告该 DB 不可读，不把它当作未安装

#### Scenario: 未安装时 lane 为空

- **GIVEN** 机器上没有任何 TRAE CN 目录
- **WHEN** CLI 执行扫描
- **THEN** `trae_cn_dbs` 为空，扫描不报错，其余客户端不受影响

### Requirement: 解密快照

系统必须用 TRAE 共享应用密钥对 `database.db` 做 SQLCipher 4 页解密，合并 WAL 中已提交的帧，产出只读快照。快照解密前必须用页 1 的 HMAC 验证密钥。WAL 合并语义：

- 帧校验和链中断时，只合并中断点之前的已提交帧。
- WAL 头的 salt 与主库不匹配（WAL 重置残留）时，忽略整个 WAL，只用主文件。
- WAL 只含未提交帧时，不用 WAL 的任何帧。

源文件在快照生成期间变化（stat 前哨不一致）时，系统必须重新生成快照，最多重试 3 次；3 次后仍不一致则跳过该 DB 并输出警告。

#### Scenario: 加密库解密并产出可查询快照

- **GIVEN** 一个 TRAE CN 加密 `database.db` 及其含已提交帧的非空 `-wal`
- **WHEN** 系统生成快照
- **THEN** 快照是合法 SQLite 文件，查询结果等于主文件与 WAL 已提交帧合并后的已提交视图

#### Scenario: WAL 校验和链中断只取中断点之前

- **GIVEN** 一个 WAL 其第 N 帧的累计校验和与链不符（自第 N 帧起链断裂），第 1..N-1 帧中含已提交帧
- **WHEN** 系统生成快照
- **THEN** 快照只合并第 1..N-1 帧中的已提交页，第 N 帧及之后不生效

#### Scenario: WAL salt 不匹配时只用主文件

- **GIVEN** 一个 `-wal` 其头 salt 与主库页 1 salt 不同
- **WHEN** 系统生成快照
- **THEN** 快照内容只来自主文件，扫描不失败

#### Scenario: 只有未提交帧的 WAL 不生效

- **GIVEN** 一个 `-wal` 只含 commit 字段为 0 的帧
- **WHEN** 系统生成快照
- **THEN** 快照内容只来自主文件

#### Scenario: 源文件持续变化时跳过并告警

- **GIVEN** TRAE 正在写入，stat 前哨连续 4 次（初次 + 3 次重试）不一致
- **WHEN** 系统生成快照
- **THEN** 该 DB 被跳过，诊断输出包含警告，扫描不失败

#### Scenario: 密钥不匹配时跳过该 DB

- **GIVEN** 一个页 1 HMAC 校验失败的 `database.db`（不同密钥或格式）
- **WHEN** 系统生成快照
- **THEN** 该 DB 被跳过并输出警告，扫描不失败，其余客户端不受影响

#### Scenario: 截断尾页

- **GIVEN** 源文件大小不是页大小的整数倍
- **WHEN** 系统生成快照
- **THEN** 系统按真实页数（去掉不完整尾页）生成快照

### Requirement: 坏页容忍与可见性

生成快照时 HMAC 校验失败的页必须置零并继续。坏页计数必须在生成快照的那次扫描中出现在 stderr 诊断里，内容包含 DB 路径与坏页数。缓存命中（指纹未变、不重新解密）的扫描不重发坏页计数。快照中因置零导致结构损坏、rusqlite 查询失败时，系统必须跳过该 DB 并输出警告，不得产出部分消息。

#### Scenario: 单个坏页不阻断扫描且计数可见

- **GIVEN** 一个含 1 个坏页的合成加密 fixture
- **WHEN** 系统生成快照并完成解析
- **THEN** 解析产出其余页中的消息，stderr 诊断包含该 DB 路径与坏页数 `1`

#### Scenario: 缓存命中扫描不重发坏页计数

- **GIVEN** 上一次扫描生成了带坏页计数 k 的缓存条目，源文件指纹未变
- **WHEN** CLI 再次扫描
- **THEN** 不重新生成快照，stderr 不出现坏页诊断，消息来自缓存

#### Scenario: 置零导致查询失败时跳过该 DB

- **GIVEN** 一个坏页位于 B-tree 内页、置零后快照查询报 `DatabaseCorrupt` 的 fixture
- **WHEN** 系统解析该快照
- **THEN** 该 DB 被跳过并输出警告，同扫描中其他 DB 的消息正常产出

### Requirement: schema 门禁

系统对每个发现的 DB 必须先做 schema 门禁再解析。门禁通过条件：`chat_turn` 表存在，且该表含以下全部列：`context`、`session_id`、`turn_id`、`created_at`、`updated_at`、`turn_status`、`deleted_at`。该列集等于解析所需的最小列集。token 用量与模型名位于 `context` JSON 内，不需要额外列。不满足门禁的 DB 必须跳过并输出警告。门禁通过但查询失败（如类型不符导致 SQL 错误）的 DB 必须跳过并输出警告。同一扫描中其他 DB 不受影响。

#### Scenario: 同构 DB 正常解析

- **GIVEN** 一个 `chat_turn` 含门禁列集全部 7 列的 DB
- **WHEN** 系统执行门禁
- **THEN** 门禁通过，DB 进入解析

#### Scenario: 缺列 DB 被跳过且告警

- **GIVEN** 一个 `chat_turn` 缺 `turn_id` 列的 DB
- **WHEN** 系统执行门禁
- **THEN** 该 DB 被跳过，诊断输出包含警告，同扫描中门禁通过的 DB 正常产出

#### Scenario: 门禁通过但查询失败时跳过

- **GIVEN** 一个门禁通过但 `context` 列类型使查询报错的 DB
- **WHEN** 系统解析该 DB
- **THEN** 该 DB 被跳过并输出警告，扫描不失败

### Requirement: 逐 turn 解析与归一化

系统必须把每个满足 `turn_status='completed'` 且 `deleted_at <= 0` 的 `chat_turn` 行转换为一条 `UnifiedMessage`，client 为 `trae-cn`。数据库内容是不可信输入。逐行规则（违反任一条即跳过该行并计入跳过计数，不得产出猜测值或负值）：

- `token_usage` 五个数值字段 `prompt_tokens`、`completion_tokens`、`cache_read_input_tokens`、`reasoning_tokens`、`total_tokens` 任一不是数值，或为负：跳过。
- `context` 不是合法 JSON，或 `token_usage` 不是对象：跳过。
- `total_tokens` 不等于 `prompt_tokens + completion_tokens`：跳过。
- `cache_read_input_tokens > prompt_tokens`：跳过（产生的负 input 会在提交前被聚合层钳位为 0，变成静默少计；跳行让异常显式可数）。
- `reasoning_tokens > completion_tokens`：跳过。
- `model_id`、`session_id`、`turn_id` 任意一个超过 256 字节：跳过。
- `created_at` 不是正数，或乘 1000 溢出：跳过。
- 通过校验的行：`input = prompt_tokens - cache_read_input_tokens`，`output = completion_tokens - reasoning_tokens`，`cache_read = cache_read_input_tokens`，`cache_write = 0`，`reasoning = reasoning_tokens`。
- 模型名剥离 `__` 及其后缀并转小写；缺失或清洗后为空时用 `trae-unknown`。
- `session_title` 必须保持 `None`：TRAE CN 解析器不得从数据库填充任何文本字段。

#### Scenario: 含缓存拆分的 turn 正确归一化

- **GIVEN** 一行 `token_usage` 为 `prompt=1000, completion=200, cache_read=800, reasoning=50, total=1200`
- **WHEN** 系统解析该行
- **THEN** 产出 `TokenBreakdown{input: 200, output: 150, cache_read: 800, cache_write: 0, reasoning: 50}`，五桶之和等于 1200

#### Scenario: total 对账失败的行被跳过

- **GIVEN** 一行 `prompt=100, completion=10, total=500`
- **WHEN** 系统解析该行
- **THEN** 该行不产出消息，跳过计数加 1

#### Scenario: cacheRead 超过 prompt 的行被跳过

- **GIVEN** 一行 `prompt=100, completion=10, cache_read=200, total=110`
- **WHEN** 系统解析该行
- **THEN** 该行不产出消息，跳过计数加 1，聚合中不出现负 input

#### Scenario: reasoning 超过 completion 的行被跳过

- **GIVEN** 一行 `prompt=100, completion=10, reasoning=50, total=110`
- **WHEN** 系统解析该行
- **THEN** 该行不产出消息，跳过计数加 1

#### Scenario: 负 cache_read 的行被跳过

- **GIVEN** 一行 `prompt=100, completion=10, cache_read=-10, total=110`
- **WHEN** 系统解析该行
- **THEN** 该行不产出消息，跳过计数加 1，聚合中不出现负的 `cache_read` 桶

#### Scenario: dev 后缀剥离

- **GIVEN** 一行模型名为 `deepseek-v4.1-flash__dev`
- **WHEN** 系统解析该行
- **THEN** 消息的 `model_id` 为 `deepseek-v4.1-flash`

#### Scenario: 时间戳溢出的行被跳过

- **GIVEN** 一行 `created_at` 接近 `i64::MAX`（乘 1000 溢出）
- **WHEN** 系统解析该行
- **THEN** 该行不产出消息，跳过计数加 1

#### Scenario: session_title 保持为空

- **GIVEN** 一行其 `context` JSON 内含会话标题文本
- **WHEN** 系统解析该行
- **THEN** 产出消息的 `session_title` 为 `None`

### Requirement: 逐 turn 去重

CN 行是 turn 级增量。系统必须按 `turn_id` 去重：同一 `turn_id` 出现多次时，保留 `updated_at` 最大的一条。系统不得按 `session_id` 折叠：同一 session 的不同 turn 必须全部保留。

#### Scenario: 同一 session 的多个 turn 全部保留

- **GIVEN** 同一 `session_id` 下 3 个不同 `turn_id` 的 completed 行
- **WHEN** 系统去重
- **THEN** 产出 3 条消息

#### Scenario: 同一 turn 重复出现时取最新

- **GIVEN** 同一 `turn_id` 两行，`updated_at` 分别为 t1 与 t2（t2 晚于 t1），用量不同
- **WHEN** 系统去重
- **THEN** 只产出 1 条消息，用量取 t2 行

### Requirement: 成本归属

系统必须用既有 `PricingService` 为每条 trae-cn 消息估算成本，`cost_source` 为 `Estimated`。provider 提示由 CN 解析器按模型家族映射：`glm` 前缀到 `zai`，`kimi` 前缀到 `moonshotai`，`deepseek` 前缀到 `deepseek`，`minimax` 前缀到 `minimax`，`doubao` 前缀到 `volcengine`。对无第一方上游费率的 5 个模型（`deepseek-v4.1-flash`、`doubao-seed-2-1-turbo`、`kimi-k2.6`、`kimi-k2.7-code`、`minimax-m2.7`），系统必须提供 Tokens Archive 第一方费率，key 采用 `<provider>/<model>` 格式并带来源引注。无法定价的模型，消息成本为 0，所在日期进入 `incomplete_cost_dates`。

#### Scenario: 已覆盖模型直接命中上游数据集

- **GIVEN** 一条消息 `model_id = deepseek-v4-flash`，provider 提示 `deepseek`
- **WHEN** PricingService 解析费率
- **THEN** 命中第一方行，成本按分桶费率计算，`cost_source` 为 `Estimated`

#### Scenario: doubao 模型映射到 volcengine 提示

- **GIVEN** 一条消息 `model_id = doubao-seed-2-1-turbo`
- **WHEN** 系统解析该消息
- **THEN** 该消息携带 provider 提示 `volcengine`

#### Scenario: Archive 费率对转售商行保持优先

- **GIVEN** 上游数据集只有转售商行（如 `aihubmix/doubao-seed-2-1-turbo`）
- **WHEN** PricingService 以 provider 提示 `volcengine` 解析该模型
- **THEN** 解析到 `volcengine/doubao-seed-2-1-turbo` 的 Archive 第一方费率行，带来源引注

#### Scenario: 无法定价的模型不谎报成本

- **GIVEN** 一个任何来源都无法定价的模型
- **WHEN** 系统处理该消息
- **THEN** 消息成本为 0，该消息日期进入 `incomplete_cost_dates`

### Requirement: 客户端注册与上报

`trae-cn` 必须注册为 `ClientId` 变体，`submit_default` 为 `true`，并加入 `ClientFilter`。服务端白名单必须包含 `"trae-cn"`。trae-cn 消息必须流经既有聚合与 submit 管线，行为与其他客户端一致（含 trim、校验、`incomplete_cost_dates` 上报）。

#### Scenario: 默认提交包含 trae-cn

- **GIVEN** 机器上有含 completed turn 的 TRAE CN 安装
- **WHEN** 用户执行 `tokens submit`（无 `--client` 过滤）
- **THEN** 聚合负载包含 client 为 `trae-cn` 的贡献

#### Scenario: 服务端白名单接受新客户端

- **GIVEN** `web/src/lib/types.ts` 的 `SUPPORTED_CLIENT_TYPES`
- **WHEN** 检查该列表
- **THEN** 列表包含 `"trae-cn"`

### Requirement: 国际版集成不变

国际版 Trae 的凭据、同步命令、API 拉取与解析路径必须保持现状。`trae` 与 `trae-cn` 是两个独立 client，互不影响。本 change 不得修改 `cli/tokens-cli/src/trae.rs` 与 `cli/tokens-core/src/sessions/trae.rs`。

#### Scenario: 国际版既有测试保持通过

- **GIVEN** 本 change 实现完成
- **WHEN** 运行 `sessions/trae.rs` 与 `cli/tokens-cli/src/trae.rs` 的全部既有测试
- **THEN** 全部通过，且这两个文件的测试代码未被本 change 修改

#### Scenario: 国际版 ClientDef 条目逐字段不变

- **GIVEN** 本 change 实现完成
- **WHEN** 断言测试检查 `clients.rs` 中 `trae` 的 `ClientDef` 条目
- **THEN** `id`、`root`、`relative`、`pattern`、`headless`、`parse_local`、`submit_default` 七个字段值与实现前逐项相等（测试中硬编码当前值）

#### Scenario: 两个客户端数据并存

- **GIVEN** 同一机器上有国际版缓存文件与 TRAE CN 本地库
- **WHEN** CLI 执行扫描
- **THEN** `trae` 与 `trae-cn` 各自产出消息，互不合并、互不覆盖
