# Gateflow — implicit state machines and user-flow architecture

Audited 14 November 2026 from the R06 candidate in PR #17. This is a *source-derived design map*, not proof of real-world Safari/VoiceOver or human enjoyment. `docs/STATE_MACHINE_AUDIT_LEDGER.md` tracks conflicting, unreachable, redundant and unverified transitions. Diagram syntax: GitHub Mermaid.

## Boundaries, inputs, and version evolution

- **v5 Sites baseline:** airport belts obstruct corridor crossings. Static 15×12 post grid per zone and 14×11 walking cells. Two desks phases and deterministic passengers.
- **PR #10:** interpolated inter-lane walking, reservations and FIFO-on-arrival (replaces abandoned PR #6).
- **PR #13/main:** classic + R04 (four seven-person landings) + R05 (two fourteen-person landings), score feedback and a public *test* Pages build.
- **PR #17, draft:** R06 four seven-person waves 0/7/27/34, one optional *removal* of a visible belt after t=14s, honest scoring offsets, 12-profile mobile QA, clear debrief focus and responsive controls. Main/Pages is still R04/R05.
- There is **no slide deck** (`.ppt`, `.pptx`, or slide-output directory) in the inspected tracked tree. Visual evidence is GitHub Actions screenshots, not slides.
- Runtime domains: `app/page.tsx` React UI + engine, `lib/simulation.js` geometry/routing/score/queue selection, `lib/rounds.js` wave schedules/guards, `lib/challenges.js` share contract; static Pages `src/main.tsx`, original Sites Worker `worker/index.ts`. `db/index.ts` is optional D1 scaffold, not a current gameplay transaction boundary.

### S-1. Canonical layout import and physical-belt uniqueness (new negative-test state)

```mermaid
flowchart TD
  A[User edits or imports layout] --> B{Canonical integer post IDs in bounds?}
  B -->|No: alias, decimal or malformed| R[Reject invalid layout; do not create challenge]
  B -->|Yes| C{Endpoints cardinal and directed degree valid?}
  C -->|No| R
  C -->|Yes| D{One physical belt per unordered post pair?}
  D -->|No: A→B plus B→A| R
  D -->|Yes| E[Accept validated layout]
  E --> F[Share / store / run deterministic physics]
  F --> G[Route blocked crossings and draw belts]
  R --> H[Fallback to valid saved/default design]
```

**Failure mechanism found 14 November:** an original `A→B` plus reversed `B→A` passed directed one-in/one-out checks while rendering and blocking the **same** physical segment twice. Imported post strings such as `01:1` could parse to a numeric post but could not be selected by the canonical canvas node `1:1`. Both are invalid states. New entry guards use canonical `nodeId(x,y)` equality and an **unordered physical edge key**; a single A→B or B→A is still valid by itself because directed endpoint ownership remains a real editing constraint.

**Trade-off:** malformed legacy imported layouts are **rejected**, not silently repaired, to avoid mutating challenge geometry and score provenance. Existing valid G1 layouts, round rules and seeds retain their original meaning. Negative oracle: traversability with [A→B] must equal traversability with [A→B,B→A], so the latter must never become an independently accepted game state. Exhaustively test 40 segments in a 5×5 lattice, plus a deliberately malformed URL in the real browser.

### S0. Overall player session: guard-driven, not a collection of unrelated buttons

```mermaid
stateDiagram-v2
  [*] --> Hydrating
  Hydrating --> Editing: URL or local layout validated; fallback preset
  Editing --> Running: Start [snapshot initial layout]
  Running --> Paused: Pause button
  Running --> Paused: document becomes hidden
  Paused --> Running: Resume
  Running --> Finished: spawned=28 AND resolved=28
  Paused --> Finished: forbidden unless already terminal
  Finished --> Editing: Adjust design
  Editing --> Editing: preset / edit pair / select mission
  Running --> Editing: Reset (fresh 0:00; preserve current layout)
  Paused --> Editing: Reset
  Finished --> Editing: Reset
  Running --> Running: 0.1s tick, pace changes only wall time
  Paused --> Paused: speed setting, inspect/flag worker faults
```

**Guards and contracts.** `finished` derives from terminal passenger counters, not an independent flag. `gameLocked` is derived from `sim.elapsed`, `sim.running`, and `finished`; R06 removal is an explicit guarded exception. A reset preserves the current belt configuration but clears the run/token. Merely changing pace is **not** supposed to change outcomes. `document.visibilityState=hidden` pauses to avoid time advancement under background timer throttling. The debrief receives keyboard focus on completion; a real focus-trap/screen-reader audit remains open.

#### Finished-state read-only invariant (SM-20)

```mermaid
stateDiagram-v2
  state Editing {
    [*] --> SelectPost
    SelectPost --> ChangeBelts: valid cardinal edit
    ChangeBelts --> SelectPost
  }
  Editing --> Running: Start / snapshot starting layout
  Running --> Paused: Pause
  Paused --> Running: Resume
  Running --> Debrief: 28 final passenger outcomes
  Debrief --> Debrief: inspect score / copy / native share
  Debrief --> Debrief: post selection / canvas click [forbidden and ignored]
  Debrief --> Editing: Ajustar diseño / reset
  Debrief --> Editing: choose different mission or preset
```

The completed `score` and `layout fingerprint` are a single immutable *result snapshot*. A post edit directly from Debrief previously bypassed the intended `Ajustar diseño` transition because `gameLocked` became false at completion while the result panel remained visible. The board is now non-interactive in Debrief: disabled precise controls, unfocusable static canvas and an additional guard in `selectNode`. This is intentionally **not** an edit history/undo feature. The browser counterexample dispatches two well-formed post clicks after completion and demands an unchanged fingerprint and score; clicking `Ajustar diseño` must then restore editability. Valid mission/preset changes already reset the completed `sim` and remain available.

### S1. Passenger phase and retry automaton (28 independent agents)

```mermaid
stateDiagram-v2
  [*] --> Grid1: spawn at advertised arrival time
  Grid1 --> Choice1: valid A* corridor route reaches desk
  Grid1 --> Grid1: obstruction/fault changed / replan from current cell
  Grid1 --> Grid1: blocked / reverse to entry and try another distinct entry
  Grid1 --> Failed: entry options exhausted
  Choice1 --> Walk1: choose different nearby lane; reserve destination
  Choice1 --> Queue1: stay in current lane, FIFO sequence assigned
  Walk1 --> Queue1: physically arrive; FIFO sequence assigned
  Queue1 --> Left: patience threshold exceeded
  Queue1 --> Service1: first waiting, lane open and not busy
  Service1 --> Service1: worker closed or remaining service time > 0
  Service1 --> TurnedAway: adverse immigration outcome
  Service1 --> Grid2: accepted; new security grid route
  Grid2 --> Choice2: valid corridor path
  Grid2 --> Grid2: topology replan or return/retry
  Grid2 --> Failed: entries exhausted
  Choice2 --> Walk2: choose different lane
  Choice2 --> Queue2: stay / FIFO
  Walk2 --> Queue2: travel completed / FIFO
  Queue2 --> Left: patience exceeded
  Queue2 --> Service2: open desk / FIFO
  Service2 --> Done: service complete
  Done --> [*]
  Failed --> [*]
  TurnedAway --> [*]
  Left --> [*]
```

**Invariants:** `spawned = active + cleared + failed + turnedAway + abandoned`; `awaitingArrival + spawned = 28`; no service before a `walk` completes; queueSequence monotone and assigned on arrival; no passenger may occupy two service lanes or terminal states; physical corridor crossing must be unblocked when traversed. Retry is bounded by the distinct entry list, not an infinite reroute. UI sprites interpolate route and lane position from these states; the CSS `prefers-reduced-motion` media query disables purely decorative animations but not simulation logic.

### S2. Player's belt selection, live R06 exception, and fault repair

```mermaid
stateDiagram-v2
  [*] --> NoPost
  NoPost --> OnePost: choose post in migration/security
  OnePost --> NoPost: choose same post / cancel
  OnePost --> OnePost: choose different zone / replace selection
  OnePost --> NoPost: choose adjacent endpoint / valid edit in Editing
  OnePost --> OnePost: invalid cardinality or occupied endpoint in Editing
  OnePost --> NoPost: running, mark detected worker fault
  OnePost --> NoPost: running, no allowed action (explain why)
  state "R06 token available" as Available
  state "R06 token spent" as Spent
  [*] --> Available: t>=14 AND round=r06 AND spent=0 AND not finished
  Available --> Spent: choose base belt AND same belt visibly present in effective layout
  Available --> Available: choose missing/rotated-away belt / reject
  Spent --> [*]: no second live edit
```

```mermaid
stateDiagram-v2
  [*] --> BaseBelt
  BaseBelt --> Faulted: worker crosses; fault opens or rotates belt
  Faulted --> Flagged: player selects original/applied endpoints
  Flagged --> Repaired: purser in patrol state AND line-of-sight/FOV match
  Flagged --> Flagged: purser outside view, break or chat
  Faulted --> Faulted: player selects unrelated endpoints
  Repaired --> BaseBelt: effective layout recomputed from base + outstanding faults
```

**Race hazards:** `sim.breathEdits` and `breathSpentRef` jointly prevent two rapid clicks; **do not delete** the ref just because it mirrors a counter—first test fast double taps and synchronous render windows. Effective belts are recomputed from the base plus unrepaired faults, not persisted into the base. A fault removed an edge visually, so the R06 action must reject attempts to spend the token opening that same already-open crossing. A fault marker is a conditional intervention, not an immediate repair.

### S3. Worker shifts, incident feed, and render clock

```mermaid
stateDiagram-v2
  [*] --> Scheduled
  Scheduled --> Walking: elapsed>=startAt
  Walking --> Handover: elapsed>=arrival
  Handover --> Preparation: elapsed>=handoverEnd
  Preparation --> Active: elapsed>=reopen
  Active --> [*]
```

Worker stage is **derived from elapsed time**; there is no second authoritative worker-status object to synchronize. During `Handover` and `Preparation` the lane cannot start or advance service. A worker can create at most one fault because `faultedWorkers` remembers processed worker IDs. Purser state is a 26-second deterministic patrol/break/chat cycle; repairs require marked faults plus visibility and patrol. Event feed displays **3 latest** items although the engine currently retains 8; verify other consumers before removing that extra history.

### S4. Shared challenge, storage, and repeat loop

```mermaid
flowchart TD
  A[Open page] --> B{Valid encoded layout?}
  B -->|Yes| C[Decode original map; verify round and rule version]
  B -->|No| D{Valid local saved map?}
  D -->|Yes| E[Restore local map]
  D -->|No| F[Guided default]
  C --> G[Edit and simulate same fixed seed]
  E --> G
  F --> G
  G --> H[Debrief and score ledger]
  H --> I{Share action}
  I -->|Native share supported| J[User gesture: OS share sheet]
  J -->|Success| K[Link sent]
  J -->|Cancel| L[No automatic copy/send]
  J -->|Other failure| M[Explicit copy fallback]
  I -->|Copy| M
  M --> N[Clipboard success or selectable text fallback]
  H --> O[Adjust design and replay]
  O --> G
  K --> P[Friend opens starting-layout + rule + target score]
  P --> G
```

A shared R06 challenge with a live edit must encode the **initial** layout, not the final modified one, so the recipient can choose their own timing/removed belt. Invalid or incompatible round/rule combinations must never claim comparable results. Browser storage contains only the local layout and best score; no server queue or external outbox currently exists. Clipboard/native share can fail due browser permissions; canceling is a legitimate no-op.

### S5. Build/release state (separate from gameplay)

```mermaid
flowchart LR
  A[Candidate commit] --> B[Lint + 20-path lib ceiling]
  B --> C[Simulation + Worker + Pages]
  C --> D[Chrome journeys / 12 layouts]
  D --> E[Per-tick engine/image parity]
  E --> F{Physical UAT, review and release gates?}
  F -->|No| G[Draft PR / publish blocked evidence]
  F -->|Yes| H[Reviewed merge to main]
  H --> I[GitHub Pages verify/package/deploy]
  I --> J[Live version SHA and asset HTTP check]
  J --> K[Accepted public test release]
```

The public repository has no active DB writes, brokers, or multi-user shared mutable records. Do **not** introduce pooling, outbox, distributed locks or server synchronization without a new requirement and a failure scenario proving the need. The Cloudflare D1 helper is optional scaffold. Native fullscreen/200% pinch zoom and actual iOS Web Share require device tests; Chrome viewport emulation alone cannot certify them.

## Distinguish state from derived views

| Mutable source | Derived state/view | Risk if duplicated |
| --- | --- | --- |
| `sim` counters, `running`, `elapsed`, `breathEdits` | finished, locked, editable, remaining, score, medals | Conflicting “running but unlocked” and double token spending |
| `edges`, `sim.faults` | `effectiveEdges`, fingerprint, blocked corridors | Belts painted open but used as blockers or vice versa |
| `agents[].stage`, route, walkProgress, queueSequence | queued count, sprite position, FIFO service order | Teleportation, service-before-arrival, duplicate reservation |
| `roundId`, arrivals, wave timestamp | next arrival caption and score-clock adjustment | Ghost waves and misleading elapsed time |
| `selected` + board cursor | selected post outline/zone | Actions applied to an offscreen/wrong post |
| `previousRun`, `bestScore`, `challengeTarget` | delta text, challenge prompt | Comparing different mission/layout/rules as if identical |
| `storageReady` and localStorage | initial layout and best-score UI | Saving defaults before hydration or restoring invalid layouts |

## Loop/process inventory (boundedness and observable purpose)

| Loop or callback | Bound/invariant | User-observable purpose | Next falsifier |
| --- | --- | --- | --- |
| `setInterval(tick)` | stops when paused/finished/hidden, DT=0.1 simulated | advances passengers and score | tab-hide clock freezes; pace invariance |
| Arrival `while` | `spawned < 28`; arrivalAt monotone | all scheduled waves arrive | per-tick conservation and unique announcement IDs |
| Worker rotation `for` | fixed deterministic worker plan; once per ID | closures/rerolls/faults | no duplicate fault events |
| Each-agent `map(move)` | max 28 agents per tick | travel, patience, service, terminal resolution | no negative time or double counting |
| Two-phase `forEach` | exactly migration + security | local queue choices and FIFO | stays + switches equals total choices |
| Route exploration A*/fallback | finite 14×11 grid and bounded entry candidates | find legal path or retry visibly | no route through blocked belt |
| Canvas draw on React state | one output frame per state; CSS reduced motion | visual feedback, not independent physics | screenshot of before/during/after lane walk |
| `events.slice(-8)` then UI `slice(-3)` | 8 retained, 3 displayed | unseen five entries may be excess | prove other readers absent before trimming |
| `effectiveEdges` in worker fault selection | once per worker state snapshot | correct dynamic topology | zero score/tick delta after removing duplicate call |

## Evidence and methodological constraints

- Known exact baseline for the last verified R06 candidate before this audit: [CI #42260910862](https://github.com/PillB/gategame/actions/runs/42260910862), 57 Chrome viewport configurations and 1,670 per-tick frames. This is **not** automatic evidence for later code changes.
- Test a behavior independently against source-independent mathematics, actual browser outputs, or deliberately broken alternatives. Mutation testing is useful because a surviving broken variant exposes ineffective assertions: https://stryker-mutator.io/docs/
- ESLint cyclomatic complexity rule and numeric limit: https://eslint.org/docs/latest/rules/complexity
- Browser background throttling and visibility: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
- Share activation and cancellation: https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API
- Keyboard focus not obscured: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum

See [audit ledger](./STATE_MACHINE_AUDIT_LEDGER.md) for hypotheses, failure oracles, and release status.


## S6. Reversible preflight design workshop (candidate added 22 Nov 2026)

```mermaid
stateDiagram-v2
  [*] --> NoHistory: initial layout validated
  NoHistory --> UndoAvailable: valid post-pair edit / push prior layout
  UndoAvailable --> RedoAvailable: Undo / move current to future
  RedoAvailable --> UndoAvailable: Redo / restore future geometry
  RedoAvailable --> UndoAvailable: new edit / drop divergent future
  UndoAvailable --> NoHistory: preset, imported layout, mission reset or start
  RedoAvailable --> NoHistory: preset, imported layout, mission reset or start
  NoHistory --> NoHistory: invalid/no-op edit rejected
  UndoAvailable --> UndoAvailable: max 20 history snapshots / discard oldest
  NoHistory --> RunningLocked: Start simulation
  RunningLocked --> NoHistory: Reset or end-of-round tuning
```

The **authoritative geometry** is `layoutEditor.edges`, not an unrelated canvas copy. `layoutWorkshopReducer` applies validated immutable editing transactions, bounded undo and redo. `load` resets all history (including the mid-turn R06 belt removal), preventing the one-use token from being undone. `clear` preserves geometry but clears history for scored runs. The rendered `routePreview` is a pure `useMemo` over this geometry and enumerates 14 possible entry columns in **each** corridor. It reports reachability and **total additional steps beyond an unblocked straight corridor**; the engine also returns mean shortest-path length for mathematical tests. The cumulative metric preserves a one-step detour that a rounded mean would hide. It deliberately does not claim future queue waits or scores. Faulted belts during play are separately derived through `effectiveEdges`, so the workshop preview describes **base geometry** rather than forecasting worker faults.

A counterexample matters: one horizontal border belt visually exists but blocks zero interior corridor crossings, so the preview must stay exactly the same as an empty map. An interior full-row wall blocks 14/28 entry routes; opening one gap reconnects all 28 but increases average shortest-path length. Test both against actual A* in `tests/layout-workshop.test.mjs`, not against the number of belts. The Chrome first-use test makes a belt, checks a real preview change, undoes it, redoes it and restores the original fingerprint before running the original seeded score baseline. R06 live-edit and finished-state invariants remain separate gates.

**Scope of proof:** source and hosted Chromium tests only when green on the exact SHA; full iPhone accessibility and a human novice's comprehension remain unverified. Implementation references: `lib/layout-workshop.js`, `app/page.tsx`, `scripts/browser-smoke.mjs`. Progressive, contextual feedback rather than forced tutorial overlays follows [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) and [NN/g onboarding guidance](https://www.nngroup.com/articles/onboarding-tutorials/). The alternative 44px mobile controls align with WCAG's equivalent-target and enhanced target-size guidance; this is not native VoiceOver certification.


## S7. Shared-challenge versus personal-save provenance (candidate, 22 Nov 2026)

```mermaid
stateDiagram-v2
  [*] --> Personal: Fresh load / validated local map
  Personal --> Temporary: Open valid challenge layout
  Temporary --> Temporary: Edit, Undo, Redo, Start, Pause, Replay
  Temporary --> Personal: Save this layout explicitly
  Temporary --> Personal: Return to my saved layout
  Temporary --> Personal: Choose a different preset
  Personal --> Personal: Edit / auto-save local map
  state Temporary {
    [*] --> DraftOnly
    DraftOnly --> DraftOnly: localStorage writes forbidden
  }
```

The initial `?layout=G1...` URL is a **temporary puzzle**, not permission to overwrite the user's `gateflow-layout-v2` personal save. The existing hydration effect loaded the challenge and then eagerly wrote `edges` into the same localStorage key once `storageReady` became true. That is silent loss of the previous editor state. `temporaryChallenge` now explicitly gates the save effect. Players can play, edit, pause, reset or share in this temporary session without replacing their personal map; `Guardar este plano` opts into saving, while `Volver a mi plano` reloads the validated personal map, resets temporary game/provenance, and removes challenge-specific query arguments. Switching to a preset deliberately exits the temporary draft and becomes the new saved layout. A malformed or incompatible round/score never makes a score comparable, independently of whether a valid imported map remains temporary.

**Adversarial browser oracle:** seed `localStorage` with one personal belt, visit `?layout=G1&beat=947`, manipulate posts via real mobile D-pad, confirm the original storage string is unchanged; `Volver` must restore fingerprint and clear challenge URL; repeat import with R04 and explicitly `Guardar`, which alone must replace local storage with `[[],[]]`. Compare this to the old behavior: an automatic save after opening the link would fail before any player action. A true multi-tab write-conflict policy is still OPEN and should not be conflated with this temporary-provenance fix.
