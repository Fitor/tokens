## 1. 非 ASCII 输入的 panic 修复（主行为）

- [x] 1.1 Write failing test: test-plan 前 4 行（`multibyte_cn_model_id_does_not_panic`、`multibyte_emoji_model_id_does_not_panic`、`multibyte_boundary_aligned_non_digit_suffix_kept`、`multibyte_short_name_kept_verbatim`），加注释说明与 prefix `OnceLock` 配置态无关；运行 `cargo test -p tokens-core --test model_normalization multibyte`，确认前 3 个在修复前因 panic 失败（失败原因即 panic，非断言不等）
- [x] 1.2 Implement: 按 design 决定 1 重写 `normalize_syntactic` 日期后缀分支——先按字节校验 `as_bytes()[len-9] == b'-'` 且末 8 字节全 `is_ascii_digit`，通过才 `name.truncate(name.len() - 9)`；再补第 5 行用例 `multibyte_name_with_dated_suffix_strips_date` 并确认 1.1 全部转绿
- [x] 1.3 Refactor: 检查分支可读性；`cargo test -p tokens-core` 全量绿

## 2. ASCII 行为不变性守门（回归）

- [x] 2.1 Write failing test: test-plan 后 3 行（`ascii_regression_gateway_prefix_case`、`ascii_regression_claude_dated_dot_rewrite`、`ascii_non_date_suffix_kept`），在 1.2 实现前运行应全绿（这些是守门用例；若实现后变红说明破坏了 ASCII 行为）
- [x] 2.2 Implement: 无新增实现；确认 1.2 的改动使 2.1 三例保持绿（`GATEWAY-A/GPT-5.4-20261001(HIGH)` → `gpt-5.4`，`claude-opus-4.6-20260101` → `claude-opus-4-6`，`gpt-5.4-high` 原样）
- [x] 2.3 Refactor; full suite stays green: `cargo test -p tokens-core` 全量再跑一次

## 3. 收尾与验证

- [x] 3.1 更新 test-plan.md 台账：8 行全部翻 🟢 green
- [x] 3.2 运行 `openspec status --change fix-multibyte-model-id-panic` 确认工件齐备，填写 verify.md
