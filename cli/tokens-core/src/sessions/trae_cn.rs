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
