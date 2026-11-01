// A deliberately small *surrogate* of Gateflow's two-stage desk queues. It uses
// the real local-minimum, seeded-event and patience helpers, but NOT corridor
// geometry, moving sprites, purser repairs, React orchestration or scoring.
// Its only purpose is to reject obviously unbalanced future-round candidates
// before implementing them in the authoritative game engine.
import { chooseLocalQueue, passengerPatience, seededRandom, selectServiceEvent, serviceTimeWithEvent } from "./simulation.js";

const STEP = 0.1;
const BASE_RATES = [[1.35, 0.76, 1.08, 0.88, 1.24, 0.72, 1.16], [1.12, 0.82, 1.28, 0.74, 1.06, 0.88, 1.2]];
const BASE = Object.freeze({
  passengers: 28, lanes: 7, activeLanes: 7, arrivalStyle: "steady",
  shiftStyle: "cascade", shiftDuration: 3.5, outages: 0,
  serviceTailRate: 0, tailMultiplier: 1.8, serviceSpread: 0.12,
  patienceScale: 1, infoLag: 0, transferLag: 2,
  expressLane: false, rescreenRate: 0,
});

// Each pair changes exactly one design parameter. The values are hypotheses,
// not tuned production settings or results of human A/B testing.
export const ROUND_AB_PAIRS = Object.freeze([
  { id: "AB01", name: "Llegadas por vuelo", knob: "arrivalStyle", a: "steady", b: "banked", playerDecision: "Abrir un segundo acceso antes de que llegue cada vuelo" },
  { id: "AB02", name: "Doble hora punta", knob: "arrivalStyle", a: "steady", b: "double-bank", playerDecision: "Reservar capacidad para la segunda oleada" },
  { id: "AB03", name: "Relevos simultáneos", knob: "shiftStyle", a: "cascade", b: "synchronized", playerDecision: "Evitar un cierre en cadena de mostradores" },
  { id: "AB04", name: "Módulos averiados", knob: "outages", a: 0, b: 2, playerDecision: "Desviar filas alrededor de dos módulos temporalmente cerrados" },
  { id: "AB05", name: "Inspecciones largas", knob: "serviceTailRate", a: 0, b: 0.28, playerDecision: "Dejar rutas alternativas para los casos demorados" },
  { id: "AB06", name: "Menos paciencia", shared: { activeLanes: 4 }, knob: "patienceScale", a: 1, b: 0.65, playerDecision: "Reducir esperas antes de que la gente abandone" },
  { id: "AB07", name: "Personal desigual", knob: "serviceSpread", a: 0.12, b: 0.55, playerDecision: "Reequilibrar según velocidad real de los mostradores" },
  { id: "AB08", name: "Información atrasada", knob: "infoLag", a: 0, b: 5, playerDecision: "Detectar que el cartel no coincide con las filas reales" },
  { id: "AB09", name: "Capacidad restringida", knob: "activeLanes", a: 7, b: 4, playerDecision: "Distribuir el flujo con menos módulos abiertos" },
  { id: "AB10", name: "Conexión rápida", knob: "transferLag", a: 2, b: 0.3, playerDecision: "Evitar que el éxito en migraciones sature seguridad" },
  { id: "AB11", name: "Carril exprés", shared: { activeLanes: 3 }, knob: "expressLane", a: false, b: true, playerDecision: "Separar casos rápidos sin bloquear el acceso regular" },
  { id: "AB12", name: "Revisión de equipaje", knob: "rescreenRate", a: 0, b: 0.3, playerDecision: "Dejar capacidad para una segunda revisión" },
]);

// Two-factor stress tests: 00 = neither complication, 10/01 = each alone,
// 11 = both. Interactions measure non-additive operational consequences.
export const ROUND_INTERACTIONS = Object.freeze([
  { id: "IX01", name: "Dos vuelos + relevo conjunto", left: { arrivalStyle: "double-bank" }, right: { shiftStyle: "synchronized" } },
  { id: "IX02", name: "Dos vuelos + dos averías", left: { arrivalStyle: "double-bank" }, right: { outages: 2 } },
  { id: "IX03", name: "Pocos puestos + inspección larga", left: { activeLanes: 4 }, right: { serviceTailRate: .28 } },
  { id: "IX04", name: "Pocos puestos + baja paciencia", left: { activeLanes: 4 }, right: { patienceScale: .65 } },
  { id: "IX05", name: "Cartel atrasado + averías", left: { infoLag: 5 }, right: { outages: 2 } },
  { id: "IX06", name: "Trasbordo veloz + revisión", left: { transferLag: .3 }, right: { rescreenRate: .3 } },
  { id: "IX07", name: "Ritmos dispares + relevo conjunto", left: { serviceSpread: .55 }, right: { shiftStyle: "synchronized" } },
  { id: "IX08", name: "Dos vuelos + menos puestos", left: { arrivalStyle: "double-bank" }, right: { activeLanes: 4 } },
]);

export function validateRoundConfig(overrides = {}) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) throw new Error("Configuración inválida");
  if (Object.keys(overrides).some((key) => !(key in BASE))) throw new Error("Parámetro desconocido");
  const c = { ...BASE, ...overrides };
  const int = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
  const range = (n, lo, hi) => Number.isFinite(n) && n >= lo && n <= hi;
  if (!int(c.passengers, 1, 120) || !int(c.lanes, 2, 7) || !int(c.activeLanes, 1, c.lanes) ||
      !["steady", "banked", "double-bank"].includes(c.arrivalStyle) ||
      !["none", "cascade", "synchronized"].includes(c.shiftStyle) ||
      !int(c.outages, 0, c.activeLanes - 1) || !range(c.shiftDuration, 0, 20) ||
      !range(c.serviceTailRate, 0, 1) || !range(c.tailMultiplier, 1, 5) ||
      !range(c.serviceSpread, 0, 0.9) || !range(c.patienceScale, 0.25, 4) ||
      !range(c.infoLag, 0, 15) || !range(c.transferLag, 0, 20) ||
      !range(c.rescreenRate, 0, 1) || typeof c.expressLane !== "boolean") {
    throw new Error("Parámetros fuera de rango");
  }
  return c;
}

function arrivalTime(id, count, style) {
  if (style === "steady") return id * 0.72;
  if (style === "banked") return Math.floor(id / 7) * 8 + (id % 7) * 0.08;
  return Math.floor(id / Math.ceil(count / 2)) * 12 + (id % Math.ceil(count / 2)) * 0.08;
}

function isClosed(phase, lane, now, c) {
  if (lane >= c.activeLanes) return true;
  if (lane < c.outages && now >= 14 && now < 14 + 10) return true;
  if (c.shiftStyle === "none") return false;
  const start = (phase === 0 ? 14 : 22) + (c.shiftStyle === "cascade" ? lane * 3.2 : 0);
  return now >= start && now < start + c.shiftDuration;
}

function round(n) { return Math.round(n * 1e6) / 1e6; }
function mean(values) { return values.reduce((sum, v) => sum + v, 0) / values.length; }
function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

export function runQueueSurrogate(overrides = {}, seed = 1) {
  const c = validateRoundConfig(overrides);
  if (!Number.isSafeInteger(seed)) throw new Error("La semilla debe ser entera");
  const random = seededRandom(seed);
  const agents = Array.from({ length: c.passengers }, (_, id) => ({
    id, stage: "not-arrived", readyAt: arrivalTime(id, c.passengers, c.arrivalStyle),
    lane: -1, queuedAt: 0, wait: 0, patience: passengerPatience(id) * c.patienceScale,
    remaining: 0, phase: 0,
  }));
  const queues = Array.from({ length: 2 }, () => Array.from({ length: c.lanes }, () => []));
  const active = Array.from({ length: 2 }, () => Array(c.lanes).fill(null));
  const snapshots = [];
  const waits = [], terminal = new Set();
  let cleared = 0, turnedAway = 0, abandoned = 0, switches = 0, maxQueue = 0, elapsed = 0;

  const join = (agent, phase, now, closed, history) => {
    const queueLengths = queues[phase].map((queue) => queue.length);
    const observed = history ?? queueLengths;
    const closedLanes = closed.map((value, lane) => value ? lane : -1).filter((lane) => lane >= 0);
    if (c.expressLane && phase === 1 && agent.id % 4 !== 0) closedLanes.push(0);
    const available = closedLanes.length < c.lanes;
    if (!available) return false;
    let origin = agent.id % c.activeLanes;
    if (c.expressLane && phase === 1 && agent.id % 4 !== 0 && origin === 0) origin = 1;
    const lane = chooseLocalQueue({ origin, waits: observed, closed: closedLanes, passengerId: agent.id, phase: phase + 1 });
    if (closedLanes.includes(lane)) return false;
    if (lane !== origin) switches += 1;
    agent.stage = `queue${phase}`;
    agent.phase = phase; agent.lane = lane; agent.queuedAt = now;
    queues[phase][lane].push(agent.id);
    return true;
  };

  for (let step = 0; step <= 2400; step += 1) {
    const now = round(step * STEP);
    const closed = Array.from({ length: 2 }, (_, phase) => Array.from({ length: c.lanes }, (_, lane) => isClosed(phase, lane, now, c)));
    const past = snapshots[Math.max(0, step - Math.round(c.infoLag / STEP))];
    for (const agent of agents) {
      if (agent.stage === "not-arrived" && now >= agent.readyAt) {
        join(agent, 0, now, closed[0], past?.[0]);
      } else if (agent.stage === "transfer" && now >= agent.readyAt) {
        join(agent, 1, now, closed[1], past?.[1]);
      }
    }
    for (let phase = 0; phase < 2; phase += 1) for (let lane = 0; lane < c.lanes; lane += 1) {
      const queue = queues[phase][lane];
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        const agent = agents[queue[index]];
        if (now - agent.queuedAt >= agent.patience) {
          queue.splice(index, 1); agent.stage = "abandoned";
          terminal.add(agent.id); abandoned += 1;
        }
      }
      const currentId = active[phase][lane];
      if (currentId !== null && !closed[phase][lane]) {
        const agent = agents[currentId];
        agent.remaining -= STEP;
        if (agent.remaining <= 1e-8) {
          active[phase][lane] = null;
          if (phase === 0 && selectServiceEvent(agent.id, "immigration").outcome === "turnaway") {
            agent.stage = "turned-away"; turnedAway += 1; terminal.add(agent.id);
          } else if (phase === 1) {
            agent.stage = "cleared"; cleared += 1; terminal.add(agent.id);
          } else {
            agent.stage = "transfer"; agent.readyAt = now + c.transferLag;
          }
        }
      }
      if (active[phase][lane] === null && !closed[phase][lane] && queue.length) {
        const id = queue.shift(), agent = agents[id];
        agent.stage = `service${phase}`;
        agent.wait = round(now - agent.queuedAt); waits.push(agent.wait);
        const event = selectServiceEvent(id, phase === 0 ? "immigration" : "security");
        const base = phase === 0 ? [2.1, 3.1, 4.4][(id * 2 + 1) % 3] : [1.8, 2.7, 3.8][(id * 5 + 2) % 3];
        // The express mechanic includes a dedicated *faster* security service;
        // restricting ordinary users alone would not model an express desk.
        const expressRate = c.expressLane && phase === 1 && lane === 0 ? 0.55 : 1;
        const rate = BASE_RATES[phase][lane] * expressRate * (1 + (random() - .5) * 2 * c.serviceSpread);
        const extra = random() < c.serviceTailRate ? c.tailMultiplier : 1;
        const rescreen = phase === 1 && random() < c.rescreenRate ? 1.75 : 1;
        agent.remaining = serviceTimeWithEvent(base * extra * rescreen, rate, event);
        active[phase][lane] = id;
      }
    }
    maxQueue = Math.max(maxQueue, queues.flat().reduce((sum, queue) => sum + queue.length, 0));
    // This is not the authoritative engine, but it must still reject its own
    // invalid worlds. Every passenger occupies at most one queue/service slot.
    const occupying = new Set();
    for (let phase = 0; phase < 2; phase += 1) for (let lane = 0; lane < c.lanes; lane += 1) {
      for (const id of queues[phase][lane]) {
        if (occupying.has(id) || agents[id].stage !== `queue${phase}` || agents[id].lane !== lane) throw new Error("Reserva de cola duplicada o inválida");
        occupying.add(id);
      }
      const servingId = active[phase][lane];
      if (servingId !== null) {
        if (occupying.has(servingId) || agents[servingId].stage !== `service${phase}` || agents[servingId].lane !== lane) throw new Error("Servicio duplicado o inválido");
        occupying.add(servingId);
      }
    }
    snapshots.push(queues.map((lanes) => lanes.map((queue) => queue.length)));
    elapsed = now;
    if (terminal.size === c.passengers) break;
  }
  const unresolved = c.passengers - terminal.size;
  if (cleared + turnedAway + abandoned + unresolved !== c.passengers || terminal.size !== new Set(agents.filter((a) => ["cleared", "turned-away", "abandoned"].includes(a.stage)).map((a) => a.id)).size) {
    throw new Error("Conservación de pasajeros violada");
  }
  return { seed, passengers: c.passengers, cleared, turnedAway, abandoned, unresolved, elapsed,
    switches, maxQueue, meanWait: round(waits.length ? mean(waits) : 0), p90Wait: percentile(waits, .9),
  };
}

export function pairedSurrogateScreen(pair, seeds = 64) {
  if (!ROUND_AB_PAIRS.includes(pair) || !Number.isInteger(seeds) || seeds < 2 || seeds > 1000) throw new Error("Experimento inválido");
  const metrics = ["cleared", "abandoned", "elapsed", "p90Wait", "maxQueue", "switches"];
  const a = [], b = [];
  for (let seed = 1; seed <= seeds; seed += 1) {
    a.push(runQueueSurrogate({ ...pair.shared, [pair.knob]: pair.a }, seed));
    b.push(runQueueSurrogate({ ...pair.shared, [pair.knob]: pair.b }, seed));
  }
  const result = {};
  for (const metric of metrics) {
    const differences = a.map((value, i) => b[i][metric] - value[metric]);
    const m = mean(differences);
    const variance = differences.reduce((sum, value) => sum + (value - m) ** 2, 0) / (seeds - 1);
    result[metric] = { control: round(mean(a.map((x) => x[metric]))), treatment: round(mean(b.map((x) => x[metric]))),
      delta: round(m), paired95ci: [round(m - 1.96 * Math.sqrt(variance / seeds)), round(m + 1.96 * Math.sqrt(variance / seeds))] };
  }
  return { id: pair.id, name: pair.name, seeds, metrics: result,
    scope: "surrogate simulation only; NOT randomized human A/B, live game, or player enjoyment evidence" };
}

export function interactionSurrogateScreen(item, seeds = 64) {
  if (!ROUND_INTERACTIONS.includes(item) || !Number.isInteger(seeds) || seeds < 2 || seeds > 1000) throw new Error("Interacción inválida");
  const metricNames = ["cleared", "abandoned", "elapsed", "p90Wait", "maxQueue"];
  const samples = Array.from({ length: 4 }, () => []);
  for (let seed = 1; seed <= seeds; seed += 1) {
    samples[0].push(runQueueSurrogate({}, seed));
    samples[1].push(runQueueSurrogate(item.left, seed));
    samples[2].push(runQueueSurrogate(item.right, seed));
    samples[3].push(runQueueSurrogate({ ...item.left, ...item.right }, seed));
  }
  const metrics = {};
  for (const metric of metricNames) {
    const cellMeans = samples.map((list) => mean(list.map((value) => value[metric])));
    const additivePrediction = cellMeans[1] + cellMeans[2] - cellMeans[0];
    metrics[metric] = { aloneLeft: round(cellMeans[1] - cellMeans[0]), aloneRight: round(cellMeans[2] - cellMeans[0]),
      together: round(cellMeans[3] - cellMeans[0]), interaction: round(cellMeans[3] - additivePrediction) };
  }
  return { id: item.id, seeds, metrics, scope: "surrogate nonlinear stress only, not user A/B evidence" };
}
