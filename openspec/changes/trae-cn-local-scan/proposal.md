# 提案：trae-cn 本地扫描

## Why

CLI 目前只支持国际版 Trae：`tokens trae sync` 通过 vendor API 拉取用量。国内版（Trae CN、TRAE SOLO CN）没有数据通路，用户在国内版客户端产生的全部用量不可见。

国内版的逐 turn 用量记录在本地加密 SQLite 数据库（SQLCipher 4）中。可行性验证已完成：共享应用密钥可解密真实数据库；6 个月 6,788 个 turn 的实测数据显示 cacheRead 记录完整（占 prompt 的 88.1%）。没有缓存拆分时，成本估算虚高约 4–5 倍。本地扫描不需要任何凭据。

## What Changes

- 新增 `trae-cn` 客户端。CLI 解密并快照本地 TRAE CN 安装的 `database.db`，读取 `chat_turn` 表，把逐 turn 用量转成 `UnifiedMessage`。
- 新增 SQLCipher 页解密与 WAL 快照模块（纯 Rust：aes、cbc、hmac、pbkdf2、sha2）。
- 归一化遵循 session-parsers 文档的 cache-inclusiveness 规则：`input = prompt_tokens - cache_read_input_tokens`。逐 turn 校验规则：`total_tokens = prompt + completion`，`cacheRead <= prompt`，`reasoning <= completion`，五个 token 字段任一非数值或为负。违反任一规则的行跳过并计数，不产出猜测值或负值（负桶会在提交前被聚合层钳位为 0，变成静默少计；跳行让异常显式可数，服务端非负校验是第二道防线）。
- `trae-cn` 的 `submit_default` 为 `true`（用户已确认）。
- 新增 5 条 Tokens Archive 第一方费率：`deepseek-v4.1-flash`、`doubao-seed-2-1-turbo`、`kimi-k2.6`、`kimi-k2.7-code`、`minimax-m2.7`。每条带来源引注。`glm-5.2`、`deepseek-v4-flash`、`minimax-m3` 已有覆盖。
- 服务端客户端白名单（`web/src/lib/types.ts`）增加 `"trae-cn"`。该文件与 CLI 在同一 change 中修改。
- 三平台发现路径（Windows `%APPDATA%`、macOS `Application Support`、Linux `XDG_CONFIG_HOME` 或 `~/.config`），支持环境变量覆盖。设计沿用 TokenTracker 的已验证实现。
- 发现范围包含 `ai-agent` 与 `ai-chat` 两个模块目录。每个 DB 先做 schema 门禁，不满足的 DB 跳过并输出警告。
- 坏页容忍：HMAC 校验失败的页置零并继续。坏页数出现在扫描输出中。
- 国际版 Trae 的 API 集成不做任何改动。

## Capabilities

### New Capabilities

- `trae-cn-local-scan`：从本地 TRAE CN 安装的加密数据库扫描逐 turn token 用量，产出带缓存拆分的统一消息，并用既有定价服务估算成本。

### Modified Capabilities

（无。现有 specs 未覆盖 Trae 或定价。）

## Impact

- `cli/tokens-core`：`scanner.rs`（发现 `trae_cn_dbs`）、`clients.rs`（`ClientId::TraeCn`）、`lib.rs`（两条流程各加 lane）、`sessions/trae_cn.rs`（新）、`trae_db.rs`（新，含 fail-alive PID 探测，与 tokens-cli 的 `process_liveness.rs` 同策略）、`sessions/mod.rs`（导出新模块；`UnifiedMessage` 新增 `#[serde(default)] turn_id: Option<String>` 与 `#[serde(default)] updated_at_ms: Option<i64>` 去重元数据字段（turn 身份与更新时间随消息缓存持久化，缓存命中与冷扫描在合并点的比较基础一致），其他客户端恒为 `None`，旧缓存条目经缓存格式升级迁移保留）、`message_cache.rs`（每客户端 parser 版本表加臂；`CACHE_FORMAT_VERSION` 9→10 升级与冻结 V9 wire 迁移，见 design D7）、`pricing/mod.rs`（Archive 行）、`Cargo.toml`（新增 hmac、pbkdf2）。
- `cli/tokens-cli`：`main.rs`（`ClientFilter` 变体）。
- `web/src/lib/types.ts`：`SUPPORTED_CLIENT_TYPES`。
- 已知风险：`lib.rs` 现有 `dedupe_latest_trae_messages` 按 session 保留最新一行，语义是"session 级累计快照"。CN 行是 turn 级增量，复用它会把一个 session 折叠成一行，导致大量少计。CN lane 必须用按 `turn_id` 的独立去重。
