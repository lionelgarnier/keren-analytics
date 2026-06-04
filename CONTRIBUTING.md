# Contributing to Keren Analytics

Thanks for considering a contribution. This file is intentionally short —
the project conventions live in [`CLAUDE.md`](CLAUDE.md), the architecture
in [`docs/`](docs/), and the rationale for what's in/out of scope in
[`docs/launch-strategy.md`](docs/launch-strategy.md) and the per-track
backlog files under [`docs/backlog/`](docs/backlog/).

## Quick start

```bash
npm install
npm test                      # 180 tests, native node:test runner
npm run dev                   # mock mode by default
npm run audit:security        # repeats the launch-time security checks
```

The dev server runs in `mock` mode without any Azure credentials. Real
Azure mode is documented in [`docs/setup-entra-id.md`](docs/setup-entra-id.md).

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
