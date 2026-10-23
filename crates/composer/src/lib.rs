//! Composer part 1: the blueprint catalog and deterministic intent recognition.
pub mod catalog;
pub mod intent;

pub use catalog::{Blueprint, Catalog, Parameter, ParamType};
pub use intent::{recognize, Intent};
