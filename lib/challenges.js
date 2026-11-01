// Public, reproducible challenge payloads. Never include a player identifier or private data.
export function parseChallengeScore(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]{0,3})$/.test(value)) return null;
  const score = Number(value);
  return Number.isSafeInteger(score) && score <= 1000 ? score : null;
}

export function createChallengeUrl(currentUrl, layoutCode, score) {
  if (typeof layoutCode !== "string" || layoutCode.length > 2048 ||
      !/^G1(?:\.[0-9A-Z]+)*$/.test(layoutCode) ||
      !Number.isInteger(score) || score < 0 || score > 1000) {
    throw new Error("El diseño o la puntuación del desafío no son válidos.");
  }
  const url = new URL(currentUrl);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("El enlace del desafío no es válido.");
  url.search = "";
  url.hash = "";
  url.searchParams.set("layout", layoutCode);
  url.searchParams.set("beat", String(score));
  return url.toString();
}

// A tie is not a win. The shared target is meaningful only with the exact original layout.
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
