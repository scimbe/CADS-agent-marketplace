//! Positions on the venue floor. Height is carried for rendering (elevation is audible) but the
//! grid is two-dimensional: crowds spread on floors and stands, not in the air.

use serde::{Deserialize, Serialize};

#[derive(Copy, Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Vec3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Vec3 {
    pub const fn new(x: f32, y: f32, z: f32) -> Vec3 {
        Vec3 { x, y, z }
    }

    pub fn sub(self, o: Vec3) -> Vec3 {
        Vec3::new(self.x - o.x, self.y - o.y, self.z - o.z)
    }

    pub fn len(self) -> f32 {
        (self.x * self.x + self.y * self.y + self.z * self.z).sqrt()
    }

    pub fn dist(self, o: Vec3) -> f32 {
        self.sub(o).len()
    }

    pub fn dist2_xy(self, o: Vec3) -> f32 {
        let (dx, dy) = (self.x - o.x, self.y - o.y);
        dx * dx + dy * dy
    }
}

/// Where a listener is and which way the head points: `yaw` 0 faces +y, positive turns right.
#[derive(Copy, Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Pose {
    pub pos: Vec3,
    pub yaw: f32,
}

impl Pose {
    /// Azimuth of `p` relative to the head: 0 in front, +pi/2 to the right, +-pi behind; and the
    /// elevation angle.
    pub fn direction_to(&self, p: Vec3) -> (f32, f32) {
        let d = p.sub(self.pos);
        let horiz = (d.x * d.x + d.y * d.y).sqrt();
        let az = d.x.atan2(d.y) - self.yaw;
        let az = (az + std::f32::consts::PI).rem_euclid(2.0 * std::f32::consts::PI) - std::f32::consts::PI;
        (az, d.z.atan2(horiz))
    }
}
