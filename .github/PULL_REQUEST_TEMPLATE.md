<!--
Thanks for the PR! Fill out as much as is relevant — feel free to delete
sections that don't apply.
-->

## What changed

<!-- 1-2 sentences. Link the issue if any: Closes #123 -->

## Why

<!-- Motivation and context. Why this approach over alternatives? -->

## How

<!-- High-level summary of the implementation. New deps? Behaviour changes? -->

## Checklist

- [ ] `npm run build` passes (tsc emits `dist/` cleanly)
- [ ] `npx tsc --noEmit` passes (strict typecheck)
- [ ] Types are tight — no `any`, no unsafe `as` casts (other than `as const`)
- [ ] New source files carry the SPDX header (`Apache-2.0` + `2026 Agonist Development AB`)
- [ ] Conventional-commit message format (`feat:`, `fix:`, `docs:`, `chore:`, etc.)
- [ ] The no-network-egress / no-runtime-dependency / no-filesystem-access invariants are preserved (or the change is the agreed point of this PR)
- [ ] If a verdict or a disclosure wording changed, the body names the provision the new behaviour follows from
- [ ] **DCO sign-off present on every commit** (`git commit -s` — see CONTRIBUTING.md)

## AI-assistance disclosure

<!--
If any part of this PR was produced with AI assistance, disclose it here
(tool + scope). Do NOT add `Co-Authored-By:` AI-tool trailers to commits.
Write "None" if no AI assistance was used.
-->

## Breaking changes

<!-- "None" or describe the migration path. -->
