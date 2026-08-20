<!-- SPDX-FileCopyrightText: 2026 Agonist Development AB -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Contributing to `@governancer-foundation/art50-observatory`

Thanks for your interest in contributing! This is a single npm/TypeScript
package: a library that resolves the transparency duties of Article 50 of the
EU AI Act and renders the disclosures they require. This document describes how
to set it up, our coding conventions, and the pull-request process.

The most valuable contribution is a **profile that produces the wrong verdict**.
The Regulation's exemptions do not line up paragraph to paragraph, and a
concrete case we get wrong is worth more than a feature request — it becomes a
test either way.

By participating, you agree to abide by our
[Code of Conduct](./CODE_OF_CONDUCT.md).

---

## Table of contents

- [Getting started](#getting-started)
- [Development workflow](#development-workflow)
- [Code style](#code-style)
- [Commit format](#commit-format)
- [Pull-request process](#pull-request-process)
- [Developer Certificate of Origin (DCO)](#developer-certificate-of-origin-dco)
- [Reporting bugs / requesting features](#reporting-bugs--requesting-features)

---

## Getting started

### Prerequisites

- **Node.js** `>=20` (use `nvm install` if you keep an `.nvmrc`).
- **npm** `>=10` (ships with Node 20+). This package uses **npm + `tsc`** — it
  is **not** a pnpm/turbo workspace.
- **Git** `>=2.40`.

### One-time setup

```sh
git clone https://github.com/governancer-foundation/art50-observatory.git
cd art50-observatory
npm ci          # reproducible install from package-lock.json
npm run build   # compiles src/*.ts → dist/ via tsc
```

### Verifying your setup

```sh
npm run build          # tsc — must emit dist/ cleanly
npx tsc --noEmit       # strict typecheck (no emit)
```

If both are green, you're ready to contribute. There is **no unit-test runner
configured yet** — the typecheck (`tsc --noEmit`) is the current correctness
gate. Do **not** add a test framework as part of an unrelated change; propose it
in a dedicated PR first (see [feature requests](#reporting-bugs--requesting-features)).

---

## Development workflow

```sh
npm run build       # one-shot compile (tsc)
npm test            # the suite, one pass
npm run test:watch  # re-run on change
npm run typecheck   # sources and specs
```

### Trying it locally

The package is a library — there is nothing to run. Exercise it from a scratch
file against the built output:

```sh
npm run build
node --input-type=module -e '
  import { planDisclosures } from "./dist/index.js";
  console.log(planDisclosures({ interactsWithPersons: true }, { locale: "sv" }));
'
```

### Changing a verdict

A change to how a paragraph resolves is a change to what the package asserts
about the law. Such a pull request must say, in the body, which sentence of
Article 50 the new behaviour follows from. A test alone is not enough: the
reasoning string the package returns is part of the output, and it has to match
the provision it cites.

### Adding a language

Wording must be reviewed by someone who speaks the language, not machine
translated. Keep it plain and formal: a disclosure that reads as marketing copy
defeats the "clear and distinguishable" requirement it exists to satisfy. Every
locale carries the same key set — the suite checks that.

### Adding a dependency

```sh
npm install some-pkg          # runtime dependency
npm install -D some-dev-pkg   # dev dependency
```

The package currently has **no runtime dependencies**, and that is a feature:
it is imported into other people's compliance paths. A pull request adding one
needs to justify it. Commit the resulting `package-lock.json` change in the
same pull request.

---

## Code style

- **TypeScript-first.** All source is TS, ESM-only (`"type": "module"`), compiled
  with the strict profile in `tsconfig.json`.
- **No `any`.** Prefer `unknown` plus a narrow type guard, or
  [`zod`](https://zod.dev) (already a dependency) for genuinely dynamic shapes.
- **Type-only imports** must use `import type`.
- **No network egress, no writes.** The server is read-only and makes no network
  calls. A PR that adds either will be rejected unless the change is the explicit
  point of the PR and has been agreed in an issue first.
- **SPDX headers.** Every new `.ts` source file starts with:

  ```ts
  // SPDX-License-Identifier: Apache-2.0
  // SPDX-FileCopyrightText: 2026 Agonist Development AB
  ```

  (In `src/index.ts` the `#!/usr/bin/env node` shebang stays on line 1, with the
  SPDX lines immediately after.)

---

## Commit format

We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

### Allowed types

| Type       | Use for                                                  |
|------------|----------------------------------------------------------|
| `feat`     | New user-facing feature                                  |
| `fix`      | Bug fix                                                  |
| `docs`     | Docs-only change (README, CONTRIBUTING, etc.)            |
| `chore`    | Tooling, deps, build config — no source-behavior change  |
| `refactor` | Code change that neither fixes a bug nor adds a feature  |
| `perf`     | Performance improvement                                  |
| `test`     | Tests only                                               |
| `build`    | Build-system / external-deps changes                     |
| `ci`       | CI configuration changes                                 |
| `style`    | Formatting / whitespace / lint-only fixes                |
| `revert`   | Reverts a previous commit                                |

### Examples

```
feat(locales): add Polish disclosure wording
fix(obligations): keep the deepfake branch when editorial control lifts the text branch
docs(readme): state that the marking itself is the caller's job
test(obligations): cover the public-crime-reporting carve-out
ci: pin scorecard-action by commit SHA
```

---

## Pull-request process

1. **Fork** the repo and create a feature branch:
   `feat/short-description` or `fix/short-description`.
2. Make your changes in small, focused commits. Each commit must build
   (`npm run build`) and typecheck (`npx tsc --noEmit`) cleanly.
3. **Run the local gates:**
   ```sh
   npm ci
   npm run build
   npx tsc --noEmit
   ```
4. **Sign off every commit** (see [DCO](#developer-certificate-of-origin-dco) —
   `git commit -s`).
5. **Open the PR** against `main`. Fill in the PR template, including the DCO
   sign-off checkbox.
6. **CI must be green.** CI runs the build + typecheck plus token-free
   supply-chain checks (CodeQL, OpenSSF Scorecard, dependency review, gitleaks,
   SBOM) and the DCO check.
7. **Get one approving review** from a CODEOWNER
   (`@governancer-foundation/maintainers`).
8. **We squash-merge** by default. The squash subject must be a valid
   Conventional Commit.

---

## Developer Certificate of Origin (DCO)

We use the [Developer Certificate of Origin v1.1](https://developercertificate.org/)
to confirm that contributors have the right to submit their work under the
project's licence (Apache-2.0).

You assert the DCO by adding a `Signed-off-by` line to **every** commit:

```sh
git commit -s -m "feat(locales): add Polish disclosure wording"
```

This appends:

```
Signed-off-by: Your Name <your.email@example.com>
```

`git config user.email` must match the email you use on GitHub. The DCO CI check
rejects PRs whose commits lack a valid `Signed-off-by` trailer.

> **No AI co-authorship trailers.** Do **not** add `Co-Authored-By: <AI tool>`,
> `Generated with <AI tool>`, or equivalent trailers. AI-assisted contributions
> are welcome but must be disclosed in the PR description (see the PR template),
> not encoded as commit co-authorship.

---

## Reporting bugs / requesting features

- **Bugs:** open a GitHub issue using the
  [Bug report template](.github/ISSUE_TEMPLATE/bug_report.md).
- **Features:** open a GitHub issue using the
  [Feature request template](.github/ISSUE_TEMPLATE/feature_request.md).
- **Security vulnerabilities:** **do not open a public issue.** See
  [SECURITY.md](./SECURITY.md) for our private-disclosure policy.

---

Thanks for contributing to verifiable, citation-checked compliance tooling!
