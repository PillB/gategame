# Gateflow — Estrategia de colas aeroportuarias

Gateflow is a client-side, deterministic airport queue strategy game with a Spanish (Peru) interface. This repository preserves the original **Sites/Vinext/Cloudflare Worker** target while adding an independent, static **GitHub Pages** testing target. Neither build automatically publishes to the other platform.

The migration baseline was the Gateflow v5 Sites source at commit `8dbe2148b47d0d45aee5e5058f1717216d86608b`. Track later updates through the Git history and deployment `version.json` rather than assuming the live Sites and Pages deployments are identical.

## Requirements

- Node.js `>=22.13.0` (the GitHub Actions checks use Node.js 24)
- npm and a clean `npm ci` from `package-lock.json`
- Linux with `flock`, `curl`, and GNU `timeout` **only for the Sites-specific** `install:ci` and `build` wrappers

## Build, test, and run

| Command | Purpose |
| --- | --- |
| `npm ci` | Install exact, lockfile-pinned dependencies for normal development and GitHub Actions |
| `npm run dev` | Start the Vite/Vinext Sites development server |
| `npm run lint` | Lint the repository |
| `npm run typecheck:pages` | Type-check Pages gameplay and adapter without emitting files; Worker typings are intentionally outside this gate |
| `npm run test:simulation` | Test deterministic game logic |
| `npm run test:rounds` | Check 12 surrogate A/B parameter pairs and 8 interactions; validate 24 delight contracts, 36 story beats and two playable mission schedules with real-engine invariants |
| `npm run compare:rounds` | Print 128-seed paired difficulty-screening results; not a human A/B experiment |
| `npm test` | Test simulation, build the Cloudflare Worker, check its artifact and rendered page metadata |
| `npm run build:pages` | Compile independent static assets into `dist/pages/` with project base `/gategame/` |
| `npm run test:pages` | Build Pages and validate links, fonts, source revision, metadata, and assets |
| `npm run preview:pages` | Preview the Pages build locally; navigate to `/gategame/` |
| `npm run build` | Run the bounded, Sites-specific Vinext Worker build with artifact validation |
| `npm run validate:artifact` | Recheck the existing Worker artifact |

The GitHub Pages adapter consists of `index.html`, `src/main.tsx`, `src/fonts.css`, and `vite.pages.config.ts`. It mounts the same `app/page.tsx` gameplay component as Sites. Relative font URLs are bundled in place; do not import the generated `.vinext/fonts/**/style.css` into Pages because that CSS can contain build-machine absolute paths. Pages serves a static SPA and has **no server-side ChatGPT sign-in, Worker API, D1, or other private runtime service**. Any future gameplay feature requiring those services must be explicitly designed for this split.

`app/layout.tsx` and the original `vite.config.ts` remain the Sites/Worker entry point. The bounded Sites scripts under `scripts/` use project-scoped runtime paths, a single dependency install, a finite timeout, and artifact verification. Do not invoke the production Sites deployment simply to build or test Pages.

## Live deployment and privacy

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for an operator checklist. `.github/workflows/ci.yml` runs quality gates on pull requests and `main` pushes and **does not deploy**. `.github/workflows/static.yml` is the **canonical automatic Pages publisher** on `main` pushes: it installs from the lockfile, lints, checks TypeScript, runs the simulation and Worker artifact tests, builds the static Pages bundle, executes headless Chrome through all three presets (including mobile and challenge flows), uploads screenshot evidence, and publishes **only `dist/pages`** if every gate passes. `.github/workflows/pages.yml` remains an optional manually dispatched recovery workflow on `main`; do not run it concurrently with the automatic publisher. GitHub Pages Source must be **GitHub Actions**.

The expected public test URL is `https://pillb.github.io/gategame/`. Check `https://pillb.github.io/gategame/version.json` to compare the deployed 40-character source commit SHA against the GitHub Actions run. **Making the repository private later does not necessarily make its existing Pages site private**. Disable the Pages site (or migrate to an access-controlled host) once user acceptance testing is complete if the site must no longer be publicly accessible.

## Quality and content obligations

- Mechanics: one reproducible simulation seed and phase/turn result ledger; no claims of numerical accuracy without expected/actual tests.
- UI: enumerate each interactive control, branch, and keyboard/mobile flow with browser evidence.
- Language: visible copy, metadata, accessibility labels, errors, and help text in `es-PE` except brand proper nouns.
- Release: no deployment until unit, Worker artifact, static Pages artifact, responsive browser checks, and screenshots match the reviewed commit.

The source is browser-executed and local-state gameplay; browser storage can persist game saves. Test from a fresh incognito profile as well as an existing save, and do not rely on an old browser tab to verify a new release.

The [gameplay specification](docs/GAME_SPEC.md) defines the authoritative mechanics. The [later-round plan](docs/ROUND_EXPANSION_SPEC.md) and [delight ledger](docs/DELIGHT_LEDGER.md) propose 24 complications across 36 new episodes. **R04 and R05 have playable draft-branch prototypes but are not in the published site; R06–R39 are designed, not implemented.** The [QA ledger](docs/QA_LEDGER.md) distinguishes source, public Pages, human tests and pending gates. Resolve conflicting claims using tests against the exact deployed commit.

## Latest release and player acceptance

The public site is **a testing deployment**, not the private ChatGPT Site. Its revision marker is `/gategame/version.json`; compare that 40-character `sourceRevision` with the successful GitHub Pages Actions run. A green deployment alone is not external HTTP/browser verification. The GitHub-hosted Chrome run tests the compiled `dist/pages` artifact and retains screenshots, but final iOS Safari, touch/VoiceOver, real-share-sheet, external URL and human enjoyment checks remain open. See [latest release ledger](docs/RELEASE_LEDGER.md) and [open QA issues](https://github.com/PillB/gategame/issues).
