// Public, reproducible challenge payloads. Never include a player identifier or private data.
import { DEFAULT_ROUND, ROUND_RULES_VERSION, isRoundId } from "./rounds.js";

export function parseChallengeRound(round, rules) {
  if (round === null && rules === null) return DEFAULT_ROUND; // historical G1 links
  if (round !== DEFAULT_ROUND && isRoundId(round) && rules === ROUND_RULES_VERSION) return round;
  return null; // fail closed: incompatible or tampered rules must not yield a comparable score
}

export function parseChallengeScore(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]{0,3})$/.test(value)) return null;
  const score = Number(value);
  return Number.isSafeInteger(score) && score <= 1000 ? score : null;
}

export function createChallengeUrl(currentUrl, layoutCode, score, roundId = DEFAULT_ROUND) {
  if (typeof layoutCode !== "string" || layoutCode.length > 2048 ||
      !/^G1(?:\.[0-9A-Z]+)*$/.test(layoutCode) ||
      !Number.isInteger(score) || score < 0 || score > 1000 || !isRoundId(roundId)) {
    throw new Error("El diseño o la puntuación del desafío no son válidos.");
  }
  const url = new URL(currentUrl);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("El enlace del desafío no es válido.");
  url.search = "";
  url.hash = "";
  url.searchParams.set("layout", layoutCode);
  url.searchParams.set("beat", String(score));
  if (roundId !== DEFAULT_ROUND) {
    url.searchParams.set("round", roundId);
    url.searchParams.set("rules", ROUND_RULES_VERSION);
  }
  return url.toString();
}

// A tie is not a win. The link provides a starting design; players may improve it to win.
export function compareChallengeScore(score, target) {
  if (!Number.isInteger(score) || score < 0 || score > 1000 ||
      !Number.isInteger(target) || target < 0 || target > 1000) return null;
  const delta = score - target;
  if (delta > 0) return { outcome: "won", delta, message: `¡Superaste el reto por ${delta} ${delta === 1 ? "punto" : "puntos"}!` };
  if (delta === 0) return { outcome: "tied", delta: 0, message: "¡Empate! Igualaste la puntuación del desafío." };
  return { outcome: "missed", delta, message: `Te faltaron ${-delta} ${delta === -1 ? "punto" : "puntos"} para superar el reto.` };
}

// One falsifiable experiment per round. Suggestions are hypotheses, not promised score gains.
export function nextRoundExperiment({ faultsLeft = 0, retries = 0, abandoned = 0, elapsed = 0, queueSwitches = 0, score = 0 } = {}) {
  if (faultsLeft > 0) return "Experimento: marca una cinta averiada temprano para darle tiempo al supervisor de encontrarla.";
  if (retries > 0) return "Experimento: abre un cruce de las cintas que bloquean las rutas; compara los reintentos.";
  if (abandoned > 0) return "Experimento: despeja un acceso a los módulos menos congestionados y observa los abandonos.";
  if (elapsed > 55) return "Experimento: crea un atajo por las celdas libres y compara el tiempo final.";
  if (queueSwitches >= 15) return "Experimento: reduce los rodeos; los cambios de fila ya alcanzaron el bono máximo.";
  if (score >= 850) return "Desafío personal: mueve una sola cinta y comprueba si mejoras este resultado.";
  return "Experimento: modifica una sola cinta, repite el turno y compara la puntuación.";
}

/** @param {number} target @param {boolean} modified @param {number | null} [finishedScore] */
export function challengePrompt(target, modified, finishedScore = null) {
  if (!Number.isInteger(target) || target < 0 || target > 1000) return null;
  if (finishedScore !== null) return compareChallengeScore(finishedScore, target)?.message ?? null;
  if (modified) return `Diseño ajustado: intenta superar los ${target} puntos del reto original.`;
  return `Reto de ${target} puntos: cambia una cinta, simula y trata de superar el diseño recibido.`;
}

/** User-triggered Web Share API payload, without contacts, analytics or duplicated links. */
export function createNativeShareData({ score, processed, target, url }) {
  if (!Number.isInteger(score) || score < 0 || score > 1000 ||
      !Number.isInteger(processed) || !Number.isInteger(target) ||
      processed < 0 || target < 1 || processed > target) {
    throw new Error("La puntuación del reto no es válida.");
  }
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol) ||
      !parsed.searchParams.has("layout") || parseChallengeScore(parsed.searchParams.get("beat")) !== score ||
      parseChallengeRound(parsed.searchParams.get("round"), parsed.searchParams.get("rules")) === null) {
    throw new Error("El enlace compartido no corresponde al reto.");
  }
  return {
    title: "Gateflow · Reto entre amigos",
    text: `¿Puedes superar mis ${score} puntos en Gateflow? Atendí a ${processed} de ${target} pasajeros. Ajusta las cintas y juega la misma hora punta.`,
    url: parsed.toString(),
  };
}

/** Describe a completed score comparison; feedback is informational, not a scoring bonus. */
export function describeRoundDelta(previousScore, currentScore, sameLayout = false) {
  if (![previousScore, currentScore].every(v => Number.isInteger(v) && v >= 0 && v <= 1000)) {
    throw new Error("Las puntuaciones de los turnos no son válidas.");
  }
  const delta = currentScore - previousScore;
  if (delta > 0) return { delta, tone: "improved", text: `Mejoraste ${delta} ${delta === 1 ? "punto" : "puntos"} frente al turno anterior. ¿Qué cinta hizo la diferencia?` };
  if (delta < 0) return { delta, tone: "lower", text: `Obtuviste ${-delta} ${delta === -1 ? "punto" : "puntos"} menos que en el turno anterior. Revisa el tiempo, las fallas y las colas.` };
  return { delta: 0, tone: "tied", text: sameLayout
    ? "Repetiste el mismo diseño y obtuviste la misma puntuación. Prueba mover una cinta."
    : "Empataste con el turno anterior. ¿Puedes encontrar otro diseño que mejore el flujo?" };
}
