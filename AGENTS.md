# Gateflow engineering and review contract

Canonical instructions for agents, CI changes, round design, and release. Read this file first. Path: `/AGENTS.md`. `/agent.md` and `/CLAUDE.md` are pointers, not duplicate policies.

## Product and source of truth

- Spanish (Peru), deterministic, local single-player airport-queue game. Belts **block** corridor crossings; passengers move through open cells. Immigration and security are separate service phases. This is not a database-backed workflow.
- Read `README.md`, `docs/GAME_SPEC.md`, `docs/STATE_MACHINES.md`, `docs/STATE_MACHINE_AUDIT_LEDGER.md`, and `docs/RELEASE_LEDGER.md` before changing states.
- Runtime: `app/page.tsx`, `lib/simulation.js`, `lib/rounds.js`, `lib/challenges.js`; Pages: `src/main.tsx`, `vite.pages.config.ts`; original Sites Worker stays independent.
- The original private ChatGPT Site must never be changed by this repo's Pages pipeline. `main` publishes through `.github/workflows/static.yml`; no green CI badge alone proves the public URL, physical touch, or player enjoyment.

## Mandatory task and round acceptance

For **every task and every new/changed round**, create or update a ledger entry with: feature/bug hypothesis; source lines; explicit precondition/event/guard/next-state; a real user journey; observable expected result; at least one negative/counterfactual oracle; measured actual result; affected states and other features; reproducible command and exact SHA; screenshots when UI changes; and unresolved risks. A test that only repeats a source literal or that passes when the behavior is deliberately broken does not close a gate.

Run locally or via the hosted CI on the **exact candidate SHA**:
```sh
npm ci --no-audit --no-fund
npm run lint
npm run lint:complexity
npm run typecheck:pages
npm test
npm run test:pages
node scripts/browser-smoke.mjs
node scripts/tick-visual-audit.mjs
```
When the CLI environment cannot access Chrome, use hosted GitHub Actions once and inspect its logs/artifacts. Do not claim native Safari/VoiceOver validation from Chromium emulation.

### chore(lint): cyclomatic complexity gate

- The `lint:complexity` script and CI step **chore(lint)** must run on every PR and every `main` push. ESLint's `complexity` rule is **error**, maximum **20** independent paths per function for pure gameplay/round/challenge modules under `lib/**/*.js` (the enforced new-logic seam). Do not suppress or raise the cap to make CI green.
- Every **new** state-transition or round mechanic must be extracted into an appropriately small `lib/` function and checked by this gate. Add behavioral tests, not just a copied condition.
- `app/page.tsx` contains documented legacy debt (`Home`, `tick`, `move` mix React, simulation, and rendering). Do not add branch-heavy domain logic there; refactor with deterministic baseline tests. Extending the 20-path gate to this module is a tracked migration, **not a claim of present compliance**. If a change must touch legacy logic, record why it cannot yet be extracted and its coverage.
- The numerical cap is a guardrail, **not a quality score**. A function under the cap can still be wrong, redundant, slow, or contradictory.

### Expert challenge and explicit trade-off review

For every new mechanic, UI step, animation, data representation, test oracle, infrastructure pattern, and release decision:
1. Find an authoritative standard, a comparable successful implementation, or the strongest available empirical evidence. State *what a domain expert would reject* about the current proposal, not just its attractions.
2. Specify an alternative that an expert would accept, with a falsifiable user outcome or technical invariant. If the likely expert rejection can be avoided at reasonable scope, reject the weaker design. Do not optimize merely for the lowest implementation effort.
3. Record **every trade-off**: correctness, usability, scientific validity, performance, maintenance, accessibility, rollout and reversibility. State what is deliberately deferred; never silently count it as done.
4. Require meaningful negative tests: on geometrical grids, reverse an edge, duplicate a physical belt, alias a post ID, import incompatible URL rules, and compare the resulting *observable* behavior. For timing state, test hidden vs visible and fast repeat input. For scores, use independent conservation or published baselines.
5. Research references before modifying a previously failing hypothesis; if an essential external service is unavailable, mark it BLOCKED and stop calls to that service.

Reference starting points: [ESLint complexity](https://eslint.org/docs/latest/rules/complexity), [statechart transition guards](https://statecharts.dev/glossary/guard.html), [Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API), [WCAG 2.2](https://www.w3.org/TR/wcag/), [input normalization and validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html), [Playwright retrying assertions](https://playwright.dev/docs/test-assertions), and [Cloudflare D1 bindings](https://developers.cloudflare.com/workers/databases/connecting-to-databases/).

### Four independent red-team passes before release

1. **State and math:** enumerate allowed/forbidden transitions, zero/one/multiple edges, 0/14/last tick, counts, FIFO, score, faults, deterministic replays; assert conservation `spawned = active + cleared + failed + turnedAway + abandoned`.
2. **Adversarial integration:** pause/resume/reset/reroll while editing, worker faults and repairs, changing arrival waves, repeated taps, challenge with invalid rules, storage denial, canceled native share, hidden/background tab, rapid UI commands. Ensure negative tests would fail under a simple targeted mutation.
3. **Human-visible interaction:** real browser controls and text, screenshots/animations at start/transition/result, 12-device viewport matrix, scroll and 200% zoom, keyboard/focus, reduced motion, no offscreen actions or misleading copy. Simulated Chrome is not real iOS Safari.
4. **Release and resilience:** independently review PR/diff, other recent agent PRs and canceled/failed CI, verify HEAD/build SHA, deploy only when approved gates pass, check live URL/JS/CSS/version, publish evidence and rollback route. Log remaining P0/P1/P2; never mark manual gates PASS from code alone.

If a fix hypothesis fails **once**, stop guessing and search authoritative technical documentation and similar reports for the **exact error**, then record competing root causes, a discriminating test, and a revised hypothesis. Do not blindly retry. If a required external service, agent, API, quota, or browser is unstable/unavailable, stop calls to that resource, label that gate **BLOCKED**, and report the evidence to the user; continue only independent local tasks.

## Test quality (tautological tests considered harmful)

Reject: `assert.equal(code.includes("newFlag"), true)` as a claim that behavior works; a screenshot with no assertion; deterministic replay compared only to itself; or checking one score with no independently grounded oracle. Prefer independent physics equations, old exact baseline versus a changed input, negative transitions, browser DOM result, and mutation checks. Explicitly classify `PASS`, `FAIL`, `BLOCKED`, or `NOT TESTED`; never use a warning as a pass.

## Scope and architecture choices

- **No pool/outbox by default:** the currently deployed Pages game has no server DB transaction, broker, or multi-writer session. `db/index.ts` is an unused opt-in D1 scaffold. Add pooling, a transactional outbox, or optimistic concurrency **only after** introducing and justifying a real data path with concurrent writers or business events and a failure-mode test.
- Prefer a pure engine transition layer, typed events and guards, single source of truth for run/round state, and one frame clock. Avoid parallel derived booleans as independent mutable state.
- Avoid decorative complexity and unused computations. Prove a candidate no-op with dataflow search **and** an observable negative/counterfactual test before deleting it.
- Respect user workflows: `Cmd+Option+Q` on macOS may close the application; do not rely on that shortcut in test automation.
- Do not declare production ready while unresolved P0/P1 checks, physical-device accessibility/share gates, or reviewer acceptance remain open. State every trade-off and failed/blocked check in the release ledger.
