//! The freshness check of the simulation: a shape that left the phone's tiles and came back inside
//! the check window is not held to full freshness (its entering state may still be on the way).

use bp_collab_crdt::relay::{positional, Frame, Relay, TileSet, SHAPE_SHIFT};
use bp_collab_crdt::sim::{held_throughout, window_positions};
use bp_collab_crdt::Stamp;

const SHAPE: u128 = 7;
const POS: u128 = (SHAPE << SHAPE_SHIFT) | 1;
const ROTATION: u128 = (SHAPE << SHAPE_SHIFT) | 2;

fn frame(route: u128, lamport: u64, tiles: [u32; 2]) -> Frame<u64> {
    Frame { route, stamp: Stamp { lamport, replica: 1 }, tiles, payload: lamport }
}

fn sequence(root: &mut Relay<u64>, f: Frame<u64>) -> std::sync::Arc<bp_collab_crdt::relay::Batch<u64>> {
    root.submit(f);
    root.tick().expect("a new frame is sequenced")
}

#[test]
fn a_shape_lost_moved_out_overwritten_and_back_in_the_window_is_not_reported() {
    let phone = TileSet::from_list(&[75]);
    let mut root: Relay<u64> = Relay::default();

    // Before the window: the shape sits in tile 75.
    sequence(&mut root, frame(POS, 1, [75, positional(75)]));
    sequence(&mut root, frame(ROTATION, 2, [75, 75]));

    // The window: ROTATION is overwritten (the phone loses it), the shape leaves to 76, ROTATION is
    // overwritten again in 76 (the repair rightly does not bring it), the shape returns to 75.
    let window = vec![
        sequence(&mut root, frame(ROTATION, 3, [75, 75])),
        sequence(&mut root, frame(POS, 4, [75, positional(76)])),
        sequence(&mut root, frame(ROTATION, 5, [76, 76])),
        sequence(&mut root, frame(POS, 6, [76, positional(75)])),
    ];
    let positions = window_positions(window.iter().map(|b| &**b));
    assert_eq!(positions[&(SHAPE)], vec![76, 75]);

    // The relay has it in the phone's tile now, which the old check alone would have demanded fresh.
    assert_eq!(root.tile_of_shape(SHAPE), Some(75));
    assert!(!held_throughout(&phone, root.tile_of_shape(SHAPE), positions.get(&SHAPE).map(Vec::as_slice)), "no report for a shape that left in the window");
}

#[test]
fn a_shape_that_stayed_is_still_held_to_full_freshness() {
    let phone = TileSet::from_list(&[75]);
    let mut root: Relay<u64> = Relay::default();
    sequence(&mut root, frame(POS, 1, [75, positional(75)]));
    let window = vec![sequence(&mut root, frame(POS, 2, [75, positional(75)])), sequence(&mut root, frame(ROTATION, 3, [75, 75]))];
    let positions = window_positions(window.iter().map(|b| &**b));
    assert!(held_throughout(&phone, root.tile_of_shape(SHAPE), positions.get(&SHAPE).map(Vec::as_slice)));
    // A shape without any move in the window is held as well.
    assert!(held_throughout(&phone, root.tile_of_shape(SHAPE), None));
}
