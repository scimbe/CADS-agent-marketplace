//! SQLite storage for prompt/harness-candidate attempts + brute-force cosine-similarity search
//! over their `task_embedding`. `rusqlite` (bundled) -- same storage-technology convention as
//! `registry`'s own `db.rs`: no new database technology, no vector-DB dependency (Qdrant/pgvector)
//! for what's expected to stay a modest-scale internal tool. Brute-force cosine over a stored f32
//! vector is genuinely fast enough at that scale (sub-millisecond to low-milliseconds even at
//! 100k rows) -- this is not a web-scale product, it's shared maintainer-team infrastructure.

use rusqlite::Connection;
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Entry {
    pub prompt: String,
    /// Arbitrary JSON describing what harness/tool-configuration was used -- deliberately opaque
    /// to this service (stored as an unparsed JSON string), since each demo's own harness shape
    /// differs and this service has no business validating it, only storing/retrieving it.
    pub harness_config: serde_json::Value,
    pub quality_score: f64,
    pub outcome: String,
    pub task_embedding: Vec<f32>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StoredEntry {
    pub id: i64,
    pub prompt: String,
    pub harness_config: serde_json::Value,
    pub quality_score: f64,
    pub outcome: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SearchResult {
    #[serde(flatten)]
    pub entry: StoredEntry,
    pub similarity: f64,
}

fn embedding_to_blob(v: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(v.len() * 4);
    for f in v {
        out.extend_from_slice(&f.to_le_bytes());
    }
    out
}

fn blob_to_embedding(b: &[u8]) -> Vec<f32> {
    b.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect()
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f64 = a.iter().zip(b).map(|(x, y)| *x as f64 * *y as f64).sum();
    let norm_a: f64 = a.iter().map(|x| (*x as f64).powi(2)).sum::<f64>().sqrt();
    let norm_b: f64 = b.iter().map(|x| (*x as f64).powi(2)).sum::<f64>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}

impl Db {
    pub fn open(path: &str) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| format!("open harness-memory db {path}: {e}"))?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prompt TEXT NOT NULL,
                harness_config TEXT NOT NULL,
                quality_score REAL NOT NULL,
                outcome TEXT NOT NULL,
                task_embedding BLOB NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at);",
        )
        .map_err(|e| format!("init harness-memory schema: {e}"))?;
        Ok(Db(Mutex::new(conn)))
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Self {
        Self::open(":memory:").expect("in-memory sqlite open never fails")
    }

    pub fn insert_entry(&self, e: &Entry, now: i64) -> Result<i64, String> {
        if e.task_embedding.is_empty() {
            return Err("task_embedding must not be empty".to_string());
        }
        let conn = self.0.lock().expect("harness-memory db mutex poisoned");
        let harness_config_json = serde_json::to_string(&e.harness_config).map_err(|err| format!("serialize harness_config: {err}"))?;
        conn.execute(
            "INSERT INTO entries (prompt, harness_config, quality_score, outcome, task_embedding, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                e.prompt,
                harness_config_json,
                e.quality_score,
                e.outcome,
                embedding_to_blob(&e.task_embedding),
                now,
            ],
        )
        .map_err(|err| format!("insert entry: {err}"))?;
        Ok(conn.last_insert_rowid())
    }

    /// Brute-force cosine-similarity search over every stored entry's `task_embedding`, returning
    /// the `top_k` highest-scoring matches, best first. Rows whose stored embedding dimensionality
    /// doesn't match the query's are skipped rather than erroring -- lets the embedding model
    /// change over time (e.g. a future non-BGE-M3 provider) without corrupting old rows or
    /// crashing a search that spans both.
    pub fn search(&self, query_embedding: &[f32], top_k: usize) -> Result<Vec<SearchResult>, String> {
        let conn = self.0.lock().expect("harness-memory db mutex poisoned");
        let mut stmt = conn
            .prepare("SELECT id, prompt, harness_config, quality_score, outcome, task_embedding, created_at FROM entries")
            .map_err(|e| format!("search: {e}"))?;
        let rows = stmt
            .query_map([], |row| {
                let harness_config_json: String = row.get(2)?;
                let embedding_blob: Vec<u8> = row.get(5)?;
                Ok((
                    StoredEntry {
                        id: row.get(0)?,
                        prompt: row.get(1)?,
                        harness_config: serde_json::from_str(&harness_config_json).unwrap_or(serde_json::Value::Null),
                        quality_score: row.get(3)?,
                        outcome: row.get(4)?,
                        created_at: row.get(6)?,
                    },
                    blob_to_embedding(&embedding_blob),
                ))
            })
            .map_err(|e| format!("search: {e}"))?;

        let mut scored: Vec<SearchResult> = Vec::new();
        for row in rows {
            let (entry, embedding) = row.map_err(|e| format!("search row: {e}"))?;
            if embedding.len() != query_embedding.len() {
                continue;
            }
            scored.push(SearchResult { entry, similarity: cosine_similarity(query_embedding, &embedding) });
        }
        scored.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal));
        scored.truncate(top_k);
        Ok(scored)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(prompt: &str, embedding: Vec<f32>) -> Entry {
        Entry {
            prompt: prompt.to_string(),
            harness_config: serde_json::json!({"tool": "test"}),
            quality_score: 0.9,
            outcome: "ok".to_string(),
            task_embedding: embedding,
        }
    }

    #[test]
    fn insert_then_search_finds_the_closest_vector_first() {
        let db = Db::open_in_memory();
        db.insert_entry(&sample("close", vec![1.0, 0.0, 0.0]), 1_000).unwrap();
        db.insert_entry(&sample("orthogonal", vec![0.0, 1.0, 0.0]), 1_001).unwrap();
        db.insert_entry(&sample("opposite", vec![-1.0, 0.0, 0.0]), 1_002).unwrap();

        let results = db.search(&[1.0, 0.0, 0.0], 3).unwrap();
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].entry.prompt, "close");
        assert!((results[0].similarity - 1.0).abs() < 1e-6, "{}", results[0].similarity);
        assert_eq!(results[1].entry.prompt, "orthogonal");
        assert!((results[1].similarity - 0.0).abs() < 1e-6, "{}", results[1].similarity);
        assert_eq!(results[2].entry.prompt, "opposite");
        assert!((results[2].similarity - (-1.0)).abs() < 1e-6, "{}", results[2].similarity);
    }

    #[test]
    fn search_respects_top_k() {
        let db = Db::open_in_memory();
        for i in 0..10 {
            db.insert_entry(&sample(&format!("e{i}"), vec![1.0, i as f32]), 1_000 + i).unwrap();
        }
        let results = db.search(&[1.0, 0.0], 3).unwrap();
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn empty_embedding_is_refused() {
        let db = Db::open_in_memory();
        let err = db.insert_entry(&sample("bad", vec![]), 1_000).unwrap_err();
        assert!(err.contains("task_embedding must not be empty"), "{err}");
    }

    #[test]
    fn search_over_an_empty_store_returns_no_results_not_an_error() {
        let db = Db::open_in_memory();
        let results = db.search(&[1.0, 0.0], 5).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn a_stored_row_with_a_different_embedding_dimension_is_skipped_not_erroring() {
        // Guards the "embedding model can change over time" claim in search()'s own doc comment.
        let db = Db::open_in_memory();
        db.insert_entry(&sample("old-dim", vec![1.0, 0.0]), 1_000).unwrap();
        db.insert_entry(&sample("new-dim", vec![1.0, 0.0, 0.0]), 1_001).unwrap();
        let results = db.search(&[1.0, 0.0, 0.0], 5).unwrap();
        assert_eq!(results.len(), 1, "the mismatched-dimension row must be skipped, not crash or corrupt the score");
        assert_eq!(results[0].entry.prompt, "new-dim");
    }

    #[test]
    fn harness_config_round_trips_arbitrary_json_shapes() {
        let db = Db::open_in_memory();
        let mut e = sample("json-shape", vec![1.0, 0.0]);
        e.harness_config = serde_json::json!({"nested": {"tools": ["a", "b"]}, "n": 3});
        db.insert_entry(&e, 1_000).unwrap();
        let results = db.search(&[1.0, 0.0], 1).unwrap();
        assert_eq!(results[0].entry.harness_config, serde_json::json!({"nested": {"tools": ["a", "b"]}, "n": 3}));
    }
}
