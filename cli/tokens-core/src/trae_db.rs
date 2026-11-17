//! TRAE CN local database decryption and snapshot materialization.
//!
//! TRAE CN stores its usage data in a SQLCipher 4 encrypted SQLite database at
//! `ModularData/<module>/database.db`. This module decrypts that database page
//! by page, merges the committed part of the `-wal` sidecar, and writes a
//! plaintext SQLite snapshot that `rusqlite` can query read-only.
//!
//! # Authoritative SQLCipher page format
//!
//! The parameters below are the authoritative in-repo specification. They are
//! mirrored by the synthetic fixture builder in the test module and checked
//! against an official SQLCipher known-answer vector (`tests/fixtures/trae_cn/`).
//!
//! Page size defaults to 4096 bytes. The reserved area at the end of every page
//! is 80 bytes: a 16-byte IV followed by a 64-byte HMAC-SHA512 tag. A page is
//! laid out as:
//!
//! - pages other than page 1: `ciphertext (page_size - 80) ‖ IV (16) ‖ HMAC (64)`
//! - page 1: `salt (16) ‖ ciphertext (page_size - 16 - 80) ‖ IV (16) ‖ HMAC (64)`
//!
//! Page 1 of an encrypted database starts with 16 plaintext salt bytes instead
//! of the SQLite header. Those bytes are the key-derivation salt. Decrypting
//! page 1 restores the constant SQLite header `SQLite format 3\0`.
//!
//! Key derivation for the page HMAC:
//!
//! ```text
//! hmac_key = PBKDF2-HMAC-SHA512(password = raw_key,
//!                               salt     = kdf_salt XOR 0x3a (byte-wise),
//!                               rounds   = 2,
//!                               dklen    = 32 bytes)
//! ```
//!
//! Page encryption is AES-256-CBC with the raw 32-byte key, no padding, and the
//! per-page IV taken from the reserved area. The page HMAC input is the exact
//! concatenation
//!
//! ```text
//! ciphertext ‖ IV (16 bytes) ‖ page number (u32 little-endian, 4 bytes)
//! ```
//!
//! For page 1 the ciphertext starts after the 16-byte salt region, so the HMAC
//! covers `page[16 .. page_size - 80]`. Changing any IV byte invalidates that
//! page's HMAC. This layout follows the SQLCipher reference implementation
//! (`sqlcipher_page_hmac`, `CIPHER_FLAG_LE_PGNO`) and the published security
//! design: <https://www.zetetic.net/sqlcipher/design/>.
//!
//! # Authoritative WAL merge algorithm
//!
//! A SQLCipher page image written to the WAL is already encrypted, so the WAL
//! frames are merged after decryption. The `-wal` format follows the SQLite
//! reader algorithm: <https://www.sqlite.org/fileformat2.html#walformat>.
//!
//! - The 32-byte WAL header holds: magic (`0x377f0682`/`0x377f0683`),
//!   version `3007000`, page size, checkpoint sequence, salt-1/salt-2, and the
//!   header checksum computed over the first 24 bytes.
//! - Each frame is a 24-byte frame header followed by one encrypted page. The
//!   frame header holds: page number, commit field, a copy of salt-1/salt-2,
//!   and the cumulative checksum.
//! - The checksum is cumulative: the header checksum seeds the chain, and each
//!   frame extends it over the frame-header bytes 0..8 and the page data. Word
//!   order of the checksum is little-endian for magic `0x377f0682` and
//!   big-endian for magic `0x377f0683`; the stored fields themselves are
//!   big-endian.
//! - A frame is valid when its salt-1/salt-2 match the WAL header salts and the
//!   checksum chain is continuous. The first invalid frame invalidates every
//!   later frame.
//! - A non-zero commit field closes the pending frame run and sets the visible
//!   database size in pages. Frames after the last valid commit are not part of
//!   the committed view.
//! - Frame salts are compared only against the WAL header salts. They are never
//!   compared against the SQLCipher key-derivation salt in page 1; the two are
//!   independent values.
//!
//! # Key
//!
//! TRAE ships one shared SQLCipher application key. It is a public constant in
//! the client, published by TokenTracker (github.com/xiufengsun/TokenTracker,
//! MIT) and confirmed against a real install by the feasibility demo. The key
//! is a raw 32-byte key (SQLCipher `x'<hex>'` form), so SQLCipher skips the
//! passphrase KDF for page encryption but still derives the HMAC key with the
//! two-round PBKDF2 above.

use std::collections::HashMap;
use std::fs;
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use aes::cipher::{block_padding::NoPadding, BlockDecryptMut, KeyIvInit};
use hmac::{Hmac, Mac};
use sha2::Sha512;
use thiserror::Error;

type Aes256CbcDec = cbc::Decryptor<aes::Aes256>;

/// SQLite file header magic. The encrypted database hides it inside page 1.
const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";

/// Bytes reserved at the end of every SQLCipher page: 16-byte IV + 64-byte HMAC.
const RESERVE_SIZE: usize = 80;

/// Default SQLCipher page size. TRAE CN databases use 4096-byte pages.
pub const DEFAULT_PAGE_SIZE: usize = 4096;

/// Byte-wise XOR mask SQLCipher applies to the page-1 salt before PBKDF2.
const HMAC_SALT_MASK: u8 = 0x3a;

/// TRAE's shared SQLCipher application key (raw 32 bytes).
///
/// Hex form: `3605f6691095a993f03d5009c918352ef5be31ae31e8f000212b81ff058da773`.
pub const TRAE_SQLCIPHER_KEY: [u8; 32] = [
    0x36, 0x05, 0xf6, 0x69, 0x10, 0x95, 0xa9, 0x93, 0xf0, 0x3d, 0x50, 0x09, 0xc9, 0x18, 0x35, 0x2e,
    0xf5, 0xbe, 0x31, 0xae, 0x31, 0xe8, 0xf0, 0x00, 0x21, 0x2b, 0x81, 0xff, 0x05, 0x8d, 0xa7, 0x73,
];

#[derive(Debug, Error)]
pub enum TraeDbError {
    #[error("i/o error: {0}")]
    Io(#[from] io::Error),
    #[error("database file is too small to hold one page")]
    TooSmall,
    #[error("page 1 HMAC check failed; the key or the database format does not match")]
    KeyMismatch,
    #[error("page {page} failed its HMAC check")]
    BadPageHmac { page: u32 },
    #[error("unsupported WAL file: {0}")]
    UnsupportedWal(String),
}

/// A plaintext snapshot produced from one encrypted database.
#[derive(Debug, Clone)]
pub struct Snapshot {
    /// Path of the plaintext SQLite file. The caller owns cleanup.
    pub path: PathBuf,
    /// Number of pages in the snapshot.
    pub page_count: u32,
    /// Pages whose HMAC failed and that were zeroed instead of decrypted.
    pub bad_pages: u64,
}

/// The raw key TRAE uses for its local database.
pub fn default_key() -> [u8; 32] {
    TRAE_SQLCIPHER_KEY
}

/// Derive the page HMAC key from the raw key and the page-1 salt.
pub fn derive_hmac_key(key: &[u8], kdf_salt: &[u8]) -> [u8; 32] {
    let salt: Vec<u8> = kdf_salt.iter().map(|b| b ^ HMAC_SALT_MASK).collect();
    let mut out = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<Sha512>(key, &salt, 2, &mut out);
    out
}

/// Decrypt one SQLCipher page in place and verify its HMAC first.
///
/// `page` must be exactly one page. For page 1 the leading 16 salt bytes are
/// replaced by the SQLite header on success.
pub fn decrypt_page(
    page: &mut [u8],
    page_no: u32,
    key: &[u8],
    hmac_key: &[u8; 32],
) -> Result<(), TraeDbError> {
    let page_size = page.len();
    if page_size <= RESERVE_SIZE {
        return Err(TraeDbError::TooSmall);
    }
    let start = if page_no == 1 { 16 } else { 0 };
    let iv_off = page_size - RESERVE_SIZE;
    if start >= iv_off {
        return Err(TraeDbError::TooSmall);
    }

    let iv: [u8; 16] = page[iv_off..iv_off + 16]
        .try_into()
        .expect("reserved area holds a 16-byte IV");
    let expected: [u8; 64] = page[iv_off + 16..iv_off + 80]
        .try_into()
        .expect("reserved area holds a 64-byte HMAC");

    if !hmac_matches(hmac_key, &page[start..iv_off], &iv, page_no, &expected) {
        return Err(TraeDbError::BadPageHmac { page: page_no });
    }

    let mut ciphertext = page[start..iv_off].to_vec();
    let cipher = Aes256CbcDec::new_from_slices(key, &iv).map_err(|_| TraeDbError::KeyMismatch)?;
    let plain = cipher
        .decrypt_padded_mut::<NoPadding>(&mut ciphertext)
        .map_err(|_| TraeDbError::KeyMismatch)?;
    page[start..iv_off].copy_from_slice(plain);
    if page_no == 1 {
        page[0..16].copy_from_slice(SQLITE_HEADER);
    }
    Ok(())
}

fn hmac_matches(
    hmac_key: &[u8; 32],
    ciphertext: &[u8],
    iv: &[u8; 16],
    page_no: u32,
    expected: &[u8],
) -> bool {
    let Ok(mut mac) = <Hmac<Sha512> as Mac>::new_from_slice(hmac_key) else {
        return false;
    };
    mac.update(ciphertext);
    mac.update(iv);
    mac.update(&page_no.to_le_bytes());
    mac.verify_slice(expected).is_ok()
}

/// Candidate page sizes in the order worth trying. TRAE CN uses 4096.
const PAGE_SIZE_CANDIDATES: [usize; 8] = [4096, 8192, 16384, 32768, 65536, 2048, 1024, 512];

/// Committed WAL frames, keyed by target page number, plus the committed size.
struct WalView {
    frames: HashMap<u32, u64>,
    db_size: Option<u32>,
}

/// Decrypt `database.db` and merge the committed WAL frames into a plaintext
/// snapshot written inside `out_dir`.
pub fn create_snapshot(db_path: &Path, key: &[u8], out_dir: &Path) -> Result<Snapshot, TraeDbError> {
    let db = fs::read(db_path)?;
    let page_size = detect_page_size(&db, key)?;
    let kdf_salt: [u8; 16] = db[0..16].try_into().expect("page 1 starts with a 16-byte salt");
    let hmac_key = derive_hmac_key(key, &kdf_salt);
    let total_pages = (db.len() / page_size) as u32;

    let wal_file_path = wal_path_for(db_path);
    let wal = read_wal(&wal_file_path, page_size)?;
    let final_pages = wal
        .as_ref()
        .and_then(|view| view.db_size)
        .unwrap_or(total_pages)
        .max(1);

    let mut wal_file = match &wal {
        Some(view) if !view.frames.is_empty() => Some(fs::File::open(&wal_file_path)?),
        _ => None,
    };

    let mut bytes = Vec::with_capacity(final_pages as usize * page_size);
    for page_no in 1..=final_pages {
        let mut page = match (&wal, wal_file.as_mut()) {
            (Some(view), Some(file)) => match view.frames.get(&page_no) {
                Some(offset) => {
                    let mut buf = vec![0u8; page_size];
                    read_at(file, *offset, &mut buf)?;
                    buf
                }
                None => read_main_page(&db, page_no, total_pages, page_size),
            },
            _ => read_main_page(&db, page_no, total_pages, page_size),
        };

        match decrypt_page(&mut page, page_no, key, &hmac_key) {
            Ok(()) => {}
            Err(err) => {
                return Err(if page_no == 1 {
                    TraeDbError::KeyMismatch
                } else {
                    err
                })
            }
        }
        if page_no == 1 {
            normalize_page_one(&mut page, final_pages);
        }
        bytes.extend_from_slice(&page);
    }

    fs::create_dir_all(out_dir)?;
    let path = write_snapshot_file(out_dir, &bytes)?;
    Ok(Snapshot {
        path,
        page_count: final_pages,
        bad_pages: 0,
    })
}

/// The `-wal` sidecar path that belongs to `db_path`.
fn wal_path_for(db_path: &Path) -> PathBuf {
    let mut name = db_path.as_os_str().to_os_string();
    name.push("-wal");
    PathBuf::from(name)
}

fn read_at(file: &mut fs::File, offset: u64, buf: &mut [u8]) -> io::Result<()> {
    file.seek(SeekFrom::Start(offset))?;
    file.read_exact(buf)
}

fn read_main_page(db: &[u8], page_no: u32, total_pages: u32, page_size: usize) -> Vec<u8> {
    if page_no <= total_pages {
        let start = (page_no as usize - 1) * page_size;
        db[start..start + page_size].to_vec()
    } else {
        vec![0u8; page_size]
    }
}

/// Detect the SQLCipher page size by trial-decrypting page 1 for each candidate.
fn detect_page_size(db: &[u8], key: &[u8]) -> Result<usize, TraeDbError> {
    if db.len() <= 16 + RESERVE_SIZE {
        return Err(TraeDbError::TooSmall);
    }
    let kdf_salt: [u8; 16] = db[0..16].try_into().expect("page 1 starts with a 16-byte salt");
    let hmac_key = derive_hmac_key(key, &kdf_salt);
    let mut saw_hmac_failure = false;

    for &candidate in PAGE_SIZE_CANDIDATES.iter() {
        if db.len() < candidate {
            continue;
        }
        let mut page = db[0..candidate].to_vec();
        match decrypt_page(&mut page, 1, key, &hmac_key) {
            Ok(()) => {}
            Err(TraeDbError::BadPageHmac { .. }) => {
                saw_hmac_failure = true;
                continue;
            }
            Err(err) => return Err(err),
        }
        if &page[0..16] != SQLITE_HEADER {
            saw_hmac_failure = true;
            continue;
        }
        let declared = match u16::from_be_bytes([page[16], page[17]]) {
            1 => 65536,
            value => value as usize,
        };
        if declared == candidate {
            return Ok(candidate);
        }
        saw_hmac_failure = true;
    }

    if saw_hmac_failure {
        Err(TraeDbError::KeyMismatch)
    } else {
        Err(TraeDbError::TooSmall)
    }
}

/// Make the merged page 1 describe a standalone rollback-journal database.
fn normalize_page_one(page: &mut [u8], db_size_pages: u32) {
    // Bytes 18/19 are the file format write/read version. The snapshot has no
    // WAL, so present it as a rollback-journal database (1 = legacy).
    page[18] = 1;
    page[19] = 1;
    let change_counter = u32::from_be_bytes(page[24..28].try_into().expect("4-byte counter"));
    page[92..96].copy_from_slice(&change_counter.to_be_bytes());
    page[28..32].copy_from_slice(&db_size_pages.to_be_bytes());
}

fn write_snapshot_file(out_dir: &Path, bytes: &[u8]) -> Result<PathBuf, TraeDbError> {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let path = out_dir.join(format!(
        "trae-snapshot-{}-{}",
        std::process::id(),
        nanos
    ));
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&path)?;
    if let Err(err) = file.write_all(bytes) {
        let _ = fs::remove_file(&path);
        return Err(err.into());
    }
    file.sync_all()?;
    Ok(path)
}

/// Read the committed frame prefix of a WAL file.
fn read_wal(path: &Path, page_size: usize) -> Result<Option<WalView>, TraeDbError> {
    let mut file = match fs::File::open(path) {
        Ok(file) => file,
        Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(err.into()),
    };
    let len = file.metadata()?.len();
    if len < 32 {
        return Ok(None);
    }

    let mut header = [0u8; 32];
    read_at(&mut file, 0, &mut header)?;
    let magic = u32::from_be_bytes(header[0..4].try_into().expect("4-byte magic"));
    if magic == 0 {
        // A checkpoint may leave a zeroed or truncated WAL header.
        return Ok(None);
    }
    if magic != 0x377f_0682 && magic != 0x377f_0683 {
        return Err(TraeDbError::UnsupportedWal(format!("bad magic {magic:#010x}")));
    }
    let big_endian = magic == 0x377f_0683;
    let version = u32::from_be_bytes(header[4..8].try_into().expect("4-byte version"));
    if version != 3_007_000 {
        return Err(TraeDbError::UnsupportedWal(format!("version {version}")));
    }
    let wal_page_size = u32::from_be_bytes(header[8..12].try_into().expect("4-byte page size"));
    if wal_page_size as usize != page_size {
        return Err(TraeDbError::UnsupportedWal(format!(
            "page size {wal_page_size} does not match database page size {page_size}"
        )));
    }
    let seed = wal_checksum(&header[0..24], (0, 0), big_endian);
    let stored_seed = (
        u32::from_be_bytes(header[24..28].try_into().expect("4-byte checksum")),
        u32::from_be_bytes(header[28..32].try_into().expect("4-byte checksum")),
    );
    if seed != stored_seed {
        return Err(TraeDbError::UnsupportedWal("header checksum mismatch".into()));
    }

    let frame_len = 24 + page_size;
    let mut chain = seed;
    let mut pending: Vec<(u32, u64)> = Vec::new();
    let mut frames = HashMap::new();
    let mut db_size = None;
    let mut offset = 32u64;
    let mut frame = vec![0u8; frame_len];

    while offset + frame_len as u64 <= len {
        read_at(&mut file, offset, &mut frame)?;
        if frame[8..16] != header[16..24] {
            // Reset residue from an older WAL generation.
            break;
        }
        chain = wal_checksum(&frame[0..8], chain, big_endian);
        chain = wal_checksum(&frame[24..], chain, big_endian);
        let stored = (
            u32::from_be_bytes(frame[16..20].try_into().expect("4-byte checksum")),
            u32::from_be_bytes(frame[20..24].try_into().expect("4-byte checksum")),
        );
        if chain != stored {
            break;
        }
        let page_no = u32::from_be_bytes(frame[0..4].try_into().expect("4-byte page number"));
        let commit = u32::from_be_bytes(frame[4..8].try_into().expect("4-byte commit field"));
        pending.push((page_no, offset + 24));
        if commit != 0 {
            for (candidate, data_offset) in pending.drain(..) {
                if candidate <= commit {
                    frames.insert(candidate, data_offset);
                }
            }
            db_size = Some(commit);
        }
        offset += frame_len as u64;
    }

    Ok(Some(WalView { frames, db_size }))
}

/// WAL cumulative checksum over 8-byte word pairs.
fn wal_checksum(data: &[u8], seed: (u32, u32), big_endian: bool) -> (u32, u32) {
    let mut a = seed.0;
    let mut b = seed.1;
    for chunk in data.chunks_exact(8) {
        let (x, y) = if big_endian {
            (
                u32::from_be_bytes(chunk[0..4].try_into().expect("4-byte word")),
                u32::from_be_bytes(chunk[4..8].try_into().expect("4-byte word")),
            )
        } else {
            (
                u32::from_le_bytes(chunk[0..4].try_into().expect("4-byte word")),
                u32::from_le_bytes(chunk[4..8].try_into().expect("4-byte word")),
            )
        };
        a = a.wrapping_add(x).wrapping_add(b);
        b = b.wrapping_add(y).wrapping_add(a);
    }
    (a, b)
}

#[cfg(test)]
mod tests {
    use super::*;
    use aes::cipher::BlockEncryptMut;
    use rusqlite::{Connection, OpenFlags};
    use sha2::Digest;
    use std::path::Path;

    type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;

    const PAGE: usize = DEFAULT_PAGE_SIZE;

    fn pseudo_bytes(seed: &[u8], len: usize) -> Vec<u8> {
        let mut out = Vec::new();
        let mut counter = 0u32;
        while out.len() < len {
            let mut hasher = Sha512::new();
            hasher.update(seed);
            hasher.update(counter.to_le_bytes());
            out.extend_from_slice(&hasher.finalize());
            counter += 1;
        }
        out.truncate(len);
        out
    }

    fn test_kdf_salt() -> [u8; 16] {
        pseudo_bytes(b"trae-cn-kdf-salt", 16).try_into().unwrap()
    }

    /// Encrypt one plaintext page the way SQLCipher writes it.
    fn encrypt_page(plain: &[u8], page_no: u32, key: &[u8; 32], kdf_salt: &[u8; 16]) -> Vec<u8> {
        assert_eq!(plain.len(), PAGE, "fixture pages must be full pages");
        let iv_off = PAGE - RESERVE_SIZE;
        let start = if page_no == 1 { 16 } else { 0 };
        let hmac_key = derive_hmac_key(key, kdf_salt);
        let iv: [u8; 16] = pseudo_bytes(&[b'i', b'v', page_no as u8], 16).try_into().unwrap();
        let cipher = Aes256CbcEnc::new_from_slices(key, &iv).unwrap();
        let mut buf = plain[start..iv_off].to_vec();
        let buf_len = buf.len();
        let ciphertext = cipher.encrypt_padded_mut::<NoPadding>(&mut buf, buf_len).unwrap();

        let mut out = vec![0u8; PAGE];
        if page_no == 1 {
            out[0..16].copy_from_slice(kdf_salt);
        }
        out[start..iv_off].copy_from_slice(ciphertext);
        out[iv_off..iv_off + 16].copy_from_slice(&iv);
        let mut mac = <Hmac<Sha512> as Mac>::new_from_slice(&hmac_key).unwrap();
        mac.update(ciphertext);
        mac.update(&iv);
        mac.update(&page_no.to_le_bytes());
        let tag = mac.finalize().into_bytes();
        out[iv_off + 16..iv_off + 16 + 64].copy_from_slice(&tag);
        out
    }

    fn encrypt_pages(pages: &[Vec<u8>], key: &[u8; 32], kdf_salt: &[u8; 16]) -> Vec<u8> {
        let mut out = Vec::with_capacity(pages.len() * PAGE);
        for (index, page) in pages.iter().enumerate() {
            let page_no = index as u32 + 1;
            out.extend_from_slice(&encrypt_page(page, page_no, key, kdf_salt));
        }
        out
    }

    /// Build a plaintext SQLite database on disk with a fixed page size, then
    /// read it back as 4096-byte pages.
    fn plain_pages(dir: &Path, name: &str, sql: &str) -> Vec<Vec<u8>> {
        let path = dir.join(name);
        {
            let conn = Connection::open(&path).unwrap();
            // SQLCipher reserves 80 bytes at the end of every page. Create the
            // synthetic plaintext database with the same usable size, otherwise
            // bytes below the reserve would be lost when encrypting the page.
            let mut reserve: std::ffi::c_int = RESERVE_SIZE as std::ffi::c_int;
            let rc = unsafe {
                rusqlite::ffi::sqlite3_file_control(
                    conn.handle(),
                    b"main\0".as_ptr() as *const std::ffi::c_char,
                    rusqlite::ffi::SQLITE_FCNTL_RESERVE_BYTES,
                    &mut reserve as *mut _ as *mut std::ffi::c_void,
                )
            };
            assert_eq!(rc, rusqlite::ffi::SQLITE_OK, "fixture reserve bytes");
            conn.pragma_update(None, "page_size", PAGE as i64).unwrap();
            conn.pragma_update(None, "journal_mode", "DELETE").unwrap();
            conn.execute_batch(sql).unwrap();
        }
        let bytes = fs::read(&path).unwrap();
        assert_eq!(bytes.len() % PAGE, 0, "SQLite files end on a page boundary");
        bytes.chunks(PAGE).map(|chunk| chunk.to_vec()).collect()
    }

    const CHAT_TURN_SCHEMA: &str = "CREATE TABLE chat_turn(
            context TEXT,
            session_id TEXT,
            turn_id TEXT,
            created_at INTEGER,
            updated_at INTEGER,
            turn_status TEXT,
            deleted_at INTEGER
        );";

    /// One synthetic WAL frame specification.
    struct WalFrameSpec {
        page_no: u32,
        commit: u32,
        plain_page: Vec<u8>,
        stale_salt: bool,
        break_checksum: bool,
    }

    fn wal_checksum(data: &[u8], seed: (u32, u32), big_endian: bool) -> (u32, u32) {
        let mut a = seed.0;
        let mut b = seed.1;
        for chunk in data.chunks_exact(8) {
            let (x, y) = if big_endian {
                (
                    u32::from_be_bytes(chunk[0..4].try_into().unwrap()),
                    u32::from_be_bytes(chunk[4..8].try_into().unwrap()),
                )
            } else {
                (
                    u32::from_le_bytes(chunk[0..4].try_into().unwrap()),
                    u32::from_le_bytes(chunk[4..8].try_into().unwrap()),
                )
            };
            a = a.wrapping_add(x).wrapping_add(b);
            b = b.wrapping_add(y).wrapping_add(a);
        }
        (a, b)
    }

    /// Build a WAL file from already-encrypted page images.
    fn build_wal(
        salt: (u32, u32),
        stale_salt: (u32, u32),
        frames: &[WalFrameSpec],
        key: &[u8; 32],
        kdf_salt: &[u8; 16],
    ) -> Vec<u8> {
        // Magic 0x377f0682 selects little-endian checksum words.
        const MAGIC: u32 = 0x377f_0682;
        const VERSION: u32 = 3_007_000;
        let mut wal = vec![0u8; 32];
        wal[0..4].copy_from_slice(&MAGIC.to_be_bytes());
        wal[4..8].copy_from_slice(&VERSION.to_be_bytes());
        wal[8..12].copy_from_slice(&(PAGE as u32).to_be_bytes());
        wal[12..16].copy_from_slice(&0u32.to_be_bytes());
        wal[16..20].copy_from_slice(&salt.0.to_be_bytes());
        wal[20..24].copy_from_slice(&salt.1.to_be_bytes());
        let header_sum = wal_checksum(&wal[0..24], (0, 0), false);
        wal[24..28].copy_from_slice(&header_sum.0.to_be_bytes());
        wal[28..32].copy_from_slice(&header_sum.1.to_be_bytes());

        let mut chain = header_sum;
        for frame in frames {
            let frame_salt = if frame.stale_salt { stale_salt } else { salt };
            let mut header = [0u8; 24];
            header[0..4].copy_from_slice(&frame.page_no.to_be_bytes());
            header[4..8].copy_from_slice(&frame.commit.to_be_bytes());
            header[8..12].copy_from_slice(&frame_salt.0.to_be_bytes());
            header[12..16].copy_from_slice(&frame_salt.1.to_be_bytes());

            let encrypted = encrypt_page(&frame.plain_page, frame.page_no, key, kdf_salt);
            chain = wal_checksum(&header[0..8], chain, false);
            chain = wal_checksum(&encrypted, chain, false);
            let stored = if frame.break_checksum {
                (chain.0.wrapping_add(1), chain.1)
            } else {
                chain
            };
            header[16..20].copy_from_slice(&stored.0.to_be_bytes());
            header[20..24].copy_from_slice(&stored.1.to_be_bytes());
            wal.extend_from_slice(&header);
            wal.extend_from_slice(&encrypted);
        }
        wal
    }

    /// Write an encrypted database (and optional WAL) into `dir`.
    fn write_fixture(
        dir: &Path,
        main_pages: &[Vec<u8>],
        wal: Option<Vec<u8>>,
        key: &[u8; 32],
        kdf_salt: &[u8; 16],
    ) -> PathBuf {
        let db_path = dir.join("database.db");
        fs::write(&db_path, encrypt_pages(main_pages, key, kdf_salt)).unwrap();
        if let Some(bytes) = wal {
            fs::write(wal_path_for(&db_path), bytes).unwrap();
        }
        db_path
    }

    /// The main database holds one turn; the committed WAL replaces it with a
    /// two-turn view (one updated copy plus one new turn).
    fn fixture_db_with_committed_wal(dir: &Path) -> (PathBuf, [u8; 32], [u8; 16]) {
        let key = default_key();
        let kdf_salt = test_kdf_salt();

        let main_sql = format!(
            "{CHAT_TURN_SCHEMA}
            INSERT INTO chat_turn VALUES ('{{}}','s1','t1',1700000000,1700000001,'completed',0);"
        );
        let main_pages = plain_pages(dir, "main.db", &main_sql);

        let wal_sql = format!(
            "{CHAT_TURN_SCHEMA}
            INSERT INTO chat_turn VALUES ('{{}}','s1','t1',1700000000,1700000005,'completed',0);
            INSERT INTO chat_turn VALUES ('{{}}','s1','t2',1700000100,1700000105,'completed',0);"
        );
        let wal_pages = plain_pages(dir, "wal.db", &wal_sql);
        let frames: Vec<WalFrameSpec> = wal_pages
            .iter()
            .enumerate()
            .map(|(index, page)| WalFrameSpec {
                page_no: index as u32 + 1,
                commit: if index + 1 == wal_pages.len() {
                    wal_pages.len() as u32
                } else {
                    0
                },
                plain_page: page.clone(),
                stale_salt: false,
                break_checksum: false,
            })
            .collect();
        // WAL salts are independent of the main database's key-derivation salt.
        let salt = (0x1122_3344, 0x5566_7788);
        let wal = build_wal(salt, (0xdead_beef, 0xfeed_face), &frames, &key, &kdf_salt);

        let db_path = write_fixture(dir, &main_pages, Some(wal), &key, &kdf_salt);
        assert_ne!(
            [salt.0.to_be_bytes(), salt.1.to_be_bytes()].concat(),
            kdf_salt.to_vec(),
            "synthetic WAL salt must differ from the main database salt"
        );
        (db_path, key, kdf_salt)
    }

    #[test]
    fn test_snapshot_decrypts_db_with_committed_wal() {
        let dir = tempfile::tempdir().unwrap();
        let (db_path, key, _) = fixture_db_with_committed_wal(dir.path());

        let snapshot = create_snapshot(&db_path, &key, dir.path()).unwrap();

        let conn = Connection::open_with_flags(
            &snapshot.path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .unwrap();
        let turns: i64 = conn
            .query_row("SELECT COUNT(*) FROM chat_turn", [], |row| row.get(0))
            .unwrap();
        assert_eq!(turns, 2, "committed WAL frames must replace the main file view");
        let updated_at: i64 = conn
            .query_row(
                "SELECT updated_at FROM chat_turn WHERE turn_id = 't1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(updated_at, 1_700_000_005, "the WAL copy of turn t1 wins");
        assert_eq!(snapshot.bad_pages, 0);
    }

    const KAT_FIXTURE: &str = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/trae_cn/kat_sqlcipher4.db"
    );

    #[test]
    fn test_kat_official_vector_decrypts_and_hmac_passes() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("database.db");
        fs::copy(KAT_FIXTURE, &db_path).unwrap();
        let key = default_key();

        let snapshot = create_snapshot(&db_path, &key, dir.path()).unwrap();
        assert_eq!(snapshot.page_count, 11, "the official vector has 11 pages");
        assert_eq!(snapshot.bad_pages, 0, "every page must pass its HMAC check");

        let conn = Connection::open_with_flags(&snapshot.path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .unwrap();
        let integrity: String = conn
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .unwrap();
        assert_eq!(integrity, "ok", "the decrypted snapshot must be a valid SQLite file");
        let tables: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tables, 6, "the vector schema holds six empty tables");

        // Tampering with one IV byte must invalidate that page's HMAC. Run the
        // check on decrypt_page directly so the assertion stays valid once the
        // snapshot writer starts zeroing bad pages instead of failing.
        let encrypted = fs::read(&db_path).unwrap();
        let kdf_salt: [u8; 16] = encrypted[0..16].try_into().unwrap();
        let hmac_key = derive_hmac_key(&key, &kdf_salt);
        let mut page_two = encrypted[DEFAULT_PAGE_SIZE..2 * DEFAULT_PAGE_SIZE].to_vec();
        let iv_offset = DEFAULT_PAGE_SIZE - RESERVE_SIZE;
        page_two[iv_offset] ^= 0x01;
        let err = decrypt_page(&mut page_two, 2, &key, &hmac_key).unwrap_err();
        assert!(
            matches!(err, TraeDbError::BadPageHmac { page: 2 }),
            "IV tampering must fail page 2's HMAC, got {err:?}"
        );
    }
}
