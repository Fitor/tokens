//! TRAE CN local database parser.
//!
//! TRAE CN keeps per-turn usage in a SQLCipher database that
//! [`crate::trae_db`] decrypts into a plaintext snapshot. This module gates
//! each snapshot before parsing: the `chat_turn` table must carry the minimal
//! column set, and a probe query must succeed. A database that fails either
//! check is skipped as a whole instead of yielding partial rows.
//!
//! Token usage and the model name live inside the `context` JSON object, so the
//! gate covers exactly the columns the parser reads and nothing more.

use std::path::Path;

use rusqlite::{Connection, OpenFlags};

use super::UnifiedMessage;
use crate::TokenBreakdown;

/// Columns the parser reads from `chat_turn`.
const REQUIRED_COLUMNS: [&str; 7] = [
    "context",
    "session_id",
    "turn_id",
    "created_at",
    "updated_at",
    "turn_status",
    "deleted_at",
];

/// Outcome of the schema gate for one snapshot.
#[derive(Debug)]
pub enum TraeCnDatabase {
    /// The gate passed and the snapshot is open for parsing.
    Ready(Connection),
    /// The whole database must be skipped; the reason is the warning payload.
    Skipped(String),
}

/// Gate one snapshot and return either an open connection or the skip reason.
///
/// The gate runs in three steps: the `chat_turn` table must exist, it must carry
/// all [`REQUIRED_COLUMNS`], and the probe query over those columns must
/// succeed. Any failure skips the database instead of parsing a partial row set.
pub fn gate_and_open(path: &Path) -> TraeCnDatabase {
    let conn = match Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
        Ok(conn) => conn,
        Err(err) => return skipped(path, format!("cannot open snapshot: {err}")),
    };

    let columns = match table_columns(&conn) {
        Ok(Some(columns)) => columns,
        Ok(None) => return skipped(path, "chat_turn table is missing".to_string()),
        Err(err) => {
            return skipped(path, format!("cannot read the chat_turn schema: {err}"));
        }
    };

    let missing: Vec<&str> = REQUIRED_COLUMNS
        .iter()
        .copied()
        .filter(|required| !columns.iter().any(|column| column == required))
        .collect();
    if !missing.is_empty() {
        return skipped(
            path,
            format!("chat_turn is missing column(s): {}", missing.join(", ")),
        );
    }

    if let Err(err) = probe_query(&conn) {
        return skipped(path, format!("chat_turn query failed: {err}"));
    }

    TraeCnDatabase::Ready(conn)
}

fn skipped(path: &Path, reason: String) -> TraeCnDatabase {
    tracing::warn!(
        path = %path.display(),
        reason = %reason,
        "skipping TRAE CN database"
    );
    TraeCnDatabase::Skipped(reason)
}

/// Column names of `chat_turn`, or `None` when the table does not exist.
fn table_columns(conn: &Connection) -> rusqlite::Result<Option<Vec<String>>> {
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'chat_turn'",
        [],
        |row| row.get(0),
    )?;
    if exists == 0 {
        return Ok(None);
    }
    let mut stmt = conn.prepare("PRAGMA table_info(chat_turn)")?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(Some(columns))
}

/// Read one row through the gated columns so a broken B-tree surfaces here.
fn probe_query(conn: &Connection) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare(
        "SELECT context, session_id, turn_id, created_at, updated_at, turn_status, deleted_at          FROM chat_turn LIMIT 1",
    )?;
    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        let _context: Option<String> = row.get(0)?;
    }
    Ok(())
}

/// Maximum byte length accepted for the id and model fields.
const MAX_FIELD_BYTES: usize = 256;

/// Raw `chat_turn` values the parser reads for one row.
pub struct TraeCnRow<'a> {
    pub context: &'a str,
    pub session_id: &'a str,
    pub turn_id: Option<&'a str>,
    pub created_at: i64,
    pub updated_at: i64,
    pub turn_status: &'a str,
    pub deleted_at: i64,
}

/// Why one row produced no message.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SkipReason {
    NotCompleted,
    Deleted,
    InvalidContext,
    MissingTokenUsage,
    InvalidTokenField,
    NegativeTokenField,
    TotalMismatch,
    CacheReadExceedsPrompt,
    ReasoningExceedsCompletion,
    MissingTurnId,
    FieldTooLong,
    TimestampOutOfRange,
}

/// Convert one `chat_turn` row into a message, or the reason it is skipped.
///
/// The database is untrusted input: every rule here either produces a value
/// backed by the row or skips the row. Nothing is clamped or guessed.
pub fn parse_turn_row(row: &TraeCnRow<'_>) -> Result<UnifiedMessage, SkipReason> {
    if row.turn_status != "completed" {
        return Err(SkipReason::NotCompleted);
    }
    if row.deleted_at > 0 {
        return Err(SkipReason::Deleted);
    }

    let turn_id = row
        .turn_id
        .filter(|turn_id| !turn_id.is_empty())
        .ok_or(SkipReason::MissingTurnId)?;
    if row.session_id.len() > MAX_FIELD_BYTES || turn_id.len() > MAX_FIELD_BYTES {
        return Err(SkipReason::FieldTooLong);
    }

    let timestamp = row
        .created_at
        .checked_mul(1000)
        .filter(|timestamp| *timestamp > 0)
        .ok_or(SkipReason::TimestampOutOfRange)?;
    let updated_at_ms = row.updated_at.checked_mul(1000);

    let context: serde_json::Value =
        serde_json::from_str(row.context).map_err(|_| SkipReason::InvalidContext)?;
    let usage = context
        .get("token_usage")
        .and_then(serde_json::Value::as_object)
        .ok_or(SkipReason::MissingTokenUsage)?;

    let prompt = token_field(usage, "prompt_tokens")?;
    let completion = token_field(usage, "completion_tokens")?;
    let cache_read = token_field(usage, "cache_read_input_tokens")?;
    let reasoning = token_field(usage, "reasoning_tokens")?;
    let total = token_field(usage, "total_tokens")?;

    if total != prompt.checked_add(completion).ok_or(SkipReason::TotalMismatch)? {
        return Err(SkipReason::TotalMismatch);
    }
    if cache_read > prompt {
        return Err(SkipReason::CacheReadExceedsPrompt);
    }
    if reasoning > completion {
        return Err(SkipReason::ReasoningExceedsCompletion);
    }

    let model_id = clean_model_id(context_model(&context));
    if model_id.len() > MAX_FIELD_BYTES {
        return Err(SkipReason::FieldTooLong);
    }

    let tokens = TokenBreakdown {
        input: prompt - cache_read,
        output: completion - reasoning,
        cache_read,
        cache_write: 0,
        reasoning,
    };
    let provider_id = provider_hint_for_model(&model_id);
    let mut message = UnifiedMessage::new(
        "trae-cn",
        model_id,
        provider_id,
        row.session_id,
        timestamp,
        tokens,
        0.0,
    );
    message.turn_id = Some(turn_id.to_string());
    message.updated_at_ms = updated_at_ms;
    Ok(message)
}

/// One token bucket from `token_usage`.
///
/// Integers and integral floats are accepted; anything else, and any negative
/// value, skips the row.
fn token_field(
    usage: &serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> Result<i64, SkipReason> {
    let number = match usage.get(key) {
        Some(serde_json::Value::Number(number)) => number
            .as_i64()
            .or_else(|| {
                number
                    .as_f64()
                    .filter(|value| value.is_finite() && value.fract() == 0.0)
                    .and_then(|value| {
                        (value >= i64::MIN as f64 && value <= i64::MAX as f64)
                            .then_some(value as i64)
                    })
            })
            .ok_or(SkipReason::InvalidTokenField)?,
        _ => return Err(SkipReason::InvalidTokenField),
    };
    if number < 0 {
        return Err(SkipReason::NegativeTokenField);
    }
    Ok(number)
}

/// The model name inside `context`, in the order the client writes it.
fn context_model(context: &serde_json::Value) -> Option<&str> {
    const PATHS: [&[&str]; 5] = [
        &[
            "persist_user_message_context",
            "model_info",
            "display_model_name",
        ],
        &["persist_user_message_context", "model_info", "model_name"],
        &["model_name"],
        &["model"],
        &["agent_model"],
    ];
    PATHS.iter().find_map(|path| {
        let mut value = context;
        for key in *path {
            value = value.get(*key)?;
        }
        value.as_str()
    })
}

/// First-party vendor for a TRAE CN model family.
///
/// `provider_identity::inferred_provider_from_model` has no `doubao` arm, and
/// the archived rows are keyed by `<provider>/<model>`, so the CN parser maps
/// its own families. `canonicalize_provider_segment` lets `zai` and
/// `volcengine` pass through unchanged.
fn provider_hint_for_model(model_id: &str) -> &'static str {
    if model_id.starts_with("glm") {
        "zai"
    } else if model_id.starts_with("kimi") {
        "moonshotai"
    } else if model_id.starts_with("deepseek") {
        "deepseek"
    } else if model_id.starts_with("minimax") {
        "minimax"
    } else if model_id.starts_with("doubao") {
        "volcengine"
    } else {
        ""
    }
}

/// Strip the `__<channel>` suffix, lower-case the result, and fall back to
/// `trae-unknown` when nothing survives.
fn clean_model_id(raw: Option<&str>) -> String {
    let base = raw
        .unwrap_or_default()
        .split("__")
        .next()
        .unwrap_or_default()
        .trim();
    let cleaned = base.to_ascii_lowercase();
    if cleaned.is_empty() {
        "trae-unknown".to_string()
    } else {
        cleaned
    }
}

/// Collapse duplicate copies of the same turn across databases.
///
/// `messages` must already be the merge of every database from one scan. The
/// winner is the copy with the greatest `updated_at_ms` (missing counts as the
/// minimum), then the later `timestamp`, then the greater serialized
/// `(model_id, five buckets, session_id)` payload. A final full-message
/// comparison keeps the choice independent of discovery order even when every
/// listed key ties.
pub fn dedupe_trae_cn_turns(messages: Vec<UnifiedMessage>) -> Vec<UnifiedMessage> {
    let mut slots: Vec<UnifiedMessage> = Vec::with_capacity(messages.len());
    let mut position: std::collections::HashMap<String, usize> = std::collections::HashMap::new();

    for message in messages {
        let Some(turn_id) = message.turn_id.clone() else {
            // No turn identity means no group to join; keep the row as-is.
            slots.push(message);
            continue;
        };
        match position.get(&turn_id) {
            Some(&index) => {
                if is_newer_turn_copy(&message, &slots[index]) {
                    slots[index] = message;
                }
            }
            None => {
                position.insert(turn_id, slots.len());
                slots.push(message);
            }
        }
    }

    slots
}

fn is_newer_turn_copy(candidate: &UnifiedMessage, current: &UnifiedMessage) -> bool {
    match (candidate.updated_at_ms, current.updated_at_ms) {
        (Some(candidate_ms), Some(current_ms)) if candidate_ms != current_ms => {
            return candidate_ms > current_ms;
        }
        (Some(_), None) => return true,
        (None, Some(_)) => return false,
        _ => {}
    }
    if candidate.timestamp != current.timestamp {
        return candidate.timestamp > current.timestamp;
    }
    match turn_payload_key(candidate).cmp(&turn_payload_key(current)) {
        std::cmp::Ordering::Greater => true,
        std::cmp::Ordering::Less => false,
        std::cmp::Ordering::Equal => full_message_key(candidate) > full_message_key(current),
    }
}

fn turn_payload_key(message: &UnifiedMessage) -> Vec<u8> {
    bincode::serialize(&(
        &message.model_id,
        message.tokens.input,
        message.tokens.output,
        message.tokens.cache_read,
        message.tokens.cache_write,
        message.tokens.reasoning,
        &message.session_id,
    ))
    .unwrap_or_default()
}

fn full_message_key(message: &UnifiedMessage) -> Vec<u8> {
    bincode::serialize(message).unwrap_or_default()
}

/// Snapshot one encrypted TRAE CN database and parse it.
///
/// This is the parse closure the lane hands to the shared SQLite loader, so it
/// only runs on a cache miss: a warm scan neither decrypts nor reprints the
/// diagnostics below. The snapshot is removed before returning.
pub fn parse_trae_cn_database(db_path: &Path) -> Vec<UnifiedMessage> {
    let tmp_dir = crate::trae_db::snapshot_tmp_dir();
    if let Err(err) = crate::trae_db::sweep_stale_snapshots(&tmp_dir) {
        crate::tui_signal::emit_or_defer_stderr(format!(
            "tokens: TRAE CN snapshot sweep skipped for {}: {err}",
            tmp_dir.display()
        ));
    }

    let snapshot = match crate::trae_db::create_snapshot(
        db_path,
        &crate::trae_db::default_key(),
        &tmp_dir,
    ) {
        Ok(snapshot) => snapshot,
        Err(err) => {
            crate::tui_signal::emit_or_defer_stderr(format!(
                "tokens: skipping TRAE CN database {}: {err}",
                db_path.display()
            ));
            return Vec::new();
        }
    };

    if snapshot.stats.bad_pages > 0 {
        crate::tui_signal::emit_or_defer_stderr(format!(
            "tokens: TRAE CN database {}: {} unreadable page(s) zeroed in the snapshot",
            db_path.display(),
            snapshot.stats.bad_pages
        ));
    }

    let parsed = parse_trae_cn_db(&snapshot.path);
    if let Some(reason) = parsed.skip_reason {
        crate::tui_signal::emit_or_defer_stderr(format!(
            "tokens: skipping TRAE CN database {}: {reason}",
            db_path.display()
        ));
    }
    let _ = std::fs::remove_file(&snapshot.path);
    parsed.messages
}

/// Result of parsing one plaintext snapshot.
#[derive(Debug, Default)]
pub struct TraeCnParse {
    /// Accepted turns, in database row order.
    pub messages: Vec<UnifiedMessage>,
    /// Rows rejected by a per-row rule.
    pub skipped: usize,
    /// Set when the whole database was skipped; nothing was parsed.
    pub skip_reason: Option<String>,
}

/// Gate the snapshot, then convert every `chat_turn` row.
pub fn parse_trae_cn_db(path: &Path) -> TraeCnParse {
    let conn = match gate_and_open(path) {
        TraeCnDatabase::Ready(conn) => conn,
        TraeCnDatabase::Skipped(reason) => {
            return TraeCnParse {
                skip_reason: Some(reason),
                ..TraeCnParse::default()
            }
        }
    };

    let mut stmt = match conn.prepare(
        "SELECT context, session_id, turn_id, created_at, updated_at, turn_status, deleted_at \
         FROM chat_turn",
    ) {
        Ok(stmt) => stmt,
        Err(err) => return skip_whole_db(path, err),
    };
    let mut rows = match stmt.query([]) {
        Ok(rows) => rows,
        Err(err) => return skip_whole_db(path, err),
    };

    let mut parsed = TraeCnParse::default();
    loop {
        let row = match rows.next() {
            Ok(Some(row)) => row,
            Ok(None) => break,
            Err(err) => return skip_whole_db(path, err),
        };

        let context: Option<String> = match row.get(0) {
            Ok(value) => value,
            Err(err) => return skip_whole_db(path, err),
        };
        let session_id: Option<String> = match row.get(1) {
            Ok(value) => value,
            Err(err) => return skip_whole_db(path, err),
        };
        let turn_id: Option<String> = match row.get(2) {
            Ok(value) => value,
            Err(err) => return skip_whole_db(path, err),
        };
        let created_at: Option<i64> = match row.get(3) {
            Ok(value) => value,
            Err(err) => return skip_whole_db(path, err),
        };
        let updated_at: Option<i64> = match row.get(4) {
            Ok(value) => value,
            Err(err) => return skip_whole_db(path, err),
        };
        let turn_status: Option<String> = match row.get(5) {
            Ok(value) => value,
            Err(err) => return skip_whole_db(path, err),
        };
        let deleted_at: Option<i64> = match row.get(6) {
            Ok(value) => value,
            Err(err) => return skip_whole_db(path, err),
        };

        let raw = TraeCnRow {
            context: context.as_deref().unwrap_or_default(),
            session_id: session_id.as_deref().unwrap_or_default(),
            turn_id: turn_id.as_deref(),
            created_at: created_at.unwrap_or(0),
            updated_at: updated_at.unwrap_or(0),
            turn_status: turn_status.as_deref().unwrap_or_default(),
            deleted_at: deleted_at.unwrap_or(0),
        };

        match parse_turn_row(&raw) {
            Ok(message) => parsed.messages.push(message),
            Err(_) => parsed.skipped += 1,
        }
    }

    parsed
}

fn skip_whole_db(path: &Path, err: rusqlite::Error) -> TraeCnParse {
    let reason = format!("chat_turn query failed: {err}");
    tracing::warn!(
        path = %path.display(),
        reason = %reason,
        "skipping TRAE CN database"
    );
    TraeCnParse {
        skip_reason: Some(reason),
        ..TraeCnParse::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use std::path::PathBuf;
    use tempfile::TempDir;

    const ALL_COLUMNS: &str = "context TEXT, session_id TEXT, turn_id TEXT, \
        created_at INTEGER, updated_at INTEGER, turn_status TEXT, deleted_at INTEGER";

    fn create_db(dir: &Path, columns: &str, rows: usize) -> PathBuf {
        let path = dir.join("database.db");
        let conn = Connection::open(&path).unwrap();
        conn.pragma_update(None, "page_size", 4096).unwrap();
        conn.execute_batch(&format!("CREATE TABLE chat_turn({columns});"))
            .unwrap();
        for index in 0..rows {
            conn.execute(
                "INSERT INTO chat_turn VALUES \
                 ('{}', 's1', ?1, 1700000000, 1700000001, 'completed', 0)",
                params![format!("t{index}")],
            )
            .unwrap();
        }
        path
    }

    fn skip_reason(database: TraeCnDatabase) -> String {
        match database {
            TraeCnDatabase::Skipped(reason) => reason,
            TraeCnDatabase::Ready(_) => panic!("expected the database to be skipped"),
        }
    }

    // ---- per-turn normalization -------------------------------------------------

    fn usage_context(
        prompt: i64,
        completion: i64,
        cache_read: i64,
        reasoning: i64,
        total: i64,
        extra: &str,
    ) -> String {
        format!(
            r#"{{"token_usage":{{"prompt_tokens":{prompt},"completion_tokens":{completion},"cache_read_input_tokens":{cache_read},"reasoning_tokens":{reasoning},"total_tokens":{total}}}{extra}}}"#
        )
    }

    fn row<'a>(context: &'a str, turn_id: Option<&'a str>) -> TraeCnRow<'a> {
        TraeCnRow {
            context,
            session_id: "s1",
            turn_id,
            created_at: 1_700_000_000,
            updated_at: 1_700_000_005,
            turn_status: "completed",
            deleted_at: 0,
        }
    }

    fn skip_of(context: &str, turn_id: Option<&str>) -> SkipReason {
        parse_turn_row(&row(context, turn_id)).unwrap_err()
    }

    #[test]
    fn test_normalize_turn_with_cache_split() {
        let context = usage_context(
            1000,
            200,
            800,
            50,
            1200,
            r#","model_name":"deepseek-v4.1-flash""#,
        );
        let parsed = parse_turn_row(&row(&context, Some("turn-1"))).unwrap();

        assert_eq!(
            parsed.tokens,
            crate::TokenBreakdown {
                input: 200,
                output: 150,
                cache_read: 800,
                cache_write: 0,
                reasoning: 50,
            }
        );
        assert_eq!(parsed.tokens.total(), 1200);
        assert_eq!(parsed.client, "trae-cn");
        assert_eq!(parsed.model_id, "deepseek-v4.1-flash");
        assert_eq!(parsed.timestamp, 1_700_000_000_000);
        assert_eq!(parsed.turn_id.as_deref(), Some("turn-1"));
        assert_eq!(parsed.updated_at_ms, Some(1_700_000_005_000));
    }

    #[test]
    fn test_skip_total_mismatch_row() {
        let context = usage_context(100, 10, 0, 0, 500, "");
        assert_eq!(
            skip_of(&context, Some("t1")),
            SkipReason::TotalMismatch
        );
    }

    #[test]
    fn test_skip_cache_read_exceeds_prompt() {
        let context = usage_context(100, 10, 200, 0, 110, "");
        assert_eq!(
            skip_of(&context, Some("t1")),
            SkipReason::CacheReadExceedsPrompt
        );
    }

    #[test]
    fn test_skip_reasoning_exceeds_completion() {
        let context = usage_context(100, 10, 0, 50, 110, "");
        assert_eq!(
            skip_of(&context, Some("t1")),
            SkipReason::ReasoningExceedsCompletion
        );
    }

    #[test]
    fn test_skip_negative_cache_read() {
        let context = usage_context(100, 10, -10, 0, 110, "");
        assert_eq!(
            skip_of(&context, Some("t1")),
            SkipReason::NegativeTokenField
        );
    }

    #[test]
    fn test_skip_missing_turn_id() {
        let context = usage_context(100, 10, 0, 0, 110, "");
        assert_eq!(skip_of(&context, None), SkipReason::MissingTurnId);
        assert_eq!(skip_of(&context, Some("")), SkipReason::MissingTurnId);
    }

    #[test]
    fn test_doubao_model_maps_to_volcengine_hint() {
        for (model, provider) in [
            ("glm-5.2", "zai"),
            ("kimi-k2.6", "moonshotai"),
            ("deepseek-v4.1-flash", "deepseek"),
            ("minimax-m2.7", "minimax"),
            ("doubao-seed-2-1-turbo", "volcengine"),
        ] {
            let context = usage_context(
                100,
                10,
                0,
                0,
                110,
                &format!(r#","model_name":"{model}""#),
            );
            let parsed = parse_turn_row(&row(&context, Some("t1"))).unwrap();
            assert_eq!(parsed.provider_id, provider, "model {model}");
        }
    }

    #[test]
    fn test_strip_dev_suffix() {
        let context = usage_context(
            100,
            10,
            0,
            0,
            110,
            r#","model_name":"DeepSeek-V4.1-Flash__dev""#,
        );
        let parsed = parse_turn_row(&row(&context, Some("t1"))).unwrap();
        assert_eq!(parsed.model_id, "deepseek-v4.1-flash");
    }

    #[test]
    fn test_skip_timestamp_overflow() {
        let context = usage_context(100, 10, 0, 0, 110, "");
        let mut input = row(&context, Some("t1"));
        input.created_at = i64::MAX;
        assert_eq!(
            parse_turn_row(&input).unwrap_err(),
            SkipReason::TimestampOutOfRange
        );
    }

    #[test]
    fn test_session_title_stays_none() {
        let context = usage_context(
            100,
            10,
            0,
            0,
            110,
            r#","title":"my secret chat","session_title":"also secret""#,
        );
        let parsed = parse_turn_row(&row(&context, Some("t1"))).unwrap();
        assert_eq!(parsed.session_title, None);
    }

    #[test]
    fn test_skip_non_completed_and_deleted_rows() {
        let context = usage_context(100, 10, 0, 0, 110, "");

        let mut running = row(&context, Some("t1"));
        running.turn_status = "running";
        assert_eq!(parse_turn_row(&running).unwrap_err(), SkipReason::NotCompleted);

        let mut deleted = row(&context, Some("t1"));
        deleted.deleted_at = 1;
        assert_eq!(parse_turn_row(&deleted).unwrap_err(), SkipReason::Deleted);
    }

    // ---- per-turn dedupe -------------------------------------------------------

    fn turn_message(session: &str, turn: &str, updated_at_ms: Option<i64>) -> UnifiedMessage {
        let mut message = UnifiedMessage::new(
            "trae-cn",
            "glm-5.2",
            "",
            session,
            1_700_000_000_000,
            crate::TokenBreakdown {
                input: 10,
                output: 5,
                cache_read: 0,
                cache_write: 0,
                reasoning: 0,
            },
            0.0,
        );
        message.turn_id = Some(turn.to_string());
        message.updated_at_ms = updated_at_ms;
        message
    }

    #[test]
    fn test_dedupe_keeps_all_turns_in_session() {
        let messages = vec![
            turn_message("s1", "t1", Some(1)),
            turn_message("s1", "t2", Some(2)),
            turn_message("s1", "t3", Some(3)),
        ];
        let kept = dedupe_trae_cn_turns(messages);
        assert_eq!(kept.len(), 3, "a session is never collapsed to one row");
        let mut turns: Vec<&str> = kept
            .iter()
            .filter_map(|message| message.turn_id.as_deref())
            .collect();
        turns.sort_unstable();
        assert_eq!(turns, vec!["t1", "t2", "t3"]);
    }

    #[test]
    fn test_dedupe_same_turn_latest_updated_at_wins() {
        let older = turn_message("s1", "t1", Some(1_000));
        let mut newer = turn_message("s1", "t1", Some(2_000));
        newer.tokens.input = 99;

        let kept = dedupe_trae_cn_turns(vec![older, newer]);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].updated_at_ms, Some(2_000));
        assert_eq!(kept[0].tokens.input, 99);
    }

    #[test]
    fn test_dedupe_keeps_distinct_turns_with_identical_fields() {
        let first = turn_message("s1", "t1", Some(5));
        let second = turn_message("s1", "t2", Some(5));

        let kept = dedupe_trae_cn_turns(vec![first, second]);
        assert_eq!(
            kept.len(),
            2,
            "identical payloads with different turn ids stay separate"
        );
    }

    #[test]
    fn test_dedupe_updated_at_tie_break_deterministic() {
        let smaller = turn_message("s1", "t1", Some(5));
        let mut larger = turn_message("s1", "t1", Some(5));
        larger.tokens.input = 20;

        let forward = dedupe_trae_cn_turns(vec![smaller.clone(), larger.clone()]);
        let reversed = dedupe_trae_cn_turns(vec![larger, smaller]);
        assert_eq!(forward.len(), 1);
        assert_eq!(reversed.len(), 1);
        assert_eq!(
            forward[0].tokens.input, reversed[0].tokens.input,
            "the tie-break must not depend on discovery order"
        );
        assert_eq!(forward[0].tokens.input, 20, "larger serialized payload wins");
    }

    #[test]
    fn test_dedupe_missing_updated_at_still_emitted() {
        // A lone row without updated_at must survive rather than being dropped.
        let lone = turn_message("s1", "solo", None);
        assert_eq!(dedupe_trae_cn_turns(vec![lone]).len(), 1);

        // Competing against a usable updated_at, the missing one is the minimum.
        let missing = turn_message("s1", "t1", None);
        let mut present = turn_message("s1", "t1", Some(7));
        present.tokens.input = 42;
        let kept = dedupe_trae_cn_turns(vec![present, missing]);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].updated_at_ms, Some(7));
        assert_eq!(kept[0].tokens.input, 42);
    }

    #[test]
    fn test_parse_trae_cn_db_skips_invalid_rows_and_counts() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("database.db");
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(
            "CREATE TABLE chat_turn(context TEXT, session_id TEXT, turn_id TEXT, \
             created_at INTEGER, updated_at INTEGER, turn_status TEXT, deleted_at INTEGER);",
        )
        .unwrap();
        let valid = usage_context(100, 10, 0, 0, 110, "");
        let mismatch = usage_context(100, 10, 0, 0, 999, "");
        conn.execute(
            "INSERT INTO chat_turn VALUES (?1, 's1', 't1', 1700000000, 1700000005, 'completed', 0)",
            params![valid],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO chat_turn VALUES (?1, 's1', 't2', 1700000000, 1700000005, 'completed', 0)",
            params![mismatch],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO chat_turn VALUES (?1, 's1', NULL, 1700000000, 1700000005, 'completed', 0)",
            params![usage_context(100, 10, 0, 0, 110, "")],
        )
        .unwrap();
        drop(conn);

        let parsed = parse_trae_cn_db(&path);
        assert_eq!(parsed.skip_reason, None);
        assert_eq!(parsed.messages.len(), 1);
        assert_eq!(parsed.messages[0].turn_id.as_deref(), Some("t1"));
        assert_eq!(parsed.skipped, 2);
        assert_eq!(parsed.messages[0].tokens.total(), 110);
    }

    #[test]
    fn test_schema_gate_passes_isomorphic_db() {
        let dir = TempDir::new().unwrap();
        let path = create_db(dir.path(), ALL_COLUMNS, 2);

        match gate_and_open(&path) {
            TraeCnDatabase::Ready(conn) => {
                let rows: i64 = conn
                    .query_row("SELECT COUNT(*) FROM chat_turn", [], |row| row.get(0))
                    .unwrap();
                assert_eq!(rows, 2);
            }
            TraeCnDatabase::Skipped(reason) => {
                panic!("an isomorphic database was skipped: {reason}")
            }
        }
    }

    #[test]
    fn test_schema_gate_missing_column_skips_with_warning() {
        let dir = TempDir::new().unwrap();
        let columns = "context TEXT, session_id TEXT, created_at INTEGER, \
            updated_at INTEGER, turn_status TEXT, deleted_at INTEGER";
        let path = create_db(dir.path(), columns, 0);

        let reason = skip_reason(gate_and_open(&path));
        assert!(
            reason.contains("turn_id"),
            "the reason must name the missing column: {reason}"
        );
    }

    #[test]
    fn test_schema_gate_query_failure_skips() {
        let dir = TempDir::new().unwrap();
        let path = create_db(dir.path(), ALL_COLUMNS, 200);

        // Overwrite the `chat_turn` root page so the probe query fails while
        // `sqlite_master` on page 1 stays readable.
        let mut bytes = std::fs::read(&path).unwrap();
        let page_size = 4096;
        assert!(bytes.len() > page_size * 2, "fixture must span pages");
        bytes[page_size..page_size * 2].fill(0xff);
        std::fs::write(&path, &bytes).unwrap();

        let reason = skip_reason(gate_and_open(&path));
        assert!(
            reason.contains("query failed"),
            "the reason must explain the failed query: {reason}"
        );
    }
}
