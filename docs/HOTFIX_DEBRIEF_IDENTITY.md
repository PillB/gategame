# Focused R04/R05 production hotfix — 14 Nov 2026

This change is intentionally smaller than draft PR #17. It preserves the production deterministic missions, timing, score and existing Pages workflow while addressing two independent state-integrity defects. It does **not** publish R06 or modify the private ChatGPT Site.

## Correctness defects and user-flow consequences

### HF-01: finished score could be paired with an unscored layout (P0)

**Precondition:** 28 passengers terminal; the debrief panel shows the score and fingerprint. **Bug:** `layoutLocked = elapsed>0 && !finished` reopened the background post editor while `finished` and `sim` still described the old completed game. Two late post selections could alter `edges` and the shared challenge fingerprint without recalculating the score. **Fix:** block post clicks/keys and precise D-pad selection after completion; canvas is static/removed from tab focus; focus is directed to the named, read-only debrief region, and explicit `Ajustar diseño` resets to editable mode. Also lock presets immediately after `running=true`, not only after the first timer tick. Do not change the score calculation or allow a finished layout mutation.

**Independent behavioral test:** `scripts/browser-smoke.mjs` runs a real Chrome Guided round, captures score and fingerprint, dispatches clicks on two adjacent valid post coordinates, and requires unchanged score and fingerprint; all post controls must be disabled. It then clicks `Ajustar diseño` and requires the canvas to become interactive. Removing the finished guard would fail this test.

### HF-02: duplicate physical belts in imported layouts (P1)

**Precondition:** a directed belt A→B exists. **Bug:** an imported/saved layout could also contain B→A, a second edge blocking the identical corridor crossing while consuming another logical connection and modifying replay fingerprint. Noncanonical post IDs such as `01:1` also parsed to numeric coordinates that could not be selected using the canvas's canonical IDs.

**Fix:** validate canonical integer post ID string and reject a second belt occupying the same unordered pair. A single reversed belt remains legal: it is a distinct directed allocation, but not a second physical obstruction. Existing invalid legacy imports now fail closed instead of being silently rewritten. Valid existing layouts remain compatible.

**Independent tests:** exhaustive 40 cardinal segments of 5×5 lattice; each standalone direction has a valid roundtrip; both together are rejected. Metamorphic check demonstrates one vs duplicate obstruction blocks the same crossing. Browser tests a malformed G1 challenge link and requires no comparable score ribbon.

## Four risk checks before public release

1. **Math/engine:** `npm test` full-round score fixtures and conservation; no post-physics or A* drift.
2. **Transition attacks:** 0-tick start lock; late edit invalid; invalid G1 challenge; reversible post selection remains available only after explicit return to Editing.
3. **Visual:** Chrome smoke and existing mobile 390px checks; role and focus during debrief. Native physical Safari/VoiceOver validation remains an independent gate.
4. **Build/publish:** original repository Pages artifact, exact SHA CI, then merge and check the deployed version and assets. Any failed stage blocks public release; do not reuse R06's green tests for this separate hotfix.

Trade-off: rejects formerly accepted **invalid** physical duplicates/aliases. The positive case for either direction alone and the previous deterministic scoring are explicitly tested. No D1, connection pooling, distributed locks or outbox are involved.
