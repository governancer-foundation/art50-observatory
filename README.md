# @governancer-foundation/art50-observatory

> Does a public deployment tell visitors they are talking to a machine? Observed from the outside, and reported as a record rather than a screenshot.

Article 50(1) of the **EU AI Act** requires a system that interacts directly
with people to inform them it is an AI system, at the latest at the time of the
first interaction. It is the least ambiguous of the transparency duties and the
only one observable without an account: on a public page it is a fact about the
markup a visitor is served.

## What it refuses to conclude

Not finding a disclosure is not the same as there being none, and this package
will not pretend otherwise. A notice can be painted by script after load, live
inside a third-party frame, or appear only once a widget is opened.

So every observation carries what was examined and what was not, and the
strongest negative it will state is **no disclosure was found in the served
markup** — a fact, where "the operator is in breach" would be a guess wearing a
fact's clothes. A page that defers its content to script produces no negative
at all.

That restraint is the point. An observatory that overstates once is an
observatory nobody cites again.

## Use

```bash
npm install @governancer-foundation/art50-observatory
```

```ts
import { analyse, toStatement } from "@governancer-foundation/art50-observatory";

const observation = analyse(html);
observation.finding;
// "disclosed" | "no-disclosure-found" | "inconclusive-client-rendered" | "no-interactive-surface"

const record = toStatement(observation, {
  url: "https://example.org/support",
  body: html,
  observedAt: new Date().toISOString(),
  observer: { name: "my-scanner", version: "1.0.0" },
});
```

The record is an in-toto statement carrying a conformance predicate, so it can
be signed and verified by tooling that already handles build provenance. A
screenshot proves nothing to anyone who was not there; a signed statement
naming the requirement, the outcome, the reasoning and the limitations does.

**Two halves, kept apart.** `analyse` is pure — markup in, observation out, no
network and no clock — so it can be tested exhaustively and its results
reproduce. Fetching is yours: this package will not decide for you what to
request, how often, or whether you are welcome to.

## What it looks for

A conversational surface is recognised conservatively: a dialog region that
names itself a conversation, an element named as a chat surface, a known
conversational widget, an input inviting a question. Search controls are
excluded outright — a false positive produces a finding about a duty that was
never raised, which costs an operator time to rebut and costs the observatory
its standing.

A disclosure is recognised in the wording
[`art50-disclosure-sdk`](https://github.com/governancer-foundation/art50-disclosure-sdk)
publishes, in all six of its languages, plus common phrasings nobody took from
us.

## The marking duty, too

Article 50(2) requires synthetic output to be marked in a machine-readable
format. `detectMark` reads a file's bytes and reports what it finds — from the
box each container reserves for a provenance manifest, and from the metadata
tag that names a generated source.

```ts
import { detectMark, toMarkStatement } from "@governancer-foundation/art50-observatory";

detectMark(bytes).finding;
// "signed-mark-present" | "unsigned-mark-only" | "no-mark-found" | "container-not-recognised"
```

**A signed manifest and an unsigned tag are not the same thing**, and this
reports them apart rather than adding them together. A manifest is
cryptographically signed, so tampering is detectable and the signature says who
asserted what. A metadata tag is a string: anybody can write one, anybody can
edit one. It is machine-readable, and it is not evidence — so only a signed
manifest reaches a positive finding, and a tag alone draws no conclusion at all.

Presence is not validity either. Finding a manifest means bytes claiming to be
one are there; whether the signature verifies needs the full verification
toolchain, which this package is not, and every record says so.

## Status

v0.1. The detector improves by meeting pages it gets wrong — the first real
page it was pointed at produced a false positive, which is now a test.

## License

**Apache-2.0** (see [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE)).

---

Maintained by **Alexander Brichkin (Agonist Development AB)**.
