use tokens_core::{
    aggregate_by_date, canonical_model_id, normalize_model_for_grouping, TokenBreakdown,
    UnifiedMessage,
};

fn configure_prefixes() {
    tokens_core::model_normalization::set_prefixes_to_strip(&[
        "GATEWAY-A/".into(),
        "gateway-b/".into(),
        "gateway-a/team/".into(),
    ]);
}

#[test]
fn configured_prefixes_apply_to_any_model_family() {
    configure_prefixes();

    assert_eq!(canonical_model_id("gateway-a/gpt-5.4"), "gpt-5.4");
    assert_eq!(
        canonical_model_id("gateway-b/claude-opus-4-6"),
        "claude-opus-4-6"
    );
    assert_eq!(normalize_model_for_grouping("gateway-a/gpt-5.4"), "gpt-5.4");
}

#[test]
fn prefix_removal_keeps_existing_case_and_suffix_normalization() {
    configure_prefixes();

    assert_eq!(
        canonical_model_id("GATEWAY-A/GPT-5.4-20261001(HIGH)"),
        "gpt-5.4"
    );
    assert_eq!(
        canonical_model_id("gateway-b/anthropic/claude-4-6-opus"),
        "claude-opus-4-6"
    );
}

#[test]
fn unconfigured_namespaces_and_partial_matches_remain_distinct() {
    configure_prefixes();

    assert_eq!(canonical_model_id("Qwen/Qwen3"), "qwen/qwen3");
    assert_eq!(
        canonical_model_id("meta-llama/Llama-4"),
        "meta-llama/llama-4"
    );
    assert_eq!(
        canonical_model_id("gateway-a-other/gpt-5.4"),
        "gateway-a-other/gpt-5.4"
    );
    assert_eq!(
        canonical_model_id("other/gateway-a/gpt-5.4"),
        "other/gateway-a/gpt-5.4"
    );
    assert_eq!(canonical_model_id("gateway-a/"), "gateway-a/");
}

#[test]
fn the_longest_prefix_is_removed_once() {
    configure_prefixes();

    assert_eq!(canonical_model_id("gateway-a/team/gpt-5.4"), "gpt-5.4");
    assert_eq!(
        canonical_model_id("gateway-a/gateway-b/gpt-5.4"),
        "gateway-b/gpt-5.4"
    );
}

// 多字节（非 ASCII）model_id 回归用例。
//
// `set_prefixes_to_strip` 是 first-call-wins 的进程级 `OnceLock`，本文件的
// 测试并行运行，前缀配置态不可预测。下列输入不含任何已配置前缀形态
// （`GATEWAY-A/`、`gateway-b/`、`gateway-a/team/`），断言不依赖哪个测试先
// 配置前缀：无论前缀配置与否，这些名字都不会被剥前缀。

#[test]
fn multibyte_cn_model_id_does_not_panic() {
    // 「正常模型名Test」小写后 19 字节：正(0..3)常(3..6)模(6..9)型(9..12)名(12..15)test(15..19)。
    // `len - 8 = 11` 落在「型」(9..12) 内部。修复前 `&name[len-8..]` 切片即 panic。
    assert_eq!(canonical_model_id("正常模型名Test"), "正常模型名test");
    assert_eq!(
        normalize_model_for_grouping("正常模型名Test"),
        "正常模型名test"
    );
}

#[test]
fn multibyte_emoji_model_id_does_not_panic() {
    // 「模型🚀Abcde」小写后 15 字节：模(0..3)型(3..6)🚀(6..10)abcde(10..15)。
    // `len - 8 = 7` 落在 4 字节 emoji (6..10) 内部。修复前切片 panic。
    assert_eq!(canonical_model_id("模型🚀Abcde"), "模型🚀abcde");
}

#[test]
fn multibyte_boundary_aligned_non_digit_suffix_kept() {
    // 「正正正-模型ABCDE」小写后 21 字节：`len - 8 = 13` 恰为「型」的起始边界，
    // 末 8 字节为「型abcde」，不全为 ASCII 数字。切片在字符边界上，且不满足
    // 日期条件，因此不剥任何后缀。
    assert_eq!(
        canonical_model_id("正正正-模型ABCDE"),
        "正正正-模型abcde"
    );
}

#[test]
fn multibyte_short_name_kept_verbatim() {
    // 「模型a」7 字节、「模型abc」9 字节，均不满足 `len > 9`，不进入日期分支。
    assert_eq!(canonical_model_id("模型a"), "模型a");
    assert_eq!(canonical_model_id("模型abc"), "模型abc");
}

#[test]
fn multibyte_name_with_dated_suffix_strips_date() {
    // 「模型A-20260101」小写后 16 字节：模(0..3)型(3..6)a(6)-(7)20260101(8..16)。
    // 尾部 8 字节全为 ASCII 数字，第 9 字节为 `-`。与既有 ASCII 规则一致，
    // 剥离 `-20260101` 后返回 `模型a`。
    assert_eq!(canonical_model_id("模型A-20260101"), "模型a");
}

// ASCII 行为不变性守门用例。这些输入在修复前后必须得到同一结果：
// 若实现修复后变红，说明破坏了既有 ASCII 归一化行为。

#[test]
fn ascii_regression_gateway_prefix_case() {
    // 与本文件其他前缀用例相同的配置值。`set_prefixes_to_strip` 是
    // first-call-wins，输入构造不依赖新配置。
    configure_prefixes();
    assert_eq!(
        canonical_model_id("GATEWAY-A/GPT-5.4-20261001(HIGH)"),
        "gpt-5.4"
    );
}

#[test]
fn ascii_regression_claude_dated_dot_rewrite() {
    assert_eq!(
        normalize_model_for_grouping("claude-opus-4.6-20260101"),
        "claude-opus-4-6"
    );
}

#[test]
fn ascii_non_date_suffix_kept() {
    assert_eq!(canonical_model_id("gpt-5.4-high"), "gpt-5.4-high");
}

#[test]
fn daily_submission_merges_routes_without_losing_usage_or_provider_identity() {
    configure_prefixes();
    let messages = vec![
        UnifiedMessage::new(
            "codex",
            "gpt-5.4",
            "native",
            "native-session",
            1_791_072_000_000,
            TokenBreakdown {
                input: 11,
                output: 3,
                cache_read: 5,
                cache_write: 7,
                reasoning: 2,
            },
            0.125,
        ),
        UnifiedMessage::new(
            "codex",
            "gateway-a/gpt-5.4",
            "provider-a",
            "session-a",
            1_791_072_000_000,
            TokenBreakdown {
                input: 19,
                output: 17,
                cache_read: 13,
                cache_write: 23,
                reasoning: 29,
            },
            0.375,
        ),
        UnifiedMessage::new(
            "codex",
            "gateway-b/gpt-5.4",
            "provider-b",
            "session-b",
            1_791_072_000_000,
            TokenBreakdown {
                input: 31,
                output: 37,
                cache_read: 41,
                cache_write: 43,
                reasoning: 47,
            },
            0.25,
        ),
    ];

    let days = aggregate_by_date(messages);

    assert_eq!(days.len(), 1);
    assert_eq!(days[0].totals.tokens, 328);
    assert_eq!(days[0].totals.cost, 0.75);
    assert_eq!(days[0].totals.messages, 3);
    assert_eq!(days[0].clients.len(), 1);
    let model = &days[0].clients[0];
    assert_eq!(model.model_id, "gpt-5.4");
    assert_eq!(model.provider_id, "native, provider-a, provider-b");
    assert_eq!(model.cost, 0.75);
    assert_eq!(model.messages, 3);
    assert_eq!(
        model.tokens,
        TokenBreakdown {
            input: 61,
            output: 57,
            cache_read: 59,
            cache_write: 73,
            reasoning: 78,
        }
    );
}
