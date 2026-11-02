import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ROUNDS, arrivalAt, getRound, paceClockCaption, scoredElapsed, upcomingWave } from "../lib/rounds.js";

const document = readFileSync(new URL("../docs/DELIGHT_LEDGER.md", import.meta.url), "utf8");

function rows(section, nextSection, prefix) {
  const block = document.split(section)[1]?.split(nextSection)[0];
  assert.ok(block, `Missing section ${section}`);
  return block.split("\n").filter((line) => new RegExp(`^\\| ${prefix}\\d{2} \\|`).test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

test("every proposed complication has a specific surprise, agency, reward and negative oracle", () => {
  const candidates = rows("## Las 24 complicaciones", "## Campaña R04", "M");
  assert.equal(candidates.length, 24);
  assert.deepEqual(candidates.map((cells) => cells[0]), Array.from({length:24},(_,i)=>`M${String(i+1).padStart(2,"0")}`));
  for (const [id, surprise, choice, falsifier] of candidates) {
    for (const [name, text] of [["surprise",surprise],["agency/payoff",choice],["falsifier",falsifier]]) {
      assert.ok(text.length >= 30 && !/\b(TODO|TBD|pendiente)\b/i.test(text), `${id} missing ${name}`);
    }
  }
});

test("all 36 future rounds include a distinct scene, meaningful intervention and payoff", () => {
  const campaign = rows("## Campaña R04", "## Criterios de aceptación", "R");
  assert.equal(campaign.length, 36);
  assert.deepEqual(campaign.map((cells)=>cells[0]), Array.from({length:36},(_,i)=>`R${String(i+4).padStart(2,"0")}`));
  for (const [id, scene, choice, payoff] of campaign) {
    for (const [name, text] of [["scene",scene],["choice",choice],["payoff",payoff]]) {
      assert.ok(text.length >= 25 && !/\b(TODO|TBD|pendiente)\b/i.test(text), `${id} missing ${name}`);
    }
  }
  assert.deepEqual(ROUNDS.filter((item)=>item.id!=="classic").map((item)=>item.id.toUpperCase()),["R04","R05","R06"]);
});

test("arrival scenes are honest: count, timestamp, order and versioned mission IDs", () => {
  assert.equal(getRound("unreleased").id,"classic");
  assert.equal(arrivalAt("classic",0),0);
  assert.equal(arrivalAt("classic",27),27*.72);
  assert.equal(arrivalAt("r04",28),null);
  assert.equal(upcomingWave("r04",0)?.at,11);
  for (const round of ROUNDS.filter((item)=>item.id!=="classic")) {
    assert.equal(round.arrivals.length,28);
    assert.equal(round.waves.reduce((acc,wave)=>acc+wave.count,0),28);
    assert.ok(round.arrivals.every((at,index)=>index===0||at>round.arrivals[index-1]));
    let i = 0;
    for (const wave of round.waves) {
      assert.ok(wave.surprise.length>25 && wave.label.length>9);
      assert.equal(round.arrivals[i],wave.at,`${round.id} advertised landing does not match spawn`);
      i+=wave.count;
    }
    assert.equal(i,28);
  }
});

test("scheduled idle gaps do not silently penalize mission pace scoring", () => {
  assert.equal(scoredElapsed("classic", 42.9), 42.9);
  const r04Offset = arrivalAt("r04",27)-arrivalAt("classic",27);
  const r05Offset = arrivalAt("r05",27)-arrivalAt("classic",27);
  assert.ok(r04Offset>15 && r05Offset<0,"Missions must actually differ in arrival cadence");
  assert.ok(Math.abs(scoredElapsed("r04",59.2)-(59.2-r04Offset))<1e-9);
  assert.ok(Math.abs(scoredElapsed("r05",39.3)-(39.3-r05Offset))<1e-9);
  assert.ok(scoredElapsed("r04",5)>=0,"Pre-arrival time can never create negative score time");
  assert.throws(()=>scoredElapsed("r04",-1),/inválido/i);
  assert.match(paceClockCaption("r05",0),/ajuste \+6[,.]28 s.*meta/,
    "A pre-start scoring offset must not pretend six seconds have elapsed");
  assert.match(paceClockCaption("r04",0),/ajuste −15[,.]48 s.*meta/);
  assert.match(paceClockCaption("r05",0.1),/puntuable 00:06.*meta/);
  assert.equal(paceClockCaption("classic",0),"meta ≤ 00:55");
  assert.match(paceClockCaption("r06",0),/ajuste −16[,.]48 s/);
});

test("new mission labels and messages remain in Spanish and accessible without color or audio", () => {
  for (const round of ROUNDS.filter((item)=>item.id!=="classic")) {
    const messages = [round.title,round.badge,round.story,round.decision,round.payoff,
      ...round.waves.flatMap((wave)=>[wave.label,wave.surprise])];
    for (const message of messages) {
      assert.doesNotMatch(message,/\b(flight|round|queue|next|start|finish|waiting|score)\b/i);
      assert.ok(/[\p{L}]/u.test(message),`Message is icon-only: ${message}`);
      assert.ok(message.length >= 10,`Uninformative mission cue: ${message}`);
    }
  }
});
