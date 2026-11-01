# Gateflow v5 — implementation contract and release strategy

Status: engineering specification for the public GitHub Pages testing fork. The original ChatGPT Site remains a separate, private deployment. No section marked as an acceptance criterion is evidence of passing until its test is recorded.

## Product and player promise

Gateflow is a single-player, deterministic airport queue architecture game in Spanish (Peru). Its distinctive decision is that retractable belts are **obstacles to walking**, not walking paths: the player creates navigable gaps through two 14 × 11 corridor-cell grids by connecting posts in the two 15 × 12 lattices. Two successive service phases model immigration and security. The player learns how routing, passenger patience, service variation, local queue selection, handovers and repairs interact.

The game should support the loop **understand → design → predict → simulate → observe → debrief → adjust → replay/share**. Each iteration changes player understanding or a controllable input; rewards are performance feedback, not artificial daily scarcity, variable-payment rewards, streak pressure or a paywall.

### Game phases and transitions

| Phase | Entry | Allowed interactions | Exit |
| --- | --- | --- | --- |
| Build | Fresh page, reset, debrief tune | Choose preset, edit cardinal belt, adjust speed, inspect guide | Start |
| Run | Start / resume | Pause, speed, inspect and flag faults, reset | Pause / resolved |
| Pause | Pause | Resume, speed, inspect faults, reset | Run |
| Debrief | All 28 outcomes terminal | Inspect exact score ledger, copy challenge, tune/reset/preset | Build |

Passenger transition: `grid1 → choice1 → walk1 (when changing lanes) → queue1 → service1 → grid2 → choice2 → walk2 (when changing lanes) → queue2 → service2 → done`, with terminal branches `turnedAway`, `left`, `failed`. Immigration failures cannot enter security. All agents must reach exactly one terminal state; no duplication or disappearance.

## Mathematical specification

At time `t`, let `spawned = active + cleared + failed + turnedAway + abandoned`. For a completed run `spawned = 28` and all 28 are terminal; no passenger is counted twice. Time advances in deterministic steps of `DT = 0.1` simulation seconds; speed buttons change *wall-clock* interval, not the simulated outcomes. Passenger event selection, layout fingerprint, arrivals, patience and worker characteristics are seeded, reproducible under identical configuration.

Post lattices contain `15 × 12 = 180` posts each, `360` across two zones. Traversable corridor cell lattices contain `14 × 11 = 154` cells each. A* paths traverse cardinal neighbor cells. A horizontal post belt at interior post row `y` blocks the cardinal *vertical* crossing between corridor rows `y-1` and `y`; a vertical belt at interior post column `x` blocks the corridor *horizontal* crossing between columns `x-1` and `x`. Border belts do not block an interior corridor crossing. Claims like “5.1× density” are **not specified** until a numerator, denominator and baseline are documented and independently calculated; the literal must not appear in player-facing UI in the meantime.

Each lane processes one passenger at a time; closed lanes do not start or advance a service. Queue service order must be FIFO by *queue entry time or monotonic assignment sequence*, not by passenger creation ID. A passenger changing from `choice` to `queue` receives a queue sequence, and a switch is an actual change of lane. A walking agent must never traverse a newly blocked corridor edge: on a fault or repair topology change, re-plan from its current cell before the next crossing, or use another deterministic physically valid transition. No sprite should teleport between desk lanes; if motion interpolation is deferred, do not claim “walks to the neighboring queue.”

### Score contract, 0–1000

Current implementation target (preserve numbers when introducing an explanatory ledger):

```
throughput = 700 * cleared / 28
pace       = finished ? max(0, 220 - 4 * max(0, elapsed - 45)) : 0
calm       = finished && abandoned == 0 ? 80 : 0
wayfinding = finished && retries == 0 ? 40 : 0
switches   = min(45, 3 * max(0, smartSwitches))
repairs    = 40 * max(0, repairs)
faults     = -35 * max(0, faultsLeft)
penalties  = -12 * retries - 20 * turnedAway - 30 * abandoned
score      = clamp(round(sum(components)), 0, 1000)
```

The UI must never call an uncapped `switches * 3 + repairs * 40` figure “score earned,” because switch credit caps at 45. A fault repair changes both the repair bonus and remaining-fault penalty: `+40 +35 = +75` per fault when all other components are held fixed. Two repairs can therefore change the final score by `+150`, subject to final 0–1000 clamping; describe the two terms separately.

Ranking: S ≥ 850, A ≥ 700, B ≥ 550, C ≥ 350, D otherwise. Medal text should disclose its condition and whether it is earned; do not imply every achievement contributes directly to score. Throughput milestone is `ceil(0.85 * 28) = 24` passengers.

## Design and audiovisual system

- **Map visual grammar:** blocked crossings as bright belts anchored on posts; open dotted corridors as walkable; two zones and seven desks per zone; distinct symbols for arrivals, service, errors, queues and the roaming purser. Color cannot be the sole encoding. The compass/keyboard instruction remains available and the board advertises click, arrows, Enter and Page Up/Down.
- **Sprites:** travel fill color, immigration outline and security hatch are separate data channels. Avoid hatch overlap at the smallest rendered scale; maintain foreground/background and halo readability. Worker sprites (square) and passenger sprites (round) use consistent size and shadow. A blocked transition must not be animated as physically valid.
- **Animation:** interpolate between valid waypoints and queue positions; avoid abrupt jumps when changing desk. Respect `prefers-reduced-motion` in CSS and consider a nonanimated board mode. Never make an action depend on animation timing.
- **UI:** a legible desktop main board, and an intentionally scrollable/zoomable board on narrow phones with a visible instruction; core controls, especially reset, must stay available. Make debrief accessible within the viewport without horizontal clipping. Target 44 × 44 CSS-pixel touch areas where feasible and WCAG AA contrast for body text. Disclose scroll/zoom limits honestly.
- **Spanish:** use `lang="es-PE"`, consistent `inmigración`, `seguridad`, `fila`, `cinta`, `mostrador`, `inspeccionar`, `reparar`, `turno`; avoid untranslated dynamic overlays and incident templates. Keep proper names and familiar A*/FIFO abbreviations. LocalStorage keys and challenge code syntax must remain stable for compatibility.
- **Psychology:** the player gets immediate confirmation on belt edits and fault flags, contextual incidents in the run, continuously visible objective/progress, and a terminal debrief of controllable decisions. Clear next action: **Ajustar una cinta / Compartir desafío**. Measured reward interval is tied to events and milestones, not random confetti. Keep accessible reduced speed, no punitive daily timers or monetized random rewards.

## Test and release ledger (source implementation is not proof of pass)

| Gate | Evidence required | Failure examples |
| --- | --- | --- |
| P0 simulation | Deterministic tests for A*, blocked belt topology, queue minima/stays, FIFO by arrival, shutdown/prep, faults/repairs, FOV, event selection, persistence codes | FIFO leapfrog; travel across new belt; stuck passengers |
| P0 conservation | At all ticks, `spawned = active + terminal`, all counters nonnegative, finish has 28 terminal, no double terminal transition | missing or duplicated agents |
| P0 score | Table-driven ledger equals returned score for zero, capped switches, unresolved fault, one/two repairs and score clamp | FLOW +105 but only +45 credited |
| P0 run lifecycle | All three presets complete at ×0.5, ×1, ×2; pause freezes simulated clock and counters; resume/replay deterministic; reset unlocks and retains layout | nondeterminism; pause drift; dead-end |
| P0 static deploy | Exact build SHA in tested Pages artifact; /gategame/ CSS, JS, favicon and challenge query load without 404 | default Vite base or Worker artifact |
| P0 Spanish | All DOM-visible and canvas strings, incident templates, metadata and clipboard scorecard in es-PE; automated scan plus human screenshot review | English overlay or truncated localization |
| P0 interaction | Test each visible preset, speed, Run/Pause/Resume, Reset, belt pair build/remove/invalid, keyboard navigation, fault flag, Copy/Tune, query import, localStorage restore | hidden reset, inert control |
| P1 accessibility | Keyboard-only run/edit, mobile board access, reduced-motion, touch controls, readable debrief, contrast evaluation | offscreen debrief, canvas lacks instruction |
| P1 visual QA | Desktop 1440×900 and phone ~390×844 screenshots at build/run/debrief/fault; inspect clipping, empty states, sprite color/hatch, queues | overlap or unreadable UI |
| P1 ops | CI tests/typecheck/lint/Pages artifact, green deploy, URL and commit mapping, browser console/network checks | action green but Pages 404 |
| UAT | Human test: one complete run, adjust/retry, fault repair, keyboard/mobile and Spanish comprehension | team has not confirmed acceptance |

Infinite layout permutations are not enumerable (up to 360 posts with cardinal connections and constraints). Instead combine exhaustive small-grid topology enumeration, pairwise control combinations, deterministic scenario seeds, property/invariant tests and hand-operated browser runs; never report “all permutations pass” based on three demos.

## Engineering seams

1. `lib/simulation.js` owns pure graph, queue-choice, score and deterministic event helpers. Maintain pure tests in `tests/simulation.test.mjs`.
2. `app/page.tsx` currently owns simulation orchestration (`tick`, stage transitions, fault handling), canvas and controls. Long-term, extract a pure `lib/game-engine` with serialized `GameState` and `step(state, action)`; this enables exact per-tick tests, replay snapshots and better performance. Do this as a separate, test-led change, not an unreviewed large refactor during migration.
3. `app/globals.css` owns responsive UI and motion styles. Prefer accessibility semantics and markup outside canvas where actions need screen-reader support.
4. The private Site uses Vinext/Cloudflare Worker; GitHub Pages uses a separate static Vite client entry with `base=/gategame/` and a narrow `dist-pages` artifact. Do not publish `.openai/hosting.json`, env files, tokens, login data, or generated Worker state to the public fork.
5. The deployment pipeline must report its exact commit SHA; a public Pages URL is *not* evidence until the browser actually loaded that candidate version.

## References and rationale

- [Game Accessibility Guidelines — full list](https://gameaccessibilityguidelines.com/full-list/): speed options, motor/touch accessibility, tutorials, contrast and avoiding color-only cues.
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages): dedicated build/upload/deploy, environment, Pages/OIDC permissions.
- [GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site): explicitly configure GitHub Actions and protect the deploy branch.
- [MDN Canvas accessibility](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Basic_usage): canvas drawing is not a substitute for accessible HTML controls and semantics.

## Supervisor's change order

1. Preserve exact v5 source provenance and document the new public-test privacy boundary.
2. Migrate/build the static Pages adapter and CI without breaking existing Site build.
3. Correct mechanics claims and simulation invariants (FIFO, dynamic route validity, score ledger) with pure tests.
4. Translate all UI/events/canvas/debrief/metadata to es-PE, then mobile/responsive and keyboard/touch checks.
5. Run deterministic source tests, static artifact and source audit, lint/typecheck/build; inspect diffs and secrets.
6. Publish to public `PillB/gategame` only after local checks; configure Pages/inspect Actions and verify the deployed SHA and all controls in an interactive browser with screenshots.
7. Present evidence plus an honest open-issue ledger and invite the user/team to perform UAT. Only after explicit successful UAT discuss changing repository privacy; never silently change the existing Site's audience.


### Inter-lane walking after queue choice (candidate in PR #6)

A passenger who changes desk cannot jump directly into the destination queue. The candidate uses deterministic `walk1/walk2` states with `duration = max(0.5, 0.65 * abs(destinationLane - originLane))` simulation seconds, a continuous interpolated sprite lane coordinate, and reservations counted in the destination queue's load while walking. A passenger is assigned a FIFO sequence only at queue arrival. A walking agent is never service-eligible before arriving. Staying at an original lane still joins the queue without travel. The walking interpolation is clamped to both endpoint lanes.

This changes the game balance and therefore requires full-round acceptance, not merely unit tests. No path may teleport across lanes, an unchanged seeded layout must reproduce exactly, and every passenger must resolve into one terminal state.

Verified Node/CI **draft-engine** baselines (run [41267680383](https://github.com/PillB/gategame/actions/runs/41267680383)): Guided 42.9 s, 25/28, 11 changes, 2 unresolved faults, 868 points; Serpentine 65.9 s, 25/28, 35 changes, 2 faults, 796 points; Open Floor 47.8 s, 25/28, 13 changes, 0 faults, 933 points. Early flagged faults: Guided two repairs => 1000 capped; Serpentine two repairs => 946; Open Floor none. These are fixture assertions in `tests/full-round.test.mjs`, **not published Pages/Chrome verdicts**.
