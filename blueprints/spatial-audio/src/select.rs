//! What each listener receives: the near field as individual voices, the middle distance as cell
//! beds, the far field as sector beds.
//!
//! Direct voices are chosen per listener (exact positions matter up close) by audibility -- level
//! minus the inverse-distance loss -- with hysteresis, so that two similarly loud neighbours do not
//! swap places every frame (each swap is a stream the device has to start and stop). Beds are
//! chosen per listener *cell*: everyone in the same 8 m cell hears the same distant cells, which
//! turns a per-listener search into a per-cell one.

use crate::geom::Vec3;
use crate::grid::{cell_center, Cell, FxBuild, Grid};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct SelectConfig {
    /// Individual voices per listener.
    pub k: usize,
    /// Radius of the near field, metres: voices inside are candidates for `k`, cells whose centre is
    /// inside are not used as beds (their speakers are heard directly or masked).
    pub near_radius: f32,
    /// Cell beds per listener and the radius they are taken from.
    pub beds: usize,
    pub bed_radius: f32,
    /// Sector beds per listener: the far field beyond `bed_radius`.
    pub sector_beds: usize,
    /// A selected voice stays selected unless a challenger is this much louder.
    pub hysteresis_db: f32,
    /// Distance at which the level a speaker reports applies, metres.
    pub ref_dist: f32,
}

impl SelectConfig {
    /// For a phone on a mobile link: 6 voices, 4 cell beds, 2 sector beds = 12 streams.
    pub fn mobile() -> SelectConfig {
        SelectConfig { k: 6, near_radius: 12.0, beds: 4, bed_radius: 64.0, sector_beds: 2, hysteresis_db: 3.0, ref_dist: 1.0 }
    }

    pub fn streams(&self) -> usize {
        self.k + self.beds + self.sector_beds
    }
}

pub fn audibility_db(level_db: f32, dist: f32, ref_dist: f32) -> f32 {
    level_db - 20.0 * (dist.max(ref_dist) / ref_dist).log10()
}

#[derive(Clone, Copy, Debug)]
pub struct ActiveSpeaker {
    pub id: u32,
    pub pos: Vec3,
    pub level_db: f32,
}

/// Choose up to `k` direct voices for a listener at `pos` (never itself), keeping `prev` choices
/// unless clearly outdone. `out` is cleared and filled with speaker ids, most audible first.
pub fn select_direct(
    me: u32,
    pos: Vec3,
    grid: &Grid,
    speakers: &[ActiveSpeaker],
    cfg: &SelectConfig,
    prev: &[u32],
    scratch: &mut Vec<(f32, u32)>,
    out: &mut Vec<u32>,
) {
    scratch.clear();
    out.clear();
    let r2 = cfg.near_radius * cfg.near_radius;
    grid.for_each_near(pos, cfg.near_radius, |_, slot| {
        let s = &speakers[slot as usize];
        if s.id == me {
            return;
        }
        let d2 = s.pos.dist2_xy(pos);
        if d2 > r2 {
            return;
        }
        let mut a = audibility_db(s.level_db, d2.sqrt(), cfg.ref_dist);
        if prev.contains(&s.id) {
            a += cfg.hysteresis_db;
        }
        scratch.push((a, s.id));
    });
    if scratch.len() > cfg.k {
        scratch.select_nth_unstable_by(cfg.k - 1, |a, b| b.0.total_cmp(&a.0).then(a.1.cmp(&b.1)));
        scratch.truncate(cfg.k);
    }
    scratch.sort_unstable_by(|a, b| b.0.total_cmp(&a.0).then(a.1.cmp(&b.1)));
    out.extend(scratch.iter().map(|(_, id)| *id));
}

/// The beds every listener in `cell` receives: up to `beds` active cells beyond the near field
/// (nearest first), and up to `sector_beds` active sectors beyond `bed_radius`.
pub fn beds_for_cell(
    cell: Cell,
    cell_size: f32,
    active_cells: &HashSet<Cell, FxBuild>,
    sector_cells: i32,
    active_sectors: &HashMap<Cell, Vec3, FxBuild>,
    cfg: &SelectConfig,
) -> (Vec<Cell>, Vec<Cell>) {
    let here = cell_center(cell, cell_size);
    let rings = (cfg.bed_radius / cell_size).ceil() as i32;
    let mut cand: Vec<(f32, Cell)> = Vec::new();
    for dx in -rings..=rings {
        for dy in -rings..=rings {
            let c = (cell.0 + dx, cell.1 + dy);
            if !active_cells.contains(&c) {
                continue;
            }
            let d = cell_center(c, cell_size).dist(here);
            if d > cfg.near_radius && d <= cfg.bed_radius {
                cand.push((d, c));
            }
        }
    }
    cand.sort_unstable_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
    let cells: Vec<Cell> = cand.into_iter().take(cfg.beds).map(|(_, c)| c).collect();

    let my_sector = (cell.0.div_euclid(sector_cells), cell.1.div_euclid(sector_cells));
    let mut sec: Vec<(f32, Cell)> = active_sectors
        .iter()
        .filter(|(s, _)| (s.0 - my_sector.0).abs() > 1 || (s.1 - my_sector.1).abs() > 1)
        .map(|(s, centre)| (centre.dist(here), *s))
        .filter(|(d, _)| *d > cfg.bed_radius)
        .collect();
    sec.sort_unstable_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
    (cells, sec.into_iter().take(cfg.sector_beds).map(|(_, s)| s).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spk(id: u32, x: f32, level: f32) -> ActiveSpeaker {
        ActiveSpeaker { id, pos: Vec3::new(x, 0.0, 0.0), level_db: level }
    }

    #[test]
    fn the_most_audible_neighbours_are_chosen_and_hysteresis_keeps_them() {
        let cfg = SelectConfig { k: 2, ..SelectConfig::mobile() };
        let speakers = vec![spk(1, 1.0, 0.0), spk(2, 2.0, 0.0), spk(3, 3.0, 0.0), spk(4, 50.0, 40.0), spk(9, 0.0, 0.0)];
        let grid = Grid::build(8.0, speakers.iter().enumerate().map(|(i, s)| (i as u32, s.pos)));
        let (mut scratch, mut out) = (Vec::new(), Vec::new());
        select_direct(9, Vec3::default(), &grid, &speakers, &cfg, &[], &mut scratch, &mut out);
        assert_eq!(out, vec![1, 2], "nearest two; itself and the far one excluded");
        // Speaker 3 gets 2 dB louder than 2: not enough to displace a selected voice (3 dB).
        let louder = vec![spk(1, 1.0, 0.0), spk(2, 2.0, 0.0), spk(3, 3.0, 2.0 + 20.0 * (1.5f32).log10()), spk(9, 0.0, 0.0)];
        let grid = Grid::build(8.0, louder.iter().enumerate().map(|(i, s)| (i as u32, s.pos)));
        select_direct(9, Vec3::default(), &grid, &louder, &cfg, &[1, 2], &mut scratch, &mut out);
        assert_eq!(out, vec![1, 2]);
        select_direct(9, Vec3::default(), &grid, &louder, &cfg, &[], &mut scratch, &mut out);
        assert_eq!(out, vec![1, 3], "without history the louder one wins");
    }

    #[test]
    fn beds_skip_the_near_field_and_sectors_skip_the_neighbourhood() {
        let cfg = SelectConfig::mobile();
        let mut active = HashSet::default();
        for c in [(0, 0), (1, 0), (3, 0), (5, 5), (40, 0)] {
            active.insert(c);
        }
        let mut sectors = HashMap::default();
        sectors.insert((0, 0), cell_center((4, 4), 8.0));
        sectors.insert((5, 0), cell_center((44, 4), 8.0));
        let (beds, secs) = beds_for_cell((0, 0), 8.0, &active, 8, &sectors, &cfg);
        assert!(!beds.contains(&(0, 0)) && !beds.contains(&(1, 0)), "own and adjacent cells are near field: {beds:?}");
        assert!(beds.contains(&(3, 0)) && beds.contains(&(5, 5)));
        assert!(!beds.contains(&(40, 0)), "beyond the bed radius");
        assert_eq!(secs, vec![(5, 0)], "own sector excluded, far sector taken");
    }
}
