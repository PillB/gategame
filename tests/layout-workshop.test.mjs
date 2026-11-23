import assert from "node:assert/strict";
import test from "node:test";
import { addConnection, layoutFingerprint } from "../lib/simulation.js";
import { createLayoutWorkshop, layoutWorkshopReducer, LAYOUT_HISTORY_LIMIT, summarizeLayoutAccess } from "../lib/layout-workshop.js";

const empty = [[], []];
const belt = { from: "0:5", to: "1:5" };
const second = { from: "2:5", to: "3:5" };
const apply = (state, type, layout) => layoutWorkshopReducer(state, layout ? { type, layout } : { type });

test("editing is undoable and redoable without mutating earlier geometry", () => {
  const base = createLayoutWorkshop(empty);
  const first = apply(base, "edit", [[belt], []]);
  assert.equal(layoutFingerprint(base.edges), layoutFingerprint(empty));
  assert.deepEqual(first.edges, [[belt], []]);
  assert.equal(first.past.length, 1);
  assert.deepEqual(apply(first, "undo").edges, empty);
  const redo = apply(apply(first, "undo"), "redo");
  assert.deepEqual(redo.edges, first.edges);
  assert.notEqual(redo, first, "history is a new snapshot, not a mutable stack");
  assert.equal(apply(base, "undo"), base, "empty undo is a no-op");
  assert.equal(apply(base, "redo"), base, "empty redo is a no-op");
});

test("new edits invalidate redo; presets, challenges and respiro invalidate all history", () => {
  let state = apply(createLayoutWorkshop(empty), "edit", [[belt], []]);
  state = apply(state, "undo");
  assert.equal(state.future.length, 1);
  state = apply(state, "edit", [[second], []]);
  assert.equal(state.future.length, 0, "cannot redo an incompatible alternate branch");
  assert.equal(apply(state, "redo"), state);
  const reset = apply(state, "load", [[belt], []]);
  assert.deepEqual(reset.edges, [[belt], []]);
  assert.equal(reset.past.length, 0);
  assert.equal(reset.future.length, 0);
  const afterStart = apply(state, "clear");
  assert.deepEqual(afterStart.edges, [[second], []]);
  assert.equal(afterStart.past.length, 0);
  assert.equal(afterStart.future.length, 0);
  assert.equal(apply(afterStart, "undo"), afterStart,
    "a finished R06 live edit must never be undone through preflight history");
});

test("invalid actions and reciprocal physical belts are rejected before storing", () => {
  const base = createLayoutWorkshop(empty);
  assert.throws(() => apply(base, "unexpected"), /desconocida/);
  assert.throws(() => apply(base, "edit", [[{ from: "0:5", to: "2:5" }], []]), /válido/);
  assert.throws(() => apply(base, "load", [[belt, { from: belt.to, to: belt.from }], []]), /válido/);
  assert.throws(() => createLayoutWorkshop([[{ from: "01:5", to: "1:5" }], []]), /válido/);
  assert.equal(apply(base, "edit", empty), base, "identical geometry creates no history");
});

test("history is bounded to 20 real edits, oldest snapshots drop but newest is reversible", () => {
  let state = createLayoutWorkshop(empty);
  for (let i = 0; i < 45; i++) {
    state = apply(state, "edit", i % 2 === 0 ? [[belt], []] : empty);
    assert.ok(state.past.length <= LAYOUT_HISTORY_LIMIT);
  }
  assert.equal(state.past.length, 20);
  for (let i = 0; i < 20; i++) state = apply(state, "undo");
  assert.equal(state.past.length, 0);
  assert.equal(state.future.length, 20);
  assert.equal(apply(state, "undo"), state);
  for (let i = 0; i < 20; i++) state = apply(state, "redo");
  assert.equal(state.future.length, 0);
});

test("access preview uses real corridor blocking, not a guessed belt-count penalty", () => {
  const clear = summarizeLayoutAccess(empty);
  assert.deepEqual(clear, { reachable: 28, total: 28, blocked: 0, meanSteps: 10, byZone: [14,14] });
  // Border belts are rendered but do not separate ANY interior corridor cell.
  const border = summarizeLayoutAccess([[{ from: "0:0", to: "1:0" }], []]);
  assert.deepEqual(border, clear);
  // An unbroken, interior 14-segment belt is a genuine impassable wall.
  const wall = Array.from({ length: 14 }, (_, x) => ({ from: `${x}:5`, to: `${x+1}:5` }));
  const blocked = summarizeLayoutAccess([wall, []]);
  assert.deepEqual(blocked, { reachable: 14, total: 28, blocked: 14, meanSteps: 10, byZone: [0,14] });
  // Open just one gap: A* can detour and all access points regain a route.
  const gapped = summarizeLayoutAccess([wall.filter((_, i) => i !== 7), []]);
  assert.equal(gapped.reachable, 28);
  assert.ok(gapped.meanSteps > clear.meanSteps);
  assert.equal(gapped.blocked, 0);
  assert.deepEqual(summarizeLayoutAccess([[], wall]).byZone, [14,0]);
  assert.throws(() => summarizeLayoutAccess([[belt, {...belt, from:"1:5",to:"0:5"}], []]), /válido/);
});

test("adding an editor belt through the actual helper yields a reversible preview", () => {
  const first = createLayoutWorkshop(empty);
  const changed = [addConnection([], belt.from, belt.to, 15, 12), []];
  const secondState = apply(first, "edit", changed);
  assert.equal(secondState.edges[0].length, 1);
  assert.equal(apply(secondState, "undo").edges[0].length, 0);
});
