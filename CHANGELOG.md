<!--
SPDX-FileCopyrightText: 2026 Agonist Development AB
SPDX-License-Identifier: Apache-2.0
-->

# Changelog

Notable changes to `@governancer-foundation/art50-observatory`, newest first.
Versions follow [Semantic Versioning](https://semver.org/); before 1.0 a minor
version may add, and does not break.

## 0.1.0 — 2026-08-20

First release.

### Added

- `analyse()` — does a public page tell a visitor they are about to talk to a
  machine? Pure: markup in, observation out, no network and no clock.
- `detectMark()` — does a file carry the machine-readable mark Article 50(2)
  requires? Reports a signed provenance manifest and an unsigned metadata tag
  **apart**, because both are machine-readable and only one is evidence.
- `toStatement()` and `toMarkStatement()` — observations as in-toto statements
  carrying the conformance predicate, so a supervisory reader gets something
  signable rather than a screenshot.

### What it will not say

Not finding a disclosure is not the same as there being none, and not finding a
mark is not the same as none being there. Every observation carries what was
examined and what was not; a page that defers its content to script yields no
negative at all; presence of a manifest is not validity of its signature.

An observatory that overstates once is an observatory nobody cites again.

### Found by pointing it at the real thing

Two of its tests exist because live pages produced answers the fixtures had not
imagined: a legal database whose search dialog read as a chat surface, and an
image host that returned an error page where a file was expected. Both would
have recorded an operator as failing a duty they were never under.
