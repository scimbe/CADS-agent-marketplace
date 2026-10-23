//! Voice codec: Opus (RFC 6716) through libopus, mono, 20 ms frames.
//!
//! Speakers encode on their device at 48 kHz; the server decodes the active ones for the beds at the
//! bed rate (Opus decodes to any of 8/12/16/24/48 kHz directly, which is cheaper than decoding at
//! 48 kHz and resampling) and encodes each bed once. A forwarded voice is never touched by the server.
//!
//! Without the `opus` feature an uncompressed stand-in takes its place, so that everything but the
//! codec can be built and tested without a C toolchain. Its cost and size are not Opus': a benchmark
//! run without `opus` says so in its report.

#[derive(Debug)]
pub struct CodecError(pub String);

impl std::fmt::Display for CodecError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "codec: {}", self.0)
    }
}

impl std::error::Error for CodecError {}

/// Samples per 20 ms frame at `rate` Hz.
pub fn frame_len(rate: u32) -> usize {
    (rate / 50) as usize
}

pub const REAL_CODEC: bool = cfg!(feature = "opus");

#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct EncoderConfig {
    pub rate: u32,
    pub bitrate: i32,
    /// libopus complexity 0..=10: CPU against quality.
    pub complexity: i32,
    /// In-band forward error correction (helps on lossy mobile links, costs some bits).
    pub fec: bool,
}

impl EncoderConfig {
    pub fn voice() -> EncoderConfig {
        EncoderConfig { rate: 48_000, bitrate: 24_000, complexity: 5, fec: true }
    }

    pub fn bed() -> EncoderConfig {
        EncoderConfig { rate: 16_000, bitrate: 16_000, complexity: 3, fec: false }
    }
}

#[cfg(feature = "opus")]
mod imp {
    use super::*;

    pub struct Encoder {
        inner: opus::Encoder,
        pub cfg: EncoderConfig,
    }

    impl Encoder {
        pub fn new(cfg: EncoderConfig) -> Result<Encoder, CodecError> {
            let e = |x: opus::Error| CodecError(x.to_string());
            let mut inner = opus::Encoder::new(cfg.rate, opus::Channels::Mono, opus::Application::Voip).map_err(e)?;
            inner.set_bitrate(opus::Bitrate::Bits(cfg.bitrate)).map_err(e)?;
            inner.set_complexity(cfg.complexity).map_err(e)?;
            inner.set_inband_fec(cfg.fec).map_err(e)?;
            if cfg.fec {
                inner.set_packet_loss_perc(5).map_err(e)?;
            }
            Ok(Encoder { inner, cfg })
        }

        pub fn encode(&mut self, pcm: &[f32], out: &mut [u8]) -> Result<usize, CodecError> {
            self.inner.encode_float(pcm, out).map_err(|x| CodecError(x.to_string()))
        }

        /// Algorithmic delay of this encoder in samples at its rate (part of the latency budget).
        pub fn lookahead(&mut self) -> Result<u32, CodecError> {
            self.inner.get_lookahead().map(|n| n as u32).map_err(|x| CodecError(x.to_string()))
        }
    }

    pub struct Decoder {
        inner: opus::Decoder,
        pub rate: u32,
    }

    impl Decoder {
        pub fn new(rate: u32) -> Result<Decoder, CodecError> {
            Ok(Decoder { inner: opus::Decoder::new(rate, opus::Channels::Mono).map_err(|x| CodecError(x.to_string()))?, rate })
        }

        pub fn decode(&mut self, packet: &[u8], out: &mut [f32]) -> Result<usize, CodecError> {
            self.inner.decode_float(packet, out, false).map_err(|x| CodecError(x.to_string()))
        }
    }
}

#[cfg(not(feature = "opus"))]
mod imp {
    use super::*;

    /// Stand-in: 16-bit PCM, no compression, no lookahead.
    pub struct Encoder {
        pub cfg: EncoderConfig,
    }

    impl Encoder {
        pub fn new(cfg: EncoderConfig) -> Result<Encoder, CodecError> {
            Ok(Encoder { cfg })
        }

        pub fn encode(&mut self, pcm: &[f32], out: &mut [u8]) -> Result<usize, CodecError> {
            if out.len() < pcm.len() * 2 {
                return Err(CodecError("output buffer too small".into()));
            }
            for (i, s) in pcm.iter().enumerate() {
                let v = (s.clamp(-1.0, 1.0) * 32767.0) as i16;
                out[2 * i..2 * i + 2].copy_from_slice(&v.to_le_bytes());
            }
            Ok(pcm.len() * 2)
        }

        pub fn lookahead(&mut self) -> Result<u32, CodecError> {
            Ok(0)
        }
    }

    pub struct Decoder {
        pub rate: u32,
    }

    impl Decoder {
        pub fn new(rate: u32) -> Result<Decoder, CodecError> {
            Ok(Decoder { rate })
        }

        /// The stand-in carries 48 kHz samples; decoding to a lower rate takes every n-th.
        pub fn decode(&mut self, packet: &[u8], out: &mut [f32]) -> Result<usize, CodecError> {
            let src: Vec<f32> = packet.chunks(2).map(|c| i16::from_le_bytes([c[0], c[1]]) as f32 / 32767.0).collect();
            let step = (src.len() / out.len().max(1)).max(1);
            let n = out.len().min(src.len() / step);
            for (i, o) in out.iter_mut().take(n).enumerate() {
                *o = src[i * step];
            }
            Ok(n)
        }
    }
}

pub use imp::{Decoder, Encoder};

/// The largest packet any configuration here produces (Opus caps a packet at 1275 bytes; the
/// stand-in needs two bytes per sample at 48 kHz).
pub const MAX_PACKET: usize = 1920;

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(rate: u32, hz: f32, n: usize) -> Vec<f32> {
        (0..n).map(|i| 0.3 * (2.0 * std::f32::consts::PI * hz * i as f32 / rate as f32).sin()).collect()
    }

    #[test]
    fn a_voice_frame_survives_encode_and_decode_at_the_bed_rate() {
        let cfg = EncoderConfig::voice();
        let mut enc = Encoder::new(cfg).unwrap();
        let mut dec = Decoder::new(16_000).unwrap();
        let mut packet = [0u8; MAX_PACKET];
        let mut out = vec![0f32; frame_len(16_000)];
        let mut energy = 0.0;
        // A few frames: Opus needs a moment to converge.
        for k in 0..10 {
            let pcm: Vec<f32> = tone(cfg.rate, 440.0, frame_len(cfg.rate) * (k + 1)).split_off(frame_len(cfg.rate) * k);
            let n = enc.encode(&pcm, &mut packet).unwrap();
            assert!(n > 0 && n <= MAX_PACKET);
            if REAL_CODEC {
                assert!(n < 200, "24 kb/s is ~60 bytes per 20 ms frame, got {n}");
            }
            let got = dec.decode(&packet[..n], &mut out).unwrap();
            assert_eq!(got, frame_len(16_000));
            energy = out.iter().map(|s| s * s).sum::<f32>() / out.len() as f32;
        }
        // A 0.3 sine has mean power 0.045; allow for codec loss.
        assert!(energy > 0.02 && energy < 0.08, "decoded power {energy}");
    }
}
