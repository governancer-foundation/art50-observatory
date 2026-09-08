<!--
SPDX-FileCopyrightText: 2026 Agonist Development AB
SPDX-License-Identifier: Apache-2.0
-->

# Roadmap

What this observatory intends to become, and what it deliberately will not.

Dates are quarters, not promises. An item moves to **shipped** only when it is
released and documented; nothing is marked done because it is written.

The measure this project is trying to earn is being citable. Everything below
is ordered by that: a capability that would let the observatory say more, but
say it less defensibly, loses to one that lets it say less and be believed.

## Shipped

- ✅ Observation of Article 50(1) in served markup — is there a surface a person
  interacts with, and does the page say the counterpart is a machine
- ✅ Four findings rather than two, so "we could not tell" never reads as a
  verdict, and a client-rendered page produces no negative at all
- ✅ Detection of the Article 50(2) mark where a container reserves a place for
  one, distinguishing a signed manifest from an unsigned tag anybody can write
- ✅ Every observation carried as a conformance record naming what was **not**
  examined, so it can be checked by someone who was not there
- ✅ The exclusion protocol obeyed before anything is requested, with an
  unreadable rules file read as a refusal rather than as permission
- ✅ Retrieval under stated limits, and a survey that paces itself per host at
  whatever interval the operator asked for
- ✅ A command-line runner, because a finding nobody can reproduce is a press
  release

## Next (Q4 2026)

- 📋 **A published first survey.** The observatory's premise is that nobody
  measures this systematically. The premise is worth nothing until there is a
  corpus: a named, reproducible list of public deployments, the records, and
  the list of what was declined and why. Scope and sampling get published with
  it — a survey that does not say how its subjects were chosen is an anecdote
  with a total.
- 📋 **A right of reply, before anything is published.** An operator whose page
  produced a negative should hear it from us first, with the record attached
  and the response bytes we read. A finding published without that is an
  accusation, and one wrong accusation costs the observatory the standing that
  makes the rest of it worth doing.
- 🚧 **Rendered-page observation.** Today a page that paints its notice by
  script produces no conclusion, which is honest and is also most of the modern
  web. A headless renderer would turn many of those into findings. Gated on the
  record being able to say clearly that a renderer was used and which one,
  because otherwise reproducibility quietly leaves.
- 📋 **A stable predicate URI.** The records carry a provisional predicate type.
  It becomes stable when the shared schema settles it, and the observatory
  follows rather than leads that decision.

## Later (2027)

- 📋 **Longitudinal records.** The interesting question is not how many pages
  disclose today but whether the number moves as the duty starts to bind.
  That needs the same list observed on a schedule, and records that can be
  compared without re-litigating the method each time.
- 📋 **Article 50(3) and 50(4)**, where they are observable from outside at all.
  Emotion recognition and deep-fake labelling mostly are not, and an
  observatory that guessed at them would forfeit the credit earned on 50(1).
- 📋 **A supervisory-authority view.** Once designations are settled across
  member states, records can be grouped by who would act on them. Gated on
  those designations existing.

## Not planned

- **A verdict of non-compliance.** The strongest negative this project will
  state is that no disclosure was found in the markup served. Whether an
  operator is in breach is for an authority, and a tool that said otherwise
  would be trading its usefulness for a headline.
- **A league table.** Ranking operators invites optimisation against the
  detector rather than disclosure to visitors, and the detector would lose.
- **Anything behind a login, or any interaction with a surface.** Observation
  here means reading what a page serves an ordinary visitor. Creating accounts
  or talking to somebody's assistant to see what it admits is a different
  activity with different ethics, and this is not the project for it.
- **Ignoring an exclusion file.** Including for pages we would very much like
  to measure.

## How to influence this

Open an issue with a URL and what the observatory got wrong about it. A page
that produces the wrong finding is worth more than a feature request; it
becomes a fixture either way. Operators who believe a record about their site
is mistaken should say so on the issue tracker, and the response bytes the
record was drawn from will be there to check.

## Update history

| Version | Date | What changed |
|---|---|---|
| 1.0 | 2026-09-08 | Initial roadmap, published alongside the survey runner. |
