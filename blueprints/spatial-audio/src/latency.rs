//! Mouth-to-ear latency budget.
//!
//! Two kinds of entries: measured on this host (server processing, codec lookahead) and assumed
//! (network one-way delays, jitter buffer, device audio buffers). The assumptions are parameters,
//! named as such in every report: a budget is only as true as its inputs, and network delay is the
//! one thing a benchmark on one machine cannot measure. ITU-T G.114 puts the limit for interactive
//! speech at 150 ms one way.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Network {
    pub name: String,
    /// One-way delay device <-> nearest edge, ms (assumption).
    pub uplink_ms: f64,
    pub downlink_ms: f64,
    /// Receiver jitter buffer, ms (assumption; adaptive buffers shrink on good links).
    pub jitter_buffer_ms: f64,
}

impl Network {
    /// Assumed figures for a listener near an edge. Replace with field measurements.
    pub fn assumed() -> Vec<Network> {
        let n = |name: &str, up: f64, down: f64, jb: f64| Network { name: name.into(), uplink_ms: up, downlink_ms: down, jitter_buffer_ms: jb };
        vec![n("wifi/fiber", 8.0, 8.0, 20.0), n("5G", 12.0, 12.0, 30.0), n("LTE", 25.0, 25.0, 40.0)]
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Budget {
    pub network: String,
    pub path: String,
    pub items: Vec<(String, f64)>,
    pub total_ms: f64,
    pub within_g114: bool,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct Measured {
    /// Encoder lookahead at the speaker (48 kHz voice), ms.
    pub voice_lookahead_ms: f64,
    /// Encoder lookahead of a bed, ms.
    pub bed_lookahead_ms: f64,
    /// Server processing per frame at p99, ms.
    pub server_p99_ms: f64,
    /// Device decode + render of all streams per frame, ms.
    pub device_ms: f64,
}

/// Device capture and playback buffers (assumption: low-latency audio paths, AAudio / AVAudioEngine).
pub const CAPTURE_MS: f64 = 10.0;
pub const PLAYBACK_MS: f64 = 10.0;

pub fn budgets(m: &Measured, frame_ms: f64) -> Vec<Budget> {
    let mut out = Vec::new();
    for net in Network::assumed() {
        for bed in [false, true] {
            let mut items = vec![
                ("capture buffer (assumed)".to_string(), CAPTURE_MS),
                ("frame".to_string(), frame_ms),
                ("voice encoder lookahead (measured)".to_string(), m.voice_lookahead_ms),
                (format!("uplink {} (assumed)", net.name), net.uplink_ms),
            ];
            if bed {
                // A bed waits for its frame to be complete, is mixed, and is encoded again.
                items.push(("bed: wait for the mix frame".to_string(), frame_ms));
                items.push(("bed: server processing p99 (measured)".to_string(), m.server_p99_ms));
                items.push(("bed encoder lookahead (measured)".to_string(), m.bed_lookahead_ms));
            } else {
                items.push(("forwarding (no decode)".to_string(), 1.0));
            }
            items.push((format!("downlink {} (assumed)", net.name), net.downlink_ms));
            items.push(("jitter buffer (assumed)".to_string(), net.jitter_buffer_ms));
            items.push(("decode + binaural render (measured)".to_string(), m.device_ms));
            items.push(("playback buffer (assumed)".to_string(), PLAYBACK_MS));
            let total: f64 = items.iter().map(|(_, v)| v).sum();
            out.push(Budget {
                network: net.name.clone(),
                path: if bed { "bed".into() } else { "direct voice".into() },
                items,
                total_ms: total,
                within_g114: total <= 150.0,
            });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_bed_costs_at_least_one_frame_more_than_a_direct_voice() {
        let m = Measured { voice_lookahead_ms: 6.5, bed_lookahead_ms: 6.5, server_p99_ms: 8.0, device_ms: 1.0 };
        let b = budgets(&m, 20.0);
        for pair in b.chunks(2) {
            assert!(pair[1].total_ms >= pair[0].total_ms + 20.0, "{pair:?}");
        }
    }
}
