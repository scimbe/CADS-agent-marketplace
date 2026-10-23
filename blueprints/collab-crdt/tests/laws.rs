//! The algebra the convergence claim rests on, checked on random inputs: merging is commutative,
//! associative and idempotent, so the order and multiplicity of delivery cannot matter.

use bp_collab_crdt::{Delta, Doc, Prop, RegKey, Stamp, Value};
use proptest::prelude::*;

fn delta() -> impl Strategy<Value = Delta> {
    (0u64..6, 0u64..3, 0u16..4, 1u64..40, 1u64..4, any::<i16>()).prop_map(|(sl, sr, p, l, r, v)| Delta {
        key: RegKey { shape: Stamp { lamport: sl, replica: sr }, prop: Prop(p) },
        stamp: Stamp { lamport: l, replica: r },
        // The value is a function of the stamp: two deltas with one stamp carry one value, as the
        // uniqueness of (lamport, replica) per replica guarantees in the real system.
        value: Value::Int(v as i64 ^ (l * 31 + r) as i64),
    })
}

fn fold(ds: &[Delta]) -> Doc {
    let mut d = Doc::new(99);
    for x in ds {
        d.apply(x);
    }
    d
}

fn unique_stamps(ds: Vec<Delta>) -> Vec<Delta> {
    let mut seen = std::collections::HashMap::new();
    ds.into_iter().filter(|d| seen.insert(d.stamp, d.value.clone()).is_none_or(|v| v == d.value)).collect()
}

proptest! {
    #[test]
    fn order_does_not_matter(ds in prop::collection::vec(delta(), 0..60).prop_map(unique_stamps), seed in any::<u64>()) {
        let mut shuffled = ds.clone();
        // Fisher-Yates with a tiny LCG: any permutation of the deltas.
        let mut s = seed | 1;
        for i in (1..shuffled.len()).rev() {
            s = s.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            shuffled.swap(i, (s >> 33) as usize % (i + 1));
        }
        prop_assert_eq!(fold(&ds).state_hash(), fold(&shuffled).state_hash());
        prop_assert_eq!(fold(&ds).materialize(), fold(&shuffled).materialize());
    }

    #[test]
    fn duplicates_do_not_matter(ds in prop::collection::vec(delta(), 0..60).prop_map(unique_stamps)) {
        let doubled: Vec<Delta> = ds.iter().chain(ds.iter()).cloned().collect();
        prop_assert_eq!(fold(&ds).state_hash(), fold(&doubled).state_hash());
    }

    #[test]
    fn merging_replicas_is_associative_and_commutative(
        a in prop::collection::vec(delta(), 0..30),
        b in prop::collection::vec(delta(), 0..30),
        c in prop::collection::vec(delta(), 0..30),
    ) {
        let all = unique_stamps(a.iter().chain(&b).chain(&c).cloned().collect());
        let pick = |src: &[Delta]| -> Vec<Delta> { src.iter().filter(|d| all.contains(d)).cloned().collect() };
        let (a, b, c) = (fold(&pick(&a)), fold(&pick(&b)), fold(&pick(&c)));
        let mut ab_c = a.clone(); ab_c.merge(&b); ab_c.merge(&c);
        let mut a_bc = b.clone(); a_bc.merge(&c); let mut x = a.clone(); x.merge(&a_bc);
        let mut ca = c.clone(); ca.merge(&a); ca.merge(&b);
        prop_assert_eq!(ab_c.state_hash(), x.state_hash());
        prop_assert_eq!(ab_c.state_hash(), ca.state_hash());
    }
}
