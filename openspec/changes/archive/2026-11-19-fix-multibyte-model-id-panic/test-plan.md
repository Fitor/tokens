## Test Plan

| Requirement | Scenario | Test File | Test Name | Initial State |
|-------------|----------|-----------|-----------|---------------|
| specs/model-id-normalization/spec.md → 非 ASCII model_id 不得导致归一化 panic | 含中文的 model_id 正常归一化 | cli/tokens-core/tests/model_normalization.rs | `multibyte_cn_model_id_does_not_panic` | 🟢 green |
| specs/model-id-normalization/spec.md → 非 ASCII model_id 不得导致归一化 panic | 含 4 字节 emoji 的 model_id 正常归一化 | cli/tokens-core/tests/model_normalization.rs | `multibyte_emoji_model_id_does_not_panic` | 🟢 green |
| specs/model-id-normalization/spec.md → 非 ASCII model_id 不得导致归一化 panic | 边界对齐但尾部非数字的多字节名不剥后缀 | cli/tokens-core/tests/model_normalization.rs | `multibyte_boundary_aligned_non_digit_suffix_kept` | 🟢 green |
| specs/model-id-normalization/spec.md → 非 ASCII model_id 不得导致归一化 panic | 长度不足的多字节短名正常返回 | cli/tokens-core/tests/model_normalization.rs | `multibyte_short_name_kept_verbatim` | 🟢 green |
| specs/model-id-normalization/spec.md → 非 ASCII model_id 不得导致归一化 panic | 结尾为 `-` 加 8 数字的中文名按 ASCII 规则剥离 | cli/tokens-core/tests/model_normalization.rs | `multibyte_name_with_dated_suffix_strips_date` | 🟢 green |
| specs/model-id-normalization/spec.md → ASCII model_id 的归一化结果保持不变 | 既有 ASCII 归一化行为回归 | cli/tokens-core/tests/model_normalization.rs | `ascii_regression_gateway_prefix_case`（依赖既有 `configured_prefixes` 前缀态；输入构造不依赖新配置） | 🟢 green |
| specs/model-id-normalization/spec.md → ASCII model_id 的归一化结果保持不变 | 既有 claude 日期与点号重写行为回归 | cli/tokens-core/tests/model_normalization.rs | `ascii_regression_claude_dated_dot_rewrite` | 🟢 green |
| specs/model-id-normalization/spec.md → ASCII model_id 的归一化结果保持不变 | 尾部非日期的 ASCII 名不剥后缀 | cli/tokens-core/tests/model_normalization.rs | `ascii_non_date_suffix_kept` | 🟢 green |

## Coverage Notes

- 全部用例通过公开 API（`canonical_model_id` / `normalize_model_for_grouping`）断言，不测私有函数，与该文件既有风格一致。
- `set_prefixes_to_strip` 是 first-call-wins 的进程级 `OnceLock`，且测试并行运行：新用例的输入不命中任何已配置前缀（`GATEWAY-A/` 等），断言与 prefix 配置态无关；「既有 ASCII 归一化行为回归」一行复用既有场景值并注明其对前缀态的依赖。测试内以注释说明。
- 前 5 行的 red 状态含义是「修复前运行即 panic（进程崩溃）」，实现修复后翻绿；后 3 行在修复前后均应通过，作为行为不变性的守门回归。
- 实现后运行 `cargo test -p tokens-core`（工作目录 `cli/`）做全量回归；该命令同时覆盖本表之外既有归一化测试。
