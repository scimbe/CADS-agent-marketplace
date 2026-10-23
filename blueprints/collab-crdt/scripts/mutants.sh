#!/usr/bin/env bash
# Counter-checks: build each mutant (one exact replacement in one source file) in turn, run the
# test or the simulation that must notice it, and report whether it did. The original file is
# restored after every run, also when the script is interrupted.
# Usage: scripts/mutants.sh [M1b M2 ...]   (default: all). Exit 0 only if every mutant was caught.
set -u
cd "$(dirname "$0")/.."
export CARGO_TERM_COLOR=never

# id|file|detector (lib = cargo test --lib, conv = convergence 1000 editors)
MUTANTS="M1b|src/relay.rs|lib
M1c|src/relay.rs|lib
M2|src/doc.rs|lib
M3|src/outbox.rs|lib
M5|src/relay.rs|lib
M8|src/relay.rs|conv
M9|src/relay.rs|conv
M10|src/relay.rs|lib
M11|src/relay.rs|conv
M12|src/relay.rs|conv
M13|src/sim.rs|conv"

backup=$(mktemp -d)
current=""
restore() {
    if [ -n "$current" ] && [ -f "$backup/orig" ]; then cp "$backup/orig" "$current"; fi
    current=""
}
trap 'restore; rm -rf "$backup"' EXIT
trap 'exit 130' INT TERM

# mutate <id> <file>: exactly one occurrence of the old text must be replaced.
mutate() {
    python3 - "$1" "$2" <<'PY'
import sys
mid, path = sys.argv[1:3]
M8_OLD = ".filter(|(f, r)| f.concerns(wanted) || wanted.matches(r) || Some(f.stamp.replica) == me)"
M = {
    "M1b": ("Some(Arc::new(Batch { seq: self.seq, frames, routes, entering }))",
            "if self.seq % 37 == 0 {\n            frames.pop();\n            routes.pop();\n        }\n        Some(Arc::new(Batch { seq: self.seq, frames, routes, entering }))"),
    "M1c": ("for ((_, r), _) in self.by_seq.range((after + 1, 0)..) {",
            "for ((_, r), _) in self.by_seq.range((after + 2, 0)..) {"),
    "M2": ("Ok(i) if regs[i].stamp >= d.stamp => false,",
           "Ok(i) if regs[i].stamp.lamport >= d.stamp.lamport => false,"),
    "M3": ("for k in due {", "for k in due.into_iter().take(0) {"),
    "M5": ("TileSet::Only(set) => t == TILE_ANY || set.contains(&t),",
           "TileSet::Only(set) => set.contains(&t),"),
    "M8": (M8_OLD, ".filter(|(f, r)| f.concerns(wanted) || Some(f.stamp.replica) == me)"),
    "M9": ("if wanted.wants(e.to) && !wanted.wants(e.from) {",
           "if false && wanted.wants(e.to) && !wanted.wants(e.from) {"),
    "M10": (M8_OLD, ".filter(|(f, r)| f.concerns(wanted) || wanted.matches(r))"),
    "M11": ("            if is_positional(f.tiles[1]) {\n                out.insert(f.route, f.clone());\n",
            "            if is_positional(f.tiles[1]) {\n                if f.concerns(wanted) || here {\n                    out.insert(f.route, f.clone());\n                }\n"),
    "M12": ("for shape in entered {", "for shape in entered.into_iter().take(0) {"),
    "M13": ("// The new tiles are complete up to `upto` >= hwm; the old ones are what they were.\n",
            "// The new tiles are complete up to `upto` >= hwm; the old ones are what they were.\n                self.hwm = self.hwm.max(upto);\n"),
}
old, new = M[mid]
src = open(path).read()
n = src.count(old)
if n != 1:
    sys.exit(f"{mid}: the original text occurs {n} times in {path}, expected exactly once")
open(path, "w").write(src.replace(old, new))
PY
}

want="${*:-}"
total=0; caught=0; failed=""
while IFS='|' read -r id file detector; do
    if [ -n "$want" ] && ! [[ " $want " == *" $id "* ]]; then continue; fi
    total=$((total + 1))
    cp "$file" "$backup/orig"
    current="$file"
    if ! mutate "$id" "$file"; then
        restore; echo "$id: NOT APPLIED"; failed="$failed $id"; continue
    fi
    if ! cargo build --offline --release -q -p bp-collab-crdt --lib --bins >"$backup/build.log" 2>&1; then
        restore; echo "$id: MUTANT DOES NOT BUILD"; tail -5 "$backup/build.log"; failed="$failed $id"; continue
    fi
    if [ "$detector" = lib ]; then
        cargo test --offline --release -q -p bp-collab-crdt --lib >"$backup/run.log" 2>&1
    else
        cargo run --offline --release -q -p bp-collab-crdt --bin convergence -- --editors 1000 --leaves 10 >"$backup/run.log" 2>&1
    fi
    status=$?
    restore
    if [ "$status" -ne 0 ]; then
        echo "$id: detected ($detector, exit $status)"; caught=$((caught + 1))
    else
        echo "$id: SURVIVED ($detector)"; failed="$failed $id"
    fi
done <<EOF
$MUTANTS
EOF
cargo build --offline --release -q -p bp-collab-crdt --lib --bins >/dev/null 2>&1
echo "$caught of $total mutants detected"
[ -z "$failed" ] || { echo "not detected:$failed"; exit 1; }
