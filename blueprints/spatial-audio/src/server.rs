//! One shard's work per 20 ms frame, timed stage by stage.
//!
//! Codec state is per stream and must persist across frames (Opus is a predictive codec): one
//! decoder per active speaker, one encoder per active cell and per active sector, created on first
//! activity and dropped after [`EVICT_AFTER`] silent frames. The stages that cost real CPU -- decode,
//! mix, encode, selection -- run in parallel across the shard's cores (rayon).

use crate::codec::{frame_len, CodecError, Decoder, Encoder, EncoderConfig, MAX_PACKET};
use crate::geom::Vec3;
use crate::grid::{cell_center, cell_of, Cell, FxBuild, Grid};
use crate::select::{beds_for_cell, select_direct, ActiveSpeaker, SelectConfig};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Instant;

/// Frames of silence after which a stream's codec state is dropped (2 s).
pub const EVICT_AFTER: u64 = 100;

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct ShardConfig {
    pub cell_size: f32,
    /// Sector side, in cells.
    pub sector_cells: i32,
    pub select: SelectConfig,
    pub bed: EncoderConfig,
    /// A cell bed mixes at most this many of its loudest speakers (the rest are masked anyway).
    pub max_voices_per_bed: usize,
}

impl ShardConfig {
    pub fn default_mobile() -> ShardConfig {
        ShardConfig { cell_size: 8.0, sector_cells: 8, select: SelectConfig::mobile(), bed: EncoderConfig::bed(), max_voices_per_bed: 8 }
    }
}

/// One speaker's frame as it arrives: an Opus packet encoded on the device, the device's position
/// and its voice level (from the encoder's voice activity detection, sent alongside).
#[derive(Clone, Debug)]
pub struct SpeakerFrame {
    pub id: u32,
    pub pos: Vec3,
    pub level_db: f32,
    pub packet: Arc<[u8]>,
}

#[derive(Clone, Copy, Debug)]
pub struct ListenerPos {
    pub id: u32,
    pub pos: Vec3,
}

/// Wall time of each stage of one frame, milliseconds.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize)]
pub struct StageTimes {
    pub grid: f64,
    pub decode: f64,
    pub mix: f64,
    pub encode: f64,
    pub select: f64,
    pub total: f64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct FrameStats {
    pub times: StageTimes,
    pub active_speakers: usize,
    pub active_cells: usize,
    pub active_sectors: usize,
    /// Streams sent to listeners this frame, and their bytes (packets only, no transport headers).
    pub streams_out: u64,
    pub bytes_out: u64,
    /// Listeners whose set of direct voices changed this frame (each change starts a stream).
    pub direct_changes: u64,
}

pub struct Shard {
    pub cfg: ShardConfig,
    decoders: HashMap<u32, (Decoder, u64), FxBuild>,
    cell_encoders: HashMap<Cell, (Encoder, u64), FxBuild>,
    sector_encoders: HashMap<Cell, (Encoder, u64), FxBuild>,
    /// Per listener (by position in the listener slice): the direct voices chosen last frame.
    prev_direct: Vec<Vec<u32>>,
    frame: u64,
}

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1e3
}

/// A soft limiter: transparent below ~0.5, never above 1.
fn limit(x: f32) -> f32 {
    if x.abs() < 0.5 {
        x
    } else {
        x.signum() * (0.5 + 0.5 * ((x.abs() - 0.5) / 0.5).tanh())
    }
}

impl Shard {
    pub fn new(cfg: ShardConfig) -> Shard {
        Shard {
            cfg,
            decoders: HashMap::default(),
            cell_encoders: HashMap::default(),
            sector_encoders: HashMap::default(),
            prev_direct: Vec::new(),
            frame: 0,
        }
    }

    pub fn codec_states(&self) -> (usize, usize, usize) {
        (self.decoders.len(), self.cell_encoders.len(), self.sector_encoders.len())
    }

    /// Process one frame. `listeners` must be the same population in the same order every frame
    /// (the hysteresis state is kept by position).
    pub fn process(&mut self, speakers: &[SpeakerFrame], listeners: &[ListenerPos]) -> Result<FrameStats, CodecError> {
        let start = Instant::now();
        self.frame += 1;
        let frame = self.frame;
        let cfg = self.cfg;
        let rate = cfg.bed.rate;
        let n = frame_len(rate);
        let mut stats = FrameStats { active_speakers: speakers.len(), ..FrameStats::default() };

        // 1. Grid of active speakers, cells and sectors.
        let t = Instant::now();
        let active: Vec<ActiveSpeaker> = speakers.iter().map(|s| ActiveSpeaker { id: s.id, pos: s.pos, level_db: s.level_db }).collect();
        let grid = Grid::build(cfg.cell_size, active.iter().enumerate().map(|(i, s)| (i as u32, s.pos)));
        let sector_of = |c: Cell| (c.0.div_euclid(cfg.sector_cells), c.1.div_euclid(cfg.sector_cells));
        let mut cells: Vec<(Cell, Vec<u32>)> = grid.cells().map(|(c, ids)| (*c, ids.clone())).collect();
        cells.sort_unstable_by_key(|(c, _)| *c);
        let active_cells: HashSet<Cell, FxBuild> = cells.iter().map(|(c, _)| *c).collect();
        let mut sector_members: HashMap<Cell, Vec<usize>, FxBuild> = HashMap::default();
        for (i, (c, _)) in cells.iter().enumerate() {
            sector_members.entry(sector_of(*c)).or_default().push(i);
        }
        let sector_centres: HashMap<Cell, Vec3, FxBuild> = sector_members
            .iter()
            .map(|(s, members)| {
                let (mut x, mut y) = (0.0, 0.0);
                for i in members {
                    let c = cell_center(cells[*i].0, cfg.cell_size);
                    x += c.x;
                    y += c.y;
                }
                (*s, Vec3::new(x / members.len() as f32, y / members.len() as f32, 0.0))
            })
            .collect();
        stats.active_cells = cells.len();
        stats.active_sectors = sector_members.len();
        stats.times.grid = ms(t);

        // 2. Decode every active speaker once, at the bed rate.
        let t = Instant::now();
        let mut work: Vec<(usize, Decoder)> = Vec::with_capacity(speakers.len());
        for (i, s) in speakers.iter().enumerate() {
            let dec = match self.decoders.remove(&s.id) {
                Some((d, _)) => d,
                None => Decoder::new(rate)?,
            };
            work.push((i, dec));
        }
        let pcm: Vec<Result<Vec<f32>, CodecError>> = work
            .par_iter_mut()
            .map(|(i, dec)| {
                let mut out = vec![0f32; n];
                dec.decode(&speakers[*i].packet, &mut out)?;
                Ok(out)
            })
            .collect();
        let pcm: Vec<Vec<f32>> = pcm.into_iter().collect::<Result<_, _>>()?;
        for (i, dec) in work {
            self.decoders.insert(speakers[i].id, (dec, frame));
        }
        stats.times.decode = ms(t);

        // 3. Mix per cell (loudest voices first, capped) and per sector.
        let t = Instant::now();
        let cell_pcm: Vec<Vec<f32>> = cells
            .par_iter()
            .map(|(_, ids)| {
                let mut ids: Vec<u32> = ids.clone();
                ids.sort_unstable_by(|a, b| active[*b as usize].level_db.total_cmp(&active[*a as usize].level_db).then(a.cmp(b)));
                ids.truncate(cfg.max_voices_per_bed);
                let norm = 1.0 / (ids.len() as f32).sqrt();
                let mut acc = vec![0f32; n];
                for id in &ids {
                    for (a, s) in acc.iter_mut().zip(&pcm[*id as usize]) {
                        *a += s * norm;
                    }
                }
                acc.iter_mut().for_each(|x| *x = limit(*x));
                acc
            })
            .collect();
        let mut sectors: Vec<(Cell, Vec<usize>)> = sector_members.into_iter().collect();
        sectors.sort_unstable_by_key(|(s, _)| *s);
        let sector_pcm: Vec<Vec<f32>> = sectors
            .par_iter()
            .map(|(_, members)| {
                let norm = 1.0 / (members.len() as f32).sqrt();
                let mut acc = vec![0f32; n];
                for m in members {
                    for (a, s) in acc.iter_mut().zip(&cell_pcm[*m]) {
                        *a += s * norm;
                    }
                }
                acc.iter_mut().for_each(|x| *x = limit(*x));
                acc
            })
            .collect();
        stats.times.mix = ms(t);

        // 4. Encode every bed once.
        let t = Instant::now();
        let take = |map: &mut HashMap<Cell, (Encoder, u64), FxBuild>, keys: &[Cell]| -> Result<Vec<Encoder>, CodecError> {
            keys.iter().map(|k| map.remove(k).map(|(e, _)| Ok(e)).unwrap_or_else(|| Encoder::new(cfg.bed))).collect()
        };
        let cell_keys: Vec<Cell> = cells.iter().map(|(c, _)| *c).collect();
        let sector_keys: Vec<Cell> = sectors.iter().map(|(s, _)| *s).collect();
        let mut cell_enc = take(&mut self.cell_encoders, &cell_keys)?;
        let mut sector_enc = take(&mut self.sector_encoders, &sector_keys)?;
        let encode_all = |encs: &mut Vec<Encoder>, pcm: &[Vec<f32>]| -> Result<Vec<usize>, CodecError> {
            encs.par_iter_mut()
                .zip(pcm.par_iter())
                .map(|(e, p)| {
                    let mut buf = [0u8; MAX_PACKET];
                    e.encode(p, &mut buf)
                })
                .collect()
        };
        let cell_bytes = encode_all(&mut cell_enc, &cell_pcm)?;
        let sector_bytes = encode_all(&mut sector_enc, &sector_pcm)?;
        for (k, e) in cell_keys.iter().zip(cell_enc) {
            self.cell_encoders.insert(*k, (e, frame));
        }
        for (k, e) in sector_keys.iter().zip(sector_enc) {
            self.sector_encoders.insert(*k, (e, frame));
        }
        stats.times.encode = ms(t);

        // 5. Selection: beds per listener cell, direct voices per listener.
        let t = Instant::now();
        let mut listener_cells: Vec<Cell> = listeners.iter().map(|l| cell_of(l.pos, cfg.cell_size)).collect::<HashSet<_, FxBuild>>().into_iter().collect();
        listener_cells.sort_unstable();
        let beds: HashMap<Cell, (Vec<Cell>, Vec<Cell>), FxBuild> = listener_cells
            .par_iter()
            .map(|c| (*c, beds_for_cell(*c, cfg.cell_size, &active_cells, cfg.sector_cells, &sector_centres, &cfg.select)))
            .collect();
        let cell_size_of: HashMap<Cell, usize, FxBuild> = cell_keys.iter().copied().zip(cell_bytes.iter().copied()).collect();
        let sector_size_of: HashMap<Cell, usize, FxBuild> = sector_keys.iter().copied().zip(sector_bytes.iter().copied()).collect();
        if self.prev_direct.len() != listeners.len() {
            self.prev_direct = vec![Vec::new(); listeners.len()];
        }
        let per_listener: Vec<(u64, u64, bool)> = listeners
            .par_iter()
            .zip(self.prev_direct.par_iter_mut())
            .map_init(
                || (Vec::new(), Vec::new()),
                |(scratch, out), (l, prev)| {
                    select_direct(l.id, l.pos, &grid, &active, &cfg.select, prev, scratch, out);
                    let changed = out.as_slice() != prev.as_slice();
                    prev.clear();
                    prev.extend_from_slice(out);
                    // Bed bytes here; the forwarded voices are counted below from the selections.
                    let (cb, sb) = &beds[&cell_of(l.pos, cfg.cell_size)];
                    let bytes = cb.iter().map(|c| cell_size_of[c] as u64).sum::<u64>() + sb.iter().map(|s| sector_size_of[s] as u64).sum::<u64>();
                    ((out.len() + cb.len() + sb.len()) as u64, bytes, changed)
                },
            )
            .collect();
        // Forwarded packets: count them by size once (a packet goes out once per receiving listener).
        let size_by_id: HashMap<u32, usize, FxBuild> = speakers.iter().map(|s| (s.id, s.packet.len())).collect();
        let direct_bytes: u64 = self.prev_direct.iter().flat_map(|v| v.iter()).map(|id| size_by_id[id] as u64).sum();
        stats.streams_out = per_listener.iter().map(|p| p.0).sum();
        stats.bytes_out = per_listener.iter().map(|p| p.1).sum::<u64>() + direct_bytes;
        stats.direct_changes = per_listener.iter().filter(|p| p.2).count() as u64;
        stats.times.select = ms(t);

        // Drop codec state of streams silent for too long.
        self.decoders.retain(|_, (_, last)| frame - *last <= EVICT_AFTER);
        self.cell_encoders.retain(|_, (_, last)| frame - *last <= EVICT_AFTER);
        self.sector_encoders.retain(|_, (_, last)| frame - *last <= EVICT_AFTER);
        stats.times.total = ms(start);
        Ok(stats)
    }
}
