//! TRAE CN participates in submit aggregation beside the international client.

use tokens_core::{aggregate_by_date, ClientId, TokenBreakdown, UnifiedMessage};

fn message(client: &str, input: i64) -> UnifiedMessage {
    UnifiedMessage::new(
        client,
        "glm-5.2",
        "zai",
        "shared-session",
        1_736_510_400_000,
        TokenBreakdown {
            input,
            output: 1,
            ..Default::default()
        },
        0.0,
    )
}

#[test]
fn test_submit_default_includes_trae_cn() {
    assert!(ClientId::TraeCn.submit_default());
    assert_eq!(ClientId::from_str("trae-cn"), Some(ClientId::TraeCn));
    assert!(ClientId::iter().any(|client| client == ClientId::TraeCn));
    // The international client keeps its own opt-out.
    assert!(!ClientId::Trae.submit_default());
}

#[test]
fn test_trae_and_trae_cn_coexist() {
    let daily = aggregate_by_date(vec![message("trae", 10), message("trae-cn", 20)]);
    assert_eq!(daily.len(), 1);

    let mut clients: Vec<&str> = daily[0]
        .clients
        .iter()
        .map(|client| client.client.as_str())
        .collect();
    clients.sort_unstable();
    assert_eq!(clients, vec!["trae", "trae-cn"]);
    assert_eq!(
        daily[0].token_breakdown.input, 30,
        "both clients contribute to the same day without overwriting each other"
    );
}
