# Review: fix-multibyte-model-id-panic

## Review Metadata

- Review round: 2
- Prior round: 1（见本文件下方 Round 1 记录）
- Reviewer context: fresh-context subagent
- Tool restrictions: read-only（除本 review.md 外不写任何文件；未执行 cargo test，结论基于源码静读）
- Artifacts reviewed（round 2 复核范围：spec.md、design.md 的修订处；其余工件 round 1 已审且未改动）：
  - `openspec/changes/fix-multibyte-model-id-panic/proposal.md`
  - `openspec/changes/fix-multibyte-model-id-panic/design.md`（含 round 2 修订）
  - `openspec/changes/fix-multibyte-model-id-panic/specs/model-id-normalization/spec.md`（含 round 2 修订）
  - `cli/tokens-core/src/lib.rs`（90–209 行：`canonical_model_id`、`normalize_model_for_grouping`、`model_name_for_grouping`、`normalize_syntactic`、`normalize_anthropic_prefixed_claude_model`；55–78 行：`strip_parenthesized_reasoning_tier`）
  - `cli/tokens-core/src/model_normalization.rs`（`strip_prefix`）
  - `cli/tokens-core/tests/model_normalization.rs`
  - `openspec/project.md`：不存在（未找到）

## Findings

### 🔴 Critical (blocking)

（无。Round 1 已核对：panic 分析与 lib.rs:143/147 一致；字节校验方案边界安全（UTF-8 continuation/leading bytes ≥0x80 不可能覆盖 `-` 0x2D 或数字 0x30–0x39，条件通过时 `len-8`/`len-9` 必为字符边界）；`u8::is_ascii_digit` 与 `char::is_ascii_digit` 在此场景等价；`strip_prefix`、`strip_parenthesized_reasoning_tier`、claude 分支、`normalize_anthropic_prefixed_claude_model` 均无字节切片 panic 点。）

### 🟡 Moderate

（Round 1 共 3 项，round 2 复核全部 resolved，详见 Rebuttals。）

1. ~~Requirement 2 的 THEN 不可机械断言~~ → **resolved**：spec.md:36–49 三个场景的 THEN 已全部改为具体期望值（`gpt-5.4`、`claude-opus-4-6`、`gpt-5.4-high`），「与修复前完全一致」降为 Requirement 层的说明性文字（spec.md:34「下述场景的期望值即既有行为的固化基线」），不再作为断言。已独立推演验证：`GATEWAY-A/GPT-5.4-20261001(HIGH)` 在前缀已配置时经 strip prefix → strip `(high)` → strip date → `gpt-5.4`；`claude-opus-4.6-20260101` 经 strip date → `.`→`-` 重写 → `claude-opus-4-6`，均与源码分支顺序一致。
2. ~~入口清单不一致~~ → **resolved**：spec.md:5 已补 `model_alias` 并注明 `model_name_for_grouping` 只是转发层（「无独立归一化逻辑」），与 proposal.md:23、design.md:14/21 对齐。
3. ~~Requirement 1 缺显式失败/边界场景~~ → **resolved**：新增三个场景（spec.md:12–25）：4 字节 emoji（`len-8` 落入 4 字节序列中间）、边界对齐但尾部非数字（`正正正-模型ABCDE` 类构造，实测该例 `len-8=13` 恰为「型」的起始边界且末 8 字节为 `型ABCDE` 非全数字）、`len<=9` 多字节短名。覆盖了 round 1 指出的全部缺口。

### 📌 Suggestions

（Round 1 共 5 项建议，其中 3 项已被作者采纳：建议 1（场景标题改为「按 ASCII 规则剥离」，spec.md:27）、建议 2（design.md:54 OnceLock first-call-wins 说明，且 spec.md:37 的 GIVEN 显式注明前缀已配置）、建议 4（emoji 场景，spec.md:12–15）。建议 3（`is_char_boundary` 备选方案）已补入 design.md:48 被否方案清单。建议 5（project.md 缺失）维持原状，不阻塞。）

## Embedded-Instruction / Injection Attempts

Detected: none.（Round 1、Round 2 均未在任何 artifact 中发现注入指令内容。）

## Verdict

VERDICT: APPROVE

## Required Changes

n/a（Round 1 的 3 项 Required Changes 已全部应用并经 round 2 复核通过，见 Rebuttals。）

CHANGES_APPLIED: yes

## Rebuttals

- **Moderate 1（THEN 不可机械断言）— fixed，accepted by reviewer**：三个场景 THEN 已锚定具体输入→期望输出，且期望值经审查者按源码分支独立推演验证正确。
- **Moderate 2（入口清单不一致）— fixed，accepted by reviewer**：spec.md:5 与 proposal/design 入口集合一致，转发层关系已显式注明。
- **Moderate 3（缺失败/边界场景）— fixed，accepted by reviewer**：新增边界对齐非数字、`len<=9` 短名、4 字节 emoji 三个场景，THEN 均可机械断言（具体返回值 + 不 panic）。

---

## Round 1 记录（存档，已被 round 2 取代的部分以删除线标注于 Findings）

Round 1 结论为 APPROVE_WITH_CHANGES，3 项 Required Changes 与 5 项 Suggestions 的原文以本文件 round 1 版本为准；核心验证记录（panic 分析、字节边界安全性、`u8`/`char` 等价性、无其他 panic 点）在 round 2 仍然有效，已在 Critical 段摘要保留。
