//! Types for `cads-blueprint-v1` and the catalog of blueprints.
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::Path;

include!(concat!(env!("OUT_DIR"), "/embedded.rs"));

#[derive(Debug, Clone, Deserialize)]
pub struct IntentSpec {
    pub keywords: BTreeMap<String, u32>,
    pub threshold: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ParamType {
    Int,
    Float,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Parameter {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: ParamType,
    pub default: f64,
    pub min: f64,
    pub max: f64,
    #[serde(default)]
    pub units: Vec<String>,
    #[serde(default)]
    pub flags: BTreeMap<String, f64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Blueprint {
    pub schema: String,
    pub id: String,
    pub version: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub summary: String,
    pub intent: IntentSpec,
    #[serde(default)]
    pub parameters: Vec<Parameter>,
}

#[derive(Debug, Clone, Default)]
pub struct Catalog {
    pub blueprints: Vec<Blueprint>,
}

impl Catalog {
    /// The blueprints compiled into the binary.
    pub fn embedded() -> Result<Catalog, String> {
        Catalog::from_jsons(EMBEDDED.iter().copied())
    }

    /// Loads `<dir>/*/blueprint.json` at run time.
    pub fn from_dir(dir: &Path) -> Result<Catalog, String> {
        let mut paths: Vec<_> = std::fs::read_dir(dir)
            .map_err(|e| format!("{}: {e}", dir.display()))?
            .filter_map(|e| e.ok())
            .map(|e| e.path().join("blueprint.json"))
            .filter(|p| p.is_file())
            .collect();
        paths.sort();
        let texts = paths
            .iter()
            .map(|p| std::fs::read_to_string(p).map_err(|e| format!("{}: {e}", p.display())))
            .collect::<Result<Vec<_>, _>>()?;
        Catalog::from_jsons(texts.iter().map(String::as_str))
    }

    pub fn from_jsons<'a>(jsons: impl IntoIterator<Item = &'a str>) -> Result<Catalog, String> {
        let mut blueprints: Vec<Blueprint> = Vec::new();
        for j in jsons {
            let b: Blueprint = serde_json::from_str(j).map_err(|e| format!("blueprint json: {e}"))?;
            b.validate()?;
            if blueprints.iter().any(|o| o.id == b.id) {
                return Err(format!("duplicate blueprint id {}", b.id));
            }
            blueprints.push(b);
        }
        blueprints.sort_by(|a, b| a.id.cmp(&b.id));
        Ok(Catalog { blueprints })
    }

    pub fn get(&self, id: &str) -> Option<&Blueprint> {
        self.blueprints.iter().find(|b| b.id == id)
    }
}

impl Blueprint {
    pub fn validate(&self) -> Result<(), String> {
        let id = &self.id;
        if self.schema != "cads-blueprint-v1" {
            return Err(format!("{id}: unsupported schema {}", self.schema));
        }
        if self.intent.threshold == 0 {
            return Err(format!("{id}: threshold must be > 0"));
        }
        let mut seen: Vec<&str> = Vec::new();
        for p in &self.parameters {
            if seen.contains(&p.name.as_str()) {
                return Err(format!("{id}: duplicate parameter {}", p.name));
            }
            seen.push(&p.name);
            if !(p.min <= p.default && p.default <= p.max) {
                return Err(format!("{id}: parameter {} default {} outside [{}, {}]", p.name, p.default, p.min, p.max));
            }
        }
        Ok(())
    }
}
