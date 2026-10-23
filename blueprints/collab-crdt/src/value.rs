//! Register values. Kept small (24 bytes) because a replica holds one per property per shape.

use crate::stamp::Stamp;
use std::sync::Arc;

/// What a register holds. Floats are stored as their bit pattern so that values are `Eq + Hash` and
/// hash identically on every platform (the document hash is part of the convergence check).
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Value {
    Nil,
    Bool(bool),
    Int(i64),
    /// An `f64`, as `f64::to_bits`.
    Num(u64),
    /// A reference to a shape (the parent register).
    Ref(Stamp),
    /// Two `f64` as bit patterns: a position, written as one register so that two concurrent moves
    /// pick one whole position instead of mixing one writer's x with the other's y.
    Vec2(u64, u64),
    /// A fractional index (the z-order register), see [`crate::frac`].
    Frac(Arc<[u8]>),
    /// Anything else: path data, text, an image reference -- opaque to the CRDT.
    Bytes(Arc<[u8]>),
}

impl Value {
    pub fn num(x: f64) -> Value {
        // One NaN, so that every replica hashes "not a number" the same way.
        Value::Num(if x.is_nan() { f64::NAN.to_bits() } else { x.to_bits() })
    }

    pub fn as_num(&self) -> Option<f64> {
        match self {
            Value::Num(b) => Some(f64::from_bits(*b)),
            _ => None,
        }
    }

    pub fn vec2(x: f64, y: f64) -> Value {
        let bits = |v: f64| if v.is_nan() { f64::NAN.to_bits() } else { v.to_bits() };
        Value::Vec2(bits(x), bits(y))
    }

    pub fn as_vec2(&self) -> Option<(f64, f64)> {
        match self {
            Value::Vec2(x, y) => Some((f64::from_bits(*x), f64::from_bits(*y))),
            _ => None,
        }
    }

    pub fn bytes(b: &[u8]) -> Value {
        Value::Bytes(Arc::from(b))
    }

    /// Canonical encoding: a tag byte, then the content. Used by the document hash and the wire.
    pub fn encode(&self, out: &mut Vec<u8>) {
        match self {
            Value::Nil => out.push(0),
            Value::Bool(b) => {
                out.push(1);
                out.push(*b as u8);
            }
            Value::Int(i) => {
                out.push(2);
                out.extend_from_slice(&i.to_be_bytes());
            }
            Value::Num(b) => {
                out.push(3);
                out.extend_from_slice(&b.to_be_bytes());
            }
            Value::Ref(s) => {
                out.push(4);
                out.extend_from_slice(&s.to_bytes());
            }
            Value::Frac(k) => {
                out.push(5);
                out.extend_from_slice(&(k.len() as u32).to_be_bytes());
                out.extend_from_slice(k);
            }
            Value::Vec2(x, y) => {
                out.push(7);
                out.extend_from_slice(&x.to_be_bytes());
                out.extend_from_slice(&y.to_be_bytes());
            }
            Value::Bytes(k) => {
                out.push(6);
                out.extend_from_slice(&(k.len() as u32).to_be_bytes());
                out.extend_from_slice(k);
            }
        }
    }

    /// Inverse of [`Value::encode`]; returns the value and the number of bytes read.
    pub fn decode(b: &[u8]) -> Option<(Value, usize)> {
        let (&tag, rest) = b.split_first()?;
        let fixed = |n: usize| rest.get(..n);
        Some(match tag {
            0 => (Value::Nil, 1),
            1 => (Value::Bool(*rest.first()? != 0), 2),
            2 => (Value::Int(i64::from_be_bytes(fixed(8)?.try_into().ok()?)), 9),
            3 => (Value::Num(u64::from_be_bytes(fixed(8)?.try_into().ok()?)), 9),
            4 => (Value::Ref(Stamp::from_bytes(fixed(16)?.try_into().ok()?)), 17),
            7 => {
                let b = fixed(16)?;
                (Value::Vec2(u64::from_be_bytes(b[..8].try_into().ok()?), u64::from_be_bytes(b[8..].try_into().ok()?)), 17)
            }
            5 | 6 => {
                let n = u32::from_be_bytes(fixed(4)?.try_into().ok()?) as usize;
                let body: Arc<[u8]> = Arc::from(rest.get(4..4 + n)?);
                (if tag == 5 { Value::Frac(body) } else { Value::Bytes(body) }, 5 + n)
            }
            _ => return None,
        })
    }
}
