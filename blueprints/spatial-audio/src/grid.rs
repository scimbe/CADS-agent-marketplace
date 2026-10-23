//! A uniform hash grid over the floor: rebuilt every frame from the active speakers (O(n), cheaper
//! than maintaining a tree under constant motion), queried by radius.

use crate::geom::Vec3;
use std::collections::HashMap;
use std::hash::{BuildHasherDefault, Hasher};

pub type Cell = (i32, i32);

/// FxHash for cell keys (two small integers; nothing attacker-chosen worth defending against).
#[derive(Default, Clone, Copy)]
pub struct FxHasher(u64);

impl Hasher for FxHasher {
    fn finish(&self) -> u64 {
        self.0
    }
    fn write(&mut self, bytes: &[u8]) {
        for b in bytes {
            self.write_u64(*b as u64);
        }
    }
    fn write_u64(&mut self, i: u64) {
        self.0 = (self.0.rotate_left(5) ^ i).wrapping_mul(0x51_7c_c1_b7_27_22_0a_95);
    }
    fn write_i32(&mut self, i: i32) {
        self.write_u64(i as u32 as u64)
    }
    fn write_u32(&mut self, i: u32) {
        self.write_u64(i as u64)
    }
}

pub type FxBuild = BuildHasherDefault<FxHasher>;

pub fn cell_of(p: Vec3, size: f32) -> Cell {
    ((p.x / size).floor() as i32, (p.y / size).floor() as i32)
}

pub fn cell_center(c: Cell, size: f32) -> Vec3 {
    Vec3::new((c.0 as f32 + 0.5) * size, (c.1 as f32 + 0.5) * size, 0.0)
}

#[derive(Debug, Clone)]
pub struct Grid {
    pub size: f32,
    cells: HashMap<Cell, Vec<u32>, FxBuild>,
}

impl Grid {
    pub fn new(size: f32) -> Grid {
        Grid { size, cells: HashMap::default() }
    }

    pub fn build(size: f32, items: impl IntoIterator<Item = (u32, Vec3)>) -> Grid {
        let mut g = Grid::new(size);
        for (id, p) in items {
            g.cells.entry(cell_of(p, size)).or_default().push(id);
        }
        g
    }

    pub fn cells(&self) -> impl Iterator<Item = (&Cell, &Vec<u32>)> {
        self.cells.iter()
    }

    pub fn get(&self, c: &Cell) -> Option<&Vec<u32>> {
        self.cells.get(c)
    }

    /// Ids in every cell that intersects the disc (callers filter by exact distance).
    pub fn for_each_near(&self, center: Vec3, radius: f32, mut f: impl FnMut(Cell, u32)) {
        let (cx0, cy0) = cell_of(Vec3::new(center.x - radius, center.y - radius, 0.0), self.size);
        let (cx1, cy1) = cell_of(Vec3::new(center.x + radius, center.y + radius, 0.0), self.size);
        for cx in cx0..=cx1 {
            for cy in cy0..=cy1 {
                if let Some(ids) = self.cells.get(&(cx, cy)) {
                    for id in ids {
                        f((cx, cy), *id);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn a_radius_query_finds_exactly_what_brute_force_finds(
            pts in prop::collection::vec((-200.0f32..200.0, -200.0f32..200.0), 0..300),
            c in (-200.0f32..200.0, -200.0f32..200.0),
            r in 0.5f32..60.0,
            size in 2.0f32..30.0,
        ) {
            let items: Vec<(u32, Vec3)> = pts.iter().enumerate().map(|(i, (x, y))| (i as u32, Vec3::new(*x, *y, 0.0))).collect();
            let g = Grid::build(size, items.iter().copied());
            let center = Vec3::new(c.0, c.1, 0.0);
            let mut found = Vec::new();
            g.for_each_near(center, r, |_, id| if items[id as usize].1.dist2_xy(center) <= r * r { found.push(id) });
            found.sort();
            let mut want: Vec<u32> = items.iter().filter(|(_, p)| p.dist2_xy(center) <= r * r).map(|(i, _)| *i).collect();
            want.sort();
            prop_assert_eq!(found, want);
        }
    }
}
