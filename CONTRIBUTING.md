# Contributing to Keren Analytics

Thanks for considering a contribution. This file is intentionally short —
the project conventions live in [`CLAUDE.md`](CLAUDE.md), the architecture
in [`docs/`](docs/), and the rationale for what's in/out of scope in
[`docs/launch-strategy.md`](docs/launch-strategy.md) and the per-track
backlog files under [`docs/backlog/`](docs/backlog/).

## Quick start

```bash
git clone https://github.com/lionelgarnier/keren-analytics.git
cd keren-analytics
npm install
npm run dev                   # mock mode → open http://localhost:3000
```

That's the whole loop: clone, install, run, open the browser. The dev server
boots in **mock mode** — a deterministic sample dataset — so you need no Azure
account and no `.env` to click around the real data flows. New to the codebase?
[`ARCHITECTURE.md`](ARCHITECTURE.md) is the human-oriented map.

The other commands you'll use:

```bash
npm test                      # 180 tests, native node:test runner
npm run audit:security        # repeats the launch-time security checks
```

## Mock mode vs real Azure mode

Behaviour is driven by environment variables. Copy the template and edit:

```bash
cp .env.example .env
```

- **`AZURE_MODE=mock`** (the default) — sample data, no credentials. This is
  what tests run against and what you should develop against unless you're
  specifically touching the live Azure client.
- **`AZURE_MODE=real`** — OAuth against your own Entra ID app and Application
  Insights resource. The three-command setup lives in
  [`docs/setup-entra-id.md`](docs/setup-entra-id.md). You only need this to work
  on `src/providers/azure/realClient.js` or the OAuth flow.

[`.env.example`](.env.example) documents every variable (`SESSION_SECRET`,
`AI_PROVIDER`, the Azure OAuth/Foundry keys, the mock toggles). The
[`mockClient`](src/providers/azure/mockClient.js) and
[`realClient`](src/providers/azure/realClient.js) expose the same surface — keep
them in sync (the "mock parity" invariant).

## Finding a first task

[`docs/good-first-issues.md`](docs/good-first-issues.md) lists starter tasks
anchored in real files — difficulty ranges from 30-minute cosmetics to small
self-contained features, each with the files to touch and acceptance criteria.
The same tasks are filed on the tracker under the
[`good first issue`](https://github.com/lionelgarnier/keren-analytics/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
label. Comment on the issue to claim it before you start so we don't double up.

## Filing issues

- **Bug?** Open a *Bug report* (a structured form will guide you).
- **Idea or feature?** Open a *Feature request*.
- **Just a question?** Open a *Question*. It's fine — we'd rather answer
  than have you guess.
- **Security issue?** Do not file a public issue. See
  [`SECURITY.md`](SECURITY.md) for the private reporting path.

## Pull requests

1. **Read [`CLAUDE.md`](CLAUDE.md) first.** It documents the invariants
   that PRs must not break (mock parity, no raw log persistence,
   state-machine transitions, KQL templating, cache keys, range
   whitelist, OAuth secret handling).
2. **Branch off `main`.** `main` is the deployed branch — pushes trigger
   the Azure Container Apps deploy via
   [`.github/workflows/deploy-azure.yml`](.github/workflows/deploy-azure.yml)
   (OIDC) — so PRs are reviewed and merged rather than pushed directly.
3. **Add a test.** New routes get at least one supertest case in
   `tests/api.test.js`; new KQL templates get a render test in
   `tests/kql.test.js`; new readiness signals get coverage in
   `tests/readinessScore.test.js`. The pre-existing patterns are easier
   to copy than to re-invent.
4. **Keep `npm test` and `npm run audit:security` green.** The audit's
   posture checks (no sensitive logging, no surprise fs sinks, npm
   audit clean) are the trust narrative — please don't paper over a
   regression by allowlisting it without justification.
5. **No new top-level dependencies without justification.** Current
   deps are intentionally minimal (`express`, `helmet`, `express-session`,
   `dotenv`). When in doubt, write the ~50 lines instead.
6. **Commit messages**: short imperative subject, body explains the *why*
   over the *what*. `git log` for the existing flavor.

## Out-of-scope shortcuts

The project deliberately defers a few categories of work — listed in
[`CLAUDE.md`](CLAUDE.md) under "Known gaps". Don't fix them
opportunistically inside an unrelated PR:

- Database / Redis (Phase 3 territory).
- Frontend bundling / minification.
- Multi-cloud connectors (Phase 4).

If you have a strong reason to address one of these, please open an issue
first so we can scope the change.

## Code of Conduct

Participation in this project is governed by the
[Contributor Covenant](CODE_OF_CONDUCT.md). Reports of unacceptable
behavior go to garniel6@gmail.com.

## License

By contributing, you agree that your contributions will be licensed under
the project's [MIT License](LICENSE).
