# Gateflow v5 — current release ledger and falsifiable acceptance

**Scope:** Public temporary test repository `PillB/gategame`, distinct from the original private ChatGPT Site. This document supersedes obsolete historical rows in `QA_LEDGER.md`; original source comparator revision `8dbe2148b47d0d45aee5e5058f1717216d86608b`. A GitHub Actions success is evidence for the tested SHA, **not** blanket proof of a production URL or subjective enjoyment.

## Source, implemented changes and evidence

| ID | Area / owner | State | Evidence and next falsification |
| --- | --- | --- | --- |
| REL-01 | Public source provenance | PASS | Source transferred from private Sites baseline to public repo; no private Site deploy performed |
| REL-02 | Release pipeline | PASS | PR #5 replaces unsafe root upload with validated `dist/pages`; PR #8 adds mandatory GitHub-hosted Chrome gameplay test and screenshot artifact. [deployment run 41268819759](https://github.com/PillB/gategame/actions/runs/41268819759) succeeded on `97dab6c`. |
| REL-03 | Actual simulation math | PASS (CI) | [PR #10](https://github.com/PillB/gategame/pull/10) 53/53 tests, real app engine full rounds, per-tick conservation, no duplicate service, FIFO-on-arrival, walk interpolation, fault repair |
| REL-04 | Browser ↔ engine parity | PASS (CI build) | [run 41268568314](https://github.com/PillB/gategame/actions/runs/41268568314): Guided 868 at 42.9s; Serpentine 796 at 65.9s; Open Floor 933 at 47.8s, 25 cleared, 3 denied, 0 abandoned; ten Chrome screenshots, desktop + 390px |
| REL-05 | Shared challenge | PASS (source + CI browser) | `layout` + strictly bounded `beat` in canonical URL; recipient can edit starting design; win/tie/loss; score mismatch, malformed inputs and XSS-like strings rejected. No identity or tracking required |
| REL-06 | Optional native device share | PASS (source and payload tests), DEVICE BLOCKED | `Compartir reto` uses user-initiated Web Share API with copy fallback; no auto-contact or copy after explicit cancel. Real iPhone share sheet not yet manually checked |
| REL-07 | Replay score delta | PASS (PR source/CI), DEPLOY CHECK | [PR #12](https://github.com/PillB/gategame/pull/12), [run 41268991748](https://github.com/PillB/gategame/actions/runs/41268991748): 54/54 tests; Chrome verifies 868→796 (−72) and 796→933 (+137), no change to score rule |
| REL-08 | Mobile control sizing | PASS for enumerated controls in CI, TOUCH NOT TESTED | PR #12 checks selected button and summary targets >=44px at 390 width. Canvas post selection gestures not verified on real mobile |
| REL-09 | Remote public URL | BLOCKED | CI loads locally served built artifact; this environment cannot retrieve the live `https://pillb.github.io/gategame/` or `version.json`. Independent remote HTTP 200, SHA, fonts, JS/CSS and console evidence still required |
| REL-10 | Accessibility and full Spanish | PARTIAL | Main UI/canvas/incident samples in es-PE; full event-permutation copy inventory, screen reader, keyboard/focus and 200% zoom still not certified |
| REL-11 | Strategic balance | OPEN HYPOTHESIS | [Issue #9](https://github.com/PillB/gategame/issues/9): Open Floor 933 outscores other default layouts. Enumerate ≥200 one/two-belt perturbations and conduct novice playtest before concluding optimal strategy is trivial |
| REL-12 | Mobile canvas precision | OPEN | [Issue #11](https://github.com/PillB/gategame/issues/11): canvas model has small per-post tap radius and dense posts; measure real touch and zoom, correct without mis-targeting |
| REL-13 | Player acceptance, privacy transition | NOT STARTED | Human testers must confirm game is fun/understandable, sharing and faults work on their devices. Re-privatization/Pages disable requires separate explicit owner approval |

## Exact seeded balance — queue-walking rules

| Preset | Elapsed (unrounded) | Cleared/target | Denied | Switches | Faults | Repairs | Score | Auto-flag repairs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| División guiada | 42.9s | 25/28 | 3 | 11 | 2 | 0 | 868 | 2 repairs ⇒ 1000 (cap) |
| Serpentina | 65.9s | 25/28 | 3 | 35 | 2 | 0 | 796 | 2 repairs ⇒ 946 |
| Espacio libre | 47.8s | 25/28 | 3 | 13 | 0 | 0 | 933 | 0 repairs ⇒ 933 |

Reproduce with `npm ci && npm run lint && npm run typecheck:pages && npm test && npm run test:pages && node scripts/browser-smoke.mjs` on a supported Linux runner with headless Chrome. The browser CI accelerates wall-clock timers but preserves the engine's deterministic 0.1s steps.

**Important distinction:** a full-round Node test verifies passenger/repair invariants. A Chrome test verifies rendered control sequences and mobile geometries. Neither by itself proves that a physical touch or iPhone share sheet works, nor that the public remote URL is serving the exact new SHA.

## Player experience and growth experiment (pre-register, don't invent metrics)

The product loop is **design → predict → simulate → explain result → change one belt → compare score → optionally challenge a friend**. Changes already implemented: visible score ledger, concrete next move, explicit previous-run delta, deterministic score-to-beat links, native share on demand. No dark patterns, daily streak compulsion, forced invite or contact-list uploads.

Test with at least five inexperienced players: observe first belt edit without instruction, first round completion, comprehension that belts block walking, identification/flagging of a fault, explanation of score change and challenge-link usability. Use opt-in, manual observation; record real completion rates and friction. Proposed pass criteria: ≥4/5 finish first round without help; ≥4/5 correctly explain obstacle geometry and win/tie/loss; no blocking touch/UI issue; scores repeat; report uncertain subjective enjoyment rather than claiming virality.

Research: [GameFlow enjoyment model](https://doi.org/10.1145/1077246.1077253), [Apple Games HIG](https://developer.apple.com/design/human-interface-guidelines/designing-for-games/), [Xbox Accessibility Guidelines](https://learn.microsoft.com/gaming/accessibility/guidelines), [player agency study](https://doi.org/10.1016/j.entcom.2024.100754).

## Release / rollback decision

Before asking owner to approve final release: independent remote browser GET for `/gategame/` and `/gategame/version.json`, exact matching SHA and HTTP200 assets, mobile + desktop screenshots tied to the deployed SHA, real touch/clipboard/share sheet and completed playtest. If a blocker remains, keep the repo public test branch and the original private Site unchanged. Making repo private is not guaranteed to unpublish previously public Pages or cached clones; disable Pages separately after explicit approval.
