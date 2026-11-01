# Gateflow test deployment and acceptance checklist

## Targets and custody

| Target | Build command | Output | Authority |
| --- | --- | --- | --- |
| ChatGPT Sites / Vinext Worker | `npm run build` | `dist/server/index.js` and Worker files | Managed Sites lifecycle; **not** deployed by GitHub Actions |
| Public GitHub Pages test | `npm run build:pages` | `dist/pages/` | Manually dispatched GitHub Actions workflow on `main` |

The Pages build is a static HTML/CSS/JS client application. It does not provide authentication, API routes, server rendering, or database storage. Never move `.env*`, tokens, cookies, private test fixtures, or account-identifying data into `public/` or bundled client code. Before a public push, review tracked files and Git history for secrets and personal information; a deleted file remains in public Git history unless remediated.

The public fork deliberately uses `.openai/hosting.json` with `project_id: null`. The private v5 Sites project ID remains only in the untouched original source checkout and the private Sites control plane. This public repository does **not** have authority to deploy over the existing private Site.

## One-time GitHub settings

1. Confirm the repository URL is `https://github.com/PillB/gategame` and it is intentionally public **for the approved testing window**.
2. In **Settings → Pages → Build and deployment**, choose **GitHub Actions** as Source. GitHub may require an admin to enable Pages first. Keep only `main` eligible for release.
3. In **Settings → Environments → github-pages**, enable reviewer protection or branch policies if supported; permit `main` only. The Pages deploy job alone gets `pages: write` and `id-token: write` permissions.
4. Enable branch protection/rulesets for `main`: at least one independent approval and successful **Gateflow quality gates / Static, simulation, Worker and Pages checks**. Optional code scanning and dependency alerts are recommended.
5. Do not configure a custom domain unless the `base` path in `vite.pages.config.ts` and test expectations are deliberately updated for that domain.

## Candidate release sequence

1. Confirm upstream Sites snapshot/source provenance and inspect `git diff` for the intended scope; no private credentials in public repository or reachable assets.
2. Run `npm ci --no-audit --no-fund`, `npm run lint`, `npm run typecheck:pages`, `npm test`, and `npm run test:pages`. Record outputs and failures in the QA ledger. `npm test` independently validates the Sites Worker build; its Cloudflare ambient types are not part of the scoped Pages TypeScript check.
3. Run local browser/E2E tests against `npm run preview:pages` at `http://localhost:4173/gategame/`; inspect the console and network for errors; exercise keyboard, pointer, mobile viewport, reload, and each game phase. Retain screenshots.
4. Merge a reviewed PR to `main`; wait for green checks. From **Actions → Publish GitHub Pages test site → Run workflow**, select **main**, dispatch manually, and inspect both workflow jobs.
5. Open `https://pillb.github.io/gategame/` in a fresh browser profile, hard reload, check every user-facing Spanish string and control, and compare mechanics/visual evidence to the local test results.
6. Open `/gategame/version.json`, compare `sourceRevision` to the Actions run commit, and verify the HTML `gateflow-source-revision` meta equals it. Also verify returned content type, CSS/JS/font requests, and no broken route, asset, or console error. A green build alone is not proof of interactive gameplay correctness.
7. Invite human acceptance testing **after** the checks and screenshots are complete. Record pass/fail feedback and fix-and-retest the actual failing commit before calling the release ready.

## Rollback / privacy

- Rollback by reverting the faulty commit in a new reviewed PR and manually running the Pages deploy workflow on the restored `main`. Verify the resulting SHA marker.
- If testing is complete and confidentiality is required, **disable/unpublish GitHub Pages** under Settings → Pages, and check the URL becomes inaccessible. Changing a GitHub repository to private by itself is not a reliable way to restrict a formerly public Pages deployment.
- Do not automatically change the repository back to private without the explicit final human go-ahead; do not delete QA evidence or the release ledger.

## Release evidence to retain

| Field | Record |
| --- | --- |
| GitHub source commit (40-character SHA) | |
| Sites revision being compared | |
| CI run URL / conclusion | |
| Pages deploy run URL / conclusion | |
| Live `version.json` SHA | |
| Screenshots and viewport sizes | |
| Gameplay seed and expected/actual turn results | |
| Interactive/Spanish QA ledger link | |
| Human acceptance decision and timestamp | |

GitHub official guidance: [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite static deployment](https://vite.dev/guide/static-deploy.html).
