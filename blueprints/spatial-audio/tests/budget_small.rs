//! A small scene through `server::Shard`: the selection bounds, the near field, finite times and
//! the release of codec state after silence.

use bp_spatial_audio::codec::{frame_len, Encoder, EncoderConfig, MAX_PACKET};
use bp_spatial_audio::geom::Vec3;
use bp_spatial_audio::grid::{cell_center, cell_of, FxBuild};
use bp_spatial_audio::select::beds_for_cell;
use bp_spatial_audio::server::{ListenerPos, Shard, ShardConfig, SpeakerFrame, EVICT_AFTER};
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

const LISTENERS: usize = 2_000;
const FRAMES: usize = 30;

fn packet_pool() -> Vec<Arc<[u8]>> {
    let cfg = EncoderConfig::voice();
    let mut enc = Encoder::new(cfg).unwrap();
    (0..16)
        .map(|f| {
            let pcm: Vec<f32> = (0..frame_len(cfg.rate)).map(|i| 0.1 * ((i + f * 960) as f32 * 0.05).sin()).collect();
            let mut buf = [0u8; MAX_PACKET];
            let len = enc.encode(&pcm, &mut buf).unwrap();
            Arc::from(&buf[..len])
        })
        .collect()
}

#[test]
fn small_scene_respects_the_stream_budget_and_releases_state() {
    let mut rng = ChaCha8Rng::seed_from_u64(7);
    let cfg = ShardConfig::default_mobile();
    let streams = cfg.select.streams() as u64;
    let pool = packet_pool();
    let pos: Vec<Vec3> = (0..LISTENERS).map(|_| Vec3::new(rng.gen_range(0.0..200.0), rng.gen_range(0.0..200.0), 0.0)).collect();
    let listeners: Vec<ListenerPos> = pos.iter().enumerate().map(|(i, p)| ListenerPos { id: i as u32, pos: *p }).collect();
    let talkers: Vec<usize> = (0..LISTENERS).filter(|i| i % 20 == 0).collect();

    let mut shard = Shard::new(cfg);
    for frame in 0..FRAMES {
        let speakers: Vec<SpeakerFrame> = talkers
            .iter()
            .map(|&i| SpeakerFrame { id: i as u32, pos: pos[i], level_db: (i % 7) as f32, packet: pool[(frame + i) % pool.len()].clone() })
            .collect();
        let s = shard.process(&speakers, &listeners).unwrap();
        assert_eq!(s.active_speakers, talkers.len());
        assert!(s.active_cells > 0 && s.active_sectors > 0);
        assert!(s.streams_out > 0 && s.streams_out <= LISTENERS as u64 * streams, "{} streams for {LISTENERS} listeners", s.streams_out);
        let t = s.times;
        for v in [t.grid, t.decode, t.mix, t.encode, t.select, t.total] {
            assert!(v.is_finite() && v >= 0.0, "{t:?}");
        }
        assert!(t.total >= t.decode && t.total >= t.encode);
    }
    let (dec, cells, sectors) = shard.codec_states();
    assert_eq!(dec, talkers.len());
    assert!(cells > 0 && sectors > 0);

    // After silence every codec state is released.
    for _ in 0..EVICT_AFTER + 2 {
        let s = shard.process(&[], &listeners).unwrap();
        assert_eq!(s.streams_out, 0);
    }
    assert_eq!(shard.codec_states(), (0, 0, 0));
}

#[test]
fn beds_start_beyond_the_near_field_and_are_bounded() {
    let cfg = ShardConfig::default_mobile();
    let mut rng = ChaCha8Rng::seed_from_u64(3);
    let active: HashSet<(i32, i32), FxBuild> = (0..400).map(|_| (rng.gen_range(-12..12), rng.gen_range(-12..12))).collect();
    let mut sectors = HashMap::default();
    for &c in &active {
        let s = (c.0.div_euclid(cfg.sector_cells), c.1.div_euclid(cfg.sector_cells));
        sectors.entry(s).or_insert_with(|| cell_center(c, cfg.cell_size));
    }
    for _ in 0..200 {
        let p = Vec3::new(rng.gen_range(-100.0..100.0), rng.gen_range(-100.0..100.0), 0.0);
        let cell = cell_of(p, cfg.cell_size);
        let here = cell_center(cell, cfg.cell_size);
        let (cells, secs) = beds_for_cell(cell, cfg.cell_size, &active, cfg.sector_cells, &sectors, &cfg.select);
        assert!(cells.len() <= cfg.select.beds && secs.len() <= cfg.select.sector_beds);
        for c in cells {
            assert!(cell_center(c, cfg.cell_size).dist(here) > cfg.select.near_radius);
        }
    }
}
