# trae_cn 测试向量

本目录保存 `trae_db.rs` 已知答案测试（KAT）使用的二进制测试向量。

## `kat_sqlcipher4.db`

- 生成工具：`sqlcipher` CLI 3.54.1（编译期 SQLCipher 4.20.0 community）。
- 生成日期：2026-11-16。
- 内容：空 schema 加 6 张空表，无任何用户数据，共 11 页 × 4096 字节。
- 密钥形态：原始 32 字节密钥（SQLCipher 的 `x'<hex>'` 形式），值为 TRAE 共享应用密钥 `3605f6691095a993f03d5009c918352ef5be31ae31e8f000212b81ff058da773`。
- 页大小：4096 字节。
- 页加密：AES-256-CBC，无填充，每页 IV 位于页尾保留区。
- 页保留区：80 字节（16 字节 IV + 64 字节 HMAC）。
- 页 HMAC：HMAC-SHA512，输入为 `密文 ‖ IV ‖ 页号（u32 little-endian）`。
- HMAC 密钥：`PBKDF2-HMAC-SHA512(raw key, page1_salt XOR 0x3a, 2 轮, 32 字节)`。

生成命令：

```sh
sqlcipher kat_sqlcipher4.db <<'SQL'
PRAGMA key = "x'3605f6691095a993f03d5009c918352ef5be31ae31e8f000212b81ff058da773'";
PRAGMA page_size = 4096;
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE chat_turn(context TEXT, session_id TEXT, turn_id TEXT, created_at INTEGER, updated_at INTEGER, turn_status TEXT, deleted_at INTEGER);
CREATE TABLE turn_usage(id INTEGER PRIMARY KEY, prompt_tokens INTEGER);
CREATE TABLE session(id TEXT PRIMARY KEY, title TEXT);
CREATE TABLE account(id TEXT PRIMARY KEY);
CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT);
SQL
```

该向量由官方实现生成，因此不依赖本仓库的合成 fixture 构造器。它防住“构造器与解密器同源互逆、双双偏离官方实现”的系统性错误。
