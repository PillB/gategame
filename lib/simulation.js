const CARDINAL = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const nodeId = (x, y) => `${x}:${y}`;
export const parseNode = (id) => { const [x, y] = id.split(":").map(Number); return { x, y }; };
export const areCardinal = (a, b) => { const p = parseNode(a); const q = parseNode(b); return Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1; };
export const edgeKey = (a, b) => [a, b].sort().join("|");

export function addConnection(connections, from, to, cols, rows) {
  const inside = ({ x, y }) => x >= 0 && x < cols && y >= 0 && y < rows;
  if (!inside(parseNode(from)) || !inside(parseNode(to))) throw new Error("El poste está fuera de la cuadrícula.");
  if (!areCardinal(from, to)) throw new Error("Las conexiones deben unir postes contiguos.");
  const exact = connections.findIndex((edge) => edge.from === from && edge.to === to);
  if (exact >= 0) return connections.filter((_, index) => index !== exact);
  if (connections.some((edge) => edge.from === from)) throw new Error(`El poste ${from} ya tiene una conexión de salida.`);
  if (connections.some((edge) => edge.to === to)) throw new Error(`El poste ${to} ya tiene una conexión de entrada.`);
  return [...connections, { from, to }];
}

function neighbours(id, cols, rows, blocked) {
  const { x, y } = parseNode(id);
  return CARDINAL.map(([dx, dy]) => nodeId(x + dx, y + dy)).filter((next) => {
    const p = parseNode(next);
    return p.x >= 0 && p.x < cols && p.y >= 0 && p.y < rows && !blocked.has(edgeKey(id, next));
  });
}

function reconstruct(cameFrom, current) {
  const route = [current];
  while (cameFrom.has(current)) { current = cameFrom.get(current); route.unshift(current); }
  return route;
}

export function findRoute({ cols, rows, start, connections }) {
  const blocked = new Set(connections.map(({ from, to }) => edgeKey(from, to)));
  const open = new Set([start]);
  const cameFrom = new Map();
  const g = new Map([[start, 0]]);
  const f = new Map([[start, parseNode(start).y]]);
  while (open.size) {
    const current = [...open].sort((a, b) => (f.get(a) ?? Infinity) - (f.get(b) ?? Infinity) || a.localeCompare(b))[0];
    if (parseNode(current).y === 0) return reconstruct(cameFrom, current);
    open.delete(current);
    for (const next of neighbours(current, cols, rows, blocked)) {
      const tentative = (g.get(current) ?? Infinity) + 1;
      if (tentative >= (g.get(next) ?? Infinity)) continue;
      cameFrom.set(next, current); g.set(next, tentative); f.set(next, tentative + parseNode(next).y); open.add(next);
    }
  }
  return [];
}

export function getHighestReachableRoute({ cols, rows, start, connections }) {
  const blocked = new Set(connections.map(({ from, to }) => edgeKey(from, to)));
  const queue = [start]; const seen = new Set([start]); const cameFrom = new Map(); let best = start;
  while (queue.length) {
    const current = queue.shift(); const point = parseNode(current); const bestPoint = parseNode(best);
    if (point.y < bestPoint.y || (point.y === bestPoint.y && current < best)) best = current;
    for (const next of neighbours(current, cols, rows, blocked)) {
      if (seen.has(next)) continue;
      seen.add(next); cameFrom.set(next, current); queue.push(next);
    }
  }
  return reconstruct(cameFrom, best);
}

export function beltsToBlockedConnections(belts, postCols, postRows) {
  const blocked = [];
  for (const belt of belts) {
    if (!areCardinal(belt.from, belt.to)) throw new Error("Las cintas deben unir postes contiguos.");
    const a = parseNode(belt.from), b = parseNode(belt.to);
    if (a.y === b.y) {
      const x = Math.min(a.x, b.x), y = a.y;
      if (y > 0 && y < postRows - 1) blocked.push({ from: nodeId(x, y - 1), to: nodeId(x, y) });
    } else {
      const x = a.x, y = Math.min(a.y, b.y);
      if (x > 0 && x < postCols - 1) blocked.push({ from: nodeId(x - 1, y), to: nodeId(x, y) });
    }
  }
  return blocked;
}

// A belt is a wall between corridor cells, not a traversable edge. Checking the next
// route step against the CURRENT belts lets callers invalidate stale routes after faults.
export function isCorridorStepBlocked(fromCell, toCell, belts, postCols, postRows) {
  const inside = (id) => {
    if (typeof id !== "string") return false;
    const { x, y } = parseNode(id);
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < postCols - 1 && y < postRows - 1;
  };
  if (!Number.isInteger(postCols) || postCols < 2 || !Number.isInteger(postRows) || postRows < 2 ||
      !Array.isArray(belts) || !inside(fromCell) || !inside(toCell) || !areCardinal(fromCell, toCell)) {
    throw new Error("El paso entre celdas del corredor no es válido.");
  }
  const attempted = edgeKey(fromCell, toCell);
  return beltsToBlockedConnections(belts, postCols, postRows).some(({ from, to }) => edgeKey(from, to) === attempted);
}

export function findCorridorRoute({ postCols, postRows, start, belts }) {
  return findRoute({ cols: postCols - 1, rows: postRows - 1, start, connections: beltsToBlockedConnections(belts, postCols, postRows) });
}

export function getHighestCorridorRoute({ postCols, postRows, start, belts }) {
  return getHighestReachableRoute({ cols: postCols - 1, rows: postRows - 1, start, connections: beltsToBlockedConnections(belts, postCols, postRows) });
}

export function serviceLaneForCell(cellX, cellCols, lanes) {
  if (!Number.isInteger(cellCols) || cellCols < 1 || !Number.isInteger(lanes) || lanes < 1 || !Number.isInteger(cellX) || cellX < 0 || cellX >= cellCols) throw new Error("La celda o el número de módulos de atención no son válidos.");
  return Math.min(lanes - 1, Math.floor(cellX * lanes / cellCols));
}

export function findLocalQueueMinimum(origin, waits, closed = []) {
  if (!Array.isArray(waits) || waits.length === 0 || !Number.isInteger(origin) || origin < 0 || origin >= waits.length) throw new Error("El estado de las colas no es válido.");
  const closedSet = new Set(closed);
  const load = (lane) => closedSet.has(lane) ? Infinity : Math.max(0, Number(waits[lane]) || 0);
  const scan = (direction) => {
    let best = origin, bestLoad = load(origin), previousLoad = bestLoad;
    for (let lane = origin + direction; lane >= 0 && lane < waits.length; lane += direction) {
      const nextLoad = load(lane);
      if (nextLoad > previousLoad) break;
      if (nextLoad < bestLoad) { best = lane; bestLoad = nextLoad; }
      previousLoad = nextLoad;
    }
    return { lane: best, load: bestLoad, distance: Math.abs(best - origin) };
  };
  const candidates = [{ lane: origin, load: load(origin), distance: 0 }, scan(-1), scan(1)];
  return candidates.sort((a, b) => a.load - b.load || a.distance - b.distance || a.lane - b.lane)[0].lane;
}


/** Model a visible, finite walk between adjacent airport service lanes. */
export function queueWalkDuration(from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0) throw new Error("Las posiciones de las filas no son válidas.");
  return from === to ? 0 : Math.max(0.5, Math.abs(to - from) * 0.65);
}

/** Lane position in continuous lane units; interpolation is clamped to avoid teleports/overshoot. */
export function queueWalkLane(from, to, walked, duration) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 ||
      !Number.isFinite(walked) || !Number.isFinite(duration) || duration < 0) {
    throw new Error("La caminata entre filas no es válida.");
  }
  if (duration === 0) return to;
  return from + (to - from) * Math.min(1, Math.max(0, walked / duration));
}

export function queueSwitchProbability(improvement) {
  if (!Number.isFinite(improvement) || improvement <= 0) return 0;
  if (improvement === 1) return 0.74;
  if (improvement === 2) return 0.87;
  return 0.94;
}

/** @param {{origin: number, waits: number[], closed?: number[], passengerId: number, phase: number}} selection */
export function chooseLocalQueue({ origin, waits, closed = [], passengerId, phase }) {
  const candidate = findLocalQueueMinimum(origin, waits, closed);
  if (candidate === origin) return origin;
  if (closed.includes(origin)) return candidate;
  const improvement = Math.max(0, (Number(waits[origin]) || 0) - (Number(waits[candidate]) || 0));
  const random = seededRandom(Math.imul(Math.abs(passengerId) + 1, 2654435761) ^ Math.imul(Math.abs(phase) + 11, 2246822519));
  return random() < queueSwitchProbability(improvement) ? candidate : origin;
}

// Queue order must reflect when a person JOINED this queue, never their immutable passenger ID
// or their insertion order in the global agent array. A monotonic sequence resolves arrivals
// within the same simulation tick; queuedAt is the fallback for callers without that sequence.
export function findNextQueuedAgentIndex(agents, stage, lane) {
  if (!Array.isArray(agents) || !["queue1", "queue2"].includes(stage) || !Number.isInteger(lane) || lane < 0) {
    throw new Error("La cola o el módulo de atención no son válidos.");
  }
  let bestIndex = -1;
  let bestOrder = Infinity;
  let bestId = Infinity;
  for (let index = 0; index < agents.length; index += 1) {
    const agent = agents[index];
    if (!agent || agent.stage !== stage || agent.exit !== lane) continue;
    const order = Number.isFinite(agent.queueSequence) ? agent.queueSequence : agent.queuedAt;
    if (!Number.isFinite(order) || order < 0) throw new Error("Falta el orden de llegada de una persona en cola.");
    const id = Number.isFinite(agent.id) ? agent.id : Infinity;
    if (order < bestOrder || (order === bestOrder && id < bestId)) {
      bestIndex = index;
      bestOrder = order;
      bestId = id;
    }
  }
  return bestIndex;
}

const WORKER_NAMES = ["Mina", "Theo", "Ana", "Luis", "Noor", "Jo", "Sam"];
const WORKER_TRAITS = ["RÁPIDO", "CONSTANTE", "MINUCIOSO"];
const WORKER_RATES = [0.74, 0.82, 0.94, 1.04, 1.16, 1.26, 1.34];

export function workerShiftPlan({ phase, lanes, startAt, cadence }) {
  if (!Number.isInteger(phase) || phase < 0 || !Number.isInteger(lanes) || lanes < 1 || !Number.isFinite(startAt) || !Number.isFinite(cadence) || cadence <= 0) throw new Error("El plan de rotación del personal no es válido.");
  const center = Math.floor(lanes / 2), order = [center];
  for (let distance = 1; order.length < lanes; distance += 1) {
    if (center - distance >= 0) order.push(center - distance);
    if (center + distance < lanes) order.push(center + distance);
  }
  return order.map((lane, index) => {
    const seed = phase * 97 + lane * 31 + index * 17;
    const rate = WORKER_RATES[seed % WORKER_RATES.length];
    const trait = rate <= 0.86 ? WORKER_TRAITS[0] : rate >= 1.2 ? WORKER_TRAITS[2] : WORKER_TRAITS[1];
    const roll = seededRandom(seed * 59 + 1)();
    return {
      id: `P${phase}-L${lane}`,
      phase,
      lane,
      name: WORKER_NAMES[(seed + phase) % WORKER_NAMES.length],
      hint: `${trait} ${rate.toFixed(2).replace(".", ",")}×`,
      rate,
      startAt: Math.round((startAt + index * cadence) * 10) / 10,
      walkDuration: 2.2 + (seed % 3) * 0.25,
      handoverDuration: 0.8,
      prepDuration: 1.2 + (seed % 4) * 0.25,
      faultKind: roll < 0.05 ? "open" : roll < 0.12 ? "rotate-down" : null,
    };
  });
}

export function applyBeltFault(connections, original, kind, cols, rows) {
  if (kind !== "open" && kind !== "rotate-down") throw new Error("El tipo de falla de cinta no es válido.");
  const index = connections.findIndex((edge) => edge.from === original.from && edge.to === original.to);
  if (index < 0) return { edges: [...connections], applied: null };
  const remaining = connections.filter((_, edgeIndex) => edgeIndex !== index);
  if (kind !== "rotate-down") return { edges: remaining, applied: null };
  const from = parseNode(original.from), candidate = { from: original.from, to: nodeId(from.x, from.y + 1) };
  if (from.y + 1 >= rows) return { edges: remaining, applied: null };
  try {
    const added = addConnection(remaining, candidate.from, candidate.to, cols, rows);
    const edges = [...added]; edges.splice(index, 0, edges.pop());
    return { edges, applied: candidate };
  } catch { return { edges: remaining, applied: null }; }
}

export function findWorkerCrossing(belts, cellX) {
  if (!Array.isArray(belts) || !Number.isFinite(cellX)) return null;
  return belts.filter((edge) => { const a = parseNode(edge.from), b = parseNode(edge.to); return a.y === b.y; })
    .sort((a, b) => {
      const pa = parseNode(a.from), qa = parseNode(a.to), pb = parseNode(b.from), qb = parseNode(b.to);
      const distanceA = Math.abs(Math.min(pa.x, qa.x) - cellX), distanceB = Math.abs(Math.min(pb.x, qb.x) - cellX);
      return distanceA - distanceB || Math.max(pb.y, qb.y) - Math.max(pa.y, qa.y);
    })[0] ?? null;
}

export function repairBeltFault(connections, fault, cols, rows) {
  const appliedIndex = fault.applied ? connections.findIndex((edge) => edge.from === fault.applied.from && edge.to === fault.applied.to) : -1;
  let cleaned = connections.filter((edge) => !(fault.applied && edge.from === fault.applied.from && edge.to === fault.applied.to));
  cleaned = cleaned.filter((edge) => edge.from !== fault.original.from && edge.to !== fault.original.to);
  try {
    const added = addConnection(cleaned, fault.original.from, fault.original.to, cols, rows);
    if (appliedIndex >= 0) { const edges = [...added]; edges.splice(appliedIndex, 0, edges.pop()); return edges; }
    return added;
  } catch { return cleaned; }
}

export function fieldOfViewContains({ origin, heading, target, range, fovDegrees }) {
  const dx = target.x - origin.x, dy = target.y - origin.y, distance = Math.hypot(dx, dy), headingLength = Math.hypot(heading.x, heading.y);
  if (!Number.isFinite(distance) || !Number.isFinite(range) || distance > range || distance === 0 || headingLength === 0) return false;
  const cosine = (dx * heading.x + dy * heading.y) / (distance * headingLength);
  return cosine >= Math.cos((fovDegrees * Math.PI / 180) / 2);
}

export function sanitizeLayoutGroups(value, cols, rows) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const result = [];
  for (const group of value) {
    if (!Array.isArray(group) || group.length > cols * rows) return null;
    const clean = [], outgoing = new Set(), incoming = new Set(), exact = new Set();
    for (const edge of group) {
      if (!edge || typeof edge !== "object" || typeof edge.from !== "string" || typeof edge.to !== "string") return null;
      const from = parseNode(edge.from), to = parseNode(edge.to);
      const inside = (point) => Number.isInteger(point.x) && Number.isInteger(point.y) && point.x >= 0 && point.x < cols && point.y >= 0 && point.y < rows;
      const key = `${edge.from}>${edge.to}`;
      if (!inside(from) || !inside(to) || !areCardinal(edge.from, edge.to) || outgoing.has(edge.from) || incoming.has(edge.to) || exact.has(key)) return null;
      outgoing.add(edge.from); incoming.add(edge.to); exact.add(key); clean.push({ from: edge.from, to: edge.to });
    }
    result.push(clean);
  }
  return result;
}

export function encodeLayout(edgeGroups, cols, rows) {
  const clean = sanitizeLayoutGroups(edgeGroups, cols, rows);
  if (!clean) throw new Error("No se puede compartir una distribución no válida.");
  const nodes = cols * rows, span = nodes * nodes;
  const tokens = clean.flatMap((edges, grid) => edges.map(({ from, to }) => {
    const a = parseNode(from), b = parseNode(to);
    return grid * span + (a.y * cols + a.x) * nodes + (b.y * cols + b.x);
  })).sort((a, b) => a - b).map((value) => value.toString(36).toUpperCase());
  return tokens.length ? `G1.${tokens.join(".")}` : "G1";
}

export function decodeLayout(code, cols, rows) {
  if (typeof code !== "string" || code.length > 2048 || !/^G1(?:\.[0-9A-Z]+)*$/.test(code)) return null;
  const nodes = cols * rows, span = nodes * nodes, result = [[], []];
  for (const token of code.split(".").slice(1)) {
    const value = Number.parseInt(token, 36), grid = Math.floor(value / span), remainder = value % span;
    const fromIndex = Math.floor(remainder / nodes), toIndex = remainder % nodes;
    if (!Number.isSafeInteger(value) || grid < 0 || grid > 1 || fromIndex >= nodes || toIndex >= nodes) return null;
    result[grid].push({ from: nodeId(fromIndex % cols, Math.floor(fromIndex / cols)), to: nodeId(toIndex % cols, Math.floor(toIndex / cols)) });
  }
  return sanitizeLayoutGroups(result, cols, rows);
}

export function seededRandom(seed) { let value = seed >>> 0; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; }
export function shuffleWithSeed(values, seed) {
  const random = seededRandom(seed); const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) { const other = Math.floor(random() * (index + 1)); [copy[index], copy[other]] = [copy[other], copy[index]]; }
  return copy;
}

export const PASSENGER_EVENTS = Object.freeze({
  immigration: Object.freeze([
    { id: "documents-ready", title: "Documentos listos", short: "DOCUMENTOS LISTOS", detail: "Tiene el pasaporte, la tarjeta de ingreso y la dirección del hotel listos para el control.", multiplier: 0.86, outcome: "clear", tone: "good" },
    { id: "hotel-on-phone", title: "Buscando la dirección del hotel", short: "CELULAR AL 1 %", detail: "La dirección del hotel está en un celular con 1 % de batería. Aparece un cargador justo a tiempo.", multiplier: 1.28, outcome: "clear", tone: "warn" },
    { id: "purpose-follow-up", title: "Una respuesta inesperada", short: "PREGUNTA ADICIONAL", detail: "¿Motivo del viaje? «Una conferencia… y encontrar el mejor sánguche de la ciudad». Una pregunta más aclara todo.", multiplier: 1.22, outcome: "clear", tone: "warn" },
    { id: "name-order", title: "Apellidos en distinto orden", short: "REVISIÓN MANUAL", detail: "La reserva y el pasaporte muestran los apellidos en distinto orden. El personal los verifica manualmente.", multiplier: 1.42, outcome: "clear", tone: "warn" },
    { id: "date-mismatch", title: "Fechas de viaje distintas", short: "SEGUNDA ENTREVISTA", detail: "La fecha de retorno declarada no coincide con el itinerario. Se requiere una segunda entrevista.", multiplier: 1.78, outcome: "clear", tone: "alert" },
    { id: "wrong-document", title: "Documento equivocado", short: "BUSCANDO EL DOCUMENTO", detail: "La persona presenta una entrada de museo, luego su pase de abordar y finalmente encuentra el documento solicitado.", multiplier: 1.36, outcome: "clear", tone: "warn" },
    { id: "entry-condition", title: "Requisito de ingreso pendiente", short: "INGRESO DENEGADO", detail: "No se puede verificar un requisito obligatorio de ingreso. La persona sale del circuito de llegadas.", multiplier: 1.9, outcome: "turnaway", tone: "alert" },
    { id: "brief-interview", title: "Entrevista breve", short: "RESPUESTAS CLARAS", detail: "Las respuestas son coherentes y el control termina rápidamente.", multiplier: 0.94, outcome: "clear", tone: "good" },
  ]),
  security: Object.freeze([
    { id: "tray-ready", title: "Bandeja lista", short: "LISTO PARA RAYOS X", detail: "Los equipos electrónicos y los líquidos ya están separados antes de llegar al escáner.", multiplier: 0.86, outcome: "clear", tone: "good" },
    { id: "full-bottle", title: "Botella de agua llena", short: "VACIAR Y REGRESAR", detail: "Encuentran una botella llena. La persona la vacía y regresa al control de seguridad.", multiplier: 1.3, outcome: "clear", tone: "warn" },
    { id: "laptop-stack", title: "Laptop bajo las guías", short: "REESCANEO DE EQUIPAJE", detail: "Una laptop está debajo de tres guías turísticas. El equipaje debe pasar otra vez por el escáner.", multiplier: 1.38, outcome: "clear", tone: "warn" },
    { id: "souvenir-globe", title: "Esfera de nieve de recuerdo", short: "REVISIÓN ADICIONAL", detail: "Una esfera de nieve de recuerdo provoca una conversación muy cordial. La inspección manual resuelve la duda.", multiplier: 1.46, outcome: "clear", tone: "warn" },
    { id: "dense-snacks", title: "Bocaditos y polvos compactos", short: "INSPECCIÓN DE EQUIPAJE", detail: "Los bocaditos y los polvos dificultan la imagen del escáner. Revisan el equipaje a mano.", multiplier: 1.58, outcome: "clear", tone: "alert" },
    { id: "pocket-coin", title: "La moneda de la suerte", short: "ALARMA Y NUEVO CONTROL", detail: "Unas llaves, una correa y una moneda de la suerte activan la alarma. Repiten el control rápidamente.", multiplier: 1.28, outcome: "clear", tone: "warn" },
    { id: "multi-tool", title: "Multiherramienta olvidada", short: "OBJETO ENTREGADO", detail: "Encuentran una multiherramienta en el equipaje de mano. Se entrega el objeto y continúa el control.", multiplier: 1.7, outcome: "clear", tone: "alert" },
    { id: "random-secondary", title: "Control de seguridad adicional", short: "SEGUNDA REVISIÓN", detail: "Una selección de rutina requiere una segunda revisión antes de poder continuar.", multiplier: 1.82, outcome: "clear", tone: "alert" },
  ]),
});

export function selectServiceEvent(passengerId, phase) {
  const events = PASSENGER_EVENTS[phase];
  if (!events) throw new Error(`Fase de atención desconocida: ${phase}`);
  const salt = phase === "immigration" ? 0x51f15e : 0x93a4c7;
  const random = seededRandom((passengerId + 1) * 2654435761 ^ salt);
  return events[Math.floor(random() * events.length)];
}

export function serviceTimeWithEvent(baseTime, laneRate, event) {
  return Math.round(baseTime * laneRate * event.multiplier * 1000) / 1000;
}

export function shouldAbandon({ stage, waitTime, patience }) {
  return (stage === "queue1" || stage === "queue2") && waitTime >= patience;
}

export function passengerPatience(passengerId) {
  return [15, 19, 23, 28][Math.abs(passengerId) % 4];
}

// A pure, auditable ledger: positive components add points and penalties subtract them.
// Keep the arithmetic identical to scoreShift's original scoring contract.
export function scoreShiftBreakdown({ processed, elapsed, retries, target, turnedAway = 0, abandoned = 0, complete = false, smartSwitches = 0, repairs = 0, faultsLeft = 0 }) {
  if (processed <= 0 && elapsed <= 0) return {
    throughput: 0, pace: 0, calm: 0, wayfinding: 0, queueSwitchBonus: 0, repairBonus: 0,
    unresolvedFaultPenalty: 0, retryPenalty: 0, turnawayPenalty: 0, abandonmentPenalty: 0,
    raw: 0, capped: 0, total: 0,
  };
  const throughput = (processed / Math.max(1, target)) * 700;
  const pace = complete ? Math.max(0, 220 - Math.max(0, elapsed - 45) * 4) : 0;
  const calm = complete && abandoned === 0 ? 80 : 0;
  const wayfinding = complete && retries === 0 ? 40 : 0;
  const queueSwitchBonus = Math.min(45, Math.max(0, smartSwitches) * 3);
  const repairBonus = Math.max(0, repairs) * 40;
  const asPenalty = (count, weight) => { const penalty = -count * weight; return penalty === 0 ? 0 : penalty; };
  const unresolvedFaultPenalty = asPenalty(Math.max(0, faultsLeft), 35);
  const retryPenalty = asPenalty(retries, 12);
  const turnawayPenalty = asPenalty(turnedAway, 20);
  const abandonmentPenalty = asPenalty(abandoned, 30);
  const raw = throughput + pace + calm + wayfinding + queueSwitchBonus + repairBonus + unresolvedFaultPenalty + retryPenalty + turnawayPenalty + abandonmentPenalty;
  const capped = Math.max(0, Math.min(1000, raw));
  return { throughput, pace, calm, wayfinding, queueSwitchBonus, repairBonus, unresolvedFaultPenalty, retryPenalty, turnawayPenalty, abandonmentPenalty, raw, capped, total: Math.round(capped) };
}

export function scoreShift(args) {
  return scoreShiftBreakdown(args).total;
}

export function rankShift(score) {
  if (score >= 850) return { grade: "S", title: "Arquitecto del flujo" };
  if (score >= 700) return { grade: "A", title: "Experto en colas" };
  if (score >= 550) return { grade: "B", title: "Operador constante" };
  if (score >= 350) return { grade: "C", title: "Planificador de sala" };
  return { grade: "D", title: "Aprendiz de rutas" };
}

export function getShiftMedals({ processed, abandoned, retries, elapsed, target }) {
  return [
    { id: "throughput", title: "Flujo de personas", detail: `Atiende a ${Math.ceil(target * 0.85)} personas`, earned: processed >= Math.ceil(target * 0.85) },
    { id: "calm", title: "Sala tranquila", detail: "Termina sin abandonos", earned: abandoned === 0 },
    { id: "wayfinder", title: "Buena orientación", detail: "Termina sin reintentos de ruta", earned: retries === 0 },
    { id: "pace", title: "Puntualidad", detail: "Termina el turno en 00:55", earned: elapsed > 0 && elapsed <= 55 },
  ];
}

export function layoutFingerprint(edgeGroups) {
  const value = edgeGroups.map((edges, grid) => edges.map(({ from, to }) => `${grid}:${from}>${to}`).sort().join(",")).join("|");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(-6);
}

export function createShareCard({ score, rank, processed, target, elapsed, abandoned, retries, fingerprint, url }) {
  const seconds = Math.max(0, Math.floor(elapsed));
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return `GATEFLOW ${rank.grade} · ${score}\n${processed}/${target} atendidos · ${clock}\n${abandoned} abandonos · ${retries} reintentos\nDiseño ${fingerprint}\n¿Tus cintas superan a las mías?\n${url}`;
}

export function simulationInterval(pace, stepSeconds) {
  if (![0.5, 1, 2].includes(pace)) throw new Error("La velocidad de simulación no es compatible.");
  return stepSeconds * 1000 / pace;
}
