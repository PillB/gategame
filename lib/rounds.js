// Reproducible round schedules. The original 28-person v5 shift stays unchanged.
// New challenges always carry a round ID: a layout alone is not a fair replay.
export const ROUND_RULES_VERSION = "waves-1";
export const DEFAULT_ROUND = "classic";

const CLASSIC_ROUND = {
    id: "classic", title: "Turno clásico", badge: "CADENA DE RELEVOS",
    story: "El aeropuerto despierta: los pasajeros llegan a ritmo constante.",
    decision: "Abre corredores útiles antes de iniciar el turno.",
    payoff: "Encuentra un flujo tranquilo aun cuando cambien los trabajadores.",
    arrivals: Object.freeze(Array.from({ length: 28 }, (_, i) => i * .72)),
    waves: Object.freeze([]),
};

export const ROUNDS = Object.freeze([
  CLASSIC_ROUND,
  {
    id: "r04", title: "R04 · Las maletas cantoras", badge: "¡PRÓXIMO ATERRIZAJE!",
    story: "Cuatro avioncitos llegan con siete viajeros cada uno. Sus maletas hacen coro en la cinta. 🎵",
    decision: "Antes del próximo aterrizaje, decide qué acceso dejar despejado.",
    payoff: "Cada tanda llega como un pequeño bis: busca que las filas respiren entre canciones.",
    arrivals: Object.freeze([0, 11, 22, 33].flatMap((start) => Array.from({ length: 7 }, (_, i) => start + i * .32))),
    waves: Object.freeze([
      { at: 0, count: 7, label: "Vuelo del coro de maletas", surprise: "¡Primer acorde! Llegan siete viajeros." },
      { at: 11, count: 7, label: "Segundo bis de maletas", surprise: "¡Bis! Siete viajeros entran al vestíbulo." },
      { at: 22, count: 7, label: "Tercer coro viajero", surprise: "¡Otra estrofa! La fila recibe siete viajeros." },
      { at: 33, count: 7, label: "Gran final del coro", surprise: "¡Gran final! La última tanda quiere llegar a tiempo." },
    ]),
  },
  {
    id: "r05", title: "R05 · Dos vuelos, una pista", badge: "DOBLE DESEMBARQUE",
    story: "Un vuelo de nubes y otro de estrellas aterrizan casi a la vez. ☁️ ✨",
    decision: "Prueba dos accesos distintos para que ninguna de las dos tandas bloquee el corredor.",
    payoff: "Cuando las dos filas funcionan, el tablero parece una coreografía de bienvenida.",
    arrivals: Object.freeze([0, 9].flatMap((start) => Array.from({ length: 14 }, (_, i) => start + i * .32))),
    waves: Object.freeze([
      { at: 0, count: 14, label: "Vuelo Nube", surprise: "¡Aterrizó Nube! Catorce viajeros vienen en camino." },
      { at: 9, count: 14, label: "Vuelo Estrella", surprise: "¡Aterrizó Estrella! Otra tanda quiere un pasillo libre." },
    ]),
  },
  {
    id: "r06", title: "R06 · La fila que respira", badge: "UN RESPIRO ENTRE VUELOS",
    story: "Después de dos aterrizajes, el vestíbulo toma aire antes del siguiente dúo. 📚 ✈️",
    decision: "Desde el segundo 14 puedes retirar una sola cinta durante el turno. Pausa cuando quieras: el respiro no caduca.",
    payoff: "Un pasaje libre puede aliviar la segunda mitad del turno. Elige qué cinta retirar, o conserva el diseño.",
    arrivals: Object.freeze([0, 7, 27, 34].flatMap((start) => Array.from({ length: 7 }, (_, i) => start + i * .32))),
    waves: Object.freeze([
      { at: 0, count: 7, label: "Primer vuelo de la biblioteca", surprise: "¡Shhh! Llegan los primeros siete viajeros." },
      { at: 7, count: 7, label: "Segundo vuelo silencioso", surprise: "Otro grupo llega de puntillas: siete viajeros más." },
      { at: 27, count: 7, label: "El regreso de los libros viajeros", surprise: "¡Se abrió un nuevo capítulo! Entran siete viajeros." },
      { at: 34, count: 7, label: "Última página del turno", surprise: "¡Final del cuento! El último vuelo trae siete viajeros." },
    ]),
  },
]);

const byId = new Map(ROUNDS.map((round) => [round.id, round]));
export function getRound(value) { return byId.get(value) ?? CLASSIC_ROUND; }
export function isRoundId(value) { return typeof value === "string" && byId.has(value); }
export function arrivalAt(roundId, index) {
  const arrivals = getRound(roundId).arrivals;
  if (!Number.isInteger(index) || index < 0 || index >= arrivals.length) return null;
  return arrivals[index];
}
export function upcomingWave(roundId, elapsed) {
  return getRound(roundId).waves.find((wave) => wave.at > elapsed + 1e-8) ?? null;
}

// Remove schedule-imposed waiting from the pace score. The classic round is
// numerically unchanged; newer missions compare routing skill, not the time
// until the last advertised plane has landed. Keep actual elapsed visible.
export function scoredElapsed(roundId, elapsed) {
  const classicLast = arrivalAt(DEFAULT_ROUND, 27);
  const roundLast = arrivalAt(roundId, 27);
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error("Tiempo inválido.");
  return Math.max(0, elapsed - ((roundLast ?? classicLast) - classicLast));
}

export function paceClockCaption(roundId, elapsed) {
  if (roundId === DEFAULT_ROUND) return "meta ≤ 00:55";
  if (elapsed === 0) {
    const offset = arrivalAt(roundId, 27) - arrivalAt(DEFAULT_ROUND, 27);
    const amount = Math.abs(offset).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `ajuste ${offset < 0 ? "+" : "−"}${amount} s · meta ≤ 00:55`;
  }
  const value = scoredElapsed(roundId, elapsed);
  const clock = `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
  return `puntuable ${clock} · meta ≤ 00:55`;
}

// One optional belt removal after the early flight pair; it never expires.
export function breathEditAvailable(roundId, elapsed, spent, finished = false) {
  return roundId === "r06" && Number.isFinite(elapsed) && elapsed >= 14 - 1e-8 &&
    Number.isInteger(spent) && spent === 0 && !finished;
}

// R06's one-time edit must open a physically present belt, not consume the
// player's token on a connection already removed by an active worker fault.
export function canRemoveLiveBelt(baseEdges, visibleEdges, from, to) {
  const matches = (edge) => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from);
  return Array.isArray(baseEdges) && Array.isArray(visibleEdges) &&
    baseEdges.some(matches) && visibleEdges.some(matches);
}
