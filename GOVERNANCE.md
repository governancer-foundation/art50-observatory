<!-- SPDX-FileCopyrightText: 2026 Agonist Development AB -->
<!-- SPDX-License-Identifier: CC-BY-4.0 -->

# Governance

This document describes how the `governancer-foundation/art50-observatory` project
is maintained, how decisions are made, and how new contributors and maintainers
join the project. It is intentionally short: the project is in its first public
release stage, and governance complexity will grow only when contributor count
justifies it.

## Maintainer model

**Stage 1 (current — first public release).** The project is maintained under the
`governancer-foundation` GitHub organisation by a single primary maintainer:

- Alexander Brichkin (Agonist Development AB, Sweden, org.nr 559452-5726)

Day-to-day review and merge rights are held by the
`@governancer-foundation/maintainers` team (see `.github/CODEOWNERS`). Solo
maintainership is explicitly acknowledged as a transitional state, not a target.
The maintainer holds commit and release rights, reviews and merges pull requests,
and is responsible for security disclosures coordinated under `SECURITY.md`.

> **Note:** the `@governancer-foundation/maintainers` team referenced throughout
> this document and in `CODEOWNERS` must be **created in the
> `governancer-foundation` organisation** before CODEOWNERS-based review
> enforcement takes effect. Until the team exists, the primary maintainer is the
> effective reviewer.

**Stage 2 (target — by the second project milestone).** Recruit at least one
co-maintainer with independent commit rights, drawn from sustained contributors
(≥5 substantive landed PRs and demonstrated review quality) and from the
open-source compliance-tooling ecosystem at large.

The intent is to move the project from single-point-of-failure governance to a
small, stable maintainer team before the user base grows past the point where a
solo maintainer can responsibly handle security response.

## Decision process

**Stage 1.** Benevolent-dictator model. The primary maintainer makes the final
call on technical direction, dependency choices, license decisions, breaking
changes, and release timing. Public discussion happens in GitHub Issues and Pull
Requests; the maintainer documents the rationale of contentious calls in commit
messages or design notes.

**Stage 2 (once three or more active maintainers).** Transition to lazy
consensus: proposals stand unless a maintainer formally objects within a posted
review window. Disagreements escalate to maintainer vote; ties favour the status
quo.

## Code review

- All changes — including those from the primary maintainer — go through pull
  requests against the public default branch (`main`).
- Automated review runs first: CI (build via `tsc`, strict typecheck) plus
  token-free supply-chain checks (CodeQL, OpenSSF Scorecard, dependency review,
  gitleaks, SBOM) and the DCO check.
- A maintainer approval is required before merge. The primary maintainer's own
  PRs may be self-merged once all automated checks pass; this self-merge path
  will be removed in Stage 2 once a second maintainer is in place.
- Changes that alter what the package asserts about the law — how a paragraph
  resolves, which exemption lifts which duty, the wording of a disclosure —
  require explicit reviewer acknowledgement in the pull-request description,
  naming the provision the new behaviour follows from. So do dependency
  upgrades affecting trust boundaries and anything introducing network egress.

## Releases

- Versions follow [Semantic Versioning 2.0.0](https://semver.org/).
- Releases are tagged in git, published to GitHub Releases, and (when the package
  is marked publishable) pushed to npm as `@governancer-foundation/art50-observatory` with npm
  provenance.
- All **code** is released under the **Apache License 2.0**. SPDX identifiers are
  tracked per-file and mapped in `REUSE.toml` (REUSE 3.3).
- The package asserts a reading of Regulation (EU) 2024/1689; it is not legal
  advice and carries no warranty — see `NOTICE` and the licence.

## Maintainer succession and hand-off

If the primary maintainer becomes unable or unwilling to continue maintenance,
the project's preferred succession path is:

1. **Active co-maintainers, if any** assume primary responsibility by internal
   agreement.
2. **The `governancer-foundation` organisation** appoints a steward from the
   contributor community.

In the event neither path is available, the Apache-2.0 licence ensures that any
individual or organisation may fork and continue the project under their own
governance. The `LICENSE`, `NOTICE`, and per-file SPDX headers are sufficient to
support such a fork without further permission.

## AI-attribution governance commitment

This repository may use AI assistance during development and discloses that use
where applicable. The maintainer commits to:

- Preserve human author-of-record discipline (Alexander Brichkin under copyright
  law).
- Avoid `Co-Authored-By:` AI-tool or equivalent AI co-authorship trailers in
  commits.
- Require external contributors to disclose AI-assisted contributions in the PR
  description (see the AI-disclosure line in `.github/PULL_REQUEST_TEMPLATE.md`).

## Contribution requirements

External contributions are welcomed via Pull Requests. See `CONTRIBUTING.md` for
details. Key requirements:

- **DCO sign-off** on every commit (`git commit -s`)
- **Conventional Commits** format
- **No AI co-authorship trailers** in commits
- **AI-assisted contributions** disclosed in the PR description

## Contact

- General governance questions: <governance@governancer.com> _(to-confirm)_
- Security disclosures: see [`SECURITY.md`](./SECURITY.md)
- Code of conduct concerns: see [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) —
  enforcement contact `conduct@governancer.com` _(to-confirm)_

## History

For the project's working history, see the public commit log at
<https://github.com/governancer-foundation/art50-observatory/commits/main>.

## Updates

| Version | Date | Author | Change |
|---|---|---|---|
| v0.1 | 2026-06-17 | Alexander Brichkin | Initial governance document (adapted from ariada/ADOPTA for the single-package `@governancer-foundation/art50-observatory`). |
