//! Phase 1 installer engine: fetch a signed [`manifest_core::ServiceManifest`], verify it,
//! statically guardrail-scan its compose bundle, template secrets locally, run
//! `docker compose up`, run the bundle's `verify.sh`, and report a structured result. See
//! `docs/security-model.md` for the full threat model each module in this crate defends against.
//! [`plan`] is the dry-run counterpart (scimbe/ct-agent#183): the same checks, nothing executed.

pub mod activate;
pub mod allowlist;
pub mod composition;
pub mod fetch;
pub mod guardrails;
pub mod plan;
pub mod process;
pub mod report;
pub mod sandbox;

pub use activate::{
    activate, binary_manifest_platform_verdict, require_binary_sandbox_from_env, ActivateOptions, ALLOW_UNSANDBOXED_ENV,
};
pub use guardrails::GuardrailPolicy;
pub use plan::{plan, plan_with_selector_on, Plan, PlanOptions};
pub use composition::{
    activate_composition, CompositionActivateOptions, CompositionInstallReport, HolderKeyResolver, NullHolderKeyResolver,
    TeardownOutcome,
};
pub use report::InstallReport;
