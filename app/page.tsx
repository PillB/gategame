"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { challengePrompt, createChallengeUrl, createNativeShareData, describeRoundDelta, nextRoundExperiment, parseChallengeRound, parseChallengeScore } from "@/lib/challenges.js";
import { arrivalAt, DEFAULT_ROUND, getRound, ROUNDS, upcomingWave } from "@/lib/rounds.js";
import { addConnection, applyBeltFault, chooseLocalQueue, createShareCard, decodeLayout, edgeKey, encodeLayout, fieldOfViewContains, findCorridorRoute, findNextQueuedAgentIndex, findWorkerCrossing, getHighestCorridorRoute, getShiftMedals, isCorridorStepBlocked, queueWalkDuration, queueWalkLane, layoutFingerprint, parseNode, passengerPatience, rankShift, sanitizeLayoutGroups, scoreShiftBreakdown, selectServiceEvent, serviceLaneForCell, serviceTimeWithEvent, shouldAbandon, shuffleWithSeed, simulationInterval, workerShiftPlan } from "@/lib/simulation.js";

const POST_COLS = 15;
const POST_ROWS = 12;
const CELL_COLS = POST_COLS - 1;
const CELL_ROWS = POST_ROWS - 1;
const LANES = 7;
const TARGET = 28;
const DT = 0.1;
type Edge = { from: string; to: string };
type Grid = 0 | 1;
type Stage = "grid1" | "choice1" | "walk1" | "queue1" | "service1" | "grid2" | "choice2" | "walk2" | "queue2" | "service2" | "done" | "failed" | "turnedAway" | "left";
type ServiceEvent = { id: string; title: string; short: string; detail: string; multiplier: number; outcome: "clear" | "turnaway"; tone: "good" | "warn" | "alert" };
type DeskEvent = { id: string; passengerId: number; phase: "immigration" | "security" | "queue" | "ops"; title: string; detail: string; tone: ServiceEvent["tone"]; time: number };
type Agent = {
  id: number; stage: Stage; route: string[]; routeIndex: number; progress: number;
  success: boolean; returning: boolean; attempt: number; entries1: number[]; entries2: number[];
  exit: number; speed: number; time1: number; time2: number; remaining: number;
  fill: string; border: string; hatch: number; waitTime: number; patience: number;
  queueSequence: number | null;
  walkFrom: number; walkProgress: number; walkDuration: number;
  immigrationEvent: ServiceEvent; securityEvent: ServiceEvent; currentEvent: ServiceEvent | null;
};
type WorkerChange = ReturnType<typeof workerShiftPlan>[number] & { grid: Grid };
type BeltFault = { id: string; grid: Grid; kind: "open" | "rotate-down"; original: Edge; applied: Edge | null; worker: string; flagged: boolean; repaired: boolean };
type Purser = { x: number; direction: -1 | 1; state: "patrol" | "break" | "chat" };
type Sim = { agents: Agent[]; events: DeskEvent[]; elapsed: number; spawned: number; cleared: number; failed: number; turnedAway: number; abandoned: number; retries: number; nextSpawn: number; nextQueueSequence: number; running: boolean; queueSwitches: number; queueStays: number; repairs: number; faults: BeltFault[]; faultedWorkers: string[] };

const beltRow = (row: number, gap: number) => Array.from({ length: POST_COLS - 1 }, (_, x) => ({ from: `${x}:${row}`, to: `${x + 1}:${row}` })).filter((_, x) => x !== gap);
const GUIDED: [Edge[], Edge[]] = [
  [{ from: "0:8", to: "1:8" }, { from: "1:8", to: "2:8" }, { from: "8:8", to: "9:8" }, { from: "9:8", to: "10:8" }],
  [{ from: "4:8", to: "5:8" }, { from: "5:8", to: "6:8" }, { from: "12:8", to: "13:8" }, { from: "13:8", to: "14:8" }],
];
const SERPENTINE: [Edge[], Edge[]] = [
  [...beltRow(9, 2), ...beltRow(6, 10), ...beltRow(3, 4)],
  [...beltRow(9, 11), ...beltRow(6, 3), ...beltRow(3, 9)],
];
const ENTRY_DEMAND = [0, 1, 0, 8, 9, 0, 8, 4, 9, 13, 0, 8, 1, 9, 12, 0, 8, 5, 9, 0, 8, 2, 10, 0, 9, 6, 8, 13];
const RATE1 = [1.35, 0.76, 1.08, 0.88, 1.24, 0.72, 1.16];
const RATE2 = [1.12, 0.82, 1.28, 0.74, 1.06, 0.88, 1.2];
const WORKER_CHANGES: WorkerChange[] = [
  ...workerShiftPlan({ phase: 1, lanes: LANES, startAt: 14, cadence: 3.2 }).map((change) => ({ ...change, grid: 0 as Grid })),
  ...workerShiftPlan({ phase: 2, lanes: LANES, startAt: 22, cadence: 3.2 }).map((change) => ({ ...change, grid: 1 as Grid })),
];
const blank = (): Sim => ({ agents: [], events: [], elapsed: 0, spawned: 0, cleared: 0, failed: 0, turnedAway: 0, abandoned: 0, retries: 0, nextSpawn: 0, nextQueueSequence: 0, running: false, queueSwitches: 0, queueStays: 0, repairs: 0, faults: [], faultedWorkers: [] });

const workerTimes = (worker: WorkerChange) => ({
  arrive: worker.startAt + worker.walkDuration,
  handover: worker.startAt + worker.walkDuration + worker.handoverDuration,
  reopen: worker.startAt + worker.walkDuration + worker.handoverDuration + worker.prepDuration,
});
function workerState(worker: WorkerChange, elapsed: number) {
  const times = workerTimes(worker);
  if (elapsed < worker.startAt) return "scheduled";
  if (elapsed < times.arrive) return "walking";
  if (elapsed < times.handover) return "handover";
  if (elapsed < times.reopen) return "prep";
  return "active";
}
function dynamicRates(elapsed: number): [number[], number[]] {
  const rates: [number[], number[]] = [[...RATE1], [...RATE2]];
  for (const worker of WORKER_CHANGES) if (elapsed >= workerTimes(worker).reopen) rates[worker.grid][worker.lane] = worker.rate;
  return rates;
}
function closedLanes(elapsed: number, grid: Grid) {
  return WORKER_CHANGES.filter((worker) => worker.grid === grid && ["handover", "prep"].includes(workerState(worker, elapsed))).map((worker) => worker.lane);
}
function effectiveEdges(base: [Edge[], Edge[]], faults: BeltFault[]): [Edge[], Edge[]] {
  const result: [Edge[], Edge[]] = [[...base[0]], [...base[1]]];
  for (const fault of faults) if (!fault.repaired) result[fault.grid] = applyBeltFault(result[fault.grid], fault.original, fault.kind, POST_COLS, POST_ROWS).edges;
  return result;
}
function purserAt(elapsed: number): Purser {
  const cycle = elapsed % 26, state: Purser["state"] = cycle >= 10.5 && cycle < 13.5 ? "break" : cycle >= 20 && cycle < 22.5 ? "chat" : "patrol";
  const travel = (elapsed * .78) % (CELL_COLS * 2), direction: -1 | 1 = travel <= CELL_COLS ? 1 : -1;
  return { x: direction === 1 ? travel : CELL_COLS * 2 - travel, direction, state };
}

function attemptRoute(grid: Grid, entries: number[], attempt: number, edges: [Edge[], Edge[]]) {
  const input = { postCols: POST_COLS, postRows: POST_ROWS, start: `${entries[attempt]}:${CELL_ROWS - 1}`, belts: edges[grid] };
  const route = findCorridorRoute(input);
  return route.length ? { route, success: true } : { route: getHighestCorridorRoute(input), success: false };
}

function makeAgent(id: number, edges: [Edge[], Edge[]]): Agent {
  const values = Array.from({ length: CELL_COLS }, (_, i) => i);
  const preferred = ENTRY_DEMAND[id % ENTRY_DEMAND.length];
  const entries1 = [preferred, ...shuffleWithSeed(values.filter((value) => value !== preferred), 117 + id * 31)];
  const entries2 = shuffleWithSeed(values, 701 + id * 47);
  const travel = id % 3;
  const one = (id * 2 + 1) % 3;
  const two = (id * 5 + 2) % 3;
  const first = attemptRoute(0, entries1, 0, edges);
  const immigrationEvent = selectServiceEvent(id, "immigration") as ServiceEvent;
  const securityEvent = selectServiceEvent(id, "security") as ServiceEvent;
  return {
    id, stage: "grid1", route: first.route, routeIndex: 0, progress: 0, success: first.success,
    returning: false, attempt: 0, entries1, entries2, exit: entries1[0],
    speed: [2.7, 3.35, 4.1][travel], time1: [2.1, 3.1, 4.4][one], time2: [1.8, 2.7, 3.8][two], remaining: 0,
    fill: ["#52d6b1", "#f4c95d", "#f1766b"][travel], border: ["#71b7ff", "#b59cff", "#ff8f70"][one], hatch: two + 1,
    waitTime: 0, patience: passengerPatience(id), queueSequence: null, walkFrom: 0, walkProgress: 0, walkDuration: 0, immigrationEvent, securityEvent, currentEvent: null,
  };
}

function move(agent: Agent, edges: [Edge[], Edge[]], closed: [number[], number[]]) {
  let retry = 0;
  const cleared = 0, failed = 0, turnedAway = 0, abandoned = 0;
  if (agent.stage === "service1" || agent.stage === "service2") {
    const grid: Grid = agent.stage === "service1" ? 0 : 1;
    if (closed[grid].includes(agent.exit)) return { agent, retry, cleared, failed, turnedAway, abandoned };
    const remaining = agent.remaining - DT;
    if (remaining > 0) return { agent: { ...agent, remaining }, retry, cleared, failed, turnedAway, abandoned };
    if (agent.stage === "service1" && agent.currentEvent?.outcome === "turnaway") return { agent: { ...agent, stage: "turnedAway" as Stage, remaining: 0 }, retry, cleared, failed, turnedAway: 1, abandoned };
    if (agent.stage === "service2") return { agent: { ...agent, stage: "done" as Stage, remaining: 0, currentEvent: null }, retry, cleared: 1, failed, turnedAway, abandoned };
    const preferred = Math.min(CELL_COLS - 1, agent.exit * 2 + (agent.id % 2));
    const entries2 = [preferred, ...agent.entries2.filter((entry) => entry !== preferred)];
    const next = attemptRoute(1, entries2, 0, edges);
    return { agent: { ...agent, stage: "grid2" as Stage, route: next.route, routeIndex: 0, progress: 0, success: next.success, returning: false, attempt: 0, entries2, remaining: 0, waitTime: 0, currentEvent: null }, retry, cleared, failed, turnedAway, abandoned };
  }
  if (agent.stage === "walk1" || agent.stage === "walk2") {
    const walkProgress = Math.min(agent.walkDuration, agent.walkProgress + DT);
    if (walkProgress < agent.walkDuration) return { agent: { ...agent, walkProgress }, retry, cleared, failed, turnedAway, abandoned };
    return { agent: { ...agent, stage: (agent.stage === "walk1" ? "queue1" : "queue2") as Stage, walkProgress, queueSequence: null, waitTime: 0 }, retry, cleared, failed, turnedAway, abandoned };
  }
  if (agent.stage === "queue1" || agent.stage === "queue2") {
    const waiting = { ...agent, waitTime: agent.waitTime + DT };
    if (shouldAbandon(waiting)) return { agent: { ...waiting, stage: "left" as Stage }, retry, cleared, failed, turnedAway, abandoned: 1 };
    return { agent: waiting, retry, cleared, failed, turnedAway, abandoned };
  }
  if (agent.stage !== "grid1" && agent.stage !== "grid2") return { agent, retry, cleared, failed, turnedAway, abandoned };
  // Faults can change topology while a passenger is already en route. Replan
  // from the CURRENT cell before crossing any newly blocked corridor edge.
  const grid: Grid = agent.stage === "grid1" ? 0 : 1;
  const currentCell = agent.route[agent.routeIndex];
  const nextCell = agent.route[agent.routeIndex + 1];
  if (nextCell && isCorridorStepBlocked(currentCell, nextCell, edges[grid], POST_COLS, POST_ROWS)) {
    const input = { postCols: POST_COLS, postRows: POST_ROWS, start: currentCell, belts: edges[grid] };
    const replacement = findCorridorRoute(input);
    return { agent: { ...agent, route: replacement.length ? replacement : getHighestCorridorRoute(input), routeIndex: 0, progress: 0, success: replacement.length > 0, returning: false }, retry, cleared, failed, turnedAway, abandoned };
  }
  const progress = agent.progress + agent.speed * DT;
  if (progress < 1) return { agent: { ...agent, progress }, retry, cleared, failed, turnedAway, abandoned };
  if (agent.routeIndex + 1 < agent.route.length) return { agent: { ...agent, routeIndex: agent.routeIndex + 1, progress: progress - 1 }, retry, cleared, failed, turnedAway, abandoned };
  if (agent.success) {
    const exit = serviceLaneForCell(parseNode(agent.route.at(-1) ?? "0:0").x, CELL_COLS, LANES);
    return { agent: { ...agent, stage: (agent.stage === "grid1" ? "choice1" : "choice2") as Stage, exit, progress: 0, waitTime: 0 }, retry, cleared, failed, turnedAway, abandoned };
  }
  if (!agent.returning) return { agent: { ...agent, route: [...agent.route].reverse(), routeIndex: 0, progress: 0, returning: true }, retry, cleared, failed, turnedAway, abandoned };
  const nextAttempt = agent.attempt + 1;
  const entries = agent.stage === "grid1" ? agent.entries1 : agent.entries2;
  retry = 1;
  if (nextAttempt >= entries.length) return { agent: { ...agent, stage: "failed" as Stage }, retry, cleared, failed: 1, turnedAway, abandoned };
  const next = attemptRoute(agent.stage === "grid1" ? 0 : 1, entries, nextAttempt, edges);
  return { agent: { ...agent, route: next.route, routeIndex: 0, progress: 0, success: next.success, returning: false, attempt: nextAttempt }, retry, cleared, failed, turnedAway, abandoned };
}

function allocate(agents: Agent[], phase: 1 | 2, rates: number[], closed: number[]) {
  const queue = phase === 1 ? "queue1" : "queue2";
  const service = phase === 1 ? "service1" : "service2";
  const busy = new Set(agents.filter((a) => a.stage === service).map((a) => a.exit));
  const next = [...agents];
  for (let lane = 0; lane < LANES; lane++) {
    if (busy.has(lane) || closed.includes(lane)) continue;
    const index = findNextQueuedAgentIndex(next, queue, lane);
    if (index < 0) continue;
    const event = phase === 1 ? next[index].immigrationEvent : next[index].securityEvent;
    const baseTime = phase === 1 ? next[index].time1 : next[index].time2;
    next[index] = { ...next[index], stage: service as Stage, remaining: serviceTimeWithEvent(baseTime, rates[lane], event), waitTime: 0, currentEvent: event };
  }
  return next;
}

function tick(state: Sim, edges: [Edge[], Edge[]], roundId = DEFAULT_ROUND): Sim {
  if (!state.running) return state;
  const elapsed = state.elapsed + DT;
  let spawned = state.spawned, nextSpawn = state.nextSpawn, agents = [...state.agents], events = [...state.events];
  let faults: BeltFault[] = state.faults.map((fault) => ({ ...fault })), repairs = state.repairs;
  const faultedWorkers = [...state.faultedWorkers];
  for (const worker of WORKER_CHANGES) {
    if (elapsed < workerTimes(worker).arrive || faultedWorkers.includes(worker.id)) continue;
    faultedWorkers.push(worker.id);
    if (!worker.faultKind) continue;
    const crossed = findWorkerCrossing(effectiveEdges(edges, faults)[worker.grid], Math.min(CELL_COLS - 1, worker.lane * 2 + 1));
    if (!crossed) continue;
    const result = applyBeltFault(effectiveEdges(edges, faults)[worker.grid], crossed, worker.faultKind, POST_COLS, POST_ROWS);
    faults.push({ id: `${worker.id}-${crossed.from}`, grid: worker.grid, kind: worker.faultKind as BeltFault["kind"], original: crossed, applied: result.applied, worker: worker.name, flagged: false, repaired: false });
    events.push({ id: `${elapsed}-${worker.id}-belt`, passengerId: worker.lane, phase: "ops", title: "La cinta cambió de posición", detail: `${worker.name} cruzó la zona. Inspecciona la conexión cercana y márcala para que el supervisor la repare.`, tone: "warn", time: elapsed });
  }
  const purser = purserAt(elapsed);
  faults = faults.map((fault) => {
    if (fault.repaired || !fault.flagged || purser.state !== "patrol") return fault;
    const a = parseNode(fault.original.from), b = parseNode(fault.original.to), target = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const seen = fieldOfViewContains({ origin: { x: purser.x, y: POST_ROWS - 1 }, heading: { x: purser.direction, y: -.18 }, target, range: 7.5, fovDegrees: 90 });
    if (!seen) return fault;
    repairs += 1;
    events.push({ id: `${elapsed}-${fault.id}-fixed`, passengerId: repairs, phase: "ops", title: "El supervisor reparó la cinta", detail: "El supervisor detectó la falla marcada dentro de su campo de visión y restauró la conexión prevista.", tone: "good", time: elapsed });
    return { ...fault, repaired: true };
  });
  const liveEdges = effectiveEdges(edges, faults), closed: [number[], number[]] = [closedLanes(elapsed, 0), closedLanes(elapsed, 1)], rates = dynamicRates(elapsed);
  for (const wave of getRound(roundId).waves) if (state.elapsed < wave.at + DT / 2 && elapsed >= wave.at) {
    events.push({ id: `${roundId}-${wave.at}-landing`, passengerId: 0, phase: "ops", title: wave.surprise, detail: `${wave.label}: ${wave.count} pasajeros. El acceso que abriste decidirá por dónde caminan.`, tone: "good", time: elapsed });
  }
  while (spawned < TARGET && elapsed >= nextSpawn) { agents.push(makeAgent(spawned, liveEdges)); spawned++; nextSpawn = arrivalAt(roundId, spawned) ?? Infinity; }
  let retries = state.retries, cleared = state.cleared, failed = state.failed, turnedAway = state.turnedAway, abandoned = state.abandoned;
  let queueSwitches = state.queueSwitches, queueStays = state.queueStays;
  let nextQueueSequence = state.nextQueueSequence;
  agents = agents.map((agent) => {
    const priorStage = agent.stage; const result = move(agent, liveEdges, closed);
    retries += result.retry; cleared += result.cleared; failed += result.failed; turnedAway += result.turnedAway; abandoned += result.abandoned;
    if (result.turnedAway) events.push({ id: `${elapsed}-${agent.id}-turned`, passengerId: agent.id, phase: "immigration", title: "Ingreso denegado", detail: agent.currentEvent?.detail ?? "No se pudo resolver un requisito obligatorio de ingreso.", tone: "alert", time: elapsed });
    if (result.abandoned) events.push({ id: `${elapsed}-${agent.id}-left`, passengerId: agent.id, phase: "queue", title: "Un pasajero abandonó la fila", detail: `Se agotó su paciencia después de ${Math.round(agent.waitTime)} segundos de espera en ${priorStage === "queue1" ? "migraciones" : "seguridad"}.`, tone: "alert", time: elapsed });
    if ((priorStage === "walk1" || priorStage === "walk2") && (result.agent.stage === "queue1" || result.agent.stage === "queue2")) {
      return { ...result.agent, queueSequence: nextQueueSequence++ };
    }
    return result.agent;
  });
  ([1, 2] as const).forEach((phase) => {
    const choice = phase === 1 ? "choice1" : "choice2", queue = phase === 1 ? "queue1" : "queue2", grid: Grid = phase === 1 ? 0 : 1;
    const waits = Array.from({ length: LANES }, (_, lane) => agents.filter((agent) => (agent.stage === queue || agent.stage === (phase === 1 ? "walk1" : "walk2")) && agent.exit === lane).length);
    agents = agents.map((agent) => {
      if (agent.stage !== choice) return agent;
      const origin = agent.exit, lane = chooseLocalQueue({ origin, waits, closed: closed[grid] as number[], passengerId: agent.id, phase });
      waits[lane] += 1;
      if (lane !== origin) {
        queueSwitches += 1;
        if (queueSwitches <= 4 || queueSwitches % 6 === 0) events.push({ id: `${elapsed}-${agent.id}-switch-${phase}`, passengerId: agent.id, phase: "queue", title: "Encontró una fila más corta", detail: `El pasajero ${String(agent.id + 1).padStart(2, "0")} exploró las filas cercanas hasta la primera más larga y eligió un módulo a ${Math.abs(lane - origin)} puesto${Math.abs(lane - origin) === 1 ? "" : "s"} de distancia.`, tone: "good", time: elapsed });
      } else queueStays += 1;
      if (lane !== origin) return { ...agent, stage: (phase === 1 ? "walk1" : "walk2") as Stage, exit: lane, walkFrom: origin, walkProgress: 0, walkDuration: queueWalkDuration(origin, lane), waitTime: 0, queueSequence: null };
      return { ...agent, stage: queue as Stage, exit: lane, waitTime: 0, queueSequence: nextQueueSequence++ };
    });
  });
  const beforeAllocation = new Map(agents.map((agent) => [agent.id, agent.stage]));
  agents = allocate(allocate(agents, 1, rates[0], closed[0]), 2, rates[1], closed[1]);
  for (const agent of agents) {
    if ((agent.stage === "service1" || agent.stage === "service2") && beforeAllocation.get(agent.id) !== agent.stage && agent.currentEvent) {
      events.push({ id: `${elapsed}-${agent.id}-${agent.stage}`, passengerId: agent.id, phase: agent.stage === "service1" ? "immigration" : "security", title: agent.currentEvent.title, detail: agent.currentEvent.detail, tone: agent.currentEvent.tone, time: elapsed });
    }
  }
  events = events.slice(-8);
  const done = spawned === TARGET && cleared + failed + turnedAway + abandoned === TARGET;
  return { agents, events, elapsed, spawned, cleared, failed, turnedAway, abandoned, retries, nextSpawn, nextQueueSequence, running: done ? false : state.running, queueSwitches, queueStays, repairs, faults, faultedWorkers };
}

function timeLabel(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

const BOARD_W = 920;
const BOARD_H = 1240;
function postPoint(grid: Grid, node: string) {
  const { x, y } = parseNode(node), bottom = grid === 0 ? 1160 : 570;
  return { x: 52 + x * 58 + (y - 5.5) * 1.8, y: bottom - (POST_ROWS - 1 - y) * 40 };
}
function cellPoint(grid: Grid, node: string) {
  const { x, y } = parseNode(node), a = postPoint(grid, `${x}:${y}`), b = postPoint(grid, `${x + 1}:${y + 1}`);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
const laneX = (lane: number) => 81 + lane * 116;

function Board({ edges, agents, selected, locked, elapsed, faults, onNode }: {
  edges: [Edge[], Edge[]]; agents: Agent[]; selected: { grid: Grid; node: string } | null; locked: boolean; elapsed: number; faults: BeltFault[]; onNode: (grid: Grid, node: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [cursor, setCursor] = useState<{ grid: Grid; node: string }>({ grid: 0, node: `0:${POST_ROWS - 1}` });
  const queueOrder = useMemo(() => {
    const result = new Map<number, number>(), counts = new Map<string, number>();
    const waiting = agents.filter((agent) => agent.stage === "queue1" || agent.stage === "queue2")
      .sort((a, b) => (a.queueSequence ?? Infinity) - (b.queueSequence ?? Infinity) || a.id - b.id);
    for (const agent of waiting) {
      if (agent.stage !== "queue1" && agent.stage !== "queue2") continue;
      const key = `${agent.stage}:${agent.exit}`;
      result.set(agent.id, counts.get(key) ?? 0);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return result;
  }, [agents]);

  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.width = BOARD_W * 2; canvas.height = BOARD_H * 2; ctx.scale(2, 2);
    const bg = ctx.createLinearGradient(0, 0, 0, BOARD_H);
    bg.addColorStop(0, "#151c22"); bg.addColorStop(1, "#0b1014");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    ctx.fillStyle = "rgba(255,255,255,.022)";
    for (let y = 0; y < BOARD_H; y += 28) ctx.fillRect(0, y, BOARD_W, 1);

    ([0, 1] as Grid[]).forEach((grid) => {
      const top = grid === 0 ? 700 : 110, bottom = grid === 0 ? 1194 : 604;
      ctx.save(); ctx.shadowColor = "#0009"; ctx.shadowBlur = 24; ctx.fillStyle = "#1d262d";
      ctx.beginPath(); ctx.moveTo(34, bottom); ctx.lineTo(892, bottom); ctx.lineTo(862, top); ctx.lineTo(60, top); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.strokeStyle = "#ffffff09"; ctx.setLineDash([2, 7]); ctx.lineWidth = 1;
      for (let row = 0; row < CELL_ROWS; row++) for (let col = 0; col < CELL_COLS; col++) {
        const p = cellPoint(grid, `${col}:${row}`);
        if (col < CELL_COLS - 1) { const q = cellPoint(grid, `${col + 1}:${row}`); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
        if (row < CELL_ROWS - 1) { const q = cellPoint(grid, `${col}:${row + 1}`); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
      }
      ctx.setLineDash([]);

      edges[grid].forEach((edge) => {
        const a = postPoint(grid, edge.from), b = postPoint(grid, edge.to);
        ctx.lineCap = "round"; ctx.strokeStyle = "#000b"; ctx.lineWidth = 12;
        ctx.beginPath(); ctx.moveTo(a.x + 2, a.y + 4); ctx.lineTo(b.x + 2, b.y + 4); ctx.stroke();
        ctx.strokeStyle = "#d9ff54"; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.fillStyle = "#f4c95d"; ctx.beginPath(); ctx.arc(a.x, a.y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#71b7ff"; ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
      });
      faults.filter((fault) => fault.grid === grid && !fault.repaired).forEach((fault) => {
        const a = postPoint(grid, fault.original.from), b = postPoint(grid, fault.original.to), x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
        ctx.save(); ctx.strokeStyle = fault.flagged ? "#71b7ff" : "#f4c95d"; ctx.lineWidth = fault.flagged ? 3 : 2; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(x, y, fault.flagged ? 12 : 9, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      });

      for (let row = 0; row < POST_ROWS; row++) for (let col = 0; col < POST_COLS; col++) {
        const id = `${col}:${row}`, p = postPoint(grid, id);
        const active = selected?.grid === grid && selected.node === id, focused = cursor.grid === grid && cursor.node === id;
        if (active || focused) {
          ctx.strokeStyle = active ? "#d9ff5488" : "#71b7ff66"; ctx.lineWidth = active ? 5 : 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, active ? 13 : 10, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = "#05080a"; ctx.beginPath(); ctx.arc(p.x + 2, p.y + 4, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = active ? "#d9ff54" : "#8b989f"; ctx.beginPath(); ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2); ctx.fill();
      }
    });

    const rates = dynamicRates(elapsed), closed: [number[], number[]] = [closedLanes(elapsed, 0), closedLanes(elapsed, 1)];
    const gate = (y: number, label: string, gateRates: number[], gateClosed: number[]) => {
      ctx.beginPath(); ctx.roundRect(58, y - 21, 804, 44, 12); ctx.fillStyle = "#10171c"; ctx.fill(); ctx.strokeStyle = "#ffffff17"; ctx.stroke();
      gateRates.forEach((rate, lane) => {
        const x = laneX(lane);
        ctx.fillStyle = gateClosed.includes(lane) ? "#4e5a61" : rate < .8 ? "#52d6b1" : rate > 1.2 ? "#f1766b" : "#f4c95d"; ctx.fillRect(x - 26, y - 3, 52, 6);
        ctx.fillStyle = gateClosed.includes(lane) ? "#f4c95d" : "#ffffffb8"; ctx.font = "600 11px monospace"; ctx.textAlign = "center"; ctx.fillText(gateClosed.includes(lane) ? "PREPARACIÓN" : `${rate.toFixed(2).replace(".", ",")}×`, x, y + 17);
      });
      ctx.fillStyle = "#d9ff54"; ctx.font = "700 12px monospace"; ctx.textAlign = "left"; ctx.fillText(label, 68, y - 29);
    };
    gate(650, "MIGRACIONES / CONTROL 01", rates[0], closed[0]); gate(60, "SEGURIDAD / CONTROL 02", rates[1], closed[1]);

    const agentPoint = (agent: Agent) => {
      if (agent.stage === "grid1" || agent.stage === "grid2") {
        const grid: Grid = agent.stage === "grid1" ? 0 : 1;
        const a = cellPoint(grid, agent.route[agent.routeIndex] ?? agent.route[0]), b = cellPoint(grid, agent.route[agent.routeIndex + 1] ?? agent.route[agent.routeIndex]);
        return { x: a.x + (b.x - a.x) * agent.progress, y: a.y + (b.y - a.y) * agent.progress };
      }
      if (agent.stage === "walk1" || agent.stage === "walk2") {
        const interpolatedLane = queueWalkLane(agent.walkFrom, agent.exit, agent.walkProgress, agent.walkDuration);
        return { x: laneX(0) + interpolatedLane * (laneX(1) - laneX(0)), y: agent.stage === "walk1" ? 691 : 101 };
      }
      const x = laneX(agent.exit);
      if (agent.stage === "choice1") return { x, y: 691 };
      if (agent.stage === "queue1") return { x, y: 678 + (queueOrder.get(agent.id) ?? 0) * 10 };
      if (agent.stage === "service1") return { x, y: 650 };
      if (agent.stage === "choice2") return { x, y: 101 };
      if (agent.stage === "queue2") return { x, y: 88 + (queueOrder.get(agent.id) ?? 0) * 10 };
      if (agent.stage === "service2") return { x, y: 60 };
      if (agent.stage === "done") return { x: 865, y: 18 + (agent.id % 4) * 8 };
      if (agent.stage === "turnedAway") return { x: 895, y: 635 + (agent.id % 5) * 8 };
      if (agent.stage === "left") return { x: 28, y: 1215 - (agent.id % 5) * 8 };
      return { x: 40, y: 1215 };
    };
    agents.forEach((agent) => {
      const p = agentPoint(agent);
      ctx.save(); ctx.shadowColor = "#000c"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 5; ctx.fillStyle = agent.fill; ctx.strokeStyle = agent.border; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = "#0a0e11b8"; ctx.lineWidth = 1.5;
      for (let h = 0; h < agent.hatch; h++) { const offset = (h - (agent.hatch - 1) / 2) * 4; ctx.beginPath(); ctx.moveTo(p.x - 5 + offset, p.y + 4); ctx.lineTo(p.x + 1 + offset, p.y - 4); ctx.stroke(); }
    });
    agents.filter((agent) => (agent.stage === "service1" || agent.stage === "service2") && agent.currentEvent?.tone !== "good").forEach((agent) => {
      const p = agentPoint(agent), below = p.y < 100, width = 108, height = 24;
      const x = Math.max(6, Math.min(BOARD_W - width - 6, p.x - width / 2)), y = below ? p.y + 18 : p.y - 39;
      ctx.save(); ctx.shadowColor = "#000b"; ctx.shadowBlur = 10; ctx.fillStyle = "#10171ef2"; ctx.strokeStyle = agent.currentEvent?.tone === "alert" ? "#f1766b" : "#f4c95d"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(x, y, width, height, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = agent.currentEvent?.tone === "alert" ? "#ff9a8f" : "#f7d979"; ctx.font = "750 10px monospace"; ctx.textAlign = "center"; ctx.fillText(agent.currentEvent?.short ?? "REVISAR", x + width / 2, y + 15); ctx.restore();
    });
    WORKER_CHANGES.forEach((worker) => {
      const state = workerState(worker, elapsed); if (state === "scheduled") return;
      const times = workerTimes(worker), progress = Math.min(1, Math.max(0, (elapsed - worker.startAt) / worker.walkDuration));
      const cellX = Math.min(CELL_COLS - 1, worker.lane * 2 + 1), start = cellPoint(worker.grid, `${cellX}:${CELL_ROWS - 1}`), end = { x: laneX(worker.lane), y: worker.grid === 0 ? 650 : 60 };
      const p = state === "walking" ? { x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress } : end;
      ctx.save(); ctx.shadowColor = "#000b"; ctx.shadowBlur = 8; ctx.fillStyle = state === "prep" ? "#f4c95d" : "#71b7ff"; ctx.strokeStyle = "#071015"; ctx.lineWidth = 2; ctx.fillRect(p.x - 7, p.y - 7, 14, 14); ctx.strokeRect(p.x - 7, p.y - 7, 14, 14); ctx.restore();
      if (state !== "active" || elapsed - times.reopen < 2.4) {
        const text = state === "walking" ? `${worker.name} EN CAMINO` : state === "handover" ? "MÓDULO CERRADO · RELEVO" : state === "prep" ? `${worker.name} PREPARANDO` : `${worker.name} · ${worker.hint}`;
        const width = 156, x = Math.max(4, Math.min(BOARD_W - width - 4, p.x - width / 2)), y = p.y < 95 ? p.y + 16 : p.y - 31;
        ctx.fillStyle = "#0d151bec"; ctx.strokeStyle = state === "prep" ? "#f4c95d" : "#71b7ff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x, y, width, 20, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#dce5df"; ctx.font = "700 9px monospace"; ctx.textAlign = "center"; ctx.fillText(text, x + width / 2, y + 13);
      }
    });
    const purser = purserAt(elapsed), purserX = 70 + purser.x * 56.5, purserY = 1205, angle = purser.direction === 1 ? -0.18 : Math.PI + 0.18;
    ctx.save(); ctx.fillStyle = "#71b7ff0f"; ctx.beginPath(); ctx.moveTo(purserX, purserY); ctx.arc(purserX, purserY, 125, angle - Math.PI / 4, angle + Math.PI / 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = purser.state === "patrol" ? "#d9ff54" : "#718088"; ctx.fillRect(purserX - 8, purserY - 8, 16, 16); ctx.fillStyle = "#ffffffc2"; ctx.font = "700 10px monospace"; ctx.textAlign = "center"; ctx.fillText(purser.state === "patrol" ? "SUPERVISOR EN RONDA" : purser.state === "break" ? "SUPERVISOR EN PAUSA" : "SUPERVISOR CONVERSANDO", purserX, purserY - 14); ctx.restore();
    ctx.fillStyle = "#ffffffc2"; ctx.font = "700 12px monospace"; ctx.textAlign = "left"; ctx.fillText("LLEGADAS · HORA PUNTA", 42, 1225);
    ctx.textAlign = "right"; ctx.fillText("ATENDIDOS →", 866, 18);
  }, [agents, cursor, edges, elapsed, faults, queueOrder, selected]);

  function choose(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!ref.current) return;
    const box = ref.current.getBoundingClientRect(), px = (event.clientX - box.left) / box.width * BOARD_W, py = (event.clientY - box.top) / box.height * BOARD_H;
    let best: { grid: Grid; node: string; distance: number } | null = null;
    for (const grid of [0, 1] as Grid[]) {
      for (let row = 0; row < POST_ROWS; row++) for (let col = 0; col < POST_COLS; col++) {
        const node = `${col}:${row}`, p = postPoint(grid, node), distance = Math.hypot(px - p.x, py - p.y);
        if (distance < 19 && (!best || distance < best.distance)) best = { grid, node, distance };
      }
    }
    if (best) { setCursor({ grid: best.grid, node: best.node }); onNode(best.grid, best.node); }
  }
  function navigate(event: React.KeyboardEvent<HTMLCanvasElement>) {
    const point = parseNode(cursor.node); let x = point.x, y = point.y, grid = cursor.grid;
    if (event.key === "PageUp") grid = 1;
    else if (event.key === "PageDown") grid = 0;
    else if (event.key === "ArrowLeft") x = Math.max(0, x - 1);
    else if (event.key === "ArrowRight") x = Math.min(POST_COLS - 1, x + 1);
    else if (event.key === "ArrowUp") y = Math.max(0, y - 1);
    else if (event.key === "ArrowDown") y = Math.min(POST_ROWS - 1, y + 1);
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onNode(grid, cursor.node); return; }
    else return;
    event.preventDefault(); setCursor({ grid, node: `${x}:${y}` });
  }
  return <canvas ref={ref} className={`game-canvas ${locked ? "inspection" : ""}`} onClick={choose} onKeyDown={navigate} tabIndex={0} role="application" aria-label={`Editor de postes y cintas. ${POST_COLS * POST_ROWS} postes por zona. ${locked ? "Turno bloqueado; selecciona los dos postes de una posible falla para marcarla." : "Usa las flechas para desplazarte, Enter para seleccionar y Av Pág o Re Pág para cambiar de zona."}`} />;
}

function safeRead(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeWrite(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Persistence is optional. */ }
}

export default function Home() {
  const [edges, setEdges] = useState<[Edge[], Edge[]]>([[...GUIDED[0]], [...GUIDED[1]]]);
  const [roundId, setRoundId] = useState(DEFAULT_ROUND);
  const [storageReady, setStorageReady] = useState(false);
  const [sim, setSim] = useState<Sim>(blank);
  const [selected, setSelected] = useState<{ grid: Grid; node: string } | null>(null);
  const [message, setMessage] = useState("Las cintas impiden el paso; los pasajeros caminan por las celdas libres del corredor.");
  const [pace, setPace] = useState<0.5 | 1 | 2>(1);
  const [bestScore, setBestScore] = useState(0);
  const [previousRun, setPreviousRun] = useState<{ score: number; fingerprint: string; roundId: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareFallback, setShareFallback] = useState<string | null>(null);
  const [challengeTarget, setChallengeTarget] = useState<{ score: number; fingerprint: string } | null>(null);
  const edgeRef = useRef(edges);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      const challenge = decodeLayout(query.get("layout") ?? "", POST_COLS, POST_ROWS);
      const challengeRound = parseChallengeRound(query.get("round"), query.get("rules"));
      if (challengeRound !== null) setRoundId(challengeRound);
      let restored: [Edge[], Edge[]] | null = challenge as [Edge[], Edge[]] | null;
      if (!restored) {
        try { restored = sanitizeLayoutGroups(JSON.parse(safeRead("gateflow-layout-v2") ?? "null"), POST_COLS, POST_ROWS) as [Edge[], Edge[]] | null; } catch { restored = null; }
      }
      if (restored) {
        setEdges(restored);
        if (challenge) {
          const targetScore = parseChallengeScore(query.get("beat"));
          if (targetScore !== null && challengeRound !== null) setChallengeTarget({ score: targetScore, fingerprint: layoutFingerprint(challenge) });
          setMessage(challengeRound === null ? "El reto usa una versión de reglas desconocida. Se cargó el diseño sin una puntuación comparable." : "Reto recibido: modifica las cintas para superar la puntuación original con las mismas llegadas.");
        }
      }
      const savedBest = Number(safeRead(challengeRound && challengeRound !== DEFAULT_ROUND ? `gateflow-best-${challengeRound}-waves-1` : "gateflow-best-v2") ?? 0);
      if (Number.isFinite(savedBest)) setBestScore(Math.max(0, Math.min(1000, savedBest)));
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    edgeRef.current = edges;
    if (storageReady) safeWrite("gateflow-layout-v2", JSON.stringify(edges));
  }, [edges, storageReady]);
  useEffect(() => {
    if (!sim.running) return;
    const timer = window.setInterval(() => setSim((state) => tick(state, edgeRef.current, roundId)), simulationInterval(pace, DT));
    return () => clearInterval(timer);
  }, [sim.running, pace, roundId]);

  const terminalStages: Stage[] = ["done", "failed", "turnedAway", "left"];
  const active = sim.agents.filter((agent) => !terminalStages.includes(agent.stage)).length;
  const queued = sim.agents.filter((agent) => agent.stage === "queue1" || agent.stage === "queue2").length;
  const resolved = sim.cleared + sim.failed + sim.turnedAway + sim.abandoned;
  const finished = sim.spawned === TARGET && resolved === TARGET;
  const layoutLocked = sim.elapsed > 0 && !finished;
  const unresolvedFaults = sim.faults.filter((fault) => !fault.repaired);
  const displayEdges = useMemo(() => effectiveEdges(edges, sim.faults), [edges, sim.faults]);
  const scoreLedger = scoreShiftBreakdown({ processed: sim.cleared, elapsed: sim.elapsed, retries: sim.retries, target: TARGET, turnedAway: sim.turnedAway, abandoned: sim.abandoned, complete: finished, smartSwitches: sim.queueSwitches, repairs: sim.repairs, faultsLeft: unresolvedFaults.length });
  const score = scoreLedger.total;
  const rank = rankShift(score);
  const medals = getShiftMedals({ processed: sim.cleared, abandoned: sim.abandoned, retries: sim.retries, elapsed: sim.elapsed, target: TARGET });
  const fingerprint = layoutFingerprint(edges);
  const roundDelta = finished && previousRun?.roundId === roundId ? describeRoundDelta(previousRun.score, score, previousRun.fingerprint === fingerprint) : null;
  const challengeModified = challengeTarget !== null && challengeTarget.fingerprint !== fingerprint;
  const challengeNotice = challengeTarget ? challengePrompt(challengeTarget.score, challengeModified, finished ? score : null) : null;
  const nextExperiment = finished ? nextRoundExperiment({ faultsLeft: unresolvedFaults.length, retries: sim.retries, abandoned: sim.abandoned, elapsed: sim.elapsed, queueSwitches: sim.queueSwitches, score }) : null;
  const flowMood = finished ? (score >= 850 ? "glow" : "settled") : queued <= 2 ? "calm" : queued <= 6 ? "steady" : "pressure";
  const flowLabel = finished ? (score >= 850 ? "FLUJO DOMINADO" : "TURNO FINALIZADO") : flowMood === "calm" ? "FLUJO TRANQUILO" : flowMood === "steady" ? "FLUJO ESTABLE" : "AUMENTA LA PRESIÓN";
  const isNewBest = finished && score > bestScore;
  const displayedBest = Math.max(bestScore, finished ? score : 0);
  const statusRank = finished ? `${rank.grade} · ${rank.title}` : sim.elapsed ? `PROVISIONAL · ${rank.grade}` : "LISTO · SIN CLASIFICAR";
  const flowPoints = scoreLedger.queueSwitchBonus + scoreLedger.repairBonus;
  const round = getRound(roundId);
  const nextWave = sim.spawned === 0 && sim.elapsed === 0 ? round.waves[0] ?? null : upcomingWave(roundId, sim.elapsed);
  const lastWave = sim.elapsed > 0 ? [...round.waves].reverse().find((wave) => wave.at <= sim.elapsed) : null;
  const nextWaveSeconds = nextWave ? Math.max(0, Math.ceil(nextWave.at - sim.elapsed)) : null;
  const ledgerItems = [
    ["Personas atendidas", scoreLedger.throughput],
    ["Tiempo de resolución", scoreLedger.pace],
    ["Sin abandonos", scoreLedger.calm],
    ["Sin reintentos de ruta", scoreLedger.wayfinding],
    ["Cambios de fila (máx. 45)", scoreLedger.queueSwitchBonus],
    ["Reparaciones", scoreLedger.repairBonus],
    ["Fallas sin reparar", scoreLedger.unresolvedFaultPenalty],
    ["Reintentos", scoreLedger.retryPenalty],
    ["Ingresos denegados", scoreLedger.turnawayPenalty],
    ["Abandonos", scoreLedger.abandonmentPenalty],
  ] as const;
  const visibleRotations = WORKER_CHANGES.filter((worker) => workerTimes(worker).reopen >= sim.elapsed - 2.5).sort((a, b) => a.startAt - b.startAt).slice(0, 4);
  useEffect(() => { if (isNewBest) safeWrite(roundId === DEFAULT_ROUND ? "gateflow-best-v2" : `gateflow-best-${roundId}-waves-1`, String(score)); }, [isNewBest, score, roundId]);

  function selectNode(grid: Grid, node: string) {
    if (layoutLocked) {
      if (!selected) { setSelected({ grid, node }); setMessage(`Inspección iniciada en el poste ${node} de ${grid ? "seguridad" : "migraciones"}. Selecciona el poste vecino.`); return; }
      if (selected.grid !== grid) { setSelected({ grid, node }); setMessage("Inspección trasladada a la otra zona."); return; }
      if (selected.node === node) { setSelected(null); setMessage("Inspección cancelada."); return; }
      const key = edgeKey(selected.node, node);
      const fault = sim.faults.find((item) => !item.repaired && item.grid === grid && (edgeKey(item.original.from, item.original.to) === key || (item.applied && edgeKey(item.applied.from, item.applied.to) === key)));
      if (fault) {
        setSim((state) => ({ ...state, faults: state.faults.map((item) => item.id === fault.id ? { ...item, flagged: true } : item) }));
        setMessage(fault.flagged ? "Esta falla ya está marcada. El supervisor la reparará cuando entre en su campo de visión." : "Falla marcada. El supervisor la reparará cuando entre en su campo de visión de 90°.");
      } else setMessage("No hay fallas del personal en esa conexión. El diseño puntuado no cambia.");
      setSelected(null); return;
    }
    if (!selected) { setSelected({ grid, node }); setMessage(`Poste ${node} de ${grid ? "seguridad" : "migraciones"} seleccionado.`); return; }
    if (selected.grid !== grid) { setSelected({ grid, node }); setMessage("Selección trasladada a la otra zona."); return; }
    if (selected.node === node) { setSelected(null); setMessage("Selección cancelada."); return; }
    const existing = edges[grid].findIndex((edge) => (edge.from === selected.node && edge.to === node) || (edge.from === node && edge.to === selected.node));
    if (existing >= 0) {
      setEdges((current) => { const next: [Edge[], Edge[]] = [[...current[0]], [...current[1]]]; next[grid] = next[grid].filter((_, index) => index !== existing); return next; });
      setSelected(null); setMessage("Cinta retráctil retirada. El corredor quedó libre."); return;
    }
    try {
      const updated = addConnection(edges[grid], selected.node, node, POST_COLS, POST_ROWS);
      setEdges((current) => { const next: [Edge[], Edge[]] = [[...current[0]], [...current[1]]]; next[grid] = updated; return next; });
      const fromPost = parseNode(selected.node), toPost = parseNode(node);
      const blocksInterior = fromPost.y === toPost.y ? fromPost.y > 0 && fromPost.y < POST_ROWS - 1 : fromPost.x > 0 && fromPost.x < POST_COLS - 1;
      setSelected(null); setMessage(blocksInterior
        ? `Cinta conectada entre ${selected.node} y ${node}. Bloquea el cruce interior y los pasajeros deben rodearla.`
        : `Cinta de borde conectada entre ${selected.node} y ${node}. No bloquea cruces dentro del corredor.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se permite colocar esa cinta.");
      setSelected({ grid, node });
    }
  }
  function commitBest() {
    if (finished && score > bestScore) { setBestScore(score); safeWrite(roundId === DEFAULT_ROUND ? "gateflow-best-v2" : `gateflow-best-${roundId}-waves-1`, String(score)); }
  }
  function captureFinishedRun() {
    commitBest();
    if (finished) setPreviousRun({ score, fingerprint, roundId });
  }
  function run() {
    setSelected(null); setCopied(false); setShareFallback(null);
    if (finished) { captureFinishedRun(); setSim(blank()); setMessage("Ajusta una cinta y vuelve a simular la misma hora punta."); return; }
    setSim((state) => ({ ...state, running: !state.running }));
    setMessage(sim.running ? "Turno en pausa. El diseño sigue bloqueado para que la puntuación sea comparable." : sim.elapsed ? "Turno reanudado. El diseño sigue bloqueado." : "Turno iniciado. Los pasajeros pasan por los espacios libres, no por las cintas.");
  }
  function reset() {
    captureFinishedRun(); setSim(blank()); setSelected(null); setCopied(false); setShareFallback(null);
    setMessage("Turno reiniciado. Tu diseño de cintas se conserva y se desbloquea.");
  }
  function preset(mode: "guided" | "serpentine" | "clear") {
    if (layoutLocked) return;
    captureFinishedRun(); setSim(blank()); setChallengeTarget(null);
    setEdges(mode === "guided" ? [[...GUIDED[0]], [...GUIDED[1]]] : mode === "serpentine" ? [[...SERPENTINE[0]], [...SERPENTINE[1]]] : [[], []]);
    setSelected(null); setCopied(false); setShareFallback(null);
    setMessage(`Diseño «${mode === "clear" ? "Espacio libre" : mode === "serpentine" ? "Serpentina" : "División guiada"}» cargado. Las cintas son obstáculos; los corredores punteados son transitables.`);
  }
  function selectRound(nextId: string) {
    if (layoutLocked || nextId === roundId) return;
    commitBest(); setSim(blank()); setRoundId(nextId); setChallengeTarget(null); setPreviousRun(null);
    const savedBest = Number(safeRead(nextId === DEFAULT_ROUND ? "gateflow-best-v2" : `gateflow-best-${nextId}-waves-1`) ?? 0);
    setBestScore(Number.isFinite(savedBest) ? Math.max(0, Math.min(1000, savedBest)) : 0);
    setSelected(null); setCopied(false); setShareFallback(null);
    setMessage(`Misión «${getRound(nextId).title}» lista. Mira el horario y prepara las cintas antes de empezar.`);
  }
  async function copyScorecard() {
    const url = createChallengeUrl(window.location.href, encodeLayout(edges, POST_COLS, POST_ROWS), score, roundId);
    const card = createShareCard({ score, rank, processed: sim.cleared, target: TARGET, elapsed: sim.elapsed, abandoned: sim.abandoned, retries: sim.retries, fingerprint, url });
    let didCopy = false;
    try { await navigator.clipboard.writeText(card); didCopy = true; } catch {
      const field = document.createElement("textarea");
      field.value = card; field.setAttribute("readonly", ""); field.style.cssText = "position:fixed;left:-9999px;opacity:0";
      document.body.appendChild(field); field.select(); didCopy = document.execCommand("copy"); field.remove();
    }
    if (didCopy) { setCopied(true); setShareFallback(null); setMessage("Desafío copiado con el diseño exacto de cintas para reproducirlo."); }
    else { setShareFallback(card); setMessage("No se pudo acceder al portapapeles. Selecciona el desafío de abajo para copiarlo manualmente."); }
  }

  async function shareScorecard() {
    const link = createChallengeUrl(window.location.href, encodeLayout(edges, POST_COLS, POST_ROWS), score, roundId);
    const payload = createNativeShareData({ score, processed: sim.cleared, target: TARGET, url: link });
    if (typeof navigator.share !== "function") { await copyScorecard(); return; }
    try {
      await navigator.share(payload);
      setMessage("Compartiste un desafío que tus amigos pueden mejorar cambiando las cintas.");
    } catch (error) {
      // Cancel is an intentional user decision; never copy or contact anyone after cancellation.
      if (error instanceof Error && error.name === "AbortError") {
        setMessage("No se compartió el desafío. Puedes copiarlo cuando quieras.");
        return;
      }
      await copyScorecard();
    }
  }

  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span>GF</span><div><p>SIMULADOR AEROPORTUARIO / TURNO 04</p><h1>Gateflow</h1></div></div>
      <div className="top-actions"><i className={sim.running ? "live" : ""}>{sim.running ? "● Turno en curso" : finished ? "● Turno terminado" : sim.elapsed ? "● Turno en pausa" : "● Modo edición"}</i><button onClick={reset}>Reiniciar turno</button></div>
    </header>
    <section className="hero">
      <div><p>JUEGO DE DISEÑO DE FILAS</p><h2>Guía a la multitud.<br />Deja libre el paso.</h2></div>
      <p>Conecta postes con cintas retráctiles para organizar dos filas del aeropuerto. Los pasajeros usan A* para avanzar por los <strong>espacios libres</strong> y luego pasan por entrevistas migratorias, nuevas revisiones de equipaje y controles de seguridad. Su paciencia tiene un límite.</p>
    </section>
    <section className="metrics" aria-label="Indicadores del turno">
      <article><span>Tiempo</span><strong>{timeLabel(sim.elapsed)}</strong><small>meta ≤ 00:55</small></article>
      <article><span>Atendidos</span><strong>{sim.cleared}<em>/{TARGET}</em></strong><small>{active} en el sistema</small></article>
      <article><span>En fila</span><strong>{queued}</strong><small>{sim.queueSwitches} cambios de fila</small></article>
      <article className="score"><span>Puntuación</span><strong>{sim.elapsed ? score : "—"}</strong><small>{displayedBest ? `récord ${displayedBest}` : "/ 1000 puntos"}</small></article>
    </section>
    <div className="game-layout">
      <section className="board-card">
        <div className="toolbar">
          <div><p className="label">PLANO EN VIVO · {fingerprint}</p><p aria-live="polite">{finished ? "Turno terminado. Revisa el resumen y ajusta una cinta o carga otro diseño." : message}</p></div>
          <div className="toolbar-controls">
            <div className="round-picker" role="group" aria-label="Misiones de llegada">{ROUNDS.map((option) => <button key={option.id} disabled={layoutLocked} aria-pressed={roundId === option.id} onClick={() => selectRound(option.id)}>{option.title}</button>)}</div>
            <div className="pace" role="group" aria-label="Velocidad de simulación"><button aria-pressed={pace === 0.5} onClick={() => setPace(0.5)}>½ Lento</button><button aria-pressed={pace === 1} onClick={() => setPace(1)}>1× Normal</button><button aria-pressed={pace === 2} onClick={() => setPace(2)}>2× Rápido</button></div>
            <div className="presets" role="group" aria-label="Diseños predeterminados"><button disabled={layoutLocked} onClick={() => preset("guided")}>División guiada</button><button disabled={layoutLocked} onClick={() => preset("serpentine")}>Serpentina</button><button disabled={layoutLocked} onClick={() => preset("clear")}>Espacio libre</button></div>
          </div>
        </div>
        <div className="scenario-banner"><span>{round.badge}</span><b>{round.title} · {POST_COLS * POST_ROWS} postes por zona</b><small>{round.story} {round.decision}</small><strong className="flow-xp" title="Puntos acreditados: cambios de fila con tope de 45, más 40 por reparación. Las fallas sin reparar restan 35 aparte.">FLUJO +{flowPoints}</strong></div>
        {round.waves.length > 0 && <div className="flight-board" role="status" aria-live="off"><strong>✈ TABLERO DE LLEGADAS</strong><span>{nextWave ? `${nextWave.label} · ${nextWave.count} viajeros en ${nextWaveSeconds} s` : `Todos los vuelos aterrizaron · ${sim.spawned}/${TARGET} viajeros en sala`}</span><small>{lastWave ? lastWave.surprise : round.payoff}</small><div className="flight-timeline" aria-label="Horarios de vuelos">{round.waves.map((wave) => <span key={wave.at} className={sim.elapsed >= wave.at ? "landed" : "upcoming"}>{timeLabel(wave.at)} · {wave.count}</span>)}</div></div>}
        {challengeNotice && <p className="challenge-ribbon" role="status"><b>RETO ENTRE AMIGOS</b><span>{challengeNotice}</span></p>}
        <p className="mobile-map-hint">Desliza el plano hacia los lados para ver todos los postes. También puedes usar las flechas y Enter con el teclado.</p>
        <div className={`canvas-wrap ${finished ? "complete" : ""}`}>
          <Board edges={displayEdges} agents={sim.agents} selected={selected} locked={layoutLocked} elapsed={sim.elapsed} faults={sim.faults} onNode={selectNode} />
          <span className="zone upper">ZONA B · SEGURIDAD</span><span className="zone lower">ZONA A · MIGRACIONES</span>
          <span className={`flow-indicator ${flowMood}`} aria-live="polite"><i />{flowLabel}</span>
          {finished && <section className="debrief" aria-label="Resumen del turno">
            <div className="grade">{rank.grade}</div>
            <div className="debrief-copy"><p className="label">RESUMEN DE {round.title.toUpperCase()} · {fingerprint}</p><h3>{rank.title}</h3><p><strong>{score}</strong> puntos · {sim.cleared}/{TARGET} atendidos en {timeLabel(sim.elapsed)}</p>{isNewBest && <span className="new-best">NUEVO RÉCORD DE ESTA MISIÓN</span>}{roundDelta && <p className={`round-delta ${roundDelta.tone}`} role="status">{roundDelta.text}</p>}</div>
            <div className="medals">{medals.map((medal) => <div className={medal.earned ? "earned" : ""} key={medal.id}><i>{medal.earned ? "◆" : "◇"}</i><span><b>{medal.title}</b><small>{medal.detail}</small></span></div>)}</div>
            <details className="score-ledger"><summary>Ver cálculo de la puntuación</summary><dl>{ledgerItems.map(([label, points]) => <div key={label}><dt>{label}</dt><dd>{points > 0 ? "+" : ""}{points.toLocaleString("es-PE", { maximumFractionDigits: 1 })}</dd></div>)}</dl><p>Total tras redondear y limitar entre 0 y 1000: <strong>{score}</strong> puntos. Reparar una falla suma 40 y evita una penalización de 35.</p></details>
            {nextExperiment && <p className="next-experiment"><strong>PRÓXIMA JUGADA</strong> {round.waves.length ? `${round.payoff} ${nextExperiment}` : nextExperiment}</p>}
            <div className="debrief-actions"><button onClick={shareScorecard}>Compartir reto</button><button onClick={copyScorecard}>{copied ? "✓ Desafío copiado" : "Copiar desafío"}</button><button className="tune" onClick={run}>Ajustar una cinta</button></div>
            {shareFallback && <textarea className="share-fallback" aria-label="Desafío para compartir" readOnly value={shareFallback} onFocus={(event) => event.currentTarget.select()} />}
          </section>}
        </div>
        <div className="board-footer">
          <div className="legend"><i className="travel" /><small>relleno = tránsito</small><i className="immigration" /><small>borde = migraciones</small><i className="security">≋</i><small>marcas = seguridad</small><i className="belt" /><small>cinta = cruce bloqueado</small></div>
          <button className="run" onClick={run}>{sim.running ? "Ⅱ  Pausar turno" : finished ? "↺  Ajustar diseño" : sim.elapsed ? "▶  Reanudar turno" : "▶  Iniciar turno"}</button>
        </div>
      </section>
      <aside>
        <section className="objective">
          <div className="objective-head"><p className="label">OBJETIVO DEL TURNO</p><span>{statusRank}</span></div>
          <strong>{Math.max(0, TARGET - resolved)}</strong><p>pasajeros pendientes de atención</p>
          <div className="progress"><span style={{ width: `${resolved / TARGET * 100}%` }} /></div>
          <div className="outcomes"><span><b>{sim.cleared}</b> atendidos</span><span><b>{sim.turnedAway}</b> rechazados</span><span><b>{sim.abandoned}</b> se retiraron</span><span><b>{sim.failed}</b> varados</span></div>
          <div className="ops-counters"><span><b>{sim.queueSwitches}</b> cambios de fila</span><span><b>{sim.repairs}</b> cintas reparadas</span></div>
          <div className="micro-goals"><span className={sim.cleared >= 24 ? "met" : ""}>24 atendidos</span><span className={finished && sim.abandoned === 0 ? "met" : ""}>sin abandonos</span><span className={finished && sim.retries === 0 ? "met" : ""}>sin reintentos</span><span className={finished && sim.elapsed <= 55 ? "met" : ""}>≤ 00:55</span></div>
        </section>
        <section className="incident-feed" aria-live="polite">
          <header><p className="label">REGISTRO EN VIVO</p><span>{sim.events.length ? "ÚLTIMOS 3" : "EN ESPERA"}</span></header>
          {sim.events.length ? <ol>{sim.events.slice(-3).reverse().map((event) => <li className={event.tone} key={event.id}><i>{event.phase === "immigration" ? "MIG" : event.phase === "security" ? "SEG" : event.phase === "ops" ? "OPE" : "FIL"} {String(event.passengerId + 1).padStart(2, "0")}</i><div><strong>{event.title}</strong><span>{event.detail}</span></div></li>)}</ol> : <p>Inicia el turno para observar decisiones de fila, relevos del personal y las causas de cada demora.</p>}
        </section>
        <section className="rotation-board">
          <header><p className="label">RELEVOS DEL PERSONAL</p><span>{unresolvedFaults.length ? `${unresolvedFaults.length} ${unresolvedFaults.length === 1 ? "FALLA" : "FALLAS"}` : "RELEVOS"}</span></header>
          {visibleRotations.length ? <ol>{visibleRotations.map((worker) => { const state = workerState(worker, sim.elapsed); return <li key={worker.id} className={state}><b>{worker.grid ? "SEG" : "MIG"} {worker.lane + 1}</b><div><strong>{worker.name}</strong><span>{state === "scheduled" ? `en ${Math.max(0, Math.ceil(worker.startAt - sim.elapsed))} s` : state === "walking" ? "cruzando la sala" : state === "handover" ? "módulo cerrado · relevo" : state === "prep" ? "módulo cerrado · preparación" : worker.hint}</span></div><i>{worker.hint}</i></li>; })}</ol> : <p className="rotation-complete">Terminaron los relevos. La velocidad de atención sigue visible en el plano.</p>}
          <p className="purser-status"><b>Supervisor:</b> {purserAt(sim.elapsed).state === "patrol" ? "recorre la sala con un campo de visión de 90°" : purserAt(sim.elapsed).state === "break" ? "está tomando una pausa breve" : "está distraído conversando"}. Selecciona los dos postes de una cinta modificada para marcar la falla.</p>
        </section>
        <section className="rules">
          <header><p className="label">CÓMO FUNCIONA EL FLUJO</p><span>A* / FIFO / SEMILLA FIJA</span></header>
          <ol><li><b>01</b><div><strong>Camina por los espacios libres</strong><span>Los postes sujetan las cintas; las celdas punteadas del corredor permiten pasar.</span></div></li><li><b>02</b><div><strong>Busca una fila cercana</strong><span>Los pasajeros comparan filas vecinas hasta encontrar una peor. Algunos no se cambian.</span></div></li><li><b>03</b><div><strong>Observa los relevos</strong><span>Los cuadros que llegan cierran los módulos durante el relevo y la preparación; luego cambia la velocidad de atención.</span></div></li><li><b>04</b><div><strong>Marca las fallas de las cintas</strong><span>Selecciona los dos postes de una cinta modificada para que el supervisor la repare durante su ronda.</span></div></li></ol>
        </section>
        <section className="contract"><p className="label">REGLAS DE LOS POSTES</p><p>Modo edición: conecta postes vecinos en horizontal o vertical. Cada poste puede iniciar una cinta y recibir otra. En el turno, el diseño se bloquea, pero puedes seleccionar dos postes para marcar una falla causada por el personal. Teclado: flechas y Enter; Re Pág/Av Pág cambia de zona.</p><div aria-hidden="true"><span>↑</span><span>←</span><i>●</i><span>→</span><span>↓</span></div></section>
        <section className="insight"><p className="label">CONSEJO OPERATIVO</p><p>{unresolvedFaults.some((fault) => !fault.flagged) ? "Una cinta cambió cuando pasó un trabajador. Revisa la conexión cercana y marca los dos postes." : unresolvedFaults.length ? "Falla marcada. Espera a que el campo de visión del supervisor pase por ella." : sim.repairs ? "Reparación confirmada. La intervención sumó puntos al contador de FLUJO." : sim.abandoned ? "Un pasajero se retiró. Desvía a quienes llegan antes de que alcancen un módulo lento." : queued > 6 ? "Las filas están creciendo. Deja un paso libre hacia los módulos con indicadores verdes." : sim.retries > 3 ? "Un muro de cintas bloqueó el corredor. Abre uno de los cruces." : sim.turnedAway ? "Los rechazos son deterministas. Protege la puntuación manteniendo un flujo rápido y ordenado." : "En hora punta se llenan primero los módulos más lentos. Una cinta corta puede mejorar el paso sin crear un laberinto."}</p></section>
      </aside>
    </div>
    <footer><span>Simulación determinista · la misma hora punta, los mismos incidentes y la misma paciencia en cada partida</span><span>Desafíos con diseño exacto · sin rachas, cajas de recompensa ni temporizadores de presión</span></footer>
  </main>;
}
