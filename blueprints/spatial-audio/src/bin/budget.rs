//! The acceptance benchmark: one shard of a crowd, real Opus, timed per frame.
//!
//! `budget [--listeners N] [--active F] [--frames N] [--threads N] [--density P] [--seed S]
//!  [--plan-listeners N]`. Prints JSON; exit code 1 unless the shard sustains real time (p99 below
//! one 20 ms frame) and a bed's server-added latency (one frame of waiting plus processing) stays
//! below 50 ms at p99.

use bp_spatial_audio::codec::{frame_len, Decoder, Encoder, EncoderConfig, MAX_PACKET, REAL_CODEC};
use bp_spatial_audio::geom::{Pose, Vec3};
use bp_spatial_audio::latency::{budgets, Measured};
use bp_spatial_audio::render::{RenderConfig, Spatializer};
use bp_spatial_audio::scale::{plan, ShardMeasurement};
use bp_spatial_audio::server::{ListenerPos, Shard, ShardConfig, SpeakerFrame};
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use serde_json::json;
use std::sync::Arc;
use std::time::Instant;

struct Args {
    listeners: usize,
    active: f64,
    frames: usize,
    threads: usize,
    density: f32,
    seed: u64,
    plan_listeners: u64,
}

fn parse() -> Args {
    let mut a = Args { listeners: 50_000, active: 0.05, frames: 250, threads: 0, density: 0.5, seed: 1, plan_listeners: 1_000_000 };
    let v: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < v.len() {
        let val = v.get(i + 1).cloned().unwrap_or_else(|| die(&format!("{} needs a value", v[i])));
        let num = |s: &str| s.parse::<f64>().unwrap_or_else(|_| die(&format!("not a number: {s}")));
        match v[i].as_str() {
            "--listeners" => a.listeners = num(&val) as usize,
            "--active" => a.active = num(&val),
            "--frames" => a.frames = num(&val) as usize,
            "--threads" => a.threads = num(&val) as usize,
            "--density" => a.density = num(&val) as f32,
            "--seed" => a.seed = num(&val) as u64,
            "--plan-listeners" => a.plan_listeners = num(&val) as u64,
            o => die(&format!("unknown option {o}")),
        }
        i += 2;
    }
    a
}

fn die(m: &str) -> ! {
    eprintln!("budget: {m}");
    std::process::exit(2)
}

/// A voice-like signal: a few harmonics of a gliding pitch under a syllable envelope, plus breath.
fn voice(rate: u32, f0: f32, frames: usize, seed: u64) -> Vec<f32> {
    let mut rng = ChaCha8Rng::seed_from_u64(seed);
    let n = frame_len(rate) * frames;
    let mut phase = 0f32;
    (0..n)
        .map(|i| {
            let t = i as f32 / rate as f32;
            let f = f0 * (1.0 + 0.08 * (2.0 * std::f32::consts::PI * 0.7 * t).sin());
            phase += 2.0 * std::f32::consts::PI * f / rate as f32;
            let syll = (0.5 + 0.5 * (2.0 * std::f32::consts::PI * 4.0 * t).sin()).powi(2);
            let h: f32 = (1..=12).map(|k| (k as f32 * phase).sin() / k as f32).sum();
            0.15 * syll * h + 0.01 * (rng.gen::<f32>() - 0.5)
        })
        .collect()
}

fn pct(v: &mut [f64], p: f64) -> f64 {
    if v.is_empty() {
        return 0.0;
    }
    v.sort_by(|a, b| a.total_cmp(b));
    v[((v.len() - 1) as f64 * p).round() as usize]
}

fn main() {
    let a = parse();
    if a.threads > 0 {
        rayon::ThreadPoolBuilder::new().num_threads(a.threads).build_global().unwrap_or_else(|e| die(&e.to_string()));
    }
    let cores = rayon::current_num_threads();
    let mut rng = ChaCha8Rng::seed_from_u64(a.seed);
    let cfg = ShardConfig::default_mobile();

    // The crowd: blocks of a stand, separated by aisles, at the given density.
    let area = a.listeners as f32 / a.density;
    let side = area.sqrt() * 1.1;
    let blocks = 5;
    let block = side / blocks as f32;
    let mut pos: Vec<Vec3> = (0..a.listeners)
        .map(|_| {
            let (bx, by) = (rng.gen_range(0..blocks), rng.gen_range(0..blocks));
            Vec3::new(bx as f32 * block + rng.gen_range(0.0..block * 0.9), by as f32 * block + rng.gen_range(0.0..block * 0.9), 0.0)
        })
        .collect();

    // Packets as phones would send them: 8 voices x 50 frames, encoded at 48 kHz.
    let voice_cfg = EncoderConfig::voice();
    let mut voice_enc = Encoder::new(voice_cfg).unwrap_or_else(|e| die(&e.to_string()));
    let voice_lookahead = voice_enc.lookahead().unwrap_or(0) as f64 * 1000.0 / voice_cfg.rate as f64;
    let mut pool: Vec<Vec<Arc<[u8]>>> = Vec::new();
    for v in 0..8 {
        let mut enc = Encoder::new(voice_cfg).unwrap();
        let pcm = voice(voice_cfg.rate, 95.0 + 22.0 * v as f32, 50, v as u64);
        let mut frames = Vec::new();
        for f in pcm.chunks(frame_len(voice_cfg.rate)) {
            let mut buf = [0u8; MAX_PACKET];
            let len = enc.encode(f, &mut buf).unwrap();
            frames.push(Arc::from(&buf[..len]));
        }
        pool.push(frames);
    }
    let mut bed_enc = Encoder::new(cfg.bed).unwrap();
    let bed_lookahead = bed_enc.lookahead().unwrap_or(0) as f64 * 1000.0 / cfg.bed.rate as f64;

    // Talk spurts: two-state Markov chain, mean spurt 1 s, duty cycle `active`.
    let p_stop = 1.0 / 50.0;
    let p_start = p_stop * a.active / (1.0 - a.active);
    let mut talking: Vec<bool> = (0..a.listeners).map(|_| rng.gen_bool(a.active)).collect();
    let level: Vec<f32> = (0..a.listeners).map(|_| rng.gen_range(-6.0..6.0)).collect();
    let listeners_of = |pos: &[Vec3]| -> Vec<ListenerPos> { pos.iter().enumerate().map(|(i, p)| ListenerPos { id: i as u32, pos: *p }).collect() };

    let mut shard = Shard::new(cfg);
    let warmup = 50;
    let mut stats = Vec::new();
    for frame in 0..(warmup + a.frames) {
        for i in 0..a.listeners {
            talking[i] = if talking[i] { !rng.gen_bool(p_stop) } else { rng.gen_bool(p_start) };
            pos[i].x += rng.gen_range(-0.02..0.02);
            pos[i].y += rng.gen_range(-0.02..0.02);
        }
        let speakers: Vec<SpeakerFrame> = (0..a.listeners)
            .filter(|i| talking[*i])
            .map(|i| SpeakerFrame { id: i as u32, pos: pos[i], level_db: level[i], packet: pool[i % 8][(frame + i) % 50].clone() })
            .collect();
        let s = shard.process(&speakers, &listeners_of(&pos)).unwrap_or_else(|e| die(&e.to_string()));
        if frame >= warmup {
            stats.push(s);
        }
    }

    // The device: decode and render what one listener receives.
    let streams = cfg.select.streams();
    let mut decoders: Vec<Decoder> = (0..streams).map(|_| Decoder::new(48_000).unwrap()).collect();
    let mut spat = Spatializer::new(RenderConfig::default());
    let mut pcm = vec![vec![0f32; frame_len(48_000)]; streams];
    let mut out = vec![0f32; 2 * frame_len(48_000)];
    let mut device_us = Vec::new();
    for f in 0..300 {
        let t = Instant::now();
        for (k, d) in decoders.iter_mut().enumerate() {
            d.decode(&pool[k % 8][f % 50], &mut pcm[k]).unwrap();
        }
        let srcs: Vec<(u32, Vec3, &[f32])> = pcm
            .iter()
            .enumerate()
            .map(|(k, p)| (k as u32, Vec3::new((k as f32 * 1.3).sin() * (3.0 + k as f32 * 4.0), (k as f32 * 1.3).cos() * (3.0 + k as f32 * 4.0), 0.0), p.as_slice()))
            .collect();
        spat.render(Pose { pos: Vec3::default(), yaw: f as f32 * 0.01 }, &srcs, &mut out);
        if f >= 50 {
            device_us.push(t.elapsed().as_secs_f64() * 1e6);
        }
    }

    let col = |f: &dyn Fn(&bp_spatial_audio::server::FrameStats) -> f64| -> Vec<f64> { stats.iter().map(f).collect() };
    let stage = |f: &dyn Fn(&bp_spatial_audio::server::FrameStats) -> f64| {
        let mut v = col(f);
        json!({ "p50": pct(&mut v, 0.5), "p99": pct(&mut v, 0.99), "max": pct(&mut v, 1.0) })
    };
    let mut total = col(&|s| s.times.total);
    let p99 = pct(&mut total, 0.99);
    let over_frame = total.iter().filter(|t| **t > 20.0).count();
    let mean = |v: Vec<f64>| v.iter().sum::<f64>() / v.len().max(1) as f64;
    let egress_kbps = mean(col(&|s| s.bytes_out as f64)) * 8.0 * 50.0 / 1000.0 / a.listeners as f64;
    let streams_avg = mean(col(&|s| s.streams_out as f64)) / a.listeners as f64;
    let device_p99_ms = pct(&mut device_us, 0.99) / 1000.0;
    let measured = Measured { voice_lookahead_ms: voice_lookahead, bed_lookahead_ms: bed_lookahead, server_p99_ms: p99, device_ms: device_p99_ms };
    let budget = budgets(&measured, 20.0);
    let shard_m = ShardMeasurement {
        listeners: a.listeners,
        active_speakers: mean(col(&|s| s.active_speakers as f64)),
        cores,
        p99_ms: p99,
        egress_kbps_per_listener: egress_kbps,
        bed_kbps: cfg.bed.bitrate as f64 / 1000.0,
        border_cells_per_side: (side / cfg.cell_size) as f64,
    };
    let event = plan(&shard_m, a.plan_listeners, 1.5, streams_avg);
    let sustainable = p99 < 20.0;
    let bed_added_p99 = 20.0 + p99;
    let ok = sustainable && bed_added_p99 < 50.0;
    let report = json!({
        "real_codec": REAL_CODEC,
        "listeners": a.listeners,
        "cores": cores,
        "frames_measured": stats.len(),
        "venue_side_m": side,
        "active_speakers_avg": shard_m.active_speakers,
        "active_cells_avg": mean(col(&|s| s.active_cells as f64)),
        "active_sectors_avg": mean(col(&|s| s.active_sectors as f64)),
        "stage_ms": {
            "grid": stage(&|s| s.times.grid),
            "decode": stage(&|s| s.times.decode),
            "mix": stage(&|s| s.times.mix),
            "encode": stage(&|s| s.times.encode),
            "select": stage(&|s| s.times.select),
            "total": stage(&|s| s.times.total),
        },
        "frames_over_20ms": over_frame,
        "server_p99_ms": p99,
        "bed_server_added_latency_p99_ms": bed_added_p99,
        "streams_per_listener": streams_avg,
        "egress_kbps_per_listener": egress_kbps,
        "direct_changes_per_listener_per_s": mean(col(&|s| s.direct_changes as f64)) * 50.0 / a.listeners as f64,
        "device": {
            "streams": streams,
            "decode_and_render_us_p50": pct(&mut device_us, 0.5),
            "decode_and_render_us_p99": device_p99_ms * 1000.0,
            "share_of_one_core": pct(&mut device_us, 0.5) / 20_000.0,
            "note": "measured on this host's CPU; a phone core is slower (factor not measured here)",
        },
        "latency_budget": budget,
        "event_plan": event,
        "acceptance": {
            "sustainable_p99_below_frame": sustainable,
            "bed_server_added_below_50ms": bed_added_p99 < 50.0,
            "direct_voice_lte_within_g114": budget.iter().any(|b| b.network == "LTE" && b.path == "direct voice" && b.within_g114),
            "passed": ok,
        },
    });
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
    if !ok {
        std::process::exit(1);
    }
}
