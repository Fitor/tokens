# Review: trae-cn-local-scan 规划工件

## 当前评审结论（R6-RC-1 定向复核）

- Reviewer：Codex（未使用 subagent）。复核时间：2026-11-16T09:19:09.118752+00:00。
- 对象：`358d142` 对 design.md、spec.md、tasks.md、test-plan.md 的修订；核对 `message_cache.rs` 的读取优先级及 `finish_message_layout_migration`。本次仅复核 R6-RC-1，不展开新一轮全量审查。
- 结论：**R6-RC-1 accepted，R6-P2-1 关闭；当前规划评审裁决改为 APPROVE**。本轮未发现该修订要求范围内的未解决项。

### 逐项核对

| R6-RC-1 要求 | 结果与证据 |
| --- | --- |
| 正确区分旧格式谱系 | 通过。D7、tasks 7.1/7.2、spec 缓存升级 requirement 与 test-plan 均改为 fork-5/V7/V8 按既有语义迁移、V4/V6 保持 Stale；磁盘版本 5 只路由 fork-5，upstream V5 不作为支持输入。与源码约 2953–3023 的实际优先级一致。 |
| 使用对应旧 wire fixture | 通过。tasks 7.1 与 Coverage Notes 明确 fork-5 使用 fork 布局、V7/V8 使用 legacy 布局、V9 使用本次冻结布局；新结构不冒充旧格式。 |
| 保留 namespace/parser 门禁 | 通过。D7、spec 与任务明确门禁不变；真实读取先检查 namespace/parser identity，不为扩大迁移范围打开不可达 legacy 分支。 |
| 旧 Claude 允许一次 provenance 重解析并保留历史 | 通过。D7、spec 的缓存独有历史场景及 test-plan 区分旧 Claude 重建与普通热缓存条目；要求历史不丢、重建后恢复热读。与源码约 2088 的 marker 清理语义一致。 |
| V9→V10 不引入额外重解析 | 通过。D7 与 tasks 7.1/7.2 明确 V9 迁移不清理 marker；spec 保留 V9 多消息/元数据不变、保存后再次热读取的验收。既有 marker 状态仍按原有机制处理，不能理解成跳过原本待执行的 provenance 工作。 |

### 实施边界与证据限制

- upstream V5 不是支持输入；版本号 5 的唯一解码路线必须保持 fork-5。`test_v4_v6_stale_guard_and_upstream_v5_rejected` 应核对该路由及选定的不兼容 fixture，不能把测试名解释为仅凭共用版本号就能可靠识别并拒绝任意来源的二进制 payload；现有代码没有额外的 upstream/fork 判别标记。本说明不要求新增格式探测或扩大支持范围。
- 本次通过的是规划修订。迁移实现、旧格式 fixture、Claude 历史保护、缓存往返、KAT 与真机扫描仍须在实施阶段完成并提供真实结果。
- 未修改其余规划或生产代码；未运行 Rust 测试或实际缓存升级。Graft 未调用，采用本地源码证据；需求明确，未重复 grill。

### Required Changes 复查结果

- [x] R6-RC-1：格式/namespace/provenance 验收矩阵已对齐本 fork，保留 V9→V10 方案。

CHANGES_APPLIED: yes

VERDICT: APPROVE

下方第 6 轮及更早记录为历史裁决，本节是当前规划评审结果。

## 第 6 轮历史评审记录


- Reviewer：Codex（未使用 subagent）。评审时间：2026-11-16T09:02:21.772279+00:00。
- 范围：`b28119c` 的五份规划修订、第五轮裁决，以及本 fork 消息缓存实际读取优先级、wire 类型、格式版本与 Claude 历史保留迁移逻辑。前轮未提交 review 全部保留。
- 当前裁决：**APPROVE_WITH_CHANGES**。R5-P1-1 的 V9 升级设计缺陷在规划层关闭，R5-S1 已修正；没有未解决 P1。剩余一项 P2 是旧格式验收矩阵与现有 fork 行为不符，须按 R6-RC-1 修正文档后复核，不要求重新设计 V9→V10 方案。
- 方法与限制：本轮为规划复审，仅写 review 与本轮本地任务记录，不改其余规划或代码；未执行 Rust 测试、真实升级、KAT 或真机扫描。迁移与历史保护测试均仍待实现，不宣称已经通过。Graft 未调用，以本地源码核对；需求明确，未重复 grill。

### 第 5 轮修订逐项复核

| 项目 | 本轮结果 | 证据与边界 |
| --- | --- | --- |
| R5-RC-1 / R5-P1-1 | accepted（规划层，关闭原 P1） | D7、tasks 7.2 明确 CACHE_FORMAT_VERSION 9→10，冻结 V9 wire 布局并显式转换，新字段置 None，状态 Migrated；proposal 删除旧缓存自然兼容的保证。spec 新增升级兼容 requirement，test-plan 包含真实旧二进制、多消息/元数据、迁移保存后热读、Claude 缓存独有历史及旧格式回归。V9 升级方案方向成立；旧格式支持范围与保持热的断言需按下项收窄。 |
| R5-S1 | accepted | D7 已承认 Claude 保留历史机制有 namespace 门禁，CN 设置 dedup_key 不会触发这些 Claude 路径；不共用字段的理由改为语义隔离，不再声称必然触发。 |

### R6-P2-1：旧格式回归矩阵未区分 fork 谱系与既有重解析语义

- 位置：design.md D7 的“既有 V4–V8 迁移分支继续工作”；tasks.md 7.1/7.2；spec.md:286–290 的“既有受支持的旧格式（V4–V8）”且不触发全量重扫；test-plan.md 对应回归行及 Coverage Notes。
- 源码事实：`message_cache.rs:1646–1657` 明确本 fork 没有写过 upstream V4/V6，V5 必须解释为 fork-5，不能交给 upstream V5 类型。实际 `read_shard_with_limit` 先处理 `FORK_CACHE_FORMAT_VERSION_V5`，再对 V4/V6 直接返回 Stale；其后的同编号 legacy 分支虽仍存在，实际不可达（约 2953–3002）。V7/V8 才按各自 legacy wire 类型迁移。仅看类型声明或分支名称会误判真实支持范围。
- 另一个既有边界：`finish_message_layout_migration`（约 2088）对旧 Claude 条目移除 retention provenance marker，以触发一次保留缓存独有历史的源重解析，补齐旧格式缺失的费率/速度证据。不能把“保留消息”统一等同于“所有非 CN 客户端立即保持热且不重扫”。
- 影响：当前验收按 V4–V8 全部迁移成功/保持热理解，会要求实现者打开本 fork 故意拒绝的格式，或绕过既有 Claude provenance 重建来满足测试；用 upstream V5 fixture 还会违反明确的 fork-5 布局门禁。这与 D7“既有迁移语义不变”冲突。
- 必需修订：把旧格式矩阵写成可执行的实际规则：fork-5、V7、V8 保持原迁移语义，新增 V9→V10；V4/V6 保持 Stale，upstream V5 不作为本 fork 支持的输入。其他 parser namespace/version 门禁继续保留。热缓存保证仅适用于原本可保持热的条目；旧 Claude 格式允许既有一次 provenance 重解析，但必须保留缓存独有历史并在重建完成后恢复热读。V9 新增字段本身不要求额外重解析，不要无条件把新的 V9 迁移也套入旧的补证据清理流程。
- 验收调整：fixture 对 fork-5 使用 `ForkCachedSourceEntryV5`，V7/V8 使用对应 legacy 类型，V9 使用本次冻结 wire 类型；分别断言迁移结果与二次读取。V4/V6 保留 Stale 护栏测试。Claude 旧格式单独断言一次 provenance 重建、历史不丢及随后热读，非 Claude 且 parser identity 有效的条目继续验证保持热。同步修订 design、tasks、spec、test-plan，勿为满足过宽测试修改既有谱系门禁。

### 本轮必需修订与结论

- [ ] R6-RC-1：将旧格式回归与热缓存验收收窄为本 fork 的实际格式/namespace/provenance 矩阵（R6-P2-1），保留 V9→V10 升级方案。

CHANGES_APPLIED: no

VERDICT: APPROVE_WITH_CHANGES

上述结论只表示规划方案附一项明确修订条件通过；不代表实施完成或缓存升级已验证。历史各轮结论保留在下方，不覆盖本轮当前裁决。

## 第 5 轮历史评审记录


- Reviewer：Codex（未使用 subagent）。评审时间：2026-11-16T08:46:14.213473+00:00。
- 范围：`3d7a8b4` 的五份规划修订、前轮裁决，以及 `UnifiedMessage`、SQLite 装载器、消息缓存的实际编码/读取/迁移与历史保留路径。原有未提交 review 内容全部保留。
- 当前裁决：**REVISE**。R4-RC-1 在规划层通过，关闭 R4-P2-1（及其承接的 R3-P2-1）；新增 R5-P1-1：共享消息结构变更缺少 bincode 兼容迁移，仍需修订。
- 本轮仅审查规划，不执行实施任务或修改代码。未运行 Rust 测试、KAT 或真机扫描；下述风险来自源码核对，未声称已复现迁移失败。未调用 Graft，使用本地源码证据；需求明确，未重复 grill。

### 第 4 轮修订复核

**R4-RC-1 → accepted（规划层）**。

- D7 与 tasks 7.2 明确新增可序列化的 `turn_id: Option<String>`，与 `updated_at_ms` 一起保存在消息中；CN 解析器填入校验后的 turn 身份，缺失/空值跳行。合并点不再猜测身份，消息时间仍取 created_at。
- D9 明确两条流程各自在合并后去重；proposal、spec 与任务已同步。缓存往返、真实装载器冷/热双向混合、全热与发现顺序互换、两条流程，以及不同 turn 其余字段全同的反例，均有对应测试计划和文件落点。
- 因此，原先“只有更新时间、没有 turn 身份”的设计缺陷关闭。新格式内的传递方案成立，但它与既有磁盘格式的兼容不能由这一结论推导，见下项。

### R5-P1-1：serde(default) 不能替代现有 bincode 消息布局迁移，风险跨越全部客户端

- 位置：design.md D7 两条元数据传递说明中的“旧缓存条目反序列化自然得 None，无需缓存迁移”；tasks.md 7.2；proposal.md Impact 中“旧缓存条目反序列化不受影响”；现有 test-plan 仅覆盖新格式往返，未覆盖升级。
- 源码证据：`message_cache.rs:4` 使用 bincode；文件开头格式版本注释明确：共享 `UnifiedMessage` 布局变化需要格式升级。当前 `CACHE_FORMAT_VERSION = 9`，历史新增 session_title、model_attribution_conflicted、cache_write_1h、inference_speed 已分别触发版本变化；V7/V8 有明确 wire 类型与迁移分支。`read_shard_with_limit`（约 2940–3035）先读 envelope，再按版本解码二进制 payload；`write_shard_with_limit`（约 3044）用 bincode 编码 entries。`message_cache.rs:2184` 还明确说明该编码不带字段名，增加字段需要版本处理。
- 问题：新方案给所有客户端共享的消息结构新增两个字段，却以 serde default 推导旧缓存兼容。bincode 是位置编码，旧 payload 不携带新字段或字段名，不能靠 JSON 式缺字段默认值保证兼容。只增加 trae-cn parser 版本也不能保护其他客户端的共享消息布局。
- 影响：若保持格式 9 而用新结构读取旧 payload，存在解码失败或字段错位风险，读取失败会进入 Invalid 分支并丢弃该 shard 的内存条目；若只提升全局格式而不提供迁移，旧条目会被视为 Stale 后重建。两者都会失去原缓存持有的消息。Claude 的部分压缩历史仅存于缓存，不能通过重扫现有文件恢复；现有迁移注释与历史保留逻辑明确保护这类数据。因此不能用“清缓存后重扫”替代兼容方案。
- 必需修订：选择并写死兼容方案。若继续扩展共享 UnifiedMessage，按既有模式升级缓存格式、保留精确 V9 wire 布局并显式转换（新字段为 None），同时更新已有支持的旧版本转换路径；保留既有字段、增量元数据、历史保留标记及现有迁移语义。也可改为不改变共享 wire 布局的专用元数据存储，但必须给出真实装载与持久化落点。同步修改 design、proposal、tasks、spec 与 test-plan，删除“无需迁移”的错误保证。
- 验收：使用由旧 wire 类型或旧版本生成的真实 V9 二进制 shard（至少多条消息），确认升级后逐条消息和既有元数据不变、新字段为 None，迁移保存后可再次热读取。覆盖 Claude 缓存独有历史在源中已消失时升级仍保留；覆盖现有支持的旧格式迁移回归及非 CN 客户端。CN 新格式往返与冷/热去重集成验收继续保留。不能仅用新结构自行生成 fixture 冒充旧格式兼容测试。
- 复核纠正：前两轮未深入核对磁盘编码，未指出“旧缓存自然兼容”的错误；本轮据实际 bincode 与迁移代码纠正该遗漏。原 turn 身份通路问题关闭不等于缓存升级安全通过。

### 非阻断建议 R5-S1：收窄不用 dedup_key 的依据

D7 声称设置 CN dedup_key 就会接入 Claude 历史保留机制，范围过大：`retained_message_keys` 先检查 `is_claude_namespace()`，`absorb_retained_history` 也先经 `retained_history_key_filter`，后者仅允许 Claude namespace。保持专用 turn_id 字段是可接受的选择，但建议将理由改为字段语义隔离，或引用真实适用于 CN 的全局去重调用点；不要把有 namespace 门禁的 Claude 路径描述为 CN 必然触发。本建议不要求改用 dedup_key。

### 本轮必需修订与结论

- [ ] R5-RC-1：明确共享消息结构的缓存格式兼容方案，并补齐旧二进制 shard 升级、Claude 缓存独有历史保护及现有迁移回归测试计划（R5-P1-1）。

第 4 轮要求的 turn 身份通路已补齐；当前仍有 1 项 P1 未解决，规划裁决为 REVISE。上述测试均是待实施验收要求，当前没有实现通过证据。

CHANGES_APPLIED: no

VERDICT: REVISE

## 第 4 轮历史评审记录


- Reviewer：Codex（未使用 subagent）。评审时间：2026-11-16T08:16:30.486565+00:00。
- 范围：复核 `3925ca9`、`04fc131` 的规划修订，并核对 proposal、design、spec、tasks、test-plan 及当前消息/缓存源码；保留已有未提交的历史 review 内容。
- 当前裁决：**REVISE**。第 3 轮两项 P1 的规划修订通过；R3-P2-1 部分修复，但 turn 身份仍无法走完缓存管线，因此尚不能关闭。
- 本轮为规划复审，不是实现验收；未修改规划或生产代码，未运行 Rust 测试或真机扫描。合成 fixture、KAT 和缓存测试均仍是待实现计划，不宣称测试已通过。未调用 Graft，以源码和官方文档核对；需求明确，未重复 grill。

### 第 3 轮修订逐项复核

| 修订要求 | 本轮结果 | 证据与边界 |
| --- | --- | --- |
| R3-RC-1：WAL salt | accepted（规划层） | spec 解密快照规则已改为帧头 salt 与 WAL 头 salt 比较；D11、tasks 1.2/2.1/2.2 和 test-plan 同步，新增正常 salt 不同仍合并及残留帧前缀场景。与 [SQLite WAL 格式](https://www.sqlite.org/fileformat2.html#walformat)一致。 |
| R3-RC-2：页 HMAC 与独立向量 | accepted（规划层） | D1 明确密文、IV、LE 页号与页 1 特殊偏移；D11、tasks 1.6、test-plan 增加官方实现生成的独立向量及 IV 篡改校验。包含 IV 的要求与 [SQLCipher 官方设计](https://www.zetetic.net/sqlcipher/design/)一致。向量及参数证据仍需实施时实际生成并验证。 |
| R3-RC-3：跨 DB/缓存去重元数据 | partially applied，未关闭 | `updated_at_ms` 已有序列化方案，跨库落点、NULL 行为、并列裁决及冷/热缓存测试计划均已补齐；但 `turn_id` 无传递字段，且 D7 明确 `dedup_key: None`，见 R4-P2-1。 |

### R4-P2-1：turn_id 仍未进入消息与缓存，合并后无法按 turn 分组

- 性质：R3-P2-1 的未解决部分，不另计为独立于旧问题的新缺陷。
- 位置：design.md:80–81（D7）、design.md:91（D9）、tasks.md:47（7.2）、proposal.md:34；spec.md:209–211 要求合并后按 turn 去重。
- 源码证据：`cli/tokens-core/src/sessions/mod.rs:80` 的 `UnifiedMessage` 没有 `turn_id`；`lib.rs` 的 `load_or_parse_sqlite_source` 闭包返回 `Vec<UnifiedMessage>`；`message_cache.rs:1623` 持久化同一消息类型。修订只为该类型新增 `updated_at_ms`，没有 turn 身份字段，并显式要求 CN 的 `dedup_key` 为空。
- 触发：两个 DB 含同一 turn 的不同版本，其中任意 DB 走缓存命中。合并后的消息虽然能比较更新时间，却无法判断哪两条属于同一 turn。即使全部冷扫描，局部 SQL 行的 turn_id 也没有被规定带到合并点。
- 影响：按当前设计无法实现指定分组；用 session_id、时间或载荷猜测身份会丢失不同 turn，或重复计算同一 turn。补齐更新时间不能单独解决这一问题。
- 必需修订：明确 turn 身份与更新时间一起贯穿解析、缓存持久化、缓存命中和两条流程合并点的方案。例如使用可序列化的专用 turn 身份字段或包含 turn 元数据的缓存结构；若改用现有 dedup_key，则须先核对并说明对全局去重的影响，不能只取消当前禁令。同步修改 proposal、design、tasks 和测试计划，保留消息时间取 created_at 的规则。
- 验收：先断言解析结果及缓存序列化/反序列化往返保留原始 turn 身份，再通过真实缓存装载路径覆盖全冷、一冷一热（新版本分别在冷侧与热侧）、全热及发现顺序互换。增加同一 session 中两个不同 turn、其余字段全部相同的反例，必须保留两条；相同 turn 的不同版本仅保留最新一条。两条业务流程均须核对合并后执行去重，不能仅用手工构造向量冒充缓存集成验证。

### 本轮必需修订与结论

- [ ] R4-RC-1：补齐可持久化的 turn 身份通路，并同步工件及缓存集成验收计划；对应 R3-RC-3 / R4-P2-1。

本轮未发现其他必须阻断的新增问题。前两项 accepted 仅关闭规划缺陷；实施正确性仍由独立向量、合成 WAL、缓存集成测试和真机验证证明。

CHANGES_APPLIED: no

VERDICT: REVISE

## 第 3 轮历史评审记录


- Reviewer: Codex（本轮未使用 subagent）
- 评审日期：2026-11-13
- 范围：proposal.md、design.md、specs/trae-cn-local-scan/spec.md、tasks.md、test-plan.md、历史 review.md，以及相关缓存与消息结构源码。
- 方法：只读审查规划与源码，并核对 SQLite、SQLCipher 官方格式说明；未运行实现测试，tasks.md 仍全部未勾选。
- 当前裁决：**REVISE**。以下 2 项 P1、1 项 P2 尚未解决；修订并复审前，不建议按现有规格进入实现。下文第 2 轮结论保留为历史记录，不代表当前批准。
- 有效范围：本轮裁决仅适用于本轮读取的工件内容；后续修改需复核受影响的发现与验收场景。

### R3-P1-1：WAL salt 比较对象错误，会忽略正常 WAL

- 位置：specs/trae-cn-local-scan/spec.md:44、61–65；design.md D11；tasks.md 1.2、2.1–2.2 及 test-plan.md 对应 salt fixture。
- 问题：规格要求比较 WAL 头 salt 与主库页 1 salt。SQLite 要求比较的是 WAL 帧头与 WAL 头中的两组 salt；SQLCipher 主库前 16 字节的 salt 用于密钥派生，与 WAL salt 没有相等约束。
- 影响：按现有规格实现会把正常 WAL 当作重置残留而忽略，遗漏尚未 checkpoint 的已提交用量。合成 fixture 若人为让两者相等，会掩盖该错误。
- 必需修订：删除 WAL 头与主库 salt 比较规则，按 WAL 帧头与 WAL 头匹配及累计校验和链判定有效前缀，再以最后有效 commit 确定可见视图。同步修订 design、spec、tasks 与 test-plan。
- 验收：正常 WAL 的 salt 与主库 SQLCipher salt 不同仍能合并；增加 WAL 帧 salt 与 WAL 头不匹配的残留帧场景，确认只保留有效前缀内已提交视图。
- 依据：[SQLite WAL File Format / Reader Algorithm](https://www.sqlite.org/fileformat2.html#walformat)、[SQLCipher Security Design](https://www.zetetic.net/sqlcipher/design/)。

### R3-P1-2：页 HMAC 输入遗漏 IV，合成测试存在同源错误风险

- 位置：design.md D1:33、D11:40；tasks.md 1.2、1.4。
- 问题：D1 把 HMAC 覆盖范围写成“密文 + LE 页号”，遗漏 IV。SQLCipher 的页 HMAC 包含密文与 IV，不能仅按当前文字计算。
- 影响：若生产解密和 fixture 构造器都照同一错误描述实现，测试可自洽通过，真实数据库却会在页 1 HMAC 预检失败，整库被跳过。
- 必需修订：明确 HMAC 输入的完整字节范围和拼接顺序（密文、IV、页号）、页 1 的特殊偏移，以及页号编码；在工件中说明参数依据。保留合成 fixture，但增加独立于被测加密构造器的已知答案测试，例如来自官方实现生成的无用户数据测试向量，记录生成版本与参数。
- 验收：独立向量可解密并通过 HMAC；修改 IV 会触发校验失败，不能仅验证本地加密器与解密器互逆。
- 依据：[SQLCipher Security Design](https://www.zetetic.net/sqlcipher/design/) 明确页 HMAC 保护密文与 IV。

### R3-P2-1：updated_at 去重元数据缺少跨缓存的数据通路

- 位置：design.md D7:78、D9:88；tasks.md 7.2、9.2。
- 源码事实：`cli/tokens-core/src/sessions/mod.rs:80` 的 `UnifiedMessage` 无 `updated_at` 字段；`lib.rs` 的 `load_or_parse_sqlite_source` 闭包及消息缓存传递 `Vec<UnifiedMessage>`。规格同时要求消息时间使用 `created_at`。
- 问题：D7 要求同一 turn 取 `updated_at` 最大者，但没有说明该元数据如何跨 DB 解析、缓存持久化及缓存命中继续存在。单 DB 解析内部去重不能覆盖多个发现路径间的重复 turn，也不能解决一部分 DB 来自缓存时的比较。
- 影响：实现者若用消息时间代替更新时间，或仅在单库内去重，会在重复副本间选错版本，导致用量不稳定或过时。
- 必需修订：明确去重范围、`turn_id` 与 `updated_at` 的传递和持久化方案，以及与现有缓存结构的兼容方式；消息时间继续保留 `created_at`。同时定义更新时间相等时的确定性裁决规则（承接 R2-S1）。
- 验收：两个 DB 含同一 turn、不同更新时间与用量，分别覆盖全冷扫描、一冷一热缓存、全热缓存及发现顺序互换；每次均保留最新版本且仅计一次。

### 本轮修订清单与结论

- [ ] R3-RC-1：修正 WAL salt 规则及全部对应工件、fixture 和验收场景。
- [ ] R3-RC-2：修正 HMAC 输入说明，增加独立已知答案测试计划。
- [ ] R3-RC-3：补齐跨 DB、跨缓存的去重元数据方案与测试，并定义并列裁决。

CHANGES_APPLIED: no

VERDICT: REVISE

## 第 2 轮历史评审记录

## Review Metadata

- Review round: 2
- Prior round: round 1 REVISE — C1 归一化契约矛盾 + M1-M8（作者已申报修复，见 Rebuttals）
- Reviewer context: fresh-context subagent（same model，与作者无共享上下文）
- Tool restrictions: read-only
- 评审对象: proposal.md、design.md、specs/trae-cn-local-scan/spec.md
- STALENESS: 本裁决只对上述工件在本轮评审时的内容有效。工件后续任何修改都使本裁决失效。

## 代码核对（本轮新核实的证据）

以下事实来自对当前工作区源码的只读核对，是本轮新发现的依据：

- `aggregator.rs:398-415`（`into_contribution`）在构建提交贡献时对五个 token 桶与 cost 逐项 `.max(0)` 钳位（日汇总与每 client 各一次）。`daily.finish()`（`aggregator.rs:75`）产出提交用 contributions（`lib.rs:4600`）。提交载荷因此永远不含负桶。三份工件"一条负值会拒收整包提交"的陈述与此不符。
- `CachedParseOutcome`（`lib.rs:1001-1006`）是通用装载器函数内的私有结构，只由装载器内部构造。解析闭包签名是 `F: Fn(&Path) -> Vec<UnifiedMessage>`（`lib.rs:1703`），闭包无法向该结构携带诊断字段。`with_opencode_incremental`（`message_cache.rs:2122`）扩展的是 `CachedSourceEntry`，其使用者是绕开通用装载器的 opencode 专用 lane（`lib.rs:1717-1725` 注释解释了绕开的原因）。
- `process_liveness.rs` 位于 tokens-cli（`cli/tokens-cli/src/process_liveness.rs`），由 `main.rs` 以私有 `mod` 声明，tokens-cli 的 antigravity/trae 通过 `crate::process_liveness` 引用。Cargo 依赖方向是 tokens-cli → tokens-core，反向不可引用。
- 第 1 轮核对结论本轮复核仍成立：`dedupe_latest_trae_messages`（`lib.rs:3545`）按 session 折叠留最新，两条 lane 接入点（`lib.rs:3380`、`lib.rs:6204`）存在，`check_sqlite_path` 盯 db+`-wal`，`ClientId` 连续且最大 id 为 `CraftAgent = 53`，`SUPPORTED_CLIENT_TYPES` 含 `"trae"`，`TokenBreakdownSchema` 五桶非负（`submission.ts:44-53`），未知 client 使 `SourceSchema` 整包失败（`submission.ts:80`）。
- M1 相关事实属实：`normalize_provider_hint`（`lookup.rs:3491-3495`）只做 trim 与 unknown 过滤。`canonicalize_provider_segment("volcengine")` 无数字、无折叠臂，原样通过。`inferred_provider_from_model` 有 glm→zai、kimi→moonshotai、deepseek→deepseek、minimax→minimax 臂，无 doubao 臂。Archive 现有 glm-5.2 行同时存在 `zhipu/` 与 `zai/` 两个 key（`pricing/mod.rs:369-374`），CN 解析器的 `zai` 提示可命中。
- M6 相关事实属实：`ClientDef` 恰为七字段（id、root、relative_path、pattern、headless、parse_local、submit_default）。`clients.rs:1190` 断言 `COUNT == 54`，加 `TraeCn = 54` 后该断言需更新为 55。clients.rs 不在 M6 的冻结清单内，无矛盾。

## Findings

### 🔴 Critical (blocking)

无。

### 🟡 Moderate

**R2-M1. 归一化契约的负值防线未覆盖两个照抄桶，且三份工件陈述的拒收理由与代码事实不符**

- 文件: proposal.md 行 13；specs/trae-cn-local-scan/spec.md 行 137-147；design.md D6 行 70
- 问题两点：
  1. spec 行 137 宣布不变量"不得产出猜测值或负值"。规则清单只拦截派生桶：input 靠 `cache_read > prompt` 规则、output 靠 `reasoning > completion` 规则间接保证非负。两个照抄桶没有防线：`cache_read = cache_read_input_tokens` 与 `reasoning = reasoning_tokens` 原样复制。一行 `cache_read=-10, prompt=100, completion=10, total=110, reasoning=0` 通过全部现行规则，产出 `tokens.cache_read = -10`，违反不变量句。reasoning 同理。此外只有 `total_tokens` 写了"不是数值"规则，`prompt_tokens`、`completion_tokens`、`cache_read_input_tokens`、`reasoning_tokens` 非数值时的行为未定义。
  2. proposal 行 13、spec 行 141 括注、design D6 都把跳行理由写成"服务端要求各桶非负，一条负值会拒收整包提交"。核实结果：`into_contribution`（`aggregator.rs:398-415`）在提交前把五桶与 cost 钳位到 0，提交载荷永远合法。负值的真实后果是静默少计，不是整包 400。
- 影响: 按现行 spec 验收通过的实现仍会对负值 DB 输入产出负桶（靠下游钳位兜底，实际后果是少计不指名）。三份工件陈述了一条不存在的拒收路径，会误导后续维护者，例如误把聚合钳位当成"掩盖 400 的缺陷"而移除。该理由源自第 1 轮 C1 自身的核对遗漏，作者忠实继承了它。
- 修复: spec 补一条跳行规则（五个 token 字段任一不是数值或为负即跳行），并把三处理由改为真实机制（跳行防静默少计；服务端非负校验是第二道防线，提交前聚合已钳位）。可补一条负 `cache_read` 跳行场景。

**R2-M2. WAL 校验和链断裂场景的 GIVEN 与 THEN 互相矛盾**

- 文件: specs/trae-cn-local-scan/spec.md 行 55-59（Scenario: WAL 校验和链中断只取中断点之前）
- 问题: GIVEN 写"在第 N 帧后校验和链断裂"。按自然读法，断点在 N 与 N+1 之间，第 1..N 帧链有效。THEN 却写"N 帧及之后不生效"，把 N 排除。两种读法必有一种让场景不可执行。Requirement 正文（行 43"只合并中断点之前的已提交帧"）与 THEN 一致，与 GIVEN 的自然读法不一致。该场景对应 D11 钦定的六个合成 fixture 之一：fixture 作者按 GIVEN 自然读法会在第 N+1 帧断链，THEN 断言随之失败。
- 影响: 解密模块最关键分支的验收场景自相矛盾。
- 修复: GIVEN 改为"第 N 帧的累计校验和与链不符（自第 N 帧起链断裂）"，与 THEN 和 Requirement 行 43 对齐。

**R2-M3. D3 的坏页诊断数据流与 D9 的装载器选择矛盾**

- 文件: design.md D3 行 52；D9 行 88
- 问题: D3 把数据流钉死为"`trae_db::snapshot` 返回值 → `CachedParseOutcome` 扩展诊断字段 → lane 输出 stderr 行"。`CachedParseOutcome` 由通用装载器内部构造，解析闭包签名 `Fn(&Path) -> Vec<UnifiedMessage>` 无法携带坏页计数进该结构。D9 又明确"解析走 `load_or_parse_sqlite_source`"。按 D3 字面落地必须改通用装载器签名，或让 CN 走 opencode 式专用装载器，两个 decision 都没写这个选择。引用的先例 `with_opencode_incremental` 扩展的是 `CachedSourceEntry`，且其使用者正是绕开通用装载器的专用 lane，先例与结论不匹配。D3 第一句"lane 闭包直接输出 stderr 行"与第二句的结构扩展路径也互斥。
- 影响: 实现者在两个矛盾的落点之间无所适从，或改出 design 未授权的通用装载器签名变更。
- 修复: 二选一并写死。推荐最小改动：解析闭包在生成快照的扫描中直接把解密统计打到 stderr（天然满足"缓存命中不重发"，因为闭包只在指纹未命中时执行），删除结构扩展句。若选专用装载器路线，同步改写 D9。

**R2-M4. D2 的启动清扫要"复用 process_liveness.rs"，但该模块在另一个 crate 且为私有**

- 文件: design.md D2 行 46；proposal.md Impact 行 34
- 问题: `process_liveness.rs` 位于 tokens-cli，由 `main.rs` 私有 `mod` 声明。trae-cn lane、`trae_db.rs` 与快照子目录都在 tokens-core。tokens-core 不能依赖 tokens-cli。proposal Impact 清单没有模块移动或新探测文件，"复用"按现状不可落地。可选路径有三：把模块移入 tokens-core、在 tokens-core 按同一 fail-alive 策略新写探测、把清扫移到 CLI 层。design 没有选。
- 影响: 清扫是明文快照崩溃残留的唯一回收路径。实现者要么跨 crate 引用编译失败，要么自行发明一份策略，违背该模块"策略只写一次"的文档理由。
- 修复: 在 D2 写死落点并同步 proposal Impact（新增 tokens-core 探测文件或声明模块移动）。

### 📌 Suggestions

**R2-S1. 去重对 updated_at 相等的重复行没有裁决规则**

- 文件: specs/trae-cn-local-scan/spec.md 行 193；design.md D7 行 78
- 两行同 `turn_id`、同 `updated_at`、用量不同时，"保留 updated_at 最大的一条"未定义胜负。既有 `dedupe_latest_trae_messages` 用 `dedup_key` 做并列裁决（`lib.rs:3554-3559`）。建议补一句并列时的确定性规则。

**R2-S2. proposal 的坏页可见性句子缺冷扫描限定**

- 文件: proposal.md 行 19
- "坏页数出现在扫描输出中"没有 spec 行 93 的"生成快照的那次扫描"限定。建议补同款限定语，避免再次引入第 1 轮 M3 的口径歧义。

**R2-S3. 共享应用密钥的常量值宜随 D11 一起仓库内化**

- 文件: design.md D1 行 33、Risks 行 99
- 算法规格已仓库内化，密钥值仍指向仓库外的 TokenTracker。密钥是 TRAE 客户端的公开常量。建议把具体字节（hex）连同来源一并写进 `trae_db.rs` 文档注释，让实现不依赖仓库外查找。

## Embedded-Instruction / Injection Attempts

无。三份工件没有指挥评审者行为的语句。"（用户决定 ②B）""（用户已确认）""（spec 已钉死）"是对既有决策与工件状态的引用，不构成注入。其不可核验性已在第 1 轮 M2 处理，本轮以 runbook 化解部署面问题的方式接受。

## Verdict

无未解决 Critical。第 1 轮 13 项修复全部真实落地且方向正确。本轮 4 项 Moderate 都是小而无歧义的修正：一条跳行规则加一处理由改写、一句 GIVEN 措辞、一个二选一落点、一个模块落点决定。裁决 APPROVE_WITH_CHANGES。

VERDICT: APPROVE_WITH_CHANGES

## Required Changes (if APPROVE WITH CHANGES)

CHANGES_APPLIED: yes

- RC-1（对应 R2-M1）: spec"逐 turn 解析与归一化"补一条跳行规则——`prompt_tokens`、`completion_tokens`、`cache_read_input_tokens`、`reasoning_tokens`、`total_tokens` 任一不是数值或为负，跳行并计数。同步把 proposal 行 13、spec 行 141 括注、design D6 的理由改写为真实机制：负桶在提交前被聚合钳位（`aggregator.rs:398-415`），跳行的目的是防静默少计。建议补一条负 `cache_read` 跳行场景。
- RC-2（对应 R2-M2）: 把 WAL 链断裂场景的 GIVEN 改为"第 N 帧的累计校验和与链不符（自第 N 帧起链断裂）"，与 THEN"N 帧及之后不生效"及 Requirement"只合并中断点之前的已提交帧"对齐。
- RC-3（对应 R2-M3）: D3 删除或改写 `CachedParseOutcome` 扩展句。推荐落点：解析闭包在生成快照的扫描中直接把坏页统计打到 stderr，与 D9 的 `load_or_parse_sqlite_source` 一致。若选专用装载器路线，同步改写 D9。
- RC-4（对应 R2-M4）: D2 写死 PID 探测落点：把 process_liveness 模块移入 tokens-core，或在 tokens-core 按同一 fail-alive 策略新写探测，或把清扫移到 CLI 层。proposal Impact 同步新增文件或模块移动。

## Rebuttals

对作者申报的 13 项修复逐项裁决（编号沿用申报表）：

1. C1 → accepted by reviewer。三条校验在 proposal 行 13 与 spec 规则清单统一为"违规即跳行并计数"，min() 截断在三份工件中已不存在，两个新跳行场景（cacheRead>prompt、reasoning>completion）已入 spec。理由陈述的事实错误由 R2-M1 另行处理，该错误源自第 1 轮自身的核对遗漏，不是作者引入的新缺陷。
2. M1 → accepted by reviewer。映射归属改到 `provider_identity.rs` 与解析器侧映射表，与代码事实一致：`normalize_provider_hint` 只做 trim 与 unknown 过滤，`canonicalize_provider_segment("volcengine")` 原样通过，`inferred_provider_from_model` 无 doubao 臂。doubao→volcengine 场景已入 spec，Open Questions 已清空。
3. M2 → accepted by reviewer。D10 如实声明窗口"收窄但不可消除"。runbook（web 先合并部署）、失败表现（整包 400、details 指名）、用户自救（--client 显式列举）、一行回退全部落在 D10 与 Migration Plan，Risks 表同步改写。
4. M3 → accepted by reviewer（spec 层修复完整）。冷扫描限定、stderr 通道、`DatabaseCorrupt` 跳过场景、缓存命中不重发场景全部落地。D3 新写的数据流路径与 D9 矛盾，由本轮新发现 R2-M3 跟踪。
5. M4 → accepted by reviewer。门禁 7 列与解析最小需要一一对应：context 载荷、session_id/turn_id 去重、created_at 时间戳、updated_at 并列裁决、turn_status 与 deleted_at 过滤。"门禁通过但查询失败→跳过"场景已入 spec 与 D5。
6. M5 → accepted by reviewer。环境变量覆盖场景、stat 前哨重试场景（4 次 = 初次 + 3 次重试，与 D2 一致）、WAL 三条边界场景、置零页查询期语义（`DatabaseCorrupt`→跳过，spec 与 D3 一致）全部落地。WAL 链断裂场景存在 GIVEN/THEN 措辞矛盾，由 R2-M2 跟踪。
7. M6 → accepted by reviewer。两个 THEN 都可机械断言：既有测试全过加文件未改（git diff 可验）；七字段硬编码断言与 `ClientDef` 实际字段一致。`clients.rs:1190` 的 COUNT 断言需随新变体更新，但该文件不在冻结清单内，无矛盾。
8. M7 → accepted by reviewer。专用子目录、pid 文件名、基于存活探测的启动清扫、session_title 必须 None 禁令与负面场景全部落地。清扫探测的跨 crate 落点问题由 R2-M4 跟踪。
9. M8 → accepted by reviewer。D11 把 WAL 算法定为仓库内权威规格（magic、页大小字段、帧头、校验和链、commit 语义、salt 断点、三条边界语义），六个合成加密 fixture 类别齐全，真实用户库不入仓库，demo 降级为可行性证据（Context 与 D11 一致）。
10. S1 → accepted by reviewer。proposal Impact 已列 `sessions/mod.rs` 与 `message_cache.rs`，与穷举 parser 版本表（`message_cache.rs:1248` 起，缺臂编译失败）的实际强制点一致。
11. S2 → accepted by reviewer。created_at 非正数或乘 1000 溢出跳行规则与场景已入 spec，`checked_mul` 先例引用（`sessions/trae.rs:74-78`）属实。
12. S3 → accepted by reviewer。model_id、session_id、turn_id 的 256 字节上限已入 spec 规则清单。
13. S4 → accepted by reviewer。五个 Archive key 全部采用 `<provider>/<model>` 并逐一列名，spec Archive 场景断言 `volcengine/doubao-seed-2-1-turbo`，与 zhipu/xiaomi/tencent 先例格式一致。

统计：13 accepted，0 rejected。

### Required Changes 复查（第 2 轮修复后）

作者按 RC-1..RC-4 修复后，评审者仅复查这 4 项（其余工件未改动，裁决按 STALENESS 规则保持有效）：

- RC-1 → accepted by reviewer。spec 行 139 新增首条规则覆盖全部五个数值字段的非数值与负值；total 规则删去"不是数值"分支；行 142 括注改为聚合钳位与静默少计机制；新增"负 cache_read 的行被跳过"场景（fixture 恰好演示旧规则的漏洞行）；proposal 行 13 与 design D6 的五字段列举与理由同步，D6 引用 `aggregator.rs:398-415`。不变量"不得产出负值"至此被规则清单完整闭合。
- RC-2 → accepted by reviewer。GIVEN 改为"第 N 帧的累计校验和与链不符（自第 N 帧起链断裂）"，与 THEN"第 N 帧及之后不生效"及 Requirement"只合并中断点之前的已提交帧"三者一致。
- RC-3 → accepted by reviewer。D3 改为解析闭包直接打 stderr，明确闭包只在指纹未命中时执行（缓存命中天然不重发），与 D9 通用装载器一致；删除 CachedParseOutcome 扩展句并写明其不适用的两条原因；新增先例声明"pricing 的 `degrade_source`"经核实属实（`pricing/mod.rs:435`，`eprintln!` 在 444）。
- RC-4 → accepted by reviewer。D2 写死落点为 trae_db.rs 内自写 fail-alive 探测，写明 kill(pid,0) 的 ESRCH/EPERM 语义（与 process_liveness 的 fail-alive 策略一致）与 Windows `OpenProcess` 路径；proposal Impact 的 trae_db.rs 条目同步注明。残留一处表面措辞：design Risks 行 102 仍写"基于 `process_liveness` 的启动清扫"，未同步为"同策略自写探测"；D2 作为权威决定已消除歧义，该残留不阻断。

结论：4 项 Required Changes 全部应用且自洽，CHANGES_APPLIED 改为 yes。Verdict 维持 APPROVE_WITH_CHANGES。
