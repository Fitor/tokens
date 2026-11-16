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

系统必须用 TRAE 共享应用密钥对 `database.db` 做 SQLCipher 4 页解密，合并 WAL 中已提交的帧，产出只读快照。快照解密前必须用页 1 的 HMAC 验证密钥。WAL 合并语义（帧有效性按 SQLite 官方 reader 算法判定，依据 fileformat2.html#walformat）：

- 帧有效条件：帧头 salt-1/salt-2 与 WAL 头 salt 一致，且累计校验和链连续。首个失效帧之后的所有帧一律无效。
- 帧校验和链中断时，只合并中断点之前的已提交帧。
- 帧头 salt 与 WAL 头 salt 不匹配（WAL 重置后的前代残留）的帧无效，只保留有效前缀内的已提交视图。
- WAL 头/帧头的 salt 与主库页 1 前 16 字节的 SQLCipher 密钥派生 salt 之间没有相等约束，系统不得以任何一方为基准比较两者。
- WAL 只含未提交帧时，或最后一个有效 commit 之后只有未提交帧时，这些帧不参与合并。

源文件在快照生成期间变化（stat 前哨不一致）时，系统必须重新生成快照，最多重试 3 次；3 次后仍不一致则跳过该 DB 并输出警告。

#### Scenario: 加密库解密并产出可查询快照

- **GIVEN** 一个 TRAE CN 加密 `database.db` 及其含已提交帧的非空 `-wal`
- **WHEN** 系统生成快照
- **THEN** 快照是合法 SQLite 文件，查询结果等于主文件与 WAL 已提交帧合并后的已提交视图

#### Scenario: WAL 校验和链中断只取中断点之前

- **GIVEN** 一个 WAL 其第 N 帧的累计校验和与链不符（自第 N 帧起链断裂），第 1..N-1 帧中含已提交帧
- **WHEN** 系统生成快照
- **THEN** 快照只合并第 1..N-1 帧中的已提交页，第 N 帧及之后不生效

#### Scenario: WAL 帧 salt 与 WAL 头不一致的残留帧不生效

- **GIVEN** 一个 `-wal` 头 salt 为 S1/S2，前 k 帧帧头 salt 为 S1/S2 且校验链有效（其中含已提交帧），其后残留帧的帧头 salt 为旧代值（WAL 重置残留）
- **WHEN** 系统生成快照
- **THEN** 快照只合并前 k 帧中的已提交页，残留帧不生效，扫描不失败

#### Scenario: WAL salt 与主库 salt 不同仍正常合并

- **GIVEN** 一个 `-wal` 其帧头 salt 与 WAL 头 salt 一致，但与主库页 1 前 16 字节的 SQLCipher 密钥派生 salt 不同（正常状态，二者无相等约束）
- **WHEN** 系统生成快照
- **THEN** WAL 已提交帧正常合并入快照，不因与主库 salt 数值不同而丢弃任何帧

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
- `turn_id` 为 NULL、缺失或空字符串：跳过（没有 turn 身份的行无法参与跨库去重）。
- `created_at` 不是正数，或乘 1000 溢出：跳过。
- `updated_at` 仅作去重元数据随消息携带（秒转毫秒，`checked_mul` 溢出或非数值视为缺失，比较键取最小），不作为消息时间使用，也不因自身不可用而跳行。
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

#### Scenario: turn_id 缺失的行被跳过

- **GIVEN** 一行其余校验全部通过但 `turn_id` 为 NULL
- **WHEN** 系统解析该行
- **THEN** 该行不产出消息，跳过计数加 1

### Requirement: 逐 turn 去重

CN 行是 turn 级增量。系统必须按消息携带的 `turn_id` 在单次扫描合并后的全部 trae-cn 消息上做跨库去重：同一 `turn_id` 出现多次时（无论多行来自同一 DB、不同 DB 的副本，还是缓存命中与冷扫描的混合），保留 `updated_at` 最大的一条。collect 流与 ParsedMessage 流两条业务流程都必须在各自合并后的消息上执行该去重。系统不得按 `session_id` 折叠：同一 session 的不同 turn 必须全部保留，即使两条消息除 turn 身份外其余字段全部相同。

去重所依据的 `turn_id` 必须作为可序列化字段随消息走完整条管线——解析输出、消息缓存的序列化持久化、缓存命中路径，直到两条流程的合并点；系统不得在合并点用 session_id、消息时间或载荷相似度推断 turn 身份。`turn_id` 为 NULL、缺失或空字符串的行在解析期跳过，不产出消息。

去重所用的 `updated_at` 必须来自数据库行并随消息走完整条管线（含消息缓存的序列化持久化与缓存命中路径）；不得用消息时间代替——消息时间仍取 `created_at`，二者语义分离。`updated_at` 为非数值（含 NULL）或转毫秒溢出的行照常产出，仅其比较键视为最小。`updated_at` 并列时的裁决必须确定且与发现顺序无关：先取 `created_at` 较大者，仍并列时取（`model_id`、五桶用量、`session_id`）序列化字节序较大者。

#### Scenario: 同一 session 的多个 turn 全部保留

- **GIVEN** 同一 `session_id` 下 3 个不同 `turn_id` 的 completed 行
- **WHEN** 系统去重
- **THEN** 产出 3 条消息

#### Scenario: 同一 turn 重复出现时取最新

- **GIVEN** 同一 `turn_id` 两行，`updated_at` 分别为 t1 与 t2（t2 晚于 t1），用量不同
- **WHEN** 系统去重
- **THEN** 只产出 1 条消息，用量取 t2 行

#### Scenario: 跨库重复 turn 在缓存与发现顺序各安排下保留最新且仅计一次

- **GIVEN** 两个 DB 各含同一 `turn_id` 的 completed 行，`updated_at` 分别为 t1 与 t2（t2 晚于 t1），用量不同；五种安排：两库全冷、一冷一热且新版本（t2）在缓存命中侧、一冷一热且新版本（t2）在冷扫描侧、两库全热、发现顺序与上述互换
- **WHEN** 系统在五种安排下分别经真实缓存装载路径扫描并去重
- **THEN** 每种安排都只产出 1 条该 turn 的消息，用量取 t2 行，五种安排结果一致

#### Scenario: updated_at 并列时裁决与顺序无关

- **GIVEN** 同一 `turn_id` 两行，`updated_at` 相同且 `created_at` 相同，五桶用量不同
- **WHEN** 系统去重，并以两种发现顺序分别执行
- **THEN** 两种顺序产出同一条消息（按序列化字节序裁决），不因顺序不同而翻转

#### Scenario: updated_at 为 NULL 的行照常产出

- **GIVEN** 一行 `updated_at` 为 NULL、其余校验通过，另一同 `turn_id` 行的 `updated_at` 为可用数值
- **WHEN** 系统去重
- **THEN** 只产出 1 条，取 `updated_at` 可用的一行；扫描不报错

#### Scenario: 缓存序列化往返保留 turn 身份与更新时间

- **GIVEN** 一行 completed turn 经解析产出携带 `turn_id` 与 `updated_at_ms` 的消息，并经消息缓存持久化
- **WHEN** 下次扫描从缓存装载该消息
- **THEN** 装载得到的 `turn_id` 与 `updated_at_ms` 和解析原始输出逐字段一致，后续跨库去重按该身份分组

#### Scenario: 同一 session 两个不同 turn 其余字段全部相同仍保留两条

- **GIVEN** 同一 `session_id` 下两个不同 `turn_id` 的 completed 行，模型、五桶用量、`created_at`、`updated_at` 等其余字段全部相同，分属两个 DB
- **WHEN** 系统在任意缓存与发现顺序安排下扫描并去重
- **THEN** 产出 2 条消息，不因其余字段相同而折叠为一条

#### Scenario: 两条流程合并后均执行去重

- **GIVEN** 两个 DB 含同一 `turn_id` 的不同版本，分别经 collect 流与 ParsedMessage 流扫描
- **WHEN** 各流程在合并 DB 消息后执行去重
- **THEN** 两条流程都只产出 1 条该 turn 的最新消息

### Requirement: 消息缓存格式升级兼容

共享 `UnifiedMessage` 因新增去重元数据字段而改变消息缓存二进制布局时，系统必须按既有缓存格式升级模式处理：缓存格式版本必须升级；升级路径必须保留精确的旧版本 wire 布局并显式转换到新布局（新去重字段置空）；既有受支持的旧版本迁移分支必须继续工作。升级读取不得把既有条目当作损坏丢弃（Invalid）或静默重建（Stale）：升级后的条目必须逐条保留原有消息与既有元数据，新去重字段为空，迁移保存后必须可再次热读取。仅存在于缓存中的消息历史（如 Claude 压缩保留历史）必须在升级后保留。

#### Scenario: 旧格式 shard 升级保留消息与元数据

- **GIVEN** 由冻结旧 wire 类型生成的真实 V9 二进制缓存 shard（含多条消息与既有元数据）
- **WHEN** 新版本读取该 shard，迁移保存后再次热读取
- **THEN** 每条消息与既有元数据逐字段不变，新去重字段为空，二次读取不重新解析源文件且不出现损坏或重建告警

#### Scenario: 缓存独有历史升级后保留

- **GIVEN** 一个 Claude 缓存条目，其压缩保留历史在源文件中已不存在
- **WHEN** 缓存格式升级并迁移该条目
- **THEN** 保留历史消息仍在升级后的缓存中，未因升级被重建丢弃

#### Scenario: 既有旧版本迁移回归且非 CN 客户端保持热

- **GIVEN** 既有受支持的旧格式（V4–V8）shard，其中含 CN 以外客户端的条目
- **WHEN** 新版本读取并迁移这些 shard
- **THEN** 迁移成功，这些客户端条目保持缓存命中语义，不触发全量重扫

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
