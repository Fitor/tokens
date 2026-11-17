# Test Plan: trae-cn-local-scan

<!-- LIVE LEDGER：apply 阶段每行 🔴 red → 🟢 green；verify 审计无 red 残留。 -->

| Requirement | Scenario | Test File | Test Name | Initial State |
|-------------|----------|-----------|-----------|---------------|
| specs/trae-cn-local-scan/spec.md → 发现本地 TRAE CN 数据库 | macOS 标准安装被发现 | cli/tokens-core/src/scanner.rs (tests) | test_discover_trae_cn_dbs_standard_layout | 🟢 green |
| specs/trae-cn-local-scan/spec.md → 发现本地 TRAE CN 数据库 | 环境变量覆盖扫描根目录 | cli/tokens-core/src/scanner.rs (tests) | test_discover_trae_cn_dbs_env_override | 🟢 green |
| specs/trae-cn-local-scan/spec.md → 发现本地 TRAE CN 数据库 | 同一根下两个模块 DB 都被收集 | cli/tokens-core/src/scanner.rs (tests) | test_discover_trae_cn_dbs_collects_all_modules | 🟢 green |
| specs/trae-cn-local-scan/spec.md → 发现本地 TRAE CN 数据库 | 无权限目录不被静默丢弃 | cli/tokens-core/src/scanner.rs (tests) | test_discover_trae_cn_dbs_eacces_reported | 🟢 green |
| specs/trae-cn-local-scan/spec.md → 发现本地 TRAE CN 数据库 | 未安装时 lane 为空 | cli/tokens-core/src/scanner.rs (tests) | test_discover_trae_cn_dbs_absent_empty | 🟢 green |
| specs/trae-cn-local-scan/spec.md → 解密快照 | 加密库解密并产出可查询快照 | cli/tokens-core/src/trae_db.rs (tests) | test_snapshot_decrypts_db_with_committed_wal | 🟢 green |
| specs/trae-cn-local-scan/spec.md → 解密快照 | WAL 校验和链中断只取中断点之前 | cli/tokens-core/src/trae_db.rs (tests) | test_snapshot_wal_chain_break_takes_prefix | 🟢 green |
| specs/trae-cn-local-scan/spec.md → 解密快照 | WAL 帧 salt 与 WAL 头不一致的残留帧不生效 | cli/tokens-core/src/trae_db.rs (tests) | test_snapshot_wal_stale_frame_salt_takes_valid_prefix | 🟢 green |
| specs/trae-cn-local-scan/spec.md → 解密快照 | WAL salt 与主库 salt 不同仍正常合并 | cli/tokens-core/src/trae_db.rs (tests) | test_snapshot_wal_merges_despite_main_db_salt_difference | 🟢 green |
| specs/trae-cn-local-scan/spec.md → 解密快照 | 只有未提交帧的 WAL 不生效 | cli/tokens-core/src/trae_db.rs (tests) | test_snapshot_wal_uncommitted_only_ignored | 🟢 green |
| specs/trae-cn-local-scan/spec.md → 解密快照 | 源文件持续变化时跳过并告警 | cli/tokens-core/src/trae_db.rs (tests) | test_snapshot_stat_retry_exhausted_skips_db | 🟢 green |
| specs/trae-cn-local-scan/spec.md → 解密快照 | 密钥不匹配时跳过该 DB | cli/tokens-core/src/trae_db.rs (tests) | test_snapshot_key_mismatch_skips | 🟢 green |
| specs/trae-cn-local-scan/spec.md → 解密快照 | 截断尾页 | cli/tokens-core/src/trae_db.rs (tests) | test_snapshot_truncated_tail_page_count | 🟢 green |
| specs/trae-cn-local-scan/spec.md → 解密快照 | 已知答案：官方向量可解密且页 HMAC 通过、IV 篡改触发失败 | cli/tokens-core/src/trae_db.rs (tests) | test_kat_official_vector_decrypts_and_hmac_passes | 🟢 green |
| specs/trae-cn-local-scan/spec.md → 坏页容忍与可见性 | 单个坏页不阻断扫描且计数可见 | cli/tokens-core/src/trae_db.rs (tests) | test_bad_page_continues_and_counts | 🟢 green |
| specs/trae-cn-local-scan/spec.md → 坏页容忍与可见性 | 缓存命中扫描不重发坏页计数 | cli/tokens-core/src/lib.rs (tests) | test_cache_hit_does_not_reemit_bad_page_diag | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 坏页容忍与可见性 | 置零导致查询失败时跳过该 DB | cli/tokens-core/src/trae_db.rs (tests) | test_zeroed_interior_page_skips_db | 🟢 green |
| specs/trae-cn-local-scan/spec.md → schema 门禁 | 同构 DB 正常解析 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_schema_gate_passes_isomorphic_db | 🟢 green |
| specs/trae-cn-local-scan/spec.md → schema 门禁 | 缺列 DB 被跳过且告警 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_schema_gate_missing_column_skips_with_warning | 🟢 green |
| specs/trae-cn-local-scan/spec.md → schema 门禁 | 门禁通过但查询失败时跳过 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_schema_gate_query_failure_skips | 🟢 green |
| specs/trae-cn-local-scan/spec.md → 逐 turn 解析与归一化 | 含缓存拆分的 turn 正确归一化 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_normalize_turn_with_cache_split | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 逐 turn 解析与归一化 | total 对账失败的行被跳过 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_skip_total_mismatch_row | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 逐 turn 解析与归一化 | cacheRead 超过 prompt 的行被跳过 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_skip_cache_read_exceeds_prompt | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 逐 turn 解析与归一化 | reasoning 超过 completion 的行被跳过 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_skip_reasoning_exceeds_completion | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 逐 turn 解析与归一化 | 负 cache_read 的行被跳过 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_skip_negative_cache_read | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 逐 turn 解析与归一化 | dev 后缀剥离 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_strip_dev_suffix | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 逐 turn 解析与归一化 | 时间戳溢出的行被跳过 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_skip_timestamp_overflow | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 逐 turn 解析与归一化 | session_title 保持为空 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_session_title_stays_none | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 逐 turn 解析与归一化 | turn_id 缺失的行被跳过 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_skip_missing_turn_id | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 逐 turn 去重 | 同一 session 的多个 turn 全部保留 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_dedupe_keeps_all_turns_in_session | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 逐 turn 去重 | 同一 turn 重复出现时取最新 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_dedupe_same_turn_latest_updated_at_wins | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 逐 turn 去重 | 同一 session 两个不同 turn 其余字段全部相同仍保留两条 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_dedupe_keeps_distinct_turns_with_identical_fields | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 逐 turn 去重 | updated_at 并列时裁决与顺序无关 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_dedupe_updated_at_tie_break_deterministic | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 逐 turn 去重 | updated_at 为 NULL 的行照常产出 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_dedupe_missing_updated_at_still_emitted | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 逐 turn 去重 | 缓存序列化往返保留 turn 身份与更新时间 | cli/tokens-core/src/message_cache.rs (tests) | test_cache_roundtrip_preserves_turn_identity_and_updated_at | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 消息缓存格式升级兼容 | 旧格式 shard 升级保留消息与元数据 | cli/tokens-core/src/message_cache.rs (tests) | test_v9_shard_upgrade_preserves_messages_and_metadata | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 消息缓存格式升级兼容 | 缓存独有历史升级后保留 | cli/tokens-core/src/message_cache.rs (tests) | test_upgrade_preserves_claude_cache_only_history | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 消息缓存格式升级兼容 | fork-5/V7/V8 按既有语义迁移且谱系门禁不变 | cli/tokens-core/src/message_cache.rs (tests) | test_fork5_v7_v8_migrations_keep_semantics_and_gates | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 消息缓存格式升级兼容 | V4/V6 维持 Stale 且 upstream V5 不作为支持输入 | cli/tokens-core/src/message_cache.rs (tests) | test_v4_v6_stale_guard_and_upstream_v5_rejected | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 逐 turn 去重 | 跨库重复 turn 在缓存与发现顺序各安排下保留最新且仅计一次 | cli/tokens-core/src/lib.rs (tests) | test_dedupe_cross_db_newest_wins_across_cache_and_order | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 逐 turn 去重 | 两条流程合并后均执行去重 | cli/tokens-core/src/lib.rs (tests) | test_dedupe_applies_after_merge_in_both_flows | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 成本归属 | 已覆盖模型直接命中上游数据集 | cli/tokens-core/src/pricing/mod.rs (tests) | test_deepseek_v4_flash_first_party_resolves | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 成本归属 | doubao 模型映射到 volcengine 提示 | cli/tokens-core/src/sessions/trae_cn.rs (tests) | test_doubao_model_maps_to_volcengine_hint | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 成本归属 | Archive 费率对转售商行保持优先 | cli/tokens-core/src/pricing/mod.rs (tests) | test_archive_volcengine_doubao_beats_reseller | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 成本归属 | 无法定价的模型不谎报成本 | cli/tokens-core/src/lib.rs (tests) | test_unpriced_trae_cn_model_marks_incomplete_date | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 客户端注册与上报 | 默认提交包含 trae-cn | cli/tokens-core/tests/trae_cn_submit.rs | test_submit_default_includes_trae_cn | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 客户端注册与上报 | 服务端白名单接受新客户端 | web/src/lib/types.ts（CI 机械校验：`grep '"trae-cn"' web/src/lib/types.ts`） | supported-client-types-contains-trae-cn | N/A — non-executable |
| specs/trae-cn-local-scan/spec.md → 国际版集成不变 | 国际版既有测试保持通过 | cli（`cargo test -p tokens-core trae && cargo test -p tokens-cli trae` + `git diff --exit-code` on 两个冻结文件） | existing_trae_suite_green_and_unmodified | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 国际版集成不变 | 国际版 ClientDef 条目逐字段不变 | cli/tokens-core/src/clients.rs (tests) | test_trae_clientdef_fields_unchanged | 🔴 red |
| specs/trae-cn-local-scan/spec.md → 国际版集成不变 | 两个客户端数据并存 | cli/tokens-core/tests/trae_cn_submit.rs | test_trae_and_trae_cn_coexist | 🔴 red |

## Coverage Notes

- 解密快照、坏页两组共 12 个测试，其中 11 个依赖**合成加密 fixture 构造器**（按 D1 参数加密合成页、构造 WAL：已提交/链断裂/帧 salt 与 WAL 头 salt 不匹配的前缀+残留帧/仅未提交/坏页/截断尾页）；`test_kat_official_vector_decrypts_and_hmac_passes` 独立于该构造器。构造器是 `trae_db.rs` 测试模块的共享工具，先于组内测试实现（tasks 组 1 首项）。合成 WAL 的头/帧 salt 独立生成，**不得**人为与主库页 1 salt 相等。
- KAT 向量由官方 SQLCipher 实现生成（无用户数据，二进制 fixture 入仓库，附版本与参数记录），与合成构造器不同源；同时断言 IV 篡改触发页 HMAC 失败。该测试防住构造器与解密器同源互逆的系统性错误（R3-P1-2）。
- 去重跨库/缓存测试（test_dedupe_cross_db_newest_wins_across_cache_and_order）以两个合成 DB 为源，走 `load_or_parse_sqlite_source` 真实缓存装载路径（lib.rs），参数化五种安排：全冷、一冷一热（新版本在缓存命中侧）、一冷一热（新版本在冷扫描侧）、全热、发现顺序互换；缓存路径复用 message_cache 测试的临时目录与 CacheIdentity 重定向先例。缓存往返测试（test_cache_roundtrip_preserves_turn_identity_and_updated_at）断言缓存序列化/反序列化后 `turn_id`、`updated_at_ms` 与解析原始输出逐字段一致。两条流程合并后去重由 test_dedupe_applies_after_merge_in_both_flows 在 collect 流与 ParsedMessage 流分别核对，不以手工构造向量替代。并列、NULL 与"其余字段全同的两个 turn"场景直接构造携带解析产出 `turn_id` 的消息向量调用 `dedupe_trae_cn_turns`（与缓存路径同构）。
- "无权限目录"测试用 chmod 000 模拟 EACCES（macOS/Linux）；Windows CI 上跳过该断言的 root 部分只校验诊断路径。
- "源文件持续变化"测试通过在 stat 前哨之间用后台线程改写 mtime/size 模拟。
- 缓存命中测试（test_cache_hit_does_not_reemit_bad_page_diag）复用 message_cache 测试的临时目录与 CacheIdentity 重定向模式（`lib.rs` 既有 sqlite lane 测试先例）。
- `test_submit_default_includes_trae_cn` 与 `test_trae_and_trae_cn_coexist` 走既有聚合器构造路径（fixtures 目录模式同 `tests/common`）。
- 白名单机械校验挂入 CI 脚本（与 web lint 同层执行）；该场景无 Rust 测试面，理由：`SUPPORTED_CLIENT_TYPES` 是 TS 常量数组，仓库 web 侧无 vitest/jest 测试设施。
- 缓存升级测试（组内四个 upgrade/migration 测试）的旧格式 fixture 按 R6-RC-1 矩阵用对应冻结 wire 类型序列化生成真实旧格式二进制 shard，不得用新结构自行构造冒充：fork-5 用 fork-5 布局类型（`ForkCachedSourceEntryV5` 形状）、V7/V8 用对应 legacy 类型、V9 用本次冻结类型；V4/V6 断言 Stale 护栏（不进入 Invalid），upstream V5 布局断言不被当作支持输入解释；旧 Claude 条目断言既有一次 provenance 重建、缓存独有历史不丢、重建后热读；非 Claude 且 parser 身份有效的条目断言保持热。不为满足过宽断言修改既有谱系或 namespace 门禁。CN 新格式往返与冷/热去重集成验收继续保留。
- 国际版"既有测试保持通过"的可执行形态：跑 trae 相关既有测试 + 对 `cli/tokens-cli/src/trae.rs`、`cli/tokens-core/src/sessions/trae.rs` 做 `git diff --exit-code`。两者任一失败即该行不绿。
