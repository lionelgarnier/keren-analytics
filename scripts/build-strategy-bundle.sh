#!/usr/bin/env bash
#
# Regenerates docs/_strategy-bundle.md — the single-file knowledge bundle
# you drop into a Claude / ChatGPT Project for discussion-mode chats
# about naming, positioning, GTM, or roadmap.
#
# What this NOT does:
# - Does not include source code, KQL templates, or tests. The bundle
#   is intentionally about strategy + product, not implementation.
# - Does not push or commit anything. You commit the regenerated file
#   yourself when the upstream docs have shifted enough to justify it.
#
# Run via:
#   ./scripts/build-strategy-bundle.sh
#   # or
#   npm run docs:bundle

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
out="$repo_root/docs/_strategy-bundle.md"

# Files in priority order. Add or remove entries to reshape the bundle.
files=(
  "README.md"
  "docs/launch-strategy.md"
  "docs/product.md"
  "docs/vision.md"
  "docs/maintainer-todo.md"
  "docs/backlog/launch-readiness.md"
  "CHANGELOG.md"
)

cat > "$out" << 'HEADER'
# Keren Analytics — Strategy & Product Bundle

> **Generated artifact** — do not edit by hand. Regenerate with
> `npm run docs:bundle` or `./scripts/build-strategy-bundle.sh`.
>
> This file concatenates the seven docs you'd hand a strategy / GTM /
> marketing collaborator who'd never seen the project. It's the
> right-shaped knowledge for an LLM Project (claude.ai Project, ChatGPT
> custom GPT, etc.) when you want a discussion-mode chat about naming,
> positioning, launch sequencing, or roadmap.
>
> **What it does NOT contain:** source code, KQL templates, tests,
> `public/app.js`. Drop the upstream repo into a Project if you also
> need code-level context.
>
> **Files merged (in this order):**
> 1. `README.md` — the pitch.
> 2. `docs/launch-strategy.md` — GTM + traction gates.
> 3. `docs/product.md` — scope + audiences.
> 4. `docs/vision.md` — long-term direction.
> 5. `docs/maintainer-todo.md` — what only the maintainer can do.
> 6. `docs/backlog/launch-readiness.md` — current sprint status.
> 7. `CHANGELOG.md` — what's shipped.

---

HEADER

for f in "${files[@]}"; do
  if [[ ! -f "$repo_root/$f" ]]; then
    echo "warning: skipping missing file $f" >&2
    continue
  fi
  printf '\n\n=====================================================================\n# Source file: `%s`\n=====================================================================\n\n' "$f" >> "$out"
  cat "$repo_root/$f" >> "$out"
done

# Footer with the generation timestamp so a stale bundle is obvious.
printf '\n\n---\n\n_Bundle generated: %s_\n_Generator: scripts/build-strategy-bundle.sh_\n' \
  "$(date -u +'%Y-%m-%d %H:%M UTC')" >> "$out"

lines=$(wc -l < "$out")
echo "Wrote $out ($lines lines)"
