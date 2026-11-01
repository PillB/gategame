# Gateflow v5 — QA ledger and red-team findings

This ledger distinguishes **source tests**, **local interactive observations**, **live GitHub Pages observations**, and **user acceptance**. A checked source gate never proves an untested deployed build. The original private Site v5 is the comparator, not the public release candidate.

## Current reconciliation — 1 Nov 2026 UTC (supersedes historical snapshots below)

The earlier tables record real *past* blockers (initial file modes, 404, no walk stages); they should not be read as today's state. The current [release ledger](./RELEASE_LEDGER.md) remains the release source of truth. The public browser initially served `6bca549…` while `main` was `f4437f4`; a later reload served **`9eb26c4d7a8b20543226d06ed1c30e4d845ccbb5`**, which matched then-current `main`. A visible `Gateflow` page and Spanish controls loaded from `https://pillb.github.io/gategame/`. A real-browser Guided round finished at **25/28 cleared, 3 denied, 0 abandoned, 868 points**, matching its Node baseline. This proves the public *classic* build, **not** the draft R04/R05 levels. The original private Site was not changed.

| Ticket | Status | Evidence / explicit falsifier or next gate |
| --- | --- | --- |
| B-01 Public Pages 404 | **Resolved for navigation and SHA freshness at 9eb26c4**, asset HTTP gate OPEN | Cloud Chrome rendered the public game and fetched an exact `main` SHA. Still inspect independent JS/CSS/font response and run new candidate after review. |
| B-02 Full-round engine / FIFO travel | **PASS classic Node + real browser**, new levels CI pending | `tests/full-round.test.mjs` preserves Guided 868, Serpentine 796, Open Floor 933 with deterministic walking; cloud Chrome Guided 868/25/28 matched, while new round branch still requires own CI. |
| B-03 Surprising/whimsical complications | **24 proposals inventoried, 2 playable draft** | `docs/DELIGHT_LEDGER.md` gives each M01–M24 a surprise, an intervention/reward and negative gate; every R04–R39 has an anecdote, choice and payoff; `tests/round-delight.test.mjs` rejects missing entries, not subjective boredom. |
| B-04 R04/R05 arrival engine | **PASS local deterministic tests, NOT shipped** | R04: 4×7 at 0/11/22/33s; R05: 2×14 at 0/9s; source-state conservation/replay/announcements checked with 3 layouts. Browser-smoke now includes both, not yet run in CI for this branch. |
| B-05 Comparable shared missions | **PASS unit, UI pending** | New links carry `round=r04/r05&rules=waves-1`; old G1 links remain v5; unknown versions cannot display comparable challenge score. Test browser receiver, clipboard, native device share. |
| B-06 Fair score/strategy | **Score schedule bias fixed in next candidate, human balance OPEN** | Root cause: R04's last landing is 15.48 s later than classic, yet original 45 s speed threshold treated this forced idle as poor skill. `scoredElapsed` subtracts the schedule offset, with real elapsed still displayed. New deterministic baselines: R04 Guided 856/Open Floor 932; R05 Guided 866/Open Floor 810 (one abandonment). Comparisons and bests remain mission-specific. Prove in current CI; test perceived fairness with players. |
| B-07 Live device experience | **Earlier draft CI PASS; per-tick candidate OPEN** | Run 41271237550 passed classic+R04+R05 Chrome, 390px mobile controls and versioned challenges, with images. New candidate adds one JPEG per 0.1-second tick, browser↔engine counts/score parity and event-stage NDJSON; execution and visual inspection still pending. Real device touch, 200% zoom and screen reader remain OPEN. |
| B-08 Human enjoyment / viral share | **NOT STARTED** | Preregister 5–8-person usability pilot then one-factor A/B with sufficient N; measure comprehension, spontaneous retry, enjoyment, frustration, optional share and actual referral, without instrumentation before consent. |
| B-09 Release safety | **NOT APPROVED** | Keep PR draft, no merge, original private Site unchanged, no repo privacy changes, owner playtest only after exact SHA/UAT gates. |

**Definition of completion:** Every blocker closes only against the falsifier in its row, never because a script exits 0 or a theme sounds delightful. For the two new rounds, closure also requires the owner to play them and say whether the timed forecast creates a worthwhile decision.

## Provenance and release fields

| Field | State |
| --- | --- |
| Comparator: ChatGPT Site | Private v5, revision `8dbe2148b47d0d45aee5e5058f1717216d86608b` |
| Transfer destination | Public testing repository `PillB/gategame` |
| Public fork manifest | Site `project_id: null`; no production Site deployment rights |
| GitHub source commit | Pending first public commit |
| GitHub Actions CI/deploy | First CI run `41259084918` failed with exit 126 (Git file modes), fix pending rerun; Pages not dispatched |
| Deployed `version.json` and browser SHA | Pending live verification |
| User acceptance, post-testing privacy decision | Pending; do not change permissions or disable Site without user |

## Test executions in the development clone

| Area | Observed result | Scope | Next evidence |
| --- | --- | --- | --- |
| Pure mechanics | 42/42 named tests PASS (12 added over original 30) | Source, Node JS | Confirm CI commit SHA |
| Score regression | Source tests match score breakdown across 800 cases; 2 repairs 796 → 946 (+150); switches capped at 45 | Source | Screenshot expanded ledger, compared live |
| A* blocked crossings | Tests check both belt orientations and invalidation of newly blocked steps; orchestrator re-plans from current cell | Source + code review | Fault-triggered interactive scenario, no crossed wall |
| FIFO | Pure selector chooses earlier queue sequence even when passenger IDs or array order disagree; app now assigns sequence on queue entry and uses helper | Source + integration review | Per-tick browser or engine-level invariant test |
| Vinext Worker build/SSR | `npm test` PASS after sequential clean repeat; accidental overlap with a previous concurrent build produced a stale SSR chunk transiently | Local production build | CI isolated job validates independently |
| Static Pages adapter | `npm run test:pages` PASS, `/gategame/` JS/CSS/font/favicon paths, Spanish metadata, SHA/version artifact | Local bundle | Live Pages asset requests |
| Static TypeScript | `npm run typecheck:pages` PASS after tick union/queue typing fixes | Pages scope | CI typecheck on uploaded source |
| Lint/diff | `npm run lint`, `git diff --check` PASS | Local source | CI and final diff |
| Open Floor ×2 | Local browser: 25/28 attended, 3 rejected, 0 abandoned, 0 stranded, score **947 / S**, 00:43, 14 queue switches, FLOW 42 | Live local dev preview | Repeat on deployed SHA; screenshot |
| Presets | Local browser clicked Guided, Serpentine, Open Floor; fingerprint changes and restores | Local UI | Repeat on deployed SHA |
| Speed | Local browser clicked ×0.5, ×1, ×2 and verified `aria-pressed=true` | Local UI | Measure simulation-time invariance across speed |
| Map editing | Keyboard Enter/Arrow created/removed belt; fingerprint changed/restored; noncardinal connection rejected with Spanish message | Local UI | Pointer/touch, both zones, already-used endpoints |
| Run/pause | Local browser paused, simulator clock remained `00:00` over successive checks; resume control was visible | Local UI | Pause mid-wave and compare all counters |
| Share | Local browser clicked **Copiar desafío**, UI acknowledged success | Local UI | Verify clipboard payload and incoming URL on deployed origin |
| Debrief | Local browser expanded ledger; 625 + 220 + 80 + 40 + 42 − 60 = **947**, exact | Local UI | Screenshot, mobile view |
| Spanish | Page/canvas/metadata/incident templates translated; screenshot and AX text checked at build/run/debrief | Manual sample + source scan | Full player-facing copy inventory on Pages |
| Guided and Serpentine full rounds | Previously compared private Site results 867/S and 796/A; in-progress local Guided run reset by dev hot reload after a manifest edit | Comparator only / incomplete current candidate | Complete both on candidate and deployed Pages |
| Mobile + reduced motion | CSS media queries and visible reset/viewport debrief implemented; no measured narrow-width browser session yet | Code review only | Phone screenshots/keyboard/scroll QA |
| GitHub Actions, Pages, UAT | No remote deployment or UAT yet | Not started | Remote execution, screenshots, feedback |

## Root causes addressed

1. **False FIFO claim:** `app/page.tsx` previously selected the first matching array element (`findIndex`), effectively passenger spawn order. Corrected to a queue-entry sequence and pure FIFO helper.
2. **Stale route after worker fault:** a route created before a belt rotated was not checked against the live crossing. `move()` now checks each next step and replans from the current cell.
3. **FLOW number not equal to scoring credit:** banner used `switches*3 + repairs*40` even when the switch credit capped at 45. Banner now uses `scoreShiftBreakdown()` components; the debrief exposes all penalties.
4. **Unsupported geometry marketing:** replaced “5.1× density” with countable 180 posts and 154 walkable cells per zone.
5. **Unreachable mobile reset/debrief:** legacy CSS hid reset and positioned summary offscreen; overrides maintain reset and use a viewport-fixed scrollable debrief, with horizontal-map guidance.
6. **English user-facing content:** translated UI, canvas, events, worker hints, rank/medals and share cards, with es-PE document language and Spanish metadata. This is a source-language claim pending full live copy enumeration.
7. **Pages/Worker deployment mismatch:** original Vinext build emits a Worker, not a static Pages site. Added dedicated Vite static entry and release trace marker. Removed development-preview metadata from production.
8. **Border connection feedback misstatement:** a belt along an outer post row or column does not block a crossing between *interior* cells. Confirmation now distinguishes border belts from interior blockers.
9. **CI permission regression introduced by transfer:** the first public tree was created with Git mode `100644` for every file. The original source has `100755` on four `scripts/*.sh`; CI exited 126 because `scripts/build-verified.sh` tried to execute `scripts/sites-env.sh`. Restore those file modes in the next tree/commit and check them before installing dependencies.

## Remaining risk register (must not silently call DONE)

| Priority | Risk / issue | Validation or corrective task |
| --- | --- | --- |
| P0 | GitHub Pages source not enabled / workflow not run / site 404 | Configure GitHub Actions publishing, inspect exact Actions steps and HTTPS URL |
| P0 | Complete-game conservation only tested through examples, not every tick of every topology | Extract pure `step` game engine, snapshot tests, assert `spawned = active + terminal` at all ticks |
| P1 | Queue switch changes sprite lane immediately; there is no inter-lane walk animation | Model a travel state/waypoint interpolation and test no teleport/service-before-arrival |
| P1 | Offline/small-mobile screen-reader game-board editing remains demanding | Mobile viewport, keyboard and assistive technology user tests; consider DOM grid and zoom affordance |
| P1 | Full Spanish text inventory not yet scraped from public Pages including expanded debrief, clipboard and all incident permutations | Source/static scan + browser capture across scenarios; correct accents, truncation and variants |
| P1 | GitHub Actions branch protections/security configuration not yet verified | Inspect remote Jobs/settings; set least privilege and release approver where available |
| P1 | Score is clamped to 1000; positive components could exceed cap yet the ledger shows raw bonuses | Show clipping note (present), test exact round/clamp at bounds; disclose if points not all banked |
| P2 | Core orchestration remains in React page rather than a pure game engine | Extract `lib/game-engine.ts` as a separate test-led refactor; no giant unverified rewrite |
| UAT | Team has not playtested candidate in Spanish and approved acceptance | Invite the team only after complete remote testing; obtain explicit results before privacy changes |

## Manual interaction checklist for a tester

- [x] Presets: guided, serpentine and open floor update the fingerprint; a run locks the preset choices.
- [x] Speed: ½, 1× and 2× are visibly exclusive and selected state updates.
- [x] Keyboard: Enter select, arrows navigate, Enter connect/remove, invalid diagonal displays localized rejection.
- [x] Run/pause control changes label/status; paused clock freezes at inspection.
- [x] Debrief: rank/medals and exact score ledger available; copy button confirms click; tune returns to build mode.
- [ ] Browser: pointer editing in both zones, same-node deselect, PageUp/PageDown, existing outgoing/incoming rejection, border message.
- [ ] Browser: midrun freeze of score, clock and queues; resume to identical outcome; reset preserves belt layout, clears run.
- [ ] Browser: live fault click/flag, purser cone repair, with/without repair and accurate score arithmetic.
- [ ] Browser: incoming challenge query and localStorage persistence; invalid query safe fallback; copy payload validated.
- [ ] Browser: 390×844 and 1440×900 visual/scroll; debrief all controls in viewport, no horizontal page overflow outside intended map.
- [ ] Browser: full Guided/Serpentine runs ×0.5/×1/×2 sampled, no console/network errors, each outcome terminal.
- [ ] Live: exact GitHub Pages SHA, success CI, HTTPS assets, Spanish dynamic text and screenshots.
- [ ] Human: a tester confirms clarity, fun, fairness, feedback, accessibility and next-step affordance; log findings, fix, retest.

Do not equate a checked box with complete combinatorial coverage. The mathematical state space includes far more belt arrangements than can be exhaustively clicked; use property tests, covering arrays, deterministic seeds and targeted adversarial setups.

## Follow-up release ledger — challenge-and-coaching branch (31 October 2026 Peru)

Source baseline: `a0b71646b9cec9a05da1329bc954afd976b40db6`. This section supersedes the stale 'first public commit pending' metadata above. Latest confirmed `main` GitHub CI: run `41259242890` **PASS** (the earlier run failed due to missing shell executable bits). GitHub Pages site `https://pillb.github.io/gategame/` remained unpublished / 404 at previous browser check. No UAT or privacy change.

| ID | Status | Evidence and falsifiable closure |
| --- | --- | --- |
| P0-PAGES | BLOCKED | Repository must be configured to publish from GitHub Actions; dispatch manually after tested source lands on `main`. PASS only on successful Pages deployment plus 200 response and exact SHA in browser. |
| P0-PR-CI | RECHECKING | First PR run 41264399812 passed all checks (46 mechanics/challenge tests); a newer run must pass after the unwinnable-challenge correction. |
| VIR-URL | IMPLEMENTED, RECHECKING CI | `lib/challenges.js` builds `layout` + `beat` URL and strips third-party query/hash; `tests/challenges.test.mjs` covers strict boundary/error inputs. |
| VIR-RECEIVER | IMPLEMENTED, NOT YET VERIFIED IN BROWSER | `app/page.tsx` uses shared layout as a starting point; belt edits retain the target, preset replacement exits the challenge; compares win/tie/loss after completion. |
| FUN-COACH | IMPLEMENTED, NOT YET VERIFIED IN BROWSER | One prioritized, observable next-round experiment in debrief. Verify it fits within 390 px viewport and explains next action without claiming guaranteed win. |
| FULL-ENGINE | BLOCKED | Previous isolated local candidate reportedly had full-round state invariants; its changes are not part of this GitHub branch. The GitHub `main` source still needs that engine/refactor and associated tests before full release claim. |
| ACCESSIBILITY | NOT TESTED LIVE | Screenshot contrast, keyboard, assistive access, mobile debrief and reduced-motion manual matrix. |
| USER-UAT | NOT STARTED | Invite owner only after deployed SHA regression and no P0 blockers; do not privatize until owner agrees. |

See [GROWTH_AND_PLAYTEST.md](./GROWTH_AND_PLAYTEST.md) for research, the acceptance matrix, and non-coercive sharing design.

## Later-round research and screening (31 Oct 2026, Peru)

| ID | State | Verified evidence | Explicit remaining gate |
| --- | --- | --- | --- |
| RND-SPEC | DESIGNED | [ROUND_EXPANSION_SPEC.md](./ROUND_EXPANSION_SPEC.md) details 24 complication candidates, 36 proposed rounds, deterministic schemas and user A/B hypotheses | No new mechanics integrated; owner review needed |
| RND-PROXY | PASS, **surrogate only** | 12 one-factor comparisons + 8 two-factor interactions, 128 paired seeds, conservation and deterministic replay under `lib/round-experiments.js`; comparison command prints signed deltas | Extract authoritative `tick` and validate full maps, movement, score, UI and actual enjoyment separately |
| RND-AB-PLAYERS | NOT STARTED | Pilot and A/B-PLAYER-1..4 pre-registered as proposals; no consented subjects, assignments, or real engagement logs | Conduct UAT first; do not call any proxy result an A/B win |
| RND-RELEASE | NOT STARTED | No new round-specific UI, game configuration, deployment or live browser verification. Current `main` has `walk1/walk2` and Node full-round baselines; those are **existing mechanics**, not new rounds | Build a single vertical slice, CI, exact Pages SHA, responsive/accessibility review, owner playtest |

### Critical design correction (PR #1)
A fixed seed with unchanged belts has a fixed score. Requiring the exact shared layout for a win would make a score-to-beat challenge unwinnable. The receiver must be able to modify the **starting** layout and still compete against the original score. Falsifiable test: identical layout ties; modified layout can win, tie or lose, and selecting an unrelated preset exits the challenge. This correction is source-implemented and awaiting final PR CI and deployed browser evidence.


## Queue-walk candidate evidence — CI source tests, not deployed

| Gate | Result | Reproduction / remaining work |
| --- | --- | --- |
| Real-engine full-round conservation | **PASS** [run 41267594103](https://github.com/PillB/gategame/actions/runs/41267594103) | Three presets, repeated seeded runs, every 0.1-s tick conservation and occupied-counter uniqueness; paused simulation/renderer unaffected |
| Exact numeric baseline + repairs | **PASS** [run 41267680383](https://github.com/PillB/gategame/actions/runs/41267680383) | Logged 868/796/933 defaults and 1000/946/933 with instant fault marking; verify fixed snapshots on latest CI |
| Queue travel never teleports | **PASS in engine invariant** | `queueWalkLane` clamps and moves at ≤0.1/0.65 lanes/tick, stage `walk1/walk2` completes before service, arrival FIFO, destination load reserved |
| Browser sprite interpolation, responsive controls | **BLOCKED/NOT TESTED** | Chrome local navigation administrator-blocked; pending GitHub-hosted browser screenshots on compiled PR |
| Published source SHA and owner playtest | **BLOCKED/NOT TESTED** | Candidate deliberately unmerged; last public main remained stable until separate CI-reviewed updates |

**Release policy:** do not merge until latest draft CI is green, browser evidence for actual movement exists, all score changes are documented, and there are no regression findings. The original private Site remains unchanged.
