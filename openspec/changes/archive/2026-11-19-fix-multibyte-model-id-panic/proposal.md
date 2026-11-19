## Why

`tokens submit` 在扫描到 model_id 含多字节字符（如中文）的会话时直接 panic。崩溃点是 `cli/tokens-core/src/lib.rs` 第 143 行：`normalize_syntactic()` 在剥离尾部 `-YYYYMMDD` 日期时，用字节偏移 `name.len() - 8` 切片字符串。当该偏移落在多字节字符中间（实测一个含「正」的 model_id，字节 16..19），切片不是字符边界，Rust 运行时 panic，整个提交流程终止。纯 ASCII 的 model_id 不受影响，所以只在个别机器（如报告的 Windows 1.0.5 环境）复现。

## What Changes

- 修改 `normalize_syntactic()` 中的日期后缀剥离逻辑：先按字节检查尾部 8 个字节是否全为 ASCII 数字、且第 9 个字节是否为 `-`，检查通过后才切片。条件不满足时不切片，多字节输入自然被排除。
- 对纯 ASCII 输入的行为完全不变：现有日期剥离、大小写、前缀、`(reasoning-tier)`、claude `.`→`-` 等归一化结果一律保持。
- 新增回归测试：含中文的 model_id 走 `canonical_model_id` / `normalize_model_for_grouping` 不 panic，且原名保留（不做日期剥离）。
- 不改任何归一化规则本身，不引入新依赖，不改对外 API。

## Capabilities

### New Capabilities
- `model-id-normalization`: model_id 的本地归一化规则，含对非 ASCII 输入的安全性要求（不 panic、行为可预期）。

### Modified Capabilities

（无。`openspec/specs/` 现有 cli-install、email-transport、team-invitation-inbox、trae-cn-local-scan 均不覆盖 model_id 归一化。）

## Impact

- 受影响代码：`cli/tokens-core/src/lib.rs` 中 `normalize_syntactic()` 的日期后缀分支（第 142–149 行）。调用方 `canonical_model_id`、`normalize_model_for_grouping`、`model_alias` 均经由该函数，修复自动覆盖全部路径。
- 受影响测试：`cli/tokens-core/tests/model_normalization.rs` 追加非 ASCII 回归用例。
- 不影响 API、schema、依赖与上传格式。修复后，之前因此 panic 无法提交的会话数据可正常聚合上传。
