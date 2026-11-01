import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Script } from "node:vm";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { queueWalkLane, scoreShiftBreakdown, simulationInterval } from "../lib/simulation.js";

// Compile the ACTUAL simulation functions from the shipped UI, not a second,
// potentially divergent implementation. React is never mounted in this test.
const require = createRequire(import.meta.url);
const source = readFileSync(path.resolve("app/page.tsx"), "utf8") +
  "\nexport { tick, blank, GUIDED, SERPENTINE, TARGET, DT };\n";
const output = ts.transpileModule(source, { fileName: "page.tsx", compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  esModuleInterop: true,
}}).outputText;
const sandbox = { exports: {}, module: { exports: {} }, require: (id) => {
  if (id === "@/lib/simulation.js") return require("../lib/simulation.js");
  if (id === "@/lib/challenges.js") return require("../lib/challenges.js");
  return require(id);
}};
sandbox.module.exports = sandbox.exports;
new Script(output, { filename: "page.engine.cjs" }).runInNewContext(sandbox, { timeout: 5000 });
const { tick, blank, GUIDED, SERPENTINE, TARGET, DT } = sandbox.exports;
const scenarios = [
  ["guided", GUIDED], ["serpentine", SERPENTINE], ["open-floor", [[], []]],
];
const terminal = new Set(["done", "failed", "turnedAway", "left"]);

function fullRound(layout, { flagFaults = false, maxTicks = 2700 } = {}) {
  let state = { ...blank(), running: true };
  let walkingSeen = 0;
  let switchesInferred = 0;
  for (let step = 0; step < maxTicks; step++) {
    if (flagFaults) state = { ...state, faults: state.faults.map(f => ({ ...f, flagged: true })) };
    const prior = new Map(state.agents.map(a => [a.id, a]));
    const previous = state;
    const next = tick(state, layout);

    assert.equal(next.spawned, next.agents.length, "No duplicated/lost passenger objects");
    assert.equal(next.spawned, next.agents.filter(a => !terminal.has(a.stage)).length +
      next.cleared + next.failed + next.turnedAway + next.abandoned, "Conservation at each step");
    assert.ok(next.spawned <= TARGET && next.spawned >= previous.spawned, "Spawn count monotonic");
    assert.ok(next.retries >= previous.retries && next.repairs >= previous.repairs);
    assert.ok(next.queueSwitches >= previous.queueSwitches);
    assert.ok(next.repairs <= next.faults.length, "Cannot repair more belts than fault events");

    const ids = new Set();
    const busy = new Set();
    for (const agent of next.agents) {
      assert.ok(!ids.has(agent.id), "Duplicated passenger id");
      ids.add(agent.id);
      if (agent.stage === "walk1" || agent.stage === "walk2") {
        walkingSeen++;
        assert.ok(agent.walkDuration > 0 && agent.walkProgress >= 0 &&
          agent.walkProgress <= agent.walkDuration, "Invalid walk state");
        assert.equal(agent.queueSequence, null, "Walking passenger already allocated FIFO slot");
        const position = queueWalkLane(agent.walkFrom, agent.exit, agent.walkProgress, agent.walkDuration);
        assert.ok(position >= Math.min(agent.walkFrom, agent.exit) &&
          position <= Math.max(agent.walkFrom, agent.exit), "Walking sprite out of bounds");
      }
      if (agent.stage === "queue1" || agent.stage === "queue2") {
        assert.ok(Number.isInteger(agent.queueSequence), "Queued passenger missing arrival order");
      }
      if (agent.stage === "service1" || agent.stage === "service2") {
        const key = agent.stage + ":" + agent.exit;
        assert.ok(!busy.has(key), "Two passengers occupying one service counter");
        busy.add(key);
      }
      const before = prior.get(agent.id);
      if (before?.stage === "walk1" || before?.stage === "walk2") {
        if (agent.stage === "service1" || agent.stage === "service2") {
          assert.ok(before.walkProgress + DT >= before.walkDuration - 1e-8,
            "Passenger started service without completing the walk");
        }
      }
    }
    switchesInferred += next.queueSwitches - previous.queueSwitches;
    state = next;
    if (!state.running) {
      assert.equal(state.spawned, TARGET, "Premature game completion");
      assert.equal(state.cleared + state.failed + state.turnedAway + state.abandoned, TARGET);
      const score = scoreShiftBreakdown({processed:state.cleared,elapsed:state.elapsed,
        retries:state.retries,target:TARGET,turnedAway:state.turnedAway,
        abandoned:state.abandoned,complete:true,smartSwitches:state.queueSwitches,
        repairs:state.repairs,faultsLeft:state.faults.filter(f=>!f.repaired).length});
      assert.ok(score.total>=0 && score.total<=1000);
      return { state, steps: step+1, walkingSeen, switchesInferred, score:score.total };
    }
  }
  assert.fail("Round did not resolve within "+(maxTicks*DT)+" simulated seconds");
}

for (const [name, layout] of scenarios) {
  test(name+" full round: bounded completion, invariants, deterministic replay, actual walking", () => {
    const first = fullRound(layout);
    const repeat = fullRound(layout);
    assert.equal(JSON.stringify(first.state), JSON.stringify(repeat.state),
      "Same seed and map produced different state");
    assert.equal(first.steps, repeat.steps);
    assert.equal(first.score, repeat.score);
    assert.ok(first.walkingSeen > 0, "No passenger used a walk stage: path untested");
    assert.equal(first.switchesInferred, first.state.queueSwitches);
    console.info("GATEFLOW_BASELINE "+JSON.stringify({preset:name,
      elapsed:+first.state.elapsed.toFixed(1),cleared:first.state.cleared,turnedAway:first.state.turnedAway,
      failed:first.state.failed,abandoned:first.state.abandoned,switches:first.state.queueSwitches,
      faults:first.state.faults.length,repairs:first.state.repairs,score:first.score,
      observedWalkingTicks:first.walkingSeen}));
    for (const pace of [0.5, 1, 2]) {
      assert.ok(simulationInterval(pace, DT) > 0);
      // Speed changes only wall-clock scheduling; completed tick semantics stay invariant.
      assert.equal(first.score, fullRound(layout).score);
    }
  });
}

test("faults flagged on detection never break conservation or deterministic completion", () => {
  for (const [name, layout] of scenarios) {
    const baseline = fullRound(layout);
    const repaired = fullRound(layout, { flagFaults: true });
    assert.equal(repaired.state.spawned, TARGET, name);
    assert.ok(repaired.score>=0 && repaired.score<=1000);
    assert.ok(repaired.state.repairs <= repaired.state.faults.length);
    console.info("GATEFLOW_REPAIR "+JSON.stringify({preset:name,
      noIntervention:{score:baseline.score,elapsed:+baseline.state.elapsed.toFixed(1)},
      intervention:{score:repaired.score,elapsed:+repaired.state.elapsed.toFixed(1),repairs:repaired.state.repairs,
      faults:repaired.state.faults.length}}));
    if (repaired.state.repairs) assert.ok(repaired.score >= baseline.score ||
      repaired.state.cleared !== baseline.state.cleared ||
      repaired.state.elapsed !== baseline.state.elapsed,
      "Repairing faults unexpectedly lowered score with identical throughput/time");
  }
});
