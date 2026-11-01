import assert from "node:assert/strict";
import test from "node:test";
import { parseChallengeScore, createChallengeUrl, compareChallengeScore, challengePrompt, nextRoundExperiment } from "../lib/challenges.js";

test("challenge score parser is strict, bounded and never interprets HTML or decimals", () => {
  assert.equal(parseChallengeScore("0"), 0);
  assert.equal(parseChallengeScore("1000"), 1000);
  for (const invalid of [null, undefined, 2, "", "-1", "1001", "01", "01.0", "2e2", "NaN", "Infinity", " 5", "5 ", "1\\n", "<img>", "２", "9999", "00"]) {
    assert.equal(parseChallengeScore(invalid), null, `incorrectly accepted ${String(invalid)}`);
  }
});

test("shared URLs preserve an exact layout and canonical score, dropping unrelated query and fragments", () => {
  const url = new URL(createChallengeUrl("https://pillb.github.io/gategame/?utm_campaign=abc#fragment", "G1.7.AA", 947));
  assert.equal(url.origin, "https://pillb.github.io");
  assert.equal(url.pathname, "/gategame/");
  assert.equal(url.searchParams.get("layout"), "G1.7.AA");
  assert.equal(url.searchParams.get("beat"), "947");
  assert.equal(url.searchParams.has("utm_campaign"), false);
  assert.equal(url.hash, "");
  for (const [code, score] of [["x", 50], ["G1.<img>", 50], ["G1", -1], ["G1", 1001], ["G1", 1.5], ["G1." + "A".repeat(2049), 50]]) {
    assert.throws(() => createChallengeUrl("https://pillb.github.io/gategame/", code, score), /no son válidos/i);
  }
  assert.throws(() => createChallengeUrl("javascript:alert(1)", "G1", 42), /no es válido/i);
});

test("challenge results distinguish win, tie and loss without rounding or data mutation", () => {
  assert.deepEqual(compareChallengeScore(949, 947), { outcome: "won", delta: 2, message: "¡Superaste el reto por 2 puntos!" });
  assert.equal(compareChallengeScore(947, 947).outcome, "tied");
  assert.equal(compareChallengeScore(946, 947).outcome, "missed");
  assert.equal(compareChallengeScore(1001, 947), null);
  assert.equal(compareChallengeScore(947.3, 947), null);
});

test("coaching uses observable variables, prioritizes repairs, and does not promise arbitrary points", () => {
  assert.match(nextRoundExperiment({ faultsLeft: 1, retries: 9 }), /supervisor/i);
  assert.match(nextRoundExperiment({ retries: 1 }), /reintentos/i);
  assert.match(nextRoundExperiment({ abandoned: 1 }), /abandonos/i);
  assert.match(nextRoundExperiment({ elapsed: 56 }), /tiempo final/i);
  assert.match(nextRoundExperiment({ queueSwitches: 35 }), /bono máximo/i);
  assert.match(nextRoundExperiment({ score: 900 }), /una sola cinta/i);
  assert.doesNotMatch(nextRoundExperiment({ score: 900 }), /garantiz|siempre|obtendrás/i);
});

test("deterministic same-layout replay is a tie, but improving the starting layout can win", () => {
  // Fixed seed + unchanged topology is deterministic: an exact replay cannot improve the score.
  assert.equal(challengePrompt(947, false, 947), "¡Empate! Igualaste la puntuación del desafío.");
  assert.match(challengePrompt(947, false), /cambia una cinta/i);
  // Changed layout MUST NOT disable the score target: optimization is the playable challenge.
  assert.match(challengePrompt(947, true), /Diseño ajustado.*947/i);
  assert.match(challengePrompt(947, true, 948), /Superaste el reto por 1 punto/i);
  assert.match(challengePrompt(947, true, 946), /faltaron 1 punto/i);
});
