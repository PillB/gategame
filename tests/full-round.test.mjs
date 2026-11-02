import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Script } from "node:vm";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { queueWalkLane, scoreShiftBreakdown, simulationInterval } from "../lib/simulation.js";
import { ROUNDS, arrivalAt, breathEditAvailable, scoredElapsed } from "../lib/rounds.js";

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
  if (id === "@/lib/rounds.js") return require("../lib/rounds.js");
  return require(id);
}};
sandbox.module.exports = sandbox.exports;
new Script(output, { filename: "page.engine.cjs" }).runInNewContext(sandbox, { timeout: 5000 });
const { tick, blank, GUIDED, SERPENTINE, TARGET, DT } = sandbox.exports;
const scenarios = [
  ["guided", GUIDED], ["serpentine", SERPENTINE], ["open-floor", [[], []]],
];
const terminal = new Set(["done", "failed", "turnedAway", "left"]);

const BASELINES = Object.freeze({
  guided: { elapsed: 42.9, cleared: 25, turnedAway: 3, switches: 11, repairs: 0, faults: 2, score: 868 },
  serpentine: { elapsed: 65.9, cleared: 25, turnedAway: 3, switches: 35, repairs: 0, faults: 2, score: 796 },
  "open-floor": { elapsed: 47.8, cleared: 25, turnedAway: 3, switches: 13, repairs: 0, faults: 0, score: 933 },
});
const REPAIRED_BASELINES = Object.freeze({
  guided: { score: 1000, repairs: 2, elapsed: 42.9 },
  serpentine: { score: 946, repairs: 2, elapsed: 65.9 },
  "open-floor": { score: 933, repairs: 0, elapsed: 47.8 },
});
const MISSION_BASELINES = Object.freeze({
  r04: {
    guided: {elapsed:59.2,cleared:25,abandoned:0,score:856},
    serpentine: {elapsed:75.1,cleared:25,abandoned:0,score:822},
    "open-floor": {elapsed:59.5,cleared:25,abandoned:0,score:932},
  },
  r05: {
    guided: {elapsed:39.3,cleared:25,abandoned:0,score:866},
    serpentine: {elapsed:63.1,cleared:25,abandoned:0,score:782},
    "open-floor": {elapsed:39.9,cleared:24,abandoned:1,score:810},
  },
  r06: {
    guided: {elapsed:57.7,cleared:25,abandoned:0,score:847},
    serpentine: {elapsed:73.2,cleared:25,abandoned:0,score:833},
    "open-floor": {elapsed:59.5,cleared:25,abandoned:0,score:929},
  },
});


function fullRound(layout, { flagFaults = false, maxTicks = 2700, roundId = "classic", breathRemoval = null } = {}) {
  let state = { ...blank(), running: true };
  const playedLayout = layout.map((group) => group.map((edge) => ({ ...edge })));
  let walkingSeen = 0;
  let switchesInferred = 0;
  const landings = [];
  const landingTimes = [];
  const announcements = new Set();
  let breathAnnouncements = 0;
  for (let step = 0; step < maxTicks; step++) {
    if (breathRemoval && breathEditAvailable(roundId, state.elapsed, state.breathEdits)) {
      const { grid, from, to } = breathRemoval;
      const existing = playedLayout[grid].findIndex((edge) =>
        (edge.from === from && edge.to === to) || (edge.to === from && edge.from === to));
      assert.ok(existing >= 0, "Breath removal must target a real belt");
      playedLayout[grid].splice(existing, 1);
      state = { ...state, breathEdits: state.breathEdits + 1 };
    }
    if (flagFaults) state = { ...state, faults: state.faults.map(f => ({ ...f, flagged: true })) };
    const prior = new Map(state.agents.map(a => [a.id, a]));
    const previous = state;
    const next = tick(state, playedLayout, roundId);
    for (const event of next.events) if (event.id.endsWith("-landing")) announcements.add(event.id);
    if (next.events.some((event)=>event.id==="r06-breath-open") &&
      !previous.events.some((event)=>event.id==="r06-breath-open")) {
      breathAnnouncements++;
      assert.equal(Math.round(next.elapsed / DT),140,"R06 respiro notice must arrive at 14.0s");
    }

    if (next.spawned > previous.spawned) {
      for (let i = previous.spawned; i < next.spawned; i++) {
        assert.ok(next.elapsed >= arrivalAt(roundId, i) - 1e-7, "Passenger arrived before the advertised flight");
        landings.push(i);
        landingTimes.push(next.elapsed);
      }
    }

    assert.equal(next.spawned, next.agents.length, "No duplicated/lost passenger objects");
    assert.equal(next.spawned, next.agents.filter(a => !terminal.has(a.stage)).length +
      next.cleared + next.failed + next.turnedAway + next.abandoned, "Conservation at each step");
    assert.ok(next.spawned <= TARGET && next.spawned >= previous.spawned, "Spawn count monotonic");
    assert.ok(next.retries >= previous.retries && next.repairs >= previous.repairs);
    assert.ok(next.breathEdits >= previous.breathEdits && next.breathEdits <= 1);
    assert.equal(next.breathEdits > 0 && roundId !== "r06", false, "Other rounds cannot earn breath changes");
    assert.ok(next.queueSwitches >= previous.queueSwitches);
    assert.ok(next.repairs <= next.faults.length, "Cannot repair more belts than fault events");
    assert.equal(new Set(next.events.map((item)=>item.id)).size,next.events.length,
      "Incident feed contains duplicate React keys (can leave ghost DOM events)");

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
      const score = scoreShiftBreakdown({processed:state.cleared,elapsed:scoredElapsed(roundId, state.elapsed),
        retries:state.retries,target:TARGET,turnedAway:state.turnedAway,
        abandoned:state.abandoned,complete:true,smartSwitches:state.queueSwitches,
        repairs:state.repairs,faultsLeft:state.faults.filter(f=>!f.repaired).length});
      assert.ok(score.total>=0 && score.total<=1000);
      return { state, steps: step+1, walkingSeen, switchesInferred, score:score.total, landings, landingTimes, announcements: [...announcements], breathAnnouncements };
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
    assert.deepEqual({
      elapsed: +first.state.elapsed.toFixed(1), cleared: first.state.cleared,
      turnedAway: first.state.turnedAway, switches: first.state.queueSwitches,
      repairs: first.state.repairs, faults: first.state.faults.length,
      score: first.score,
    }, BASELINES[name], "A game balance change must explicitly update the verified baseline");
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
    assert.deepEqual({
      score: repaired.score, repairs: repaired.state.repairs,
      elapsed: +repaired.state.elapsed.toFixed(1),
    }, REPAIRED_BASELINES[name], "Repair outcome changed without updating the audited baseline");
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

test("R04/R05/R06 landings, whimsical announcements, conservation, replay and 3 layout variants", () => {
  for (const round of ROUNDS.filter((item) => item.id !== "classic")) {
    assert.equal(round.arrivals.length, TARGET);
    assert.equal(round.waves.reduce((sum, wave) => sum + wave.count, 0), TARGET);
    assert.ok(round.title && round.story && round.decision && round.payoff);
    assert.ok(round.waves.every((wave, index) => index === 0 || wave.at > round.waves[index-1].at));
    for (const [name, layout] of scenarios) {
      const first = fullRound(layout, { roundId: round.id });
      const second = fullRound(layout, { roundId: round.id });
      assert.equal(JSON.stringify(first.state), JSON.stringify(second.state), `Replay diverged: ${round.id}/${name}`);
      assert.deepEqual(first.landings, Array.from({length:TARGET},(_,i)=>i));
      let waveFirstIndex=0;
      for (const wave of round.waves) {
        assert.ok(Math.abs(first.landingTimes[waveFirstIndex]-Math.max(DT,wave.at))<1e-7,
          `${round.id} landing ${wave.at}s delayed by floating-point accumulation`);
        waveFirstIndex+=wave.count;
      }
      assert.equal(first.announcements.length, round.waves.length, `Missing whimsical announcement: ${round.id}/${name}`);
      if (round.id === "r06") assert.equal(first.breathAnnouncements,1,
        "R06 relief announcement must fire once and at the earned moment");
      assert.ok(first.walkingSeen > 0, `Walking stages missing: ${round.id}/${name}`);
      assert.equal(first.score, second.score);
      assert.ok(first.state.elapsed >= round.arrivals.at(-1));
      assert.equal(first.state.cleared + first.state.failed + first.state.turnedAway + first.state.abandoned, TARGET);
      assert.deepEqual({elapsed:+first.state.elapsed.toFixed(1),cleared:first.state.cleared,
        abandoned:first.state.abandoned,score:first.score},MISSION_BASELINES[round.id][name],
        `Balance regression must update the explicit ${round.id}/${name} snapshot`);
      console.info("GATEFLOW_NEW_ROUND "+JSON.stringify({round:round.id,preset:name,
        elapsed:+first.state.elapsed.toFixed(1),cleared:first.state.cleared,abandoned:first.state.abandoned,
        score:first.score,walking:first.walkingSeen}));
    }
  }
});

test("a single player belt edit has a causal, reproducible effect in each new mission", () => {
  for (const roundId of ["r04","r05"]) {
    const base = fullRound(GUIDED,{roundId});
    const variants = GUIDED.flatMap((group,grid)=>group.map((edge,index)=>{
      const layout = GUIDED.map((edges)=>edges.map((item)=>({...item})));
      layout[grid].splice(index,1);
      const outcome = fullRound(layout,{roundId});
      return {removed:`${grid}:${edge.from}>${edge.to}`,score:outcome.score,
        cleared:outcome.state.cleared,abandoned:outcome.state.abandoned,
        retries:outcome.state.retries,elapsed:+outcome.state.elapsed.toFixed(1)};
    }));
    assert.ok(variants.some((candidate)=>candidate.score!==base.score),
      `${roundId} all one-belt changes were cosmetic`);
    assert.ok(new Set(variants.map((item)=>item.score)).size>=2,
      `${roundId} all modified layouts produced the same score`);
    console.info("GATEFLOW_CAUSAL_BELT "+JSON.stringify({roundId,baseScore:base.score,
      highest:variants.reduce((a,b)=>a.score>=b.score?a:b),
      lowest:variants.reduce((a,b)=>a.score<=b.score?a:b)}));
  }
});

test("arrival complication flips which starter layout performs better (non-cosmetic interaction)", () => {
  const r04Guided=fullRound(GUIDED,{roundId:"r04"}).score;
  const r04Open=fullRound([[],[]],{roundId:"r04"}).score;
  const r05Guided=fullRound(GUIDED,{roundId:"r05"}).score;
  const r05Open=fullRound([[],[]],{roundId:"r05"}).score;
  const openAdvantageR04=r04Open-r04Guided;
  const openAdvantageR05=r05Open-r05Guided;
  assert.equal(openAdvantageR04,76);
  assert.equal(openAdvantageR05,-56);
  assert.equal(openAdvantageR04-openAdvantageR05,132);
  console.info("GATEFLOW_STRATEGY_CROSSOVER "+JSON.stringify({r04:{guided:r04Guided,open:r04Open},
    r05:{guided:r05Guided,open:r05Open},interaction:132}));
});

test("R06 one-time relief is optional, replayable, risky and can genuinely help", () => {
  assert.equal(breathEditAvailable("r06",13.9,0),false);
  assert.equal(breathEditAvailable("r06",14,0),true);
  assert.equal(breathEditAvailable("r06",45,0),true,"No reaction-time penalty on the earned edit");
  assert.equal(breathEditAvailable("r06",14,1),false);
  assert.equal(breathEditAvailable("r06",14,0,true),false);
  assert.equal(breathEditAvailable("r04",14,0),false);
  const guided=fullRound(GUIDED,{roundId:"r06"});
  const guidedChanges=GUIDED.flatMap((group,grid)=>group.map((edge)=>({
    removed:`${grid}:${edge.from}>${edge.to}`,
    result:fullRound(GUIDED,{roundId:"r06",breathRemoval:{grid,...edge}}),
  })));
  const serp=fullRound(SERPENTINE,{roundId:"r06"});
  const serpChanges=SERPENTINE.flatMap((group,grid)=>group.map((edge)=>({
    removed:`${grid}:${edge.from}>${edge.to}`,
    result:fullRound(SERPENTINE,{roundId:"r06",breathRemoval:{grid,...edge}}),
  })));
  assert.ok(guidedChanges.every((change)=>change.result.state.breathEdits===1));
  assert.ok(guidedChanges.some((change)=>change.result.score!==guided.score));
  assert.ok(serpChanges.some((change)=>change.result.score>=serp.score+10),"No useful R06 move");
  assert.ok(serpChanges.some((change)=>change.result.score<=serp.score-10),"No risk/tradeoff");
  assert.equal(serpChanges.find((change)=>change.removed==="1:4:9>5:9")?.result.score,852,
    "Browser belt-removal fixture must remain helpful");
  const action={roundId:"r06",breathRemoval:{grid:1,from:"4:9",to:"5:9"}};
  assert.equal(JSON.stringify(fullRound(SERPENTINE,action).state),JSON.stringify(fullRound(SERPENTINE,action).state),
    "Identical edit and tick must produce identical state");
  console.info("GATEFLOW_BREATH_CAUSAL "+JSON.stringify({guided:guided.score,
    serpentine:serp.score,highest:Math.max(...serpChanges.map(x=>x.result.score)),
    lowest:Math.min(...serpChanges.map(x=>x.result.score)),helpfulBelt:"SEG 4:9>5:9"}));
});
