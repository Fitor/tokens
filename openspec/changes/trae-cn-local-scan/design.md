# 设计：trae-cn 本地扫描

## Context

国际版 Trae 走 vendor API（`cli/tokens-cli/src/trae.rs`），API 返回的 `dollar_float` 直接作为权威成本，解析产物缓存在 `trae-cache/sessions/*.json`，由 `sessions/trae.rs` 解析。国内版从未接入。

国内版数据源是本地 SQLCipher 4 加密 SQLite（`ModularData/<module>/database.db`）。可行性 demo（`/Users/ci/tmp/trae-scan-demo/`，仓库外）已验证端到端可行：页解密、WAL 合并、真实 2.18GB 数据库（6,788 turn）解析。字段语义已实测：`total = prompt + completion`，`cacheRead ⊆ prompt`，`reasoning ⊆ completion`，费用字符串全为 `"0.000"`（无成本数据）。**demo 只是可行性证据，不是权威规格**；本实现的权威规格是仓库内的算法文档注释与合成 fixture（见 D1、D11）。

代码库已有 13+ 个 SQLite 数据库型客户端 lane（opencode、devin、micode 等），`load_or_parse_sqlite_source` + `CacheIdentity` + `SourceFingerprint::check_sqlite_path`（盯 db+wal，SamplesOnly，不做全文件哈希）是现成模式。TRAE 是第一个加密数据库。

关键语义差异：国际版 API 行是 session 级累计快照，`dedupe_latest_trae_messages`（`lib.rs:3545`）按 session 保留最新一行。CN 行是 turn 级增量，同一 session 的多行必须全部保留。

## Goals / Non-Goals

**Goals:**

- 三平台发现并解密 TRAE CN 本地库，逐 turn 产出带缓存拆分的 `UnifiedMessage`（client `trae-cn`）。
- 复用既有定价服务与 submit 管线；补 5 条 Archive 费率。
- 坏库、异构 schema、坏页均不阻断扫描，且全部可见（警告/计数）。
- 解密产物的生命周期有崩溃残留的清扫路径；任何正文字段（含 `session_title`）不进入 `UnifiedMessage`。

**Non-Goals:**

- 不改国际版 Trae 的任何代码路径。
- 不做 opencode 式增量水位扫描（v2 再评估；全量解密 2.18GB 实测约 3.3 秒）。
- 不实现订阅账单口径；成本是"同用量按各模型 API 牌价"的估算，与 Cursor 订阅口径一致。
- 不把真实用户数据库纳入仓库或 CI；测试只用程序化构造的合成加密 fixture。

## Decisions

### D1. 解密实现：纯 Rust 页解密，不链接 SQLCipher C 库

- `trae_db.rs`（tokens-core）实现：kdf salt = 页 1 前 16 字节；`hmacKey = PBKDF2-HMAC-SHA512(key, kdf salt XOR 0x3a, 2 轮, 32 字节)`；每页 AES-256-CBC（页尾 80 字节保留区 = 16 字节 IV + 64 字节 HMAC-SHA512）。页 HMAC 输入为官方实现钉死的三段拼接：**页数据区密文（`page_sz − reserve_sz` 字节）‖ IV（16 字节）‖ 页号（u32 little-endian，4 字节）**；改动 IV 任一字节必然使该页 HMAC 失败。页 1 特殊偏移：前 16 字节 salt 区不参与加密与 HMAC，页 1 密文长度为 `page_sz − 16 − reserve_sz`，IV 仍在保留区开头；解密后前 16 字节回写 SQLite 头。参数依据：SQLCipher 官方实现 `sqlcipher.c`——`sqlcipher_page_hmac` 的 HMAC 覆盖"密文 + IV + 页号"且默认 `CIPHER_FLAG_LE_PGNO`（LE 页号），`sqlite3Codec`/`sqlcipher_page_cipher` 定义页 1 偏移；另见 [SQLCipher Security Design](https://www.zetetic.net/sqlcipher/design/)。
- 依赖：新增 `hmac`、`pbkdf2`（纯 Rust）；`aes`、`cbc`、`sha2` 已在 workspace。
- 备选：rusqlite `bundled-sqlcipher`。否决理由：引入 C 构建链与 OpenSSL 依赖，构建/分发复杂度明显上升；明文临时文件（0600，用完即删）是可接受的安全面。

### D11. 权威规格仓库内化（替代"demo 即规格"）

- WAL 合并算法写成 `trae_db.rs` 的模块级文档注释，作为权威规格，覆盖：WAL 头 magic（`0x377f0682`/`0x377f0683`）、32 字节 WAL 头（含 salt-1/salt-2 与头校验和）、页大小字段、24 字节帧头（页号、commit 字段、帧头 salt-1/salt-2 副本、累计校验和）、累计校验和链（字节序由 magic 最低位决定）、commit 字段语义、帧有效性判定（帧头 salt 与 WAL 头 salt 一致 + 校验链连续，首个失效帧之后全部无效）、spec 列出的边界语义（链中断、残留 salt 帧、仅未提交帧）。帧 salt 只与 WAL 头 salt 比较，与主库页 1 的密钥派生 salt 无关（依据 [SQLite WAL File Format / Reader Algorithm](https://www.sqlite.org/fileformat2.html#walformat)）。
- 测试全部使用程序化构造的合成加密 fixture：测试代码按 D1 参数加密合成页并构造 WAL（含已提交帧、校验和链断裂、帧 salt 与 WAL 头 salt 不匹配的前缀+残留帧、仅未提交帧、坏页、截断尾页各一例；合成 WAL 的头/帧 salt 独立生成，不与主库页 1 salt 相等）。CI 可复现，不依赖真实用户库。真实用户数据库与解密副本一律不入仓库。
- 已知答案测试（KAT）独立于被测加密构造器：用官方 SQLCipher 实现生成一个无用户数据的测试向量（空 schema + 若干空表页），以二进制 fixture 入仓库，并记录生成所用 SQLCipher 版本与参数（页大小、HMAC/KDF 算法与轮数、密钥形态）。测试断言本实现可解密该向量且逐页 HMAC 通过；另断言修改向量中任一页 IV 字节会使对应页 HMAC 失败。该测试防住"合成 fixture 构造器与解密器同源互逆、双双偏离官方实现"的系统性错误（如本轮 R3-P1-2 类错误可自洽通过合成测试）。
- 语义交叉核对（2026-11-13）：修订后的 WAL/HMAC 规格已与本机可行性 demo 逐条比对一致——该 demo 参考自 TokenTracker（xiufengsun/TokenTracker，MIT）的已验证实现（`trae-scan-demo.js`）。demo 中：HMAC 输入为"密文（页 1 从 16 字节起）‖ IV ‖ LE 页号"，无任何"WAL salt 与主库 salt 比较"逻辑，帧 salt 与 WAL 头 salt 比对、累计链断裂即停。可见第 3 轮两个 P1 是规划工件转写 demo 行为时的错误，不是 demo/TokenTracker 行为本身有误。

### D2. 快照输出：专用临时子目录，stat 前哨 + 重试 + 启动清扫

- 解密写入专用子目录（`<config_dir>/trae-cn-cache/tmp/`）下的临时文件（权限 0600），rusqlite 以 readonly 打开查询，查询完立即删除。指纹（`SourceFingerprint::check_sqlite_path` 变体）盯**原始加密 db+wal** 的 size+mtime+samples，不盯临时文件。
- 源文件在快照期间变化（stat 前后不一致）→ 整体重试，上限 3 次；仍不一致则跳过该 DB 并告警（spec 已钉死）。
- 崩溃残留清扫：文件名含 pid（`trae-snapshot-<pid>-<nanos>`）。每次进入 trae-cn lane 时清扫该子目录中 pid 已死亡进程的残留文件。PID 探测落点在 `trae_db.rs` 内实现（fail-alive 策略与 tokens-cli 的 `process_liveness.rs` 相同：kill(pid, 0) 返回 ESRCH 判死、EPERM 判活；Windows 用 `OpenProcess` 探测）。tokens-cli 的 `process_liveness.rs` 是私有 `mod` 且依赖方向禁止 tokens-core 反向引用，所以本 change 在 tokens-core 按同一策略自写小型探测（约 30 行），注释标明语义对齐来源；后续统一时优先把该模块迁入 tokens-core。SIGKILL/断电留下的文件由此路径回收。
- 备选：内存快照（`Vec<u8>`）。否决理由：2.18GB 驻留内存对低配机器不友好；磁盘顺序写更快且可流式。

### D3. 坏页策略：置零继续 + 冷扫描可见（用户决定 ②B）

- HMAC 失败页置零写入快照，计数累加。
- 可见性通道：解析闭包在生成快照的扫描中，把解密统计（含坏页数）直接打到 stderr。解析闭包只在指纹未命中时执行，所以缓存命中的扫描天然不重发坏页计数。与 D9 的通用装载器 `load_or_parse_sqlite_source` 一致：不改其闭包签名（`Fn(&Path) -> Vec<UnifiedMessage>`），也不扩展 `CachedParseOutcome`（该结构由装载器内部构造，闭包无法携带诊断字段；`with_opencode_incremental` 扩展的是 `CachedSourceEntry` 且属于绕开通用装载器的专用 lane，不适用）。tokens-core 内直接打 stderr 有先例（pricing 的 `degrade_source`）。
- 缓存命中（指纹未变）的扫描不重新解密，不重发坏页计数；spec 已按此限定。
- 置零页可能破坏 B-tree 结构导致查询报 `DatabaseCorrupt`（叶子页假设不成立时）：查询失败 → 跳过该 DB + 告警，不产出部分消息（spec 已钉死）。

### D4. 发现：多根多模块，EACCES 显式上报（用户决定 ③B ④B）

- 平台父目录：Windows `%APPDATA%`（缺省 `~/AppData/Roaming`）、macOS `~/Library/Application Support`、Linux `$XDG_CONFIG_HOME`（缺省 `~/.config`）。roots 固定 `Trae CN`、`TRAE SOLO CN`（CN 范围，路线 A），modules 固定 `ai-agent`、`ai-chat`，收集全部存在的 DB。
- 环境变量 `TOKENS_TRAE_CN_HOME` 覆盖扫描根目录（父目录语义，与 `EnvVar` PathRoot 先例一致）。
- stat 错误处理：ENOENT/ENOTDIR = 未安装；其他错误（含 EACCES）= 目录存在但不可读，进入诊断输出。

### D5. schema 门禁：最小列集一次验全

- 门禁条件 = `chat_turn` 表存在 + 7 列全在：`context`、`session_id`、`turn_id`、`created_at`、`updated_at`、`turn_status`、`deleted_at`。列集等于解析的最小需要（token 用量与模型名在 `context` JSON 内，无额外列）。
- 门禁通过但查询失败（类型不符等）→ 跳过该 DB + 告警（spec 已钉死）。
- ai-chat 无本机样本；门禁保证"同构即工作、异构不污染"，部分同构（缺列）也挡在解析之前。

### D6. 归一化与对账：违规即跳行（修订，消除截断语义）

- 跳行规则覆盖派生桶与照抄桶：`token_usage` 五个数值字段 `prompt_tokens`、`completion_tokens`、`cache_read_input_tokens`、`reasoning_tokens`、`total_tokens` 任一非数值或为负即跳行；`total_tokens` 必须等于 `prompt + completion`；`cache_read > prompt` 与 `reasoning > completion` 各自跳行。不做 min() 截断。理由（与代码事实一致）：负桶在提交前被 `into_contribution` 钳位为 0（`aggregator.rs:398-415`），真实后果是静默少计；跳行让异常显式可数，服务端非负校验是第二道防线。
- 其余跳行条件：`context` 非法 JSON 或无 `token_usage` 对象；id/模型名超 256 字节；`created_at` 非正数或乘 1000 溢出（`checked_mul`，与 `sessions/trae.rs:74-78` 先例一致）。
- 通过校验的行：`input = prompt − cacheRead`，`output = completion − reasoning`，`cache_write = 0`；模型名剥 `__` 后缀、小写，清洗后为空用 `trae-unknown`。
- `session_title` 强制 `None`：CN 解析器不填充任何文本字段（M7 禁令）。
- `prompt_tokens_total` 等聚合字段在 CN 数据中恒为 0，v1 不使用。

### D7. 去重：按消息携带的 `turn_id` 跨库去重，禁止复用 `dedupe_latest_trae_messages`

- 新函数 `dedupe_trae_cn_turns`：key = 消息携带的 `turn_id` 字段（传递通路见下），作用域是单次扫描内各 DB 消息**合并之后**的全体 trae-cn 消息（跨库、缓存命中与冷扫描混合后统一执行；单库解析内部不做去重）。保留 `updated_at` 最大者；缺失视为最小；并列先比 `created_at`，再比（`model_id`、五桶、`session_id`）序列化字节序——与发现顺序无关（并列裁决承接 R2-S1）。合并点不得用 session_id、消息时间或载荷相似度推断 turn 身份：同一 session 的两个不同 turn 其余字段可以完全相同，而同一 turn 的两个版本必须只留最新，用这三者猜身份必然丢 turn 或重复计。session 级折叠会导致 ~88% 少计（795 sessions × 平均 8.5 turns 折成 795 行），这是本 change 最危险的坑。
- turn 身份的传递通路（R4-RC-1）：`UnifiedMessage`（`sessions/mod.rs`）新增 `#[serde(default)] pub turn_id: Option<String>`——语义为"源行 turn 身份"。CN 解析器把已过"非空且 ≤256 字节"校验的 `chat_turn.turn_id` 填入；`turn_id` 为 NULL/缺失或空字符串的行在解析期跳行（没有 turn 身份的行无法安全参与跨库去重）。该字段与 `updated_at_ms` 一样随 `UnifiedMessage` 被消息缓存序列化持久化（`CachedSourceEntry.messages` 直接存 `Vec<UnifiedMessage>`，`message_cache.rs:1623`；旧缓存条目反序列化自然得 `None`，无需缓存迁移），缓存命中与冷扫描在合并点的分组基础一致。其他客户端恒不设置该字段。
- `updated_at` 的传递通路：`UnifiedMessage`（`sessions/mod.rs`）新增 `#[serde(default)] pub updated_at_ms: Option<i64>`——语义为"源行 `updated_at`，毫秒"。CN 解析器从 `chat_turn.updated_at` 秒转毫秒填充（`checked_mul`，溢出或非数值置 `None`）；消息时间 `timestamp` 仍取 `created_at`，二者语义分离。该字段随 `UnifiedMessage` 一起被消息缓存 serde 序列化持久化（缓存 JSON 旧条目反序列化自然得 `None`，无需缓存迁移），因此缓存命中路径与冷扫描路径的比较基础一致。其他客户端恒不设置该字段。
- 不改用 `dedup_key`（对 R4 复核替代路线的核对结论）：`dedup_key` 在缓存层是承重字段——Claude 保留历史按它筛选（`retained_message_keys`，`message_cache.rs:2219`；`retained_history_key_filter` → `claudecode::dedup_key_is_globally_stable`，`message_cache.rs:2349`），缓存保存合并的去重键收集（`message_cache.rs:2313` 起）也读取它。CN 行一旦设置即接入这些按其他客户端语义定义的全局机制（全局稳定键判定、跨运行保留判定），影响无法局部化——这正是 CN 行保持 `dedup_key: None` 的理由，故 turn 身份走专用字段而非取消禁令。

### D8. 定价：Archive 行 + 解析器侧 provider 映射（修订定位）

- provider 映射不在 `normalize_provider_hint`（它只做 trim 与 unknown 过滤）。厂商折叠在 `provider_identity.rs`（`canonicalize_provider_segment`、`inferred_provider_from_model`）。CN 解析器自行携带模型家族 → provider 提示映射：`glm`→`zai`、`kimi`→`moonshotai`、`deepseek`→`deepseek`、`minimax`→`minimax`、`doubao`→`volcengine`。`volcengine` 经 `canonicalize_provider_segment` 原样通过，无需改折叠表；`inferred_provider_from_model` 没有 doubao 臂，所以映射必须由解析器完成（doubao 是 5 个模型中唯一无现成推断臂的）。
- `build_archive_overrides()` 增加 5 行，key 全部用 `<provider>/<model>` 格式：`deepseek/deepseek-v4.1-flash`、`volcengine/doubao-seed-2-1-turbo`、`moonshotai/kimi-k2.6`、`moonshotai/kimi-k2.7-code`、`minimax/minimax-m2.7`，格式照 zhipu/xiaomi/tencent 先例（价目页引注 + 验证日期）。
- 已验证覆盖：`glm-5.2`（Archive 现有行）、`deepseek-v4-flash`（LiteLLM 第一方）、`minimax-m3`（第一方）。上游数据集实时核对过（2026-11-13）。

### D9. 管线接入：两条流程各加 lane，指纹走缓存 lane

- collect 流（`lib.rs` ~3376 区域，Trae 块旁）与 ParsedMessage 流（~6206 区域）各加一个 trae-cn 块；解析走 `load_or_parse_sqlite_source`（CacheIdentity + `check_sqlite_path`），成本经 `apply_pricing_if_available`（`Estimated`）。trae-cn 块内，各 DB 的消息先合并再执行一次 `dedupe_trae_cn_turns`（落点与既有 Trae 块"合并后调用 `dedupe_latest_trae_messages`"的形状一致，见 D7）。
- turn 身份与 `updated_at_ms` 随 `UnifiedMessage` 走解析 → 缓存持久化 → 缓存命中 → 两条流程合并点的全链路（D7）；collect 流与 ParsedMessage 流各自都必须在合并后执行去重。缓存集成验收走真实装载路径，覆盖全冷、一冷一热（新版本分别在冷侧与热侧）、全热及发现顺序互换（test-plan 对应行）。
- 跳过 `micode` 式"免重定价"分支——CN 无权威成本，全部走估价。
- `message_cache.rs` 每客户端 parser 版本表（穷举 match，缺臂编译失败）与 `sessions/mod.rs` 模块导出随实现补齐。

### D10. 注册与服务端白名单同 change 落地（用户决定 ①B）

- `ClientId::TraeCn = 54`、`ClientDef{submit_default: true}`、`ClientFilter` 变体、`web/src/lib/types.ts` 白名单。
- 部署窗口（诚实陈述，不可消除，只能收窄）：未知 client 使服务端整包提交返回 400，受害面是用户全部客户端的提交。web 随合并部署，CLI 经发布渠道到达用户，正常时序下 web 先生效；风险面是用户自建/提前拿到新 CLI 的场景。失败表现：submit 返回 400，details 指名未知 client。用户侧自救：用 `--client` 显式列出其他客户端提交（绕开 trae-cn 贡献）。回退：一行改回 `submit_default: false`，随下一次 CLI 发布生效。

## Risks / Trade-offs

- [SQLCipher 参数或密钥随 TRAE 版本变化] → 页 1 HMAC 预检，失败时明确报"密钥/格式不匹配"，DB 跳过不崩溃；密钥来源（TokenTracker 公开常量）写入代码注释。
- [2.18GB 全量解密在 submit 频率下的耗时] → 实测 3.3 秒 + 查询约 1 秒；缓存 lane 保证 Trae 无写入时零解密（指纹命中）。
- [坏页导致偏差] → 页级 HMAC 保证坏页解不出"看似合法的错误数据"；坏页计数在冷扫描 stderr 可见（D3）；置零破坏结构时整库跳过（D3）。
- [崩溃留下明文快照] → 专用子目录 + pid 命名 + 基于同策略 fail-alive PID 探测的启动清扫（D2，探测在 trae_db.rs 内自写，与 `process_liveness` 策略对齐）；SIGKILL/断电路径已覆盖。
- [ai-chat schema 未知] → D5 门禁 + 跳过告警；用户实测数据全部来自 ai-agent，覆盖不受影响。
- [服务端拒收窗口] → D10 runbook（web 先部署）+ 失败表现与用户自救路径写档；窗口收窄但不可消除，如实声明。
- [转售商行 fuzzy 命中导致不可提交] → 既有 submission-safe 机制按设计拒绝；Archive 行补齐后 5 个模型均 submission-safe。

## Migration Plan

1. 合并顺序：单 PR 内 CLI + web 同步落地（无服务器 schema 变更，payload 格式不变，仅新增 client 字符串）。
2. 部署 runbook：web 先合并部署，确认线上生效后再发布/分发 CLI 二进制。
3. 灰度与回退：`submit_default: true` 直接启用；异常回退是把 `ClientDef` 的 `submit_default` 改回 `false`（一行，随下一次 CLI 发布生效）。
4. 回滚：revert 即回到"无 trae-cn"状态；已上报的历史数据无需清洗（客户端粒度独立，不会污染其他客户端聚合）。

## Open Questions

（无遗留。轮 1 的两个待确认项已解决：volcengine 映射归属解析器侧（D8）；坏页诊断通道定为 lane stderr 警告行（D3）。）
