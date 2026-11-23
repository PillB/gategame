// Atomic, bounded edit history for a single-player belt layout.
// All actions return a new immutable snapshot; no browser storage or clock
// callbacks occur inside the reducer. Live R06 edits use load (not edit) so
// the one-token rule can never be bypassed by Undo.
import { sanitizeLayoutGroups, findCorridorRoute } from "./simulation.js";

export const LAYOUT_HISTORY_LIMIT = 20;
const COLS = 15, ROWS = 12;

function cloneValidLayout(layout) {
  const clean = sanitizeLayoutGroups(layout, COLS, ROWS);
  if (!clean) throw new Error("El diseño del plano no es válido.");
  return clean;
}

export function createLayoutWorkshop(initialLayout) {
  return { edges: cloneValidLayout(initialLayout), past: [], future: [] };
}

export function layoutWorkshopReducer(state, action) {
  if (action.type === "clear") {
    if (!state.past.length && !state.future.length) return state;
    return { ...state, past: [], future: [] };
  }
  if (action.type === "undo") {
    if (!state.past.length) return state;
    return {
      edges: state.past.at(-1),
      past: state.past.slice(0, -1),
      future: [state.edges, ...state.future].slice(0, LAYOUT_HISTORY_LIMIT),
    };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    return {
      edges: state.future[0],
      past: [...state.past, state.edges].slice(-LAYOUT_HISTORY_LIMIT),
      future: state.future.slice(1),
    };
  }
  if (action.type !== "load" && action.type !== "edit") {
    throw new Error("Acción del editor desconocida.");
  }
  const next = cloneValidLayout(action.layout);
  if (action.type === "load") return { edges: next, past: [], future: [] };
  if (JSON.stringify(next) === JSON.stringify(state.edges)) return state;
  return {
    edges: next,
    past: [...state.past, state.edges].slice(-LAYOUT_HISTORY_LIMIT),
    future: [],
  };
}

// Preview is deliberately explanatory, NOT a score forecast: passengers can
// retry an entrance, choose neighboring queues and encounter staff changes.
// A route counts as reachable only when A* can cross the actual belt geometry
// from that entrance column to the top of its corridor.
export function summarizeLayoutAccess(layout) {
  const clean = cloneValidLayout(layout);
  const entrancesPerZone = COLS - 1, total = entrancesPerZone * clean.length;
  let reachable = 0, steps = 0;
  const byZone = [];
  for (let grid = 0; grid < clean.length; grid++) {
    let zoneReachable = 0;
    for (let entry = 0; entry < entrancesPerZone; entry++) {
      const path = findCorridorRoute({
        postCols: COLS, postRows: ROWS,
        start: `${entry}:${ROWS - 2}`, belts: clean[grid],
      });
      if (!path.length) continue;
      zoneReachable++;
      reachable++;
      steps += path.length - 1;
    }
    byZone.push(zoneReachable);
  }
  return { reachable, total, blocked: total - reachable,
    meanSteps: reachable ? steps / reachable : null, byZone };
}
