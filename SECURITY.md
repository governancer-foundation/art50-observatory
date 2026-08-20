<!-- SPDX-FileCopyrightText: 2026 Agonist Development AB -->
<!-- SPDX-License-Identifier: CC-BY-4.0 -->

# Security Policy

## Reporting a vulnerability

**Do not report security issues via public GitHub issues.**

Email **security@governancer.com** _(to-confirm: this mailbox must be provisioned and monitored before first public release)_ with:

1. Affected version(s) of `@governancer-foundation/art50-observatory`
2. Reproduction steps
3. Impact assessment (severity, exploitability)
4. Optional: suggested fix or patch

If you prefer encrypted communication, request our PGP key in the first email and we will send it from the same address.

## Threat model (what this package is)

`@governancer-foundation/art50-observatory` is a pure library. It:

- makes **no network calls** and reads **no files**;
- has **no runtime dependencies**;
- holds no state between calls, and takes its timestamp from the caller rather
  than the clock.

That leaves a small surface, and the classes of issue that matter most are not
the usual ones. In rough order of severity:

- **A wrong verdict.** A profile for which the package reports that a duty does
  not apply when it does. This is the one that costs a user real money, and it
  is a security issue in the sense that matters here even though no memory is
  corrupted. Report it with the profile that triggers it.
- **Disclosure text that misleads.** Wording in any locale that does not
  faithfully convey what the paragraph requires.
- **Supply-chain issues** in the development dependency closure.
- **Resource exhaustion** from a pathological input, though the input is a
  small plain object.

## Response targets

| Event | Target |
|---|---|
| Acknowledge receipt | within 72 hours |
| Initial assessment | within 7 days |
| Patch for HIGH/CRITICAL | within 14 days of confirmation |
| Patch for MEDIUM/LOW | within 30 days of confirmation |
| Coordinated disclosure | by mutual agreement, default 90 days |

## Supported versions

Until v1.0.0 we provide security patches for the **latest minor release on `main`** only. After v1.0.0 we will support the two most recent minor releases.

| Version | Supported |
|---|---|
| `0.x` | Latest minor only |
| `1.x` (when released) | Latest two minors |

## Disclosure

We will:

- Credit the reporter (with their consent) in the release notes and GitHub Security Advisory
- Publish a CVE via the GitHub Security Advisory database for HIGH/CRITICAL findings
- Notify users via the npm package security alerts mechanism

## Out of scope

- Vulnerabilities in third-party dependencies — please report to the upstream
  project. We track these via Dependabot and ship patches when upstream releases.
- Disagreement with the reading of the Regulation itself, where the package
  states its reasoning and that reasoning is defensible. That is an issue, not a
  vulnerability — open one, with the provision you read differently.

## Bug bounty

We do not currently offer a paid bug bounty. Acknowledgement and credit are provided for all valid reports.
