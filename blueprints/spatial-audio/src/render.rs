//! Binaural rendering on the listener's device: a structural head model, no measured HRTF set.
//!
//! Per source (Brown & Duda, "A structural model for binaural sound synthesis", IEEE Trans. Speech
//! and Audio Processing 6(5), 1998):
//!
//! - interaural time difference, Woodworth's formula `tau = a/c (theta + sin theta)` for the
//!   lateral angle `theta`, applied as a fractional delay on the far ear (up to ~0.66 ms);
//! - head shadow, a one-pole/one-zero filter per ear whose high-frequency gain `alpha` goes from 2
//!   (+6 dB, ear facing the source) to 0.1 (-20 dB, behind the head), `alpha(theta) = (1 +
//!   alpha_min/2) + (1 - alpha_min/2) cos(theta / theta_min * pi)` with `alpha_min = 0.1`,
//!   `theta_min = 150 deg`, discretised with the bilinear transform (unit gain at DC, `alpha` at
//!   Nyquist);
//! - inverse-distance attenuation and a distance-dependent low-pass for air absorption.
//!
//! Plus one shared room: a four-line feedback delay network (Jot & Chaigne 1991) with a Householder
//! feedback matrix, sized for the decay time `rt60`, fed more by distant sources. Every parameter
//! ramps linearly over the frame, so moving sources and turning heads do not click.
//!
//! The model is generic (one head size, no pinna): it gives direction and distance convincingly in
//! the horizontal plane, front/back and elevation only weakly. A personalised HRTF (SOFA file) can
//! replace the ear filters later without changing anything around them.

use crate::geom::{Pose, Vec3};
use std::collections::HashMap;
use std::f32::consts::PI;

#[derive(Clone, Copy, Debug, serde::Serialize, serde::Deserialize)]
pub struct RenderConfig {
    pub rate: u32,
    pub head_radius: f32,
    pub speed_of_sound: f32,
    pub ref_dist: f32,
    pub rt60: f32,
    /// Reverb send at 10 m and beyond (scaled down towards the listener).
    pub reverb_send: f32,
}

impl Default for RenderConfig {
    fn default() -> Self {
        RenderConfig { rate: 48_000, head_radius: 0.0875, speed_of_sound: 343.0, ref_dist: 1.0, rt60: 1.2, reverb_send: 0.15 }
    }
}

const HISTORY: usize = 128; // > max ITD (~32 samples at 48 kHz) + interpolation margin

/// One ear's head-shadow filter: y[n] = b0 x[n] + b1 x[n-1] - a1 y[n-1].
#[derive(Clone, Copy, Default)]
struct Shadow {
    x1: f32,
    y1: f32,
}

fn shadow_coeffs(alpha: f32, cfg: &RenderConfig) -> (f32, f32, f32) {
    let beta = 2.0 * cfg.speed_of_sound / cfg.head_radius;
    let k = 2.0 * cfg.rate as f32;
    let d = k + beta;
    ((alpha * k + beta) / d, (beta - alpha * k) / d, (beta - k) / d)
}

fn alpha_of(theta: f32) -> f32 {
    let (alpha_min, theta_min) = (0.1f32, 150.0f32.to_radians());
    (1.0 + alpha_min / 2.0) + (1.0 - alpha_min / 2.0) * (theta / theta_min * PI).cos()
}

#[derive(Clone, Copy, Default, PartialEq, Debug)]
struct Params {
    gain: f32,
    delay_l: f32,
    delay_r: f32,
    alpha_l: f32,
    alpha_r: f32,
    air_k: f32,
    send: f32,
}

struct SourceState {
    history: [f32; HISTORY],
    pos: usize,
    shadow_l: Shadow,
    shadow_r: Shadow,
    air: f32,
    last: Params,
    seen: u64,
}

impl SourceState {
    fn new() -> SourceState {
        SourceState { history: [0.0; HISTORY], pos: 0, shadow_l: Shadow::default(), shadow_r: Shadow::default(), air: 0.0, last: Params::default(), seen: 0 }
    }

    fn read(&self, delay: f32) -> f32 {
        // Linear interpolation between the two samples around `delay` samples ago.
        let d = delay.clamp(0.0, (HISTORY - 2) as f32);
        let i = d.floor() as usize;
        let frac = d - i as f32;
        let at = |k: usize| self.history[(self.pos + HISTORY - 1 - k) % HISTORY];
        at(i) * (1.0 - frac) + at(i + 1) * frac
    }
}

struct Fdn {
    lines: [Vec<f32>; 4],
    pos: [usize; 4],
    gains: [f32; 4],
}

impl Fdn {
    fn new(cfg: &RenderConfig) -> Fdn {
        // Mutually prime lengths, ~30-43 ms at 48 kHz (scaled for other rates).
        let base = [1433usize, 1601, 1867, 2053];
        let scale = cfg.rate as f32 / 48_000.0;
        let lens: [usize; 4] = base.map(|l| ((l as f32 * scale) as usize).max(1));
        let gains = lens.map(|l| 10f32.powf(-3.0 * l as f32 / (cfg.rate as f32 * cfg.rt60)));
        Fdn { lines: lens.map(|l| vec![0.0; l]), pos: [0; 4], gains }
    }

    /// One sample in (mono send), one stereo sample out.
    fn tick(&mut self, input: f32) -> (f32, f32) {
        let o: [f32; 4] = std::array::from_fn(|i| self.lines[i][self.pos[i]] * self.gains[i]);
        // Householder: H = I - (2/N) 1 1^T, lossless; the per-line gains set the decay.
        let sum = (o[0] + o[1] + o[2] + o[3]) * 0.5;
        for i in 0..4 {
            self.lines[i][self.pos[i]] = o[i] - sum + input;
            self.pos[i] = (self.pos[i] + 1) % self.lines[i].len();
        }
        (0.5 * (o[0] + o[2]), 0.5 * (o[1] + o[3]))
    }
}

pub struct Spatializer {
    pub cfg: RenderConfig,
    sources: HashMap<u32, SourceState>,
    fdn: Fdn,
    frame: u64,
    send: Vec<f32>,
}

impl Spatializer {
    pub fn new(cfg: RenderConfig) -> Spatializer {
        Spatializer { cfg, sources: HashMap::new(), fdn: Fdn::new(&cfg), frame: 0, send: Vec::new() }
    }

    fn params(&self, head: &Pose, p: Vec3) -> Params {
        let cfg = &self.cfg;
        let dist = head.pos.dist(p).max(1e-3);
        let (az, el) = head.direction_to(p);
        // Unit direction in head coordinates: x right, y front, z up.
        let (vx, _vy, _vz) = (az.sin() * el.cos(), az.cos() * el.cos(), el.sin());
        let lateral = vx.clamp(-1.0, 1.0).asin(); // -pi/2 (left) .. pi/2 (right)
        let t = lateral.abs();
        let itd = cfg.head_radius / cfg.speed_of_sound * (t + t.sin()) * cfg.rate as f32;
        let (delay_l, delay_r) = if lateral > 0.0 { (itd, 0.0) } else { (0.0, itd) };
        let theta_r = vx.clamp(-1.0, 1.0).acos(); // angle to the right ear axis
        let theta_l = (-vx).clamp(-1.0, 1.0).acos();
        let fc = (20_000.0 / (1.0 + dist / 30.0)).max(1_500.0);
        Params {
            gain: cfg.ref_dist / dist.max(cfg.ref_dist),
            delay_l,
            delay_r,
            alpha_l: alpha_of(theta_l),
            alpha_r: alpha_of(theta_r),
            air_k: 1.0 - (-2.0 * PI * fc / cfg.rate as f32).exp(),
            send: cfg.reverb_send * (dist / 10.0).min(1.0),
        }
    }

    /// Render one frame of `sources` (id, position, mono samples of equal length) for a head at
    /// `head` into interleaved stereo `out` (twice the frame length). Sources absent for a second
    /// lose their state.
    pub fn render(&mut self, head: Pose, sources: &[(u32, Vec3, &[f32])], out: &mut [f32]) {
        self.frame += 1;
        let n = out.len() / 2;
        out.iter_mut().for_each(|s| *s = 0.0);
        self.send.clear();
        self.send.resize(n, 0.0);
        let cfg = self.cfg;
        for (id, pos, pcm) in sources {
            let target = self.params(&head, *pos);
            let st = self.sources.entry(*id).or_insert_with(SourceState::new);
            let from = if st.seen == 0 { target } else { st.last };
            st.seen = self.frame;
            let (bl0, bl1, al) = shadow_coeffs(target.alpha_l, &cfg);
            let (br0, br1, ar) = shadow_coeffs(target.alpha_r, &cfg);
            let (fl0, fl1, fal) = shadow_coeffs(from.alpha_l, &cfg);
            let (fr0, fr1, far) = shadow_coeffs(from.alpha_r, &cfg);
            for i in 0..n.min(pcm.len()) {
                let w = (i as f32 + 1.0) / n as f32;
                let lerp = |a: f32, b: f32| a + (b - a) * w;
                st.air += lerp(from.air_k, target.air_k) * (pcm[i] - st.air);
                st.history[st.pos] = st.air;
                st.pos = (st.pos + 1) % HISTORY;
                let xl = st.read(lerp(from.delay_l, target.delay_l));
                let xr = st.read(lerp(from.delay_r, target.delay_r));
                let yl = lerp(fl0, bl0) * xl + lerp(fl1, bl1) * st.shadow_l.x1 - lerp(fal, al) * st.shadow_l.y1;
                let yr = lerp(fr0, br0) * xr + lerp(fr1, br1) * st.shadow_r.x1 - lerp(far, ar) * st.shadow_r.y1;
                st.shadow_l = Shadow { x1: xl, y1: yl };
                st.shadow_r = Shadow { x1: xr, y1: yr };
                let g = lerp(from.gain, target.gain);
                out[2 * i] += g * yl;
                out[2 * i + 1] += g * yr;
                self.send[i] += g * lerp(from.send, target.send) * st.air;
            }
            st.last = target;
        }
        for i in 0..n {
            let (l, r) = self.fdn.tick(self.send[i]);
            out[2 * i] += l;
            out[2 * i + 1] += r;
        }
        let frame = self.frame;
        self.sources.retain(|_, s| frame - s.seen <= 50);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn noise(n: usize, seed: u32) -> Vec<f32> {
        let mut x = seed.wrapping_mul(2654435761) | 1;
        (0..n)
            .map(|_| {
                x ^= x << 13;
                x ^= x >> 17;
                x ^= x << 5;
                (x as f32 / u32::MAX as f32 - 0.5) * 0.5
            })
            .collect()
    }

    /// Render a few frames of noise from `p` and return (left energy, right energy, best lag of R
    /// against L in samples: positive = left lags).
    fn probe(head: Pose, p: Vec3) -> (f32, f32, i32) {
        let cfg = RenderConfig { reverb_send: 0.0, ..RenderConfig::default() };
        let mut s = Spatializer::new(cfg);
        let n = 960;
        let mut out = vec![0f32; 2 * n];
        let (mut l, mut r) = (Vec::new(), Vec::new());
        for k in 0..6 {
            let x = noise(n, k + 1);
            s.render(head, &[(1, p, &x)], &mut out);
            if k >= 2 {
                l.extend(out.iter().step_by(2));
                r.extend(out.iter().skip(1).step_by(2));
            }
        }
        let e = |v: &[f32]| v.iter().map(|x| x * x).sum::<f32>();
        let best = (-40i32..=40)
            .max_by(|a, b| {
                let c = |lag: i32| (40..l.len() - 40).map(|i| l[i] * r[(i as i32 - lag) as usize]).sum::<f32>();
                c(*a).total_cmp(&c(*b))
            })
            .unwrap();
        (e(&l), e(&r), best)
    }

    #[test]
    fn a_source_on_the_right_is_louder_and_earlier_in_the_right_ear() {
        let head = Pose::default();
        let (l, r, lag) = probe(head, Vec3::new(5.0, 0.0, 0.0));
        assert!(r > 2.0 * l, "ILD: right {r} vs left {l}");
        // Woodworth at 90 deg: a/c (pi/2 + 1) = 0.656 ms = 31.5 samples; the left ear lags.
        assert!((28..=35).contains(&lag), "ITD lag {lag}");
    }

    #[test]
    fn in_front_both_ears_match_and_turning_the_head_moves_the_source() {
        let (l, r, lag) = probe(Pose::default(), Vec3::new(0.0, 5.0, 0.0));
        assert!((l / r - 1.0).abs() < 0.05 && lag.abs() <= 1, "{l} {r} {lag}");
        // Turn 90 deg to the right: the source that was in front is now on the left.
        let (l, r, lag) = probe(Pose { pos: Vec3::default(), yaw: PI / 2.0 }, Vec3::new(0.0, 5.0, 0.0));
        assert!(l > 2.0 * r && lag < -25, "{l} {r} {lag}");
    }

    #[test]
    fn energy_falls_with_distance_and_output_stays_bounded() {
        let (l1, r1, _) = probe(Pose::default(), Vec3::new(0.0, 2.0, 0.0));
        let (l2, r2, _) = probe(Pose::default(), Vec3::new(0.0, 8.0, 0.0));
        let ratio = (l1 + r1) / (l2 + r2);
        // Inverse distance: 4x the distance is 1/16 the energy; air absorption takes a little more.
        assert!((12.0..24.0).contains(&ratio), "energy ratio {ratio}");
        let mut s = Spatializer::new(RenderConfig::default());
        let mut out = vec![0f32; 1920];
        let loud = vec![1.0f32; 960];
        for k in 0..200 {
            let srcs: Vec<(u32, Vec3, &[f32])> = (0..12).map(|i| (i, Vec3::new(i as f32 - 6.0, 1.0 + (k % 7) as f32, 0.0), loud.as_slice())).collect();
            s.render(Pose::default(), &srcs, &mut out);
            assert!(out.iter().all(|x| x.is_finite() && x.abs() < 100.0));
        }
    }
}
