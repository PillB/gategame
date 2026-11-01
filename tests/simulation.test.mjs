import assert from "node:assert/strict";
import test from "node:test";
import {
  PASSENGER_EVENTS,
  addConnection,
  beltsToBlockedConnections,
  createShareCard,
  decodeLayout,
  encodeLayout,
  findNextQueuedAgentIndex,
  findRoute,
  findCorridorRoute,
  isCorridorStepBlocked,
  getShiftMedals,
  getHighestReachableRoute,
  layoutFingerprint,
  chooseLocalQueue,
  findLocalQueueMinimum,
  fieldOfViewContains,
  findWorkerCrossing,
  passengerPatience,
  queueSwitchProbability,
  queueWalkDuration,
  queueWalkLane,
  rankShift,
  repairBeltFault,
  sanitizeLayoutGroups,
  scoreShift,
  scoreShiftBreakdown,
  serviceLaneForCell,
  selectServiceEvent,
  serviceTimeWithEvent,
  simulationInterval,
  shouldAbandon,
  workerShiftPlan,
  applyBeltFault,
} from "../lib/simulation.js";

test("connections are cardinal and enforce one outgoing and one incoming edge", () => {
  const connections = addConnection([], "2:2", "2:1", 5, 5);
  assert.deepEqual(connections, [{ from: "2:2", to: "2:1" }]);
  assert.throws(() => addConnection(connections, "2:2", "3:2", 5, 5), /salida/i);
  assert.throws(() => addConnection(connections, "3:1", "2:1", 5, 5), /entrada/i);
  assert.throws(() => addConnection([], "0:0", "1:1", 5, 5), /contiguos/i);
});

test("A* finds a shortest route to the nearest open top-row exit", () => {
  const route = findRoute({ cols: 4, rows: 4, start: "2:3", connections: [
    { from: "1:2", to: "1:1" }, { from: "2:2", to: "2:1" }, { from: "3:2", to: "3:1" },
  ] });
  assert.equal(route.at(0), "2:3"); assert.match(route.at(-1), /^\d:0$/); assert.equal(route.length, 6);
});

test("blocked travellers reach the highest possible node", () => {
  const barrier = [0, 1, 2, 3].map((col) => ({ from: `${col}:2`, to: `${col}:1` }));
  const route = getHighestReachableRoute({ cols: 4, rows: 4, start: "1:3", connections: barrier });
  assert.equal(route.at(0), "1:3"); assert.equal(route.at(-1).endsWith(":2"), true);
});

test("shift scoring rewards throughput and penalizes overtime and retries", () => {
  const efficient = scoreShift({ processed: 24, elapsed: 80, retries: 1, target: 24 });
  const congested = scoreShift({ processed: 17, elapsed: 120, retries: 8, target: 24 });
  assert.ok(efficient > congested); assert.ok(efficient <= 1000 && congested >= 0);
});

test("service incidents are deterministic, phase-specific, and operational", () => {
  const first = selectServiceEvent(17, "immigration");
  assert.deepEqual(first, selectServiceEvent(17, "immigration"));
  assert.notDeepEqual(first, selectServiceEvent(17, "security"));
  for (const events of Object.values(PASSENGER_EVENTS)) {
    for (const event of events) {
      assert.equal(typeof event.id, "string");
      assert.equal(typeof event.title, "string");
      assert.equal(typeof event.detail, "string");
      assert.ok(event.multiplier > 0);
      assert.ok(["clear", "turnaway"].includes(event.outcome));
      for (const forbidden of ["race", "ethnicity", "religion", "gender", "nationality", "disability"]) {
        assert.equal(Object.hasOwn(event, forbidden), false);
      }
    }
  }
  assert.ok(PASSENGER_EVENTS.immigration.some((event) => event.outcome === "turnaway"));
  assert.ok(PASSENGER_EVENTS.security.some((event) => /escáner|revisión|control/i.test(`${event.title} ${event.detail}`)));
});

test("incident multipliers affect service time without changing the encoded passenger base time", () => {
  const event = { multiplier: 1.5 };
  assert.equal(serviceTimeWithEvent(4, 0.8, event), 4.8);
  assert.equal(serviceTimeWithEvent(4, 0.8, { multiplier: 1 }), 3.2);
});

test("passengers abandon only after their personal patience expires in a queue", () => {
  assert.equal(shouldAbandon({ stage: "queue1", waitTime: 11.9, patience: 12 }), false);
  assert.equal(shouldAbandon({ stage: "queue2", waitTime: 12, patience: 12 }), true);
  assert.equal(shouldAbandon({ stage: "service1", waitTime: 30, patience: 12 }), false);
});

test("the default patience curve makes abandonment exceptional rather than dominant", () => {
  const values = Array.from({ length: 28 }, (_, id) => passengerPatience(id));
  assert.ok(Math.min(...values) >= 15);
  assert.ok(new Set(values).size >= 4);
});

test("shift scoring applies stronger penalties to turnaways and abandonment", () => {
  const baseline = scoreShift({ processed: 20, elapsed: 80, retries: 2, target: 28 });
  const exceptions = scoreShift({ processed: 20, elapsed: 80, retries: 2, target: 28, turnedAway: 1, abandoned: 2 });
  assert.ok(baseline > exceptions);
});

test("the score ledger explains the observed serpentine run and both purser repairs", () => {
  const baseline = { processed: 25, elapsed: 66, retries: 0, target: 28, turnedAway: 3, abandoned: 0, complete: true, smartSwitches: 35, repairs: 0, faultsLeft: 2 };
  const ignored = scoreShiftBreakdown(baseline);
  assert.equal(ignored.throughput, 625);
  assert.equal(ignored.pace, 136);
  assert.equal(ignored.calm, 80);
  assert.equal(ignored.wayfinding, 40);
  assert.equal(ignored.queueSwitchBonus, 45);
  assert.equal(ignored.unresolvedFaultPenalty, -70);
  assert.equal(ignored.turnawayPenalty, -60);
  assert.equal(ignored.raw, 796);
  assert.equal(ignored.total, 796);
  const repaired = scoreShiftBreakdown({ ...baseline, repairs: 2, faultsLeft: 0 });
  assert.equal(repaired.repairBonus, 80);
  assert.equal(repaired.unresolvedFaultPenalty, 0);
  assert.equal(repaired.total, 946);
  assert.equal(repaired.total - ignored.total, 150);
});

test("queue-switch rewards stop at 15 switches and the score ledger clamps both extremes", () => {
  const args = { processed: 1, elapsed: 12, retries: 0, target: 10, smartSwitches: 15 };
  assert.equal(scoreShiftBreakdown(args).queueSwitchBonus, 45);
  assert.equal(scoreShiftBreakdown({ ...args, smartSwitches: 35 }).queueSwitchBonus, 45);
  assert.equal(scoreShiftBreakdown({ ...args, smartSwitches: -8 }).queueSwitchBonus, 0);
  assert.equal(scoreShiftBreakdown({ ...args, smartSwitches: 4 }).queueSwitchBonus, 12);
  const overflowing = scoreShiftBreakdown({ ...args, processed: 100, repairs: 100, complete: true });
  assert.ok(overflowing.raw > 1000);
  assert.equal(overflowing.capped, 1000);
  assert.equal(overflowing.total, 1000);
  const exhausted = scoreShiftBreakdown({ ...args, processed: 1, retries: 200, turnedAway: 100, abandoned: 100 });
  assert.ok(exhausted.raw < 0);
  assert.equal(exhausted.capped, 0);
  assert.equal(exhausted.total, 0);
  assert.deepEqual(scoreShiftBreakdown({ processed: 0, elapsed: 0, retries: 5, target: 28 }), {
    throughput: 0, pace: 0, calm: 0, wayfinding: 0, queueSwitchBonus: 0, repairBonus: 0,
    unresolvedFaultPenalty: 0, retryPenalty: 0, turnawayPenalty: 0, abandonmentPenalty: 0,
    raw: 0, capped: 0, total: 0,
  });
});

test("score ledger and legacy total agree with independent arithmetic across 800 states", () => {
  for (let index = 0; index < 800; index += 1) {
    const args = {
      processed: index % 30, elapsed: index % 137, retries: index % 11, target: 28,
      turnedAway: index % 5, abandoned: index % 7, complete: index % 3 === 0,
      smartSwitches: index % 47, repairs: index % 4, faultsLeft: index % 3,
    };
    const original = args.processed <= 0 && args.elapsed <= 0 ? 0 : Math.round(Math.max(0, Math.min(1000,
      args.processed / Math.max(1, args.target) * 700 +
      (args.complete ? Math.max(0, 220 - Math.max(0, args.elapsed - 45) * 4) : 0) +
      (args.complete && args.abandoned === 0 ? 80 : 0) +
      (args.complete && args.retries === 0 ? 40 : 0) +
      Math.min(45, Math.max(0, args.smartSwitches) * 3) + Math.max(0, args.repairs) * 40 - Math.max(0, args.faultsLeft) * 35 -
      args.retries * 12 - args.turnedAway * 20 - args.abandoned * 30
    )));
    const breakdown = scoreShiftBreakdown(args);
    assert.equal(scoreShift(args), original, `Legacy score changed for case ${index}`);
    assert.equal(breakdown.total, original, `Ledger disagrees for case ${index}`);
    assert.ok(breakdown.capped >= 0 && breakdown.capped <= 1000);
  }
});

test("shift ranks provide clear bounded mastery feedback", () => {
  assert.deepEqual(rankShift(900), { grade: "S", title: "Arquitecto del flujo" });
  assert.deepEqual(rankShift(720), { grade: "A", title: "Experto en colas" });
  assert.equal(rankShift(100).grade, "D");
});

test("medals reward legible goals instead of endless progression", () => {
  const medals = getShiftMedals({ processed: 25, abandoned: 0, retries: 0, elapsed: 52, target: 28 });
  assert.deepEqual(medals.filter((medal) => medal.earned).map((medal) => medal.id), ["throughput", "calm", "wayfinder", "pace"]);
  assert.equal(medals.length, 4);
});

test("layout fingerprints are stable, compact, and sensitive to direction", () => {
  const edges = [[{ from: "1:2", to: "1:1" }, { from: "2:2", to: "3:2" }], []];
  assert.equal(layoutFingerprint(edges), layoutFingerprint([[...edges[0]].reverse(), []]));
  assert.notEqual(layoutFingerprint(edges), layoutFingerprint([[{ from: "1:1", to: "1:2" }, { from: "2:2", to: "3:2" }], []]));
  assert.match(layoutFingerprint(edges), /^[A-Z0-9]{6}$/);
});

test("share cards are concise, challenge-oriented, and contain no passenger narratives", () => {
  const card = createShareCard({ score: 742, rank: { grade: "A", title: "Experto en colas" }, processed: 24, target: 28, elapsed: 51.2, abandoned: 0, retries: 2, fingerprint: "GF42QZ", url: "https://example.test" });
  assert.match(card, /GATEFLOW A · 742/);
  assert.match(card, /24\/28 atendidos/);
  assert.match(card, /GF42QZ/);
  assert.match(card, /¿Tus cintas superan a las mías\?/);
  assert.ok(card.length < 240);
  assert.doesNotMatch(card, /pasaporte|seguridad|migraciones/i);
  const perfect=createShareCard({score:1000,rank:{grade:"S",title:"Arquitecto del flujo"},processed:25,target:28,elapsed:42.9,abandoned:0,retries:0,fingerprint:"GF42QZ",url:"https://example.test"});
  assert.match(perfect,/igualar mis 1000 puntos perfectos/);
  assert.doesNotMatch(perfect,/superan a las mías/);
});

test("pace control remains bounded and preserves simulation time", () => {
  assert.equal(simulationInterval(0.5, 0.1), 200);
  assert.equal(simulationInterval(1, 0.1), 100);
  assert.equal(simulationInterval(2, 0.1), 50);
  assert.throws(() => simulationInterval(3, 0.1), /velocidad/i);
});

test("stanchion belts block corridor crossings instead of becoming walkable routes", () => {
  const blocked = beltsToBlockedConnections([
    { from: "1:1", to: "2:1" },
    { from: "1:1", to: "1:2" },
  ], 4, 4);
  assert.deepEqual(blocked, [
    { from: "1:0", to: "1:1" },
    { from: "0:1", to: "1:1" },
  ]);

  const route = findCorridorRoute({ postCols: 4, postRows: 4, start: "1:2", belts: [{ from: "1:2", to: "2:2" }] });
  assert.equal(route.at(0), "1:2");
  assert.equal(route.at(-1).endsWith(":0"), true);
  assert.equal(route.some((node, index) => node === "1:2" && route[index + 1] === "1:1"), false);
});

test("corridor step validity maps horizontal and vertical belts to the correct walls", () => {
  const horizontal = { from: "1:1", to: "2:1" };
  const vertical = { from: "1:1", to: "1:2" };
  assert.equal(isCorridorStepBlocked("1:0", "1:1", [horizontal], 4, 4), true);
  assert.equal(isCorridorStepBlocked("1:1", "1:0", [horizontal], 4, 4), true);
  assert.equal(isCorridorStepBlocked("0:1", "1:1", [vertical], 4, 4), true);
  assert.equal(isCorridorStepBlocked("1:1", "0:1", [vertical], 4, 4), true);
  assert.equal(isCorridorStepBlocked("1:0", "1:1", [vertical], 4, 4), false);
  assert.equal(isCorridorStepBlocked("0:1", "1:1", [horizontal], 4, 4), false);
});

test("newly faulted belts invalidate the next route step without blocking an alternate", () => {
  const from = "1:1", to = "1:0";
  const currentBelts = [{ from: "0:1", to: "1:1" }];
  assert.equal(isCorridorStepBlocked(from, to, currentBelts, 4, 4), false);
  const withFault = [...currentBelts, { from: "1:1", to: "2:1" }];
  assert.equal(isCorridorStepBlocked(from, to, withFault, 4, 4), true);
  assert.equal(isCorridorStepBlocked("1:1", "2:1", withFault, 4, 4), false);
  assert.equal(isCorridorStepBlocked("2:0", "2:1", withFault, 4, 4), false);
});

test("corridor step checks reject malformed paths instead of treating teleports as open", () => {
  assert.throws(() => isCorridorStepBlocked("0:0", "2:0", [], 4, 4), /no es válido/i);
  assert.throws(() => isCorridorStepBlocked("0:0", "0:0", [], 4, 4), /no es válido/i);
  assert.throws(() => isCorridorStepBlocked("0:0", "-1:0", [], 4, 4), /no es válido/i);
  assert.throws(() => isCorridorStepBlocked(undefined, "1:0", [], 4, 4), /no es válido/i);
  assert.throws(() => isCorridorStepBlocked("0:0", "1:0", [], 1, 4), /no es válido/i);
});

test("fivefold stanchion density still leaves a bounded corridor grid", () => {
  const postCols = 15, postRows = 12;
  assert.ok(postCols * postRows >= 35 * 5);
  const route = findCorridorRoute({ postCols, postRows, start: "7:10", belts: [] });
  assert.equal(route.length, 11);
  assert.equal(route.at(-1), "7:0");
});

test("challenge layout codes round-trip and reject malformed or oversized input", () => {
  const layout = [[{ from: "1:2", to: "2:2" }], [{ from: "4:5", to: "4:6" }]];
  const code = encodeLayout(layout, 15, 12);
  assert.match(code, /^[A-Z0-9.]+$/);
  assert.deepEqual(decodeLayout(code, 15, 12), layout);
  assert.equal(decodeLayout("NOT*VALID", 15, 12), null);
  const dense = [Array.from({ length: 12 }, (_, y) => Array.from({ length: 14 }, (_, x) => ({ from: `${x}:${y}`, to: `${x + 1}:${y}` }))).flat(), []];
  const denseCode = encodeLayout(dense, 15, 12);
  assert.ok(denseCode.length < 2048);
  assert.deepEqual(decodeLayout(denseCode, 15, 12), dense);
  assert.equal(decodeLayout("A".repeat(2049), 15, 12), null);
});

test("saved layouts fail closed when shape, cardinality, or node contracts are invalid", () => {
  assert.equal(sanitizeLayoutGroups({ nope: true }, 15, 12), null);
  assert.equal(sanitizeLayoutGroups([[{ from: "1:1", to: "3:1" }], []], 15, 12), null);
  assert.equal(sanitizeLayoutGroups([[{ from: "1:1", to: "2:1" }, { from: "1:1", to: "1:2" }], []], 15, 12), null);
  assert.deepEqual(sanitizeLayoutGroups([[{ from: "1:1", to: "2:1" }], []], 15, 12), [[{ from: "1:1", to: "2:1" }], []]);
});

test("corridor exits map predictably into the seven service desks", () => {
  assert.equal(serviceLaneForCell(0, 14, 7), 0);
  assert.equal(serviceLaneForCell(7, 14, 7), 3);
  assert.equal(serviceLaneForCell(13, 14, 7), 6);
  assert.throws(() => serviceLaneForCell(14, 14, 7), /celda/i);
  assert.throws(() => serviceLaneForCell(0, 0, 7), /válidos/i);
  assert.throws(() => serviceLaneForCell(0, 14, 0), /válidos/i);
  assert.throws(() => serviceLaneForCell(0, 14, -1), /válidos/i);
  assert.throws(() => serviceLaneForCell(0, 14, 2.5), /válidos/i);
});

test("completion scoring starts at zero, rewards speed, and keeps an S rank attainable", () => {
  assert.equal(scoreShift({ processed: 0, elapsed: 0, retries: 0, target: 28 }), 0);
  const fast = scoreShift({ processed: 25, elapsed: 50, retries: 0, target: 28, turnedAway: 3, abandoned: 0, complete: true });
  const slow = scoreShift({ processed: 25, elapsed: 70, retries: 0, target: 28, turnedAway: 3, abandoned: 0, complete: true });
  assert.ok(fast > slow);
  assert.equal(rankShift(fast).grade, "S");
});

test("FIFO service chooses earliest queue entry even when a smaller passenger ID arrived later", () => {
  const agents = [
    { id: 0, stage: "queue1", exit: 3, queuedAt: 8, queueSequence: 10 },
    { id: 1, stage: "queue1", exit: 3, queuedAt: 3, queueSequence: 4 },
    { id: 2, stage: "queue2", exit: 3, queuedAt: 2, queueSequence: 1 },
    { id: 3, stage: "queue1", exit: 4, queuedAt: 1, queueSequence: 2 },
    { id: 4, stage: "service1", exit: 3, queuedAt: 1, queueSequence: 3 },
  ];
  assert.equal(findNextQueuedAgentIndex(agents, "queue1", 3), 1);
  assert.equal(findNextQueuedAgentIndex(agents, "queue2", 3), 2);
  assert.equal(findNextQueuedAgentIndex(agents, "queue1", 4), 3);
  assert.equal(findNextQueuedAgentIndex(agents, "queue2", 6), -1);
  assert.deepEqual(agents[0], { id: 0, stage: "queue1", exit: 3, queuedAt: 8, queueSequence: 10 });
});

test("FIFO service uses arrival time if sequence is missing, then ID only to resolve an exact tie", () => {
  const agents = [
    { id: 20, stage: "queue1", exit: 0, queuedAt: 4 },
    { id: 5, stage: "queue1", exit: 0, queuedAt: 4 },
    { id: 1, stage: "queue1", exit: 0, queuedAt: 5 },
  ];
  assert.equal(findNextQueuedAgentIndex(agents, "queue1", 0), 1);
  assert.equal(findNextQueuedAgentIndex(agents.toReversed(), "queue1", 0), 1);
  assert.equal(findNextQueuedAgentIndex([{ id: 1, stage: "queue1", exit: 0, queuedAt: 2 }, { id: 999, stage: "queue1", exit: 0, queuedAt: 1 }], "queue1", 0), 1);
  assert.equal(findNextQueuedAgentIndex([{ id: 8, stage: "queue1", exit: 0, queuedAt: 5, queueSequence: 2 }, { id: 7, stage: "queue1", exit: 0, queuedAt: 3, queueSequence: 3 }], "queue1", 0), 0);
});

test("FIFO selection fails closed for malformed candidates rather than silently reverting to ID order", () => {
  assert.throws(() => findNextQueuedAgentIndex({}, "queue1", 0), /válidos/i);
  assert.throws(() => findNextQueuedAgentIndex([], "service1", 0), /válidos/i);
  assert.throws(() => findNextQueuedAgentIndex([], "queue1", -1), /válidos/i);
  assert.throws(() => findNextQueuedAgentIndex([{ id: 0, stage: "queue1", exit: 0 }], "queue1", 0), /orden de llegada/i);
  assert.throws(() => findNextQueuedAgentIndex([{ id: 0, stage: "queue1", exit: 0, queueSequence: NaN }], "queue1", 0), /orden de llegada/i);
  assert.throws(() => findNextQueuedAgentIndex([{ id: 0, stage: "queue1", exit: 0, queuedAt: -2 }], "queue1", 0), /orden de llegada/i);
  assert.equal(findNextQueuedAgentIndex([{ id: 0, stage: "queue2", exit: 1 }], "queue1", 0), -1);
});

test("FIFO selection is invariant under any permutation of the agent array", () => {
  const original = Array.from({ length: 20 }, (_, id) => ({ id, stage: "queue1", exit: 2, queueSequence: (id * 7) % 20 }));
  for (let shift = 0; shift < original.length; shift += 1) {
    const permuted = [...original.slice(shift), ...original.slice(0, shift)].reverse();
    const index = findNextQueuedAgentIndex(permuted, "queue1", 2);
    assert.equal(permuted[index].queueSequence, 0);
  }
});

test("local queue search stops at the first uphill lane and cannot see a better queue beyond it", () => {
  const waits = [0, 5, 2, 3, 4, 5, 1];
  assert.equal(findLocalQueueMinimum(4, waits), 2);
  assert.notEqual(findLocalQueueMinimum(4, waits), 0);
  assert.equal(findLocalQueueMinimum(4, waits, [3]), 4);
});

test("queue switching is deterministic, mostly follows meaningful improvements, and preserves some inertia", () => {
  assert.equal(queueSwitchProbability(0), 0);
  assert.ok(queueSwitchProbability(1) > 0.5);
  assert.ok(queueSwitchProbability(3) > queueSwitchProbability(1));
  const choices = Array.from({ length: 200 }, (_, passengerId) => chooseLocalQueue({ origin: 3, waits: [7, 6, 2, 4, 7, 8, 9], passengerId, phase: 1 }));
  const switched = choices.filter((lane) => lane === 2).length;
  const stayed = choices.filter((lane) => lane === 3).length;
  assert.ok(switched > stayed);
  assert.ok(stayed > 0);
  assert.deepEqual(choices, Array.from({ length: 200 }, (_, passengerId) => chooseLocalQueue({ origin: 3, waits: [7, 6, 2, 4, 7, 8, 9], passengerId, phase: 1 })));
});

test("reserved queue choices spread a burst instead of stampeding one desk", () => {
  const waits = [5, 4, 3, 4, 5, 6, 7];
  const assigned = [];
  for (let passengerId = 0; passengerId < 40; passengerId += 1) {
    const lane = chooseLocalQueue({ origin: 3, waits, passengerId, phase: 2 });
    waits[lane] += 1;
    assigned.push(lane);
  }
  assert.ok(new Set(assigned).size >= 2);
  assert.ok(Math.max(...waits) - Math.min(...waits) <= 5);
});

test("worker rotations cascade, close desks for prep, and expose readable difficulty hints", () => {
  const plan = workerShiftPlan({ phase: 1, lanes: 7, startAt: 14, cadence: 3.2 });
  assert.deepEqual(plan.map((change) => change.lane), [3, 2, 4, 1, 5, 0, 6]);
  assert.ok(Math.abs((plan[1].startAt - plan[0].startAt) - 3.2) < 1e-9);
  assert.ok(plan.every((change) => change.walkDuration > 0 && change.prepDuration > 0));
  assert.ok(plan.every((change) => /RÁPIDO|CONSTANTE|MINUCIOSO/.test(change.hint)));
  assert.ok(plan.every((change) => /\d,\d{2}×$/.test(change.hint)));
  assert.ok(plan.every((change) => change.rate >= 0.7 && change.rate <= 1.35));
});

test("worker rotations reject invalid phase and cadence with a localized error", () => {
  assert.throws(() => workerShiftPlan({ phase: -1, lanes: 7, startAt: 14, cadence: 3.2 }), /plan de rotación/i);
  assert.throws(() => workerShiftPlan({ phase: 1.5, lanes: 7, startAt: 14, cadence: 3.2 }), /plan de rotación/i);
  assert.throws(() => workerShiftPlan({ phase: 1, lanes: 7, startAt: 14, cadence: 0 }), /plan de rotación/i);
});

test("belt faults fail safely and repairs restore the exact original connection", () => {
  const original = { from: "4:8", to: "5:8" };
  const base = [original, { from: "8:8", to: "9:8" }];
  const open = applyBeltFault(base, original, "open", 15, 12);
  assert.equal(open.edges.some((edge) => edge.from === original.from && edge.to === original.to), false);
  assert.equal(open.applied, null);
  const rotated = applyBeltFault(base, original, "rotate-down", 15, 12);
  assert.deepEqual(rotated.applied, { from: "4:8", to: "4:9" });
  assert.deepEqual(repairBeltFault(rotated.edges, { original, applied: rotated.applied }, 15, 12), base);
});

test("an unknown fault kind cannot silently remove a valid belt", () => {
  const original = { from: "4:8", to: "5:8" };
  const base = [original];
  assert.throws(() => applyBeltFault(base, original, "unknown", 15, 12), /tipo de falla de cinta/i);
  assert.deepEqual(base, [original]);
});

test("a 90-degree purser cone sees flagged faults ahead, not behind or out of range", () => {
  assert.equal(fieldOfViewContains({ origin: { x: 2, y: 10 }, heading: { x: 1, y: 0 }, target: { x: 5, y: 8 }, range: 5, fovDegrees: 90 }), true);
  assert.equal(fieldOfViewContains({ origin: { x: 2, y: 10 }, heading: { x: 1, y: 0 }, target: { x: 0, y: 10 }, range: 5, fovDegrees: 90 }), false);
  assert.equal(fieldOfViewContains({ origin: { x: 2, y: 10 }, heading: { x: 1, y: 0 }, target: { x: 8, y: 10 }, range: 5, fovDegrees: 90 }), false);
});

test("visible interventions make the score go up while unresolved belt faults cost points", () => {
  const baseline = scoreShift({ processed: 20, elapsed: 52, retries: 0, target: 28, complete: true });
  const helped = scoreShift({ processed: 20, elapsed: 52, retries: 0, target: 28, complete: true, smartSwitches: 10, repairs: 1 });
  const ignored = scoreShift({ processed: 20, elapsed: 52, retries: 0, target: 28, complete: true, smartSwitches: 10, faultsLeft: 2 });
  assert.ok(helped > baseline);
  assert.ok(helped > ignored);
});

test("an inbound worker uses the nearest crossed horizontal belt when the direct column is open", () => {
  const belts = [
    { from: "4:8", to: "5:8" },
    { from: "12:8", to: "13:8" },
  ];
  assert.deepEqual(findWorkerCrossing(belts, 9), belts[1]);
  assert.deepEqual(findWorkerCrossing(belts, 13), belts[1]);
  assert.equal(findWorkerCrossing([{ from: "4:8", to: "4:9" }], 4), null);
});

test("a passenger never stays at an interface desk that is closed for handover", () => {
  for (let passengerId = 0; passengerId < 40; passengerId += 1) {
    assert.notEqual(chooseLocalQueue({ origin: 3, waits: [2, 2, 2, 2, 2, 2, 2], closed: [3], passengerId, phase: 1 }), 3);
  }
});

test("the seeded rotation includes early, rare open and rotated belt faults", () => {
  const plan = [...workerShiftPlan({ phase: 1, lanes: 7, startAt: 14, cadence: 3.2 }), ...workerShiftPlan({ phase: 2, lanes: 7, startAt: 22, cadence: 3.2 })];
  const faults = plan.filter((worker) => worker.faultKind);
  assert.ok(faults.length >= 1 && faults.length <= 3);
  assert.ok(faults.some((worker) => worker.faultKind === "open"));
  assert.ok(faults.some((worker) => worker.faultKind === "rotate-down"));
  assert.ok(Math.min(...faults.map((worker) => worker.startAt)) < 25);
});

test("queue travel is bounded, finite and interpolated rather than teleporting", () => {
  assert.equal(queueWalkDuration(3, 3), 0);
  assert.equal(queueWalkDuration(3, 4), 0.65);
  assert.equal(queueWalkDuration(0, 6), 3.9000000000000004);
  for (const [start, end] of [[0, 6], [6, 0], [3, 4], [4, 2]]) {
    const duration = queueWalkDuration(start, end);
    let last = start;
    for (let tick = 0; tick <= Math.ceil(duration / 0.1) + 2; tick += 1) {
      const at = queueWalkLane(start, end, tick * 0.1, duration);
      assert.ok(at >= Math.min(start, end) && at <= Math.max(start, end), "lane coordinate overshot");
      assert.ok(Math.abs(at - last) <= 0.1 / 0.65 + 1e-9, "a passenger teleported across lanes in a tick");
      if (start < end) assert.ok(at >= last); else assert.ok(at <= last);
      last = at;
    }
    assert.equal(queueWalkLane(start, end, duration, duration), end);
    assert.equal(queueWalkLane(start, end, duration + 100, duration), end);
  }
  assert.throws(() => queueWalkDuration(-1, 2), /válidas/i);
  assert.throws(() => queueWalkLane(1, 2, NaN, 1), /válida/i);
  assert.throws(() => queueWalkLane(1, 2, 0, -1), /válida/i);
});
