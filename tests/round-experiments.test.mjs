import test from "node:test";
import assert from "node:assert/strict";
import { ROUND_AB_PAIRS, ROUND_INTERACTIONS, interactionSurrogateScreen, pairedSurrogateScreen, runQueueSurrogate, validateRoundConfig } from "../lib/round-experiments.js";

test("round variants are unique, one-factor comparisons with explicit decisions", () => {
  assert.equal(ROUND_AB_PAIRS.length, 12);
  assert.equal(new Set(ROUND_AB_PAIRS.map((pair) => pair.id)).size, 12);
  for (const pair of ROUND_AB_PAIRS) {
    assert.notDeepEqual(pair.a, pair.b, `${pair.id} must change the treatment`);
    assert.ok(pair.playerDecision.length > 15);
    validateRoundConfig({ ...pair.shared, [pair.knob]: pair.a });
    validateRoundConfig({ ...pair.shared, [pair.knob]: pair.b });
  }
});

test("round config rejects invalid or hostile input without silently coercing", () => {
  for (const config of [{ lanes: 0 }, { lanes: NaN }, { passengers: -1 }, { infoLag: Infinity },
    { activeLanes: 8 }, { outages: 7 }, { serviceTailRate: 1.1 }, { shiftStyle: "other" },
    { __proto__: null, surprise: true }, [], null]) {
    assert.throws(() => validateRoundConfig(config));
  }
});

test("all A/B screening scenarios terminate, conserve people and are seed-repeatable", () => {
  for (const pair of ROUND_AB_PAIRS) for (const treatment of [pair.a, pair.b]) {
    const config = { ...pair.shared, [pair.knob]: treatment };
    for (const seed of [1, 2, 19]) {
      const result = runQueueSurrogate(config, seed);
      assert.deepEqual(result, runQueueSurrogate(config, seed));
      assert.equal(result.cleared + result.turnedAway + result.abandoned + result.unresolved, result.passengers);
      assert.equal(result.unresolved, 0, `${pair.id} ${String(treatment)} seed ${seed}`);
      assert.ok(result.elapsed > 0 && result.elapsed < 240);
      // Most queues can be empty; P90 can legitimately be zero even if the
      // longest 10% generate a positive mean. Do not assert a false ordering.
      assert.ok(result.meanWait >= 0 && result.p90Wait >= 0 && result.p90Wait <= result.elapsed);
      assert.ok(Number.isInteger(result.switches) && result.switches >= 0);
    }
  }
});

test("paired screens report honest deltas and bounded confidence intervals", () => {
  for (const pair of ROUND_AB_PAIRS) {
    const screen = pairedSurrogateScreen(pair, 4);
    assert.match(screen.scope, /NOT randomized human A\/B/);
    for (const row of Object.values(screen.metrics)) {
      assert.ok(Math.abs(row.treatment - row.control - row.delta) < 0.00001);
      assert.ok(row.paired95ci[0] <= row.delta && row.delta <= row.paired95ci[1]);
    }
  }
});

test("surrogate does not pretend its waiting queues reproduce physical belt routing", () => {
  const flat = runQueueSurrogate({ arrivalStyle: "steady" }, 9);
  assert.ok(!("pathRetries" in flat));
  assert.ok(!("score" in flat));
  assert.ok(!("faultRepairs" in flat));
});

test("combined late-round complications conserve passengers and report their non-additivity", () => {
  assert.equal(ROUND_INTERACTIONS.length, 8);
  assert.equal(new Set(ROUND_INTERACTIONS.map((item) => item.id)).size, 8);
  for (const item of ROUND_INTERACTIONS) {
    const c = validateRoundConfig({ ...item.left, ...item.right });
    assert.ok(c.activeLanes <= c.lanes);
    const result = runQueueSurrogate({ ...item.left, ...item.right }, 11);
    assert.equal(result.unresolved, 0, `${item.id}: all outcomes must be terminal`);
    assert.equal(result.cleared + result.turnedAway + result.abandoned, result.passengers);
    const screen = interactionSurrogateScreen(item, 4);
    for (const metric of Object.values(screen.metrics)) {
      assert.ok(Number.isFinite(metric.interaction));
      assert.ok(Math.abs(metric.together - metric.aloneLeft - metric.aloneRight - metric.interaction) < 0.00001);
    }
  }
});
