<!--
Thanks for opening a PR. A few quick checks before review:

- Read CLAUDE.md if you haven't — it lists the invariants PRs must respect
  (mock parity, no raw log persistence, state-machine transitions, KQL
  templating, cache keys, range whitelist, OAuth secret handling).
- `npm test` and `npm run audit:security` are both green locally.
- New routes have a supertest case; new KQL templates have a render test;
  new readiness signals cover both score branches.
-->

## Summary

<!-- 1-3 sentences. Why does this change exist? -->

## What changes

<!-- Bullet list of the user-visible / behavior-visible changes. Skip
     mechanical refactors unless they meaningfully shift the surface. -->

-

## Test plan

<!-- How did you verify this works? Bullet list, including manual UI checks
     for frontend changes. -->

- [ ] `npm test` passes locally
- [ ] `npm run audit:security` passes locally
- [ ]

## Notes for reviewers

<!-- Anything non-obvious: alternatives considered, follow-ups left for
     another PR, screenshots / GIFs for UI changes, perf implications. -->
