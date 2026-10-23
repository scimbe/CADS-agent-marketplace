//! Fractional indices for z-order: a key strictly between two others, so moving one shape writes one
//! register instead of renumbering its siblings.
//!
//! Keys are base-256 fractions in [0, 1), compared as byte strings. A generated key never ends in a
//! zero byte, so there is always room between any two distinct keys. Two replicas that insert between
//! the same neighbours at the same time generate the same key; siblings are therefore ordered by
//! `(key, shape id)`, which is still a total order every replica computes the same way.

/// A key strictly greater than `lo` and strictly less than `hi` (`None` = no upper bound). If `hi` is
/// not greater than `lo` (possible after concurrent moves), returns a key just above `lo`.
pub fn between(lo: &[u8], hi: Option<&[u8]>) -> Vec<u8> {
    let hi = match hi {
        Some(h) if h > lo => Some(h),
        _ => None,
    };
    let mut out = Vec::with_capacity(lo.len() + 1);
    let mut bounded = hi;
    let mut i = 0;
    loop {
        let a = lo.get(i).copied().unwrap_or(0) as u16;
        let b = match bounded {
            None => 256,
            Some(h) => h.get(i).copied().unwrap_or(0) as u16,
        };
        if b > a + 1 {
            out.push(((a + b) / 2) as u8);
            return out;
        }
        out.push(a as u8);
        if b == a + 1 {
            // `out` is now below `hi` for good; only `lo` still constrains the remaining digits.
            bounded = None;
        }
        i += 1;
    }
}

/// A key above every key generated earlier by the same rule, without looking at the siblings: the
/// creation stamp, big-endian, plus a non-zero terminator. "New shapes go on top" then holds against
/// other appended shapes; against a key from [`between`] it is still a valid, deterministic position.
pub fn append_key(lamport: u64, replica: u64) -> Vec<u8> {
    let mut k = Vec::with_capacity(17);
    k.extend_from_slice(&lamport.to_be_bytes());
    k.extend_from_slice(&replica.to_be_bytes());
    k.push(1);
    k
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn between_is_strictly_between_and_never_ends_in_zero() {
        let cases: &[(&[u8], Option<&[u8]>)] = &[
            (b"", None),
            (b"", Some(&[1])),
            (&[0, 0, 1], Some(&[0, 0, 2])),
            (&[5], Some(&[6])),
            (&[255, 255], None),
            (&[7, 255], Some(&[8])),
        ];
        for (lo, hi) in cases {
            let k = between(lo, *hi);
            assert!(k.as_slice() > *lo, "{k:?} > {lo:?}");
            if let Some(h) = hi {
                assert!(k.as_slice() < *h, "{k:?} < {h:?}");
            }
            assert_ne!(k.last(), Some(&0));
        }
    }

    #[test]
    fn repeated_insertion_at_the_same_gap_keeps_order() {
        let (lo, mut hi) = (vec![10u8], vec![11u8]);
        for _ in 0..200 {
            let k = between(&lo, Some(&hi));
            assert!(k > lo && k < hi);
            hi = k;
        }
    }
}
