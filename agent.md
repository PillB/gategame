# Gateflow agent entry point — /agent.md

Read the single authoritative engineering and release contract at [`/AGENTS.md`](./AGENTS.md). [`/CLAUDE.md`](./CLAUDE.md) points here and to that contract.

**For every task and every newly introduced or changed round:** implement a behavior-changing test with a documented negative/counterfactual oracle, inspect the full user journey, register the expected/actual state transitions and side effects in [`/docs/STATE_MACHINE_AUDIT_LEDGER.md`](./docs/STATE_MACHINE_AUDIT_LEDGER.md), and run the exact-commit regression suite. Tautological code-text checks do **not** count as behavior tests.

**Mandatory `chore(lint)` cyclomatic gate:** keep each new `lib/**/*.js` function within 20 cyclomatic paths, enforced as an ESLint error by `npm run lint:complexity`. The gate includes an intentionally over-complex negative control that **must** fail the lint rule. Legacy `app/page.tsx` extraction is documented debt, not covered by that numeric ceiling yet.

```sh
npm run lint
npm run lint:complexity
npm run typecheck:pages
npm run test:rounds
npm run test:pages
node scripts/browser-smoke.mjs
node scripts/tick-visual-audit.mjs
```

Red-team every change in four distinct passes (state/math; adversarial event sequences; accessible/visible user flow; deployment/integration). If a fix hypothesis fails **once**, research comparable errors online and discriminate causes before altering the hypothesis. If a required external API, agent, browser or service is limited/unstable, **stop using that service** and mark the gate BLOCKED.

For every proposed design decision, explicitly ask why an expert would reject it; prefer the best evidence-based alternative and state all trade-offs. Do not add connection pooling, an outbox, or optimistic locks without real transactions or multiwriter requirements. See `/AGENTS.md` for full policy.
