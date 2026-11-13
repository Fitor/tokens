# Tasks: trae-cn-local-scan

依赖顺序排列。每个场景的红灯测试以 test-plan.md 的行为准；实现引用 design.md 的 D1–D11。

## 1. 解密模块骨架（`trae_db.rs` + fixture 构造器）

- [ ] 1.1 在 `cli/tokens-core/Cargo.toml` 新增 `hmac`、`pbkdf2` 依赖；创建 `trae_db.rs` 模块骨架（SQLCipher 参数文档注释作为权威规格，含 D11 的 WAL 算法规格）。
- [ ] 1.2 实现合成加密 fixture 构造器（测试模块内）：按 D1 参数加密合成页（含最小 `chat_turn` schema 的明文页）、构造 WAL 帧（已提交/链断裂/salt 不匹配/仅未提交/坏页/截断尾页六类）。
- [ ] 1.3 Write failing test: `test_snapshot_decrypts_db_with_committed_wal`（断言先因函数缺失/返回错误失败，即红灯）。
- [ ] 1.4 Implement: 页解密（salt XOR `0x3a`、PBKDF2-HMAC-SHA512 2 轮、AES-256-CBC、页 HMAC 校验、页 1 头回写）使 1.3 转绿。
- [ ] 1.5 Refactor；全套测试保持绿。

## 2. WAL 合并与快照边界

- [ ] 2.1 Write failing tests: `test_snapshot_wal_chain_break_takes_prefix`、`test_snapshot_wal_salt_mismatch_uses_main`、`test_snapshot_wal_uncommitted_only_ignored`、`test_snapshot_truncated_tail_page_count`、`test_snapshot_stat_retry_exhausted_skips_db`、`test_snapshot_key_mismatch_skips`。
- [ ] 2.2 Implement: WAL 索引（帧头校验和链、commit 字段、salt 断点三语义）、stat 前哨 + 3 次重试 + 跳过告警、页 1 HMAC 预检、截断尾页处理、`DecryptStats` 返回结构。
- [ ] 2.3 Refactor；全套测试保持绿。

## 3. 坏页容忍与明文快照生命周期

- [ ] 3.1 Write failing tests: `test_bad_page_continues_and_counts`、`test_zeroed_interior_page_skips_db`。
- [ ] 3.2 Implement: 坏页置零 + 计数；查询 `DatabaseCorrupt` → 整库跳过 + 告警；专用临时子目录（`<config_dir>/trae-cn-cache/tmp/`）+ 0600 权限 + pid 文件名 + 基于 fail-alive PID 探测（`trae_db.rs` 内实现，策略同 tokens-cli `process_liveness.rs`）的启动清扫。
- [ ] 3.3 Refactor；全套测试保持绿。

## 4. 发现（`scanner.rs`）

- [ ] 4.1 Write failing tests: `test_discover_trae_cn_dbs_standard_layout`、`test_discover_trae_cn_dbs_env_override`、`test_discover_trae_cn_dbs_collects_all_modules`、`test_discover_trae_cn_dbs_eacces_reported`、`test_discover_trae_cn_dbs_absent_empty`。
- [ ] 4.2 Implement: `ScanResult.trae_cn_dbs` 字段 + 三平台父目录（Windows `%APPDATA%`、macOS `Application Support`、Linux `XDG_CONFIG_HOME`/`~/.config`）+ `TOKENS_TRAE_CN_HOME` 覆盖 + 全模块收集 + EACCES 诊断路径。
- [ ] 4.3 Refactor；全套测试保持绿。

## 5. schema 门禁（`sessions/trae_cn.rs`）

- [ ] 5.1 Write failing tests: `test_schema_gate_passes_isomorphic_db`、`test_schema_gate_missing_column_skips_with_warning`、`test_schema_gate_query_failure_skips`。
- [ ] 5.2 Implement: 7 列最小列集门禁（`context`、`session_id`、`turn_id`、`created_at`、`updated_at`、`turn_status`、`deleted_at`）+ 缺列跳过告警 + 门禁通过但查询失败跳过。
- [ ] 5.3 Refactor；全套测试保持绿。

## 6. 逐 turn 解析与归一化

- [ ] 6.1 Write failing tests: `test_normalize_turn_with_cache_split`、`test_skip_total_mismatch_row`、`test_skip_cache_read_exceeds_prompt`、`test_skip_reasoning_exceeds_completion`、`test_skip_negative_cache_read`、`test_strip_dev_suffix`、`test_skip_timestamp_overflow`、`test_session_title_stays_none`。
- [ ] 6.2 Implement: 行过滤（completed、deleted_at<=0）、五字段非数值/负值跳行、total 对账、`input = prompt - cache_read`、reasoning 拆分、模型名清洗（剥 `__`、小写、`trae-unknown`、256 字节上限）、`created_at` 秒转毫秒（`checked_mul`）、`session_title = None`、跳过计数。
- [ ] 6.3 Refactor；全套测试保持绿。

## 7. 逐 turn 去重

- [ ] 7.1 Write failing tests: `test_dedupe_keeps_all_turns_in_session`、`test_dedupe_same_turn_latest_updated_at_wins`。
- [ ] 7.2 Implement: `dedupe_trae_cn_turns`（key = `turn_id`，保留 `updated_at` 最大者；不复用 `dedupe_latest_trae_messages`）。
- [ ] 7.3 Refactor；全套测试保持绿。

## 8. 成本归属

- [ ] 8.1 Write failing tests: `test_deepseek_v4_flash_first_party_resolves`、`test_doubao_model_maps_to_volcengine_hint`、`test_archive_volcengine_doubao_beats_reseller`、`test_unpriced_trae_cn_model_marks_incomplete_date`。
- [ ] 8.2 Implement: CN 解析器侧模型家族 → provider 提示映射（glm→zai、kimi→moonshotai、deepseek→deepseek、minimax→minimax、doubao→volcengine）；`build_archive_overrides()` 增 5 行 `<provider>/<model>` key（`deepseek/deepseek-v4.1-flash`、`volcengine/doubao-seed-2-1-turbo`、`moonshotai/kimi-k2.6`、`moonshotai/kimi-k2.7-code`、`minimax/minimax-m2.7`），带价目页引注与验证日期；`apply_pricing_if_available` 接线（`Estimated`）。
- [ ] 8.3 Refactor；全套测试保持绿。

## 9. 客户端注册与管线接入

- [ ] 9.1 Write failing tests: `test_trae_clientdef_fields_unchanged`（硬编码 `trae` 七字段现值）、`test_submit_default_includes_trae_cn`、`test_trae_and_trae_cn_coexist`；更新 `clients.rs` 既有 `COUNT == 54` 断言为 55（注册新变体的伴随修改，非冻结文件）。
- [ ] 9.2 Implement: `ClientId::TraeCn = 54` + `ClientDef{id:"trae-cn", submit_default:true}` + `ClientFilter` 变体 + `sessions/mod.rs` 导出 + `message_cache.rs` parser 版本表加臂；`lib.rs` 两条流程各加 trae-cn lane（collect 流 + ParsedMessage 流），解析走 `load_or_parse_sqlite_source`（CacheIdentity + `check_sqlite_path` 盯原始 db+wal），坏页统计在生成快照的扫描中由解析闭包直接打 stderr。
- [ ] 9.3 Refactor；全套测试保持绿。

## 10. web 白名单（机械校验）

- [ ] 10.1 `web/src/lib/types.ts` 的 `SUPPORTED_CLIENT_TYPES` 加入 `"trae-cn"`；运行机械校验 `grep '"trae-cn"' web/src/lib/types.ts` 确认通过（test-plan N/A 行）。

## 11. 国际版护栏

- [ ] 11.1 运行 `cargo test -p tokens-core trae && cargo test -p tokens-cli trae`（全绿）+ 对 `cli/tokens-cli/src/trae.rs`、`cli/tokens-core/src/sessions/trae.rs` 执行 `git diff --exit-code`（无改动），确认 test-plan"国际版既有测试保持通过"行满足。

## 12. 端到端验证与收尾

- [ ] 12.1 全套测试：`cargo test -p tokens-core -p tokens-cli` 全绿；CI 机械校验（含白名单 grep）通过。
- [ ] 12.2 真机 smoke（不入仓库）：对本机 TRAE CN 安装跑一次完整扫描，核对 turn 数与 demo 实测量级一致（~千级/月）、`trae-cn` 消息进入聚合、stderr 无意外告警；结果记入 verify.md。
- [ ] 12.3 test-plan.md 全部行翻 🟢 green（N/A 行标注机械校验已跑）；运行 `openspec status --change trae-cn-local-scan` 确认规划工件齐备。
