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
