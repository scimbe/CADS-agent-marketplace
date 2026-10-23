//! From one measured shard to a whole event: how many shards, cores and how much egress.
//!
//! A venue is cut into rectangular regions, one shard each; a listener connects to the shard of its
//! region. Listeners near a border also need beds from the neighbour's cells, so each shard sends
//! its border beds to its (up to eight) neighbours -- one A2A edge per neighbouring pair in the
//! composition manifest. The model is linear in the shard count because shards share nothing but
//! those border beds; it is only as good as the measured shard it is fed.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct ShardMeasurement {
    pub listeners: usize,
    pub active_speakers: f64,
    pub cores: usize,
    pub p99_ms: f64,
    /// Average egress per listener, kbit/s (packets, no transport overhead).
    pub egress_kbps_per_listener: f64,
    /// Bed bitrate, kbit/s, and border cells per shard side (for the exchange between shards).
    pub bed_kbps: f64,
    pub border_cells_per_side: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EventPlan {
    pub listeners: u64,
    pub listeners_per_shard: usize,
    pub shards: u64,
    pub cores: u64,
    /// How much of the 20 ms frame the measured p99 uses, after the headroom factor.
    pub frame_utilisation: f64,
    pub egress_gbps: f64,
    /// Transport overhead (IP/UDP/SRTP-like headers, ~40 bytes per packet) included.
    pub egress_gbps_with_headers: f64,
    pub shard_links: u64,
    pub border_exchange_mbps_per_link: f64,
    pub egress_tb_per_hour: f64,
}

/// Plan an event of `listeners` from one measured shard. `headroom` > 1 sizes shards smaller than
/// measured (e.g. 1.5: a shard runs at most at 2/3 of what was measured to fit the frame).
pub fn plan(m: &ShardMeasurement, listeners: u64, headroom: f64, streams_per_listener: f64) -> EventPlan {
    let frame_ms = crate::FRAME_MS as f64;
    let per_shard = ((m.listeners as f64) * (frame_ms / (m.p99_ms * headroom)).min(1.0)).floor().max(1.0) as usize;
    let shards = listeners.div_ceil(per_shard as u64);
    let side = (shards as f64).sqrt().ceil() as u64;
    // Grid of shards: horizontal, vertical and diagonal neighbours.
    let links = if side <= 1 { 0 } else { 2 * side * (side - 1) + 2 * (side - 1) * (side - 1) };
    let egress_gbps = listeners as f64 * m.egress_kbps_per_listener / 1e6;
    let header_kbps = streams_per_listener * 50.0 * 40.0 * 8.0 / 1000.0; // 50 packets/s per stream
    let egress_h = listeners as f64 * (m.egress_kbps_per_listener + header_kbps) / 1e6;
    EventPlan {
        listeners,
        listeners_per_shard: per_shard,
        shards,
        cores: shards * m.cores as u64,
        frame_utilisation: m.p99_ms * headroom / frame_ms,
        egress_gbps,
        egress_gbps_with_headers: egress_h,
        shard_links: links,
        border_exchange_mbps_per_link: 2.0 * m.border_cells_per_side * m.bed_kbps / 1000.0,
        egress_tb_per_hour: egress_h * 1e9 / 8.0 * 3600.0 / 1e12,
    }
}

/// Named price assumptions, not measurements: what a GB of egress and a core-hour cost the operator.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct CostAssumptions {
    pub usd_per_gb: f64,
    pub usd_per_core_hour: f64,
}

impl Default for CostAssumptions {
    fn default() -> CostAssumptions {
        CostAssumptions { usd_per_gb: 0.02, usd_per_core_hour: 0.04 }
    }
}

/// Cost of one listener for one hour, egress and CPU kept apart.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Cost {
    pub assumptions: CostAssumptions,
    /// Egress with transport headers, GB per listener-hour.
    pub egress_gb_per_listener_hour: f64,
    /// Server cores reserved per listener (the plan's cores over its listeners).
    pub cores_per_listener: f64,
    pub egress_usd_per_listener_hour: f64,
    pub cpu_usd_per_listener_hour: f64,
    pub total_usd_per_listener_hour: f64,
}

pub fn cost(p: &EventPlan, a: &CostAssumptions) -> Cost {
    let gb = p.egress_tb_per_hour * 1000.0 / p.listeners as f64;
    let cores = p.cores as f64 / p.listeners as f64;
    let (egress, cpu) = (gb * a.usd_per_gb, cores * a.usd_per_core_hour);
    Cost { assumptions: *a, egress_gb_per_listener_hour: gb, cores_per_listener: cores, egress_usd_per_listener_hour: egress, cpu_usd_per_listener_hour: cpu, total_usd_per_listener_hour: egress + cpu }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_million_listeners_need_proportionally_many_shards() {
        let m = ShardMeasurement {
            listeners: 50_000,
            active_speakers: 2_500.0,
            cores: 4,
            p99_ms: 10.0,
            egress_kbps_per_listener: 250.0,
            bed_kbps: 16.0,
            border_cells_per_side: 40.0,
        };
        let p = plan(&m, 1_000_000, 1.5, 12.0);
        // 10 ms x 1.5 = 15 ms of a 20 ms frame: the shard as measured fits, 20 shards.
        assert_eq!(p.listeners_per_shard, 50_000);
        assert_eq!(p.shards, 20);
        assert!((p.egress_gbps - 250.0).abs() < 1e-6);
        let tight = plan(&ShardMeasurement { p99_ms: 20.0, ..m }, 1_000_000, 1.5, 12.0);
        assert!(tight.listeners_per_shard < 50_000 && tight.shards > 20);
    }

    #[test]
    fn cost_per_listener_hour_separates_egress_and_cpu() {
        let m = ShardMeasurement { listeners: 10_000, active_speakers: 500.0, cores: 4, p99_ms: 10.0, egress_kbps_per_listener: 200.0, bed_kbps: 16.0, border_cells_per_side: 20.0 };
        let p = plan(&m, 1_000_000, 1.5, 10.0);
        let c = cost(&p, &CostAssumptions { usd_per_gb: 0.02, usd_per_core_hour: 0.04 });
        // (200 + 10 * 50 * 40 * 8 / 1000 = 160) kbit/s = 360 kbit/s = 0.162 GB per hour.
        assert!((c.egress_gb_per_listener_hour - 0.162).abs() < 1e-9);
        assert!((c.egress_usd_per_listener_hour - 0.00324).abs() < 1e-9);
        assert!((c.cpu_usd_per_listener_hour - p.cores as f64 / 1e6 * 0.04).abs() < 1e-12);
        assert!((c.total_usd_per_listener_hour - c.egress_usd_per_listener_hour - c.cpu_usd_per_listener_hour).abs() < 1e-15);
    }
}
