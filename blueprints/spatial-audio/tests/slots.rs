//! Slot holding and silent beds.

use bp_spatial_audio::codec::{frame_len, Encoder, EncoderConfig, MAX_PACKET};
use bp_spatial_audio::geom::Vec3;
use bp_spatial_audio::grid::Grid;
use bp_spatial_audio::select::{select_slots, ActiveSpeaker, SelectConfig, Slot};
use bp_spatial_audio::server::{ListenerPos, Shard, ShardConfig, SpeakerFrame};
use std::sync::Arc;

fn spk(id: u32, x: f32, level: f32) -> ActiveSpeaker {
    ActiveSpeaker { id, pos: Vec3::new(x, 0.0, 0.0), level_db: level }
}

/// One frame of selection for a listener at the origin; returns the ids in slot order.
fn step(cfg: &SelectConfig, frame: u64, speakers: &[ActiveSpeaker], slots: &mut Vec<Slot>) -> Vec<u32> {
    let grid = Grid::build(8.0, speakers.iter().enumerate().map(|(i, s)| (i as u32, s.pos)));
    select_slots(99, Vec3::default(), &grid, speakers, cfg, frame, slots, &mut Vec::new());
    slots.iter().map(|s| s.id).collect()
}

#[test]
fn a_speaker_pausing_less_than_the_hold_time_keeps_the_place() {
    let cfg = SelectConfig { k: 2, hold_frames: 25, ..SelectConfig::mobile() };
    let mut slots = Vec::new();
    let both = [spk(1, 1.0, 0.0), spk(2, 2.0, 0.0)];
    assert_eq!(step(&cfg, 1, &both, &mut slots), vec![1, 2]);
    // Speaker 1 pauses for 20 frames (400 ms); an equally loud newcomer 3 appears meanwhile.
    for f in 2..22 {
        let ids = step(&cfg, f, &[spk(2, 2.0, 0.0), spk(3, 1.5, 0.0)], &mut slots);
        assert_eq!(ids, vec![1, 2], "frame {f}: place of 1 is held, 3 must wait");
    }
    assert_eq!(step(&cfg, 22, &both, &mut slots), vec![1, 2], "1 is back, set unchanged");
    // A pause beyond the hold time frees the place for the newcomer.
    let mut last = vec![];
    for f in 23..=50 {
        last = step(&cfg, f, &[spk(2, 2.0, 0.0), spk(3, 1.5, 0.0)], &mut slots);
    }
    assert_eq!(last, vec![2, 3], "3 took the place of 1, 2 kept its own");
}

#[test]
fn a_clearly_louder_challenger_displaces_the_quietest_place() {
    let cfg = SelectConfig { k: 2, hold_frames: 25, ..SelectConfig::mobile() };
    let mut slots = Vec::new();
    // 1 is quiet, 2 is loud (both at 2 m).
    assert_eq!(step(&cfg, 1, &[spk(1, 2.0, 0.0), spk(2, 2.0, 10.0)], &mut slots), vec![2, 1]);
    // 3 is 2 dB louder than 1: within the hysteresis, nobody moves.
    assert_eq!(step(&cfg, 2, &[spk(1, 2.0, 0.0), spk(2, 2.0, 10.0), spk(3, 2.0, 2.0)], &mut slots), vec![2, 1]);
    // 3 is 6 dB louder than 1: it takes the quietest place, even though 1 is still talking.
    assert_eq!(step(&cfg, 3, &[spk(1, 2.0, 0.0), spk(2, 2.0, 10.0), spk(3, 2.0, 6.0)], &mut slots), vec![2, 3]);
    // The same against a held (silent) place: 1 pauses, 4 is much louder than what 1 had.
    let mut slots = Vec::new();
    step(&cfg, 1, &[spk(1, 2.0, 0.0), spk(2, 2.0, 10.0)], &mut slots);
    assert_eq!(step(&cfg, 2, &[spk(2, 2.0, 10.0), spk(4, 2.0, 6.0)], &mut slots), vec![2, 4]);
}

#[test]
fn a_silent_bed_produces_no_stream_and_no_bytes() {
    let cfg = EncoderConfig::voice();
    let mut enc = Encoder::new(cfg).unwrap();
    let silent: Vec<f32> = vec![0.0; frame_len(cfg.rate)];
    let mut buf = [0u8; MAX_PACKET];
    // Let the encoder settle so the packet decodes to digital silence.
    let mut len = 0;
    for _ in 0..5 {
        len = enc.encode(&silent, &mut buf).unwrap();
    }
    let packet: Arc<[u8]> = Arc::from(&buf[..len]);
    // A speaker 100 m from the listener: its cell would be a bed, if it were not silent.
    let speakers = [SpeakerFrame { id: 0, pos: Vec3::new(100.0, 0.0, 0.0), level_db: 0.0, packet }];
    let listeners = [ListenerPos { id: 1, pos: Vec3::default() }];
    let mut shard = Shard::new(ShardConfig::default_mobile());
    let s = shard.process(&speakers, &listeners).unwrap();
    assert!(s.active_cells >= 1 && s.silent_beds >= 1, "{s:?}");
    assert_eq!(s.streams_out, 0, "no bed stream for a silent carpet");
    assert_eq!(s.bytes_out, 0);
    assert_eq!(shard.codec_states().1, 0, "a silent bed is not even encoded");
}
