import { ROUND_AB_PAIRS, ROUND_INTERACTIONS, pairedSurrogateScreen, interactionSurrogateScreen } from "../lib/round-experiments.js";

const amount = process.argv[2] === undefined ? 64 : Number(process.argv[2]);
if (!Number.isInteger(amount) || amount < 2 || amount > 1000) {
  console.error("Uso: node scripts/compare-rounds.mjs [semillas: 2..1000]");
  process.exitCode = 1;
} else {
  console.log(`# Gateflow — cribado de complicaciones de rondas (${amount} semillas pareadas)`);
  console.log("Modelo simplificado de colas; NO es A/B con jugadores ni reproduce mapa, fallas o puntuación final.");
  console.log("| Experimento (B vs. A) | Δ atendidos | Δ abandonos | Δ tiempo (s) | Δ espera P90 (s) | Δ pico fila |");
  console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const pair of ROUND_AB_PAIRS) {
    const { metrics } = pairedSurrogateScreen(pair, amount);
    const f = (key) => (metrics[key].delta >= 0 ? "+" : "") + metrics[key].delta.toFixed(2);
    console.log(`| ${pair.id} ${pair.name} | ${f("cleared")} | ${f("abandoned")} | ${f("elapsed")} | ${f("p90Wait")} | ${f("maxQueue")} |`);
  }
  console.log("\n## Interacciones de dos complicaciones");
  console.log("Interacción = efecto conjunto − suma de efectos individuales (en unidades originales). Positivo en abandono/espera indica sinergia de riesgo.");
  console.log("| Escenario | Δ abandonos juntos | Interacción abandonos | Δ espera P90 juntos | Interacción P90 |");
  console.log("| --- | ---: | ---: | ---: | ---: |");
  for (const item of ROUND_INTERACTIONS) {
    const { metrics } = interactionSurrogateScreen(item, amount);
    const f = (value) => (value >= 0 ? "+" : "") + value.toFixed(2);
    console.log(`| ${item.id} ${item.name} | ${f(metrics.abandoned.together)} | ${f(metrics.abandoned.interaction)} | ${f(metrics.p90Wait.together)} | ${f(metrics.p90Wait.interaction)} |`);
  }
}
