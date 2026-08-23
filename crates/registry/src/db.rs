//! SQLite storage for published manifests and the activation ledger. `rusqlite` (bundled --
//! matches this operator's own storage-technology convention of "no new database technology
//! introduced", the same choice `ct-agent`'s `capability.rs` already made).

use rusqlite::Connection;
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

#[derive(Debug, Clone)]
pub struct StoredManifest {
    pub manifest_id: String, // hex
    pub publisher_pubkey: String, // hex
    pub name: String,
    pub version: String,
    pub manifest_json: String,
    pub bundle_sha256: String, // hex
    /// "clean" or a `;`-joined list of `service[rule]: detail` violation strings -- mirrors
    /// `InstallReport::Rejected`'s own `guardrail_violations` detail formatting in
    /// `installer-engine::activate`, so an operator reading either surface sees the same shape.
    pub guardrail_verdict: String,
    pub published_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LedgerRow {
    pub manifest_id: String,
    pub name: String,
    pub version: String,
    pub activation_count: i64,
}

impl Db {
    pub fn open(path: &str) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| format!("open registry db {path}: {e}"))?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS manifests (
                manifest_id TEXT PRIMARY KEY,
                publisher_pubkey TEXT NOT NULL,
                name TEXT NOT NULL,
                version TEXT NOT NULL,
                manifest_json TEXT NOT NULL,
                bundle_sha256 TEXT NOT NULL,
                guardrail_verdict TEXT NOT NULL,
                published_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_manifests_publisher_name ON manifests(publisher_pubkey, name);
            CREATE TABLE IF NOT EXISTS activations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                manifest_id TEXT NOT NULL,
                activator_pubkey TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                status TEXT NOT NULL,
                FOREIGN KEY(manifest_id) REFERENCES manifests(manifest_id)
            );
            CREATE INDEX IF NOT EXISTS idx_activations_manifest ON activations(manifest_id);",
        )
        .map_err(|e| format!("init registry schema: {e}"))?;
        Ok(Db(Mutex::new(conn)))
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Self {
        Self::open(":memory:").expect("in-memory sqlite open never fails")
    }

    /// Insert a newly-published manifest. Fails (does not overwrite) if `manifest_id` already
    /// exists -- a `manifest_id` is a publisher-chosen, signature-bound identifier (part of the
    /// signed preimage, `manifest-core`'s own doc), so a second publish under the same id is
    /// either an accidental resend or an attempted overwrite of an immutable record; neither
    /// should silently replace what's stored.
    pub fn insert_manifest(&self, m: &StoredManifest) -> Result<(), String> {
        let conn = self.0.lock().expect("registry db mutex poisoned");
        let existing: Option<i64> = conn
            .query_row(
                "SELECT 1 FROM manifests WHERE manifest_id = ?1",
                [&m.manifest_id],
                |row| row.get(0),
            )
            .ok();
        if existing.is_some() {
            return Err(format!("manifest_id {} already published", m.manifest_id));
        }
        conn.execute(
            "INSERT INTO manifests (manifest_id, publisher_pubkey, name, version, manifest_json, bundle_sha256, guardrail_verdict, published_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                m.manifest_id,
                m.publisher_pubkey,
                m.name,
                m.version,
                m.manifest_json,
                m.bundle_sha256,
                m.guardrail_verdict,
                m.published_at
            ],
        )
        .map_err(|e| format!("insert manifest: {e}"))?;
        Ok(())
    }

    pub fn get_manifest(&self, manifest_id: &str) -> Result<Option<StoredManifest>, String> {
        let conn = self.0.lock().expect("registry db mutex poisoned");
        conn.query_row(
            "SELECT manifest_id, publisher_pubkey, name, version, manifest_json, bundle_sha256, guardrail_verdict, published_at
             FROM manifests WHERE manifest_id = ?1",
            [manifest_id],
            row_to_stored,
        )
        .map(Some)
        .or_else(|e| if e == rusqlite::Error::QueryReturnedNoRows { Ok(None) } else { Err(format!("get manifest: {e}")) })
    }

    pub fn list_manifests(&self, publisher: Option<&str>, name: Option<&str>) -> Result<Vec<StoredManifest>, String> {
        let conn = self.0.lock().expect("registry db mutex poisoned");
        let mut sql = "SELECT manifest_id, publisher_pubkey, name, version, manifest_json, bundle_sha256, guardrail_verdict, published_at FROM manifests WHERE 1=1".to_string();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        if let Some(p) = publisher {
            sql.push_str(" AND publisher_pubkey = ?");
            params.push(Box::new(p.to_string()));
        }
        if let Some(n) = name {
            sql.push_str(" AND name = ?");
            params.push(Box::new(n.to_string()));
        }
        sql.push_str(" ORDER BY published_at DESC");
        let mut stmt = conn.prepare(&sql).map_err(|e| format!("list manifests: {e}"))?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
        let rows = stmt
            .query_map(param_refs.as_slice(), row_to_stored)
            .map_err(|e| format!("list manifests: {e}"))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("list manifests: {e}"))
    }

    pub fn insert_activation(&self, manifest_id: &str, activator_pubkey: &str, timestamp: i64, status: &str) -> Result<(), String> {
        let conn = self.0.lock().expect("registry db mutex poisoned");
        conn.execute(
            "INSERT INTO activations (manifest_id, activator_pubkey, timestamp, status) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![manifest_id, activator_pubkey, timestamp, status],
        )
        .map_err(|e| format!("insert activation: {e}"))?;
        Ok(())
    }

    pub fn publisher_ledger(&self, publisher_pubkey: &str) -> Result<Vec<LedgerRow>, String> {
        let conn = self.0.lock().expect("registry db mutex poisoned");
        let mut stmt = conn
            .prepare(
                "SELECT m.manifest_id, m.name, m.version, COUNT(a.id) as cnt
                 FROM manifests m LEFT JOIN activations a ON a.manifest_id = m.manifest_id
                 WHERE m.publisher_pubkey = ?1
                 GROUP BY m.manifest_id
                 ORDER BY m.published_at DESC",
            )
            .map_err(|e| format!("publisher ledger: {e}"))?;
        let rows = stmt
            .query_map([publisher_pubkey], |row| {
                Ok(LedgerRow {
                    manifest_id: row.get(0)?,
                    name: row.get(1)?,
                    version: row.get(2)?,
                    activation_count: row.get(3)?,
                })
            })
            .map_err(|e| format!("publisher ledger: {e}"))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| format!("publisher ledger: {e}"))
    }
}

fn row_to_stored(row: &rusqlite::Row) -> rusqlite::Result<StoredManifest> {
    Ok(StoredManifest {
        manifest_id: row.get(0)?,
        publisher_pubkey: row.get(1)?,
        name: row.get(2)?,
        version: row.get(3)?,
        manifest_json: row.get(4)?,
        bundle_sha256: row.get(5)?,
        guardrail_verdict: row.get(6)?,
        published_at: row.get(7)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(id: &str) -> StoredManifest {
        StoredManifest {
            manifest_id: id.to_string(),
            publisher_pubkey: "aa".repeat(32),
            name: "litellm-proof".to_string(),
            version: "0.1.0".to_string(),
            manifest_json: "{}".to_string(),
            bundle_sha256: "bb".repeat(32),
            guardrail_verdict: "clean".to_string(),
            published_at: 1_000,
        }
    }

    #[test]
    fn insert_then_get_round_trips() {
        let db = Db::open_in_memory();
        db.insert_manifest(&sample("m1")).unwrap();
        let got = db.get_manifest("m1").unwrap().unwrap();
        assert_eq!(got.name, "litellm-proof");
        assert_eq!(got.guardrail_verdict, "clean");
    }

    #[test]
    fn duplicate_manifest_id_is_refused() {
        let db = Db::open_in_memory();
        db.insert_manifest(&sample("m1")).unwrap();
        let err = db.insert_manifest(&sample("m1")).unwrap_err();
        assert!(err.contains("already published"), "{err}");
    }

    #[test]
    fn get_missing_manifest_is_none_not_an_error() {
        let db = Db::open_in_memory();
        assert!(db.get_manifest("nope").unwrap().is_none());
    }

    #[test]
    fn list_filters_by_publisher_and_name() {
        let db = Db::open_in_memory();
        let mut a = sample("m1");
        a.publisher_pubkey = "aa".repeat(32);
        a.name = "foo".to_string();
        db.insert_manifest(&a).unwrap();
        let mut b = sample("m2");
        b.publisher_pubkey = "cc".repeat(32);
        b.name = "bar".to_string();
        db.insert_manifest(&b).unwrap();

        assert_eq!(db.list_manifests(Some(&"aa".repeat(32)), None).unwrap().len(), 1);
        assert_eq!(db.list_manifests(None, Some("bar")).unwrap().len(), 1);
        assert_eq!(db.list_manifests(None, None).unwrap().len(), 2);
        assert_eq!(db.list_manifests(Some(&"aa".repeat(32)), Some("bar")).unwrap().len(), 0);
    }

    #[test]
    fn ledger_accumulates_activation_counts_across_multiple_activations() {
        let db = Db::open_in_memory();
        db.insert_manifest(&sample("m1")).unwrap();
        let publisher = "aa".repeat(32);
        db.insert_activation("m1", "activator1", 1_100, "ok").unwrap();
        db.insert_activation("m1", "activator2", 1_200, "ok").unwrap();
        db.insert_activation("m1", "activator1", 1_300, "ok").unwrap();
        let ledger = db.publisher_ledger(&publisher).unwrap();
        assert_eq!(ledger.len(), 1);
        assert_eq!(ledger[0].activation_count, 3);
    }

    #[test]
    fn ledger_for_a_manifest_with_zero_activations_still_lists_it_at_zero() {
        let db = Db::open_in_memory();
        db.insert_manifest(&sample("m1")).unwrap();
        let ledger = db.publisher_ledger(&"aa".repeat(32)).unwrap();
        assert_eq!(ledger.len(), 1);
        assert_eq!(ledger[0].activation_count, 0);
    }
}
