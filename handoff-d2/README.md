# handoff-d2 — Direction D v2 for `easy-analytics-for-azure`

Self-contained handoff for implementing **Direction D v2** in the
`easy-analytics-for-azure` codebase. Drop this folder into the repo
root (or anywhere under the repo) and feed `KICKOFF.md` to Claude Code.

## What's in here

| File / folder            | Purpose                                                                 |
|--------------------------|-------------------------------------------------------------------------|
| `KICKOFF.md`             | **Paste this into Claude Code as the kickoff prompt.** Complete brief. |
| `STYLE-GUIDE.md`         | Visual spec: tokens, type, spacing, per-component rules.                |
| `d2-snippets.css`        | Copy-paste-ready CSS, already mapped onto project tokens (`--accent`, `--surface`, etc.). |
| `d2-reference.html`      | Standalone vanilla-HTML reference of all 3 screens. Open in a browser to inspect the design pixel-by-pixel. |
| `screenshots/`           | PNGs of all 3 screens, light + dark. The ground truth.                  |
| `reference-jsx/`         | Original React source (read-only). Reference for layout + copy + helper math. **Do not port to the codebase** — the target is vanilla JS. |

## How to use

1. Open `handoff-d2/KICKOFF.md` in Cursor / Claude Code / your editor of choice.
2. Open `handoff-d2/screenshots/` in an image viewer alongside.
3. Optionally open `handoff-d2/d2-reference.html` in a browser for DOM inspection.
4. Have Claude Code follow `KICKOFF.md` § 4 step by step.

The implementation is **presentation-only** — no server, state machine,
KQL, or AI changes. See `KICKOFF.md` § 3 for the precise change boundary.
