# Gateflow — gameplay enjoyment, fair challenges, and viral-loop experiments

Status: Proposed design/measurement contract, **not** proof of player enjoyment or virality. All changes remain separate from the private ChatGPT Site. Source branch: `feature/falsifiable-challenges-20261031`.

## Mechanic-focused enjoyment

The existing core is **design → predict → run → observe → debrief → move one belt**. New features should reinforce agency and legibility, not create extra taps, artificial scarcity, addictive streaks, paid rewards, or forced contact-list access. A CHI 2024 preregistered study (n=1,699) found curiosity and legible success-dependent feedback important, while overamplified feedback may reduce agency: https://doi.org/10.1145/3613904.3642656 .

**Implemented candidate:** after every finished round, show a single, measurable next experiment chosen from actual fault, route, abandonment, timing and switch counters. A shared URL stores the **exact belt layout** plus a score to beat (`?layout=G1...&beat=NNN`). On load, preserve the starting map fingerprint and score target. **Let the recipient edit the map to beat the target**: replaying the unchanged deterministic layout can only tie. On completion, display win, tie or loss using integer score difference; a tie is not a win. Selecting an unrelated preset exits the challenge. No account, opponent ID, player name or remote leaderboard needed.

**Fairness limitation:** the source code uses a fixed scenario and seeded rules; an unchanged layout must reproduce its score, so players must be allowed to edit belts to beat an opponent. The score is deterministic only with the same simulation implementation, fixed seed and game rules. A later balancing patch can change the outcome; until versioned rule sets are added, compare score-to-beat within the currently deployed build and disclose when rules change. Challenge links and cards do not prove anti-cheat identity, server verification or persistent leaderboards.

## Falsifiable acceptance and release gates

| ID | Test method | Required observable outcome | Gate |
| --- | --- | --- | --- |
| VIR-01 | Copy scorecard at end of a 947-point run | URL has valid `layout`, `beat=947`, no unrelated URL params or private identifiers; copied text includes same URL | Unit + browser paste |
| VIR-02 | Open link in clean profile | Board fingerprint matches sender, challenge ribbon says 'Supera los 947 puntos' | Browser |
| VIR-03 | Edit one belt after loading challenge | Challenge remains active as an optimization challenge and says the design was adjusted; if an unrelated preset is selected, exit the challenge | Unit + browser |
| VIR-04 | Finish unchanged layout, then improved layout | Unchanged deterministic replay ties at 947; edited layout can score 948 (win +1), 947 (tie), or 946 (miss −1) | Unit + browser |
| VIR-05 | Corrupt `beat`: `1001`, `-1`, `01`, `Infinity`, `<img>` | No target accepted, layout may still load safely, no script injected | Unit + browser |
| VIR-06 | Corrupt or oversized `layout` | Decoder fails closed, saved/default layout safe, no crash | Unit + browser |
| FUN-01 | End with unresolved fault | One recommendation to flag early; no guaranteed points claim | Unit + browser |
| FUN-02 | End with no faults but retries | One recommendation to open a route | Unit + browser |
| FUN-03 | Run Guided, Serpentine, Open Floor at ½×, 1×, 2× | Same seeded terminal counts and score for a given layout; no duplicated service | Engine + browser |
| FUN-04 | 390×844 and 1440×900 viewports | Ribbon, coach and share controls visible without occlusion; no horizontal viewport overflow except scrollable map | Screenshots + geometry |
| FUN-05 | Clipboard unavailable | Selectable fallback shows full challenge link; no false 'copied' success | Browser via permission mocking |
| FUN-06 | Screen reader and keyboard-only | Ribbon and outcome announced; no focus trap, maps still operable | Manual accessibility |
| P0-DEPLOY | GitHub Pages Settings → Build & deployment = GitHub Actions, dispatch `pages.yml` from main | Pages workflow succeeds, `/gategame/` is HTTP 200 with expected revision manifest | Live network and browser |
| P0-CI | PR tests for source branch | Lint, types, 42+ engine tests, challenge tests, original Worker and static Pages build all green | GitHub Actions |

**Failure policy:** FAIL has a concrete reproduction and evidence. BLOCKED means an external permission/tool limitation. NOT TESTED cannot become PASS on the basis of a source scan. Keep screenshots, JS console errors, deployed SHA and actual expected/observed states with every live finding.

## Playtest protocol (not analytics tracking)

Recruit five people unfamiliar with Gateflow. Give them the game without verbal explanation. Observe first edit, first completed shift, first discovery of faults, then give them a friend's score-to-beat URL and ask for one retry. Record (with their consent) whether they can explain why their score changed, whether they understand belts block crossings, completion, ability to share, and which control was confusing. No hidden telemetry is required.

Pre-register **hypotheses, not fabricated success claims**: ≥4/5 complete a first round without assistance; ≥4/5 can distinguish belts from paths; ≥4/5 correctly describe share challenge win/tie/loss; median frustration rating ≤2/5; no blocker at 390 px; all sampled scores reproduce. If any fails, log the issue and retest after a focused fix.

## UX/accessibility references

- CHI 2024: https://doi.org/10.1145/3613904.3642656
- Apple game HIG (minimum touch size and legibility): https://developer.apple.com/design/human-interface-guidelines/designing-for-games/
- Game Accessibility Guidelines, text contrast (4.5:1 normal text): https://gameaccessibilityguidelines.com/provide-high-contrast-between-text-ui-and-background/
- GitHub Pages workflow publishing setup: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## Remaining design backlog (do not mark done)

1. P0: Pages site is still 404 until GitHub Pages is configured and deployed from `main`. The GitHub Actions code alone does not enable the repository setting.
2. P0: Candidate branch must pass PR CI and be reviewed before merging.
3. P1: Full live browser matrix (three presets × three speeds, small phone + desktop; fault events; share import/paste) after publish.
4. P1: Add honest event-based sprite interpolation for lane changes; avoid instant jumps. Do not imply that an animated walk is implemented without testing it.
5. P1: Visual Polish — motion, animation affordances, desk visibility, feedback contrast, and touch targets need screenshot measurement and owner playtest.
6. P2: A/B test different non-coercive feedback timings only once a baseline exists; do not add artificial rewards to manufacture retention.
7. UAT: Owner must explicitly approve the public candidate before any final privacy change. Turning the repository private may not retract already-public copies, forks, or cached Pages content.
