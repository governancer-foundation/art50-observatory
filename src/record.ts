// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * An observation, as a conformance record rather than a screenshot.
 *
 * The reason the observatory emits records at all: a picture of a page proves
 * nothing to anyone who was not there, and a spreadsheet of findings is not
 * something a supervisory authority can act on. A signed statement naming the
 * requirement, the outcome, the reasoning and — mandatorily — what was not
 * examined, is.
 *
 * The subject is a page as it was served at a moment, which is not an artefact
 * with a digest. The shared schema has a shape for exactly that: pinned by
 * digest, or explicitly unpinned with a reason. Here the reason is that a live
 * surface changes between requests, so the record carries a digest of the
 * response actually examined — which makes it pinned to what was seen, even
 * though the page it came from will have moved on.
 */

import { createHash } from "node:crypto";
import type { ConformanceStatement, Outcome } from "@governancer-foundation/conformance-attestation";
import { locateRequirement } from "@governancer-foundation/art50-disclosure-sdk";

import type { Observation } from "./analyse.js";
import type { MarkObservation } from "./marking.js";

export const PROFILE_ID = "ai-act/art-50";
export const REQUIREMENT = "EU-2024-1689:Art50.1";
export const MARKING_REQUIREMENT = "EU-2024-1689:Art50.2";
const PREDICATE_TYPE = "urn:conformance-attestation:v0.1";
const STATEMENT_TYPE = "https://in-toto.io/Statement/v1";

export interface RecordOptions {
  /** The page observed. */
  url: string;
  /** The exact bytes examined — digested, so the record is pinned to what was seen. */
  body: string;
  /** ISO 8601 instant of the observation. Supplied, never read from the clock. */
  observedAt: string;
  /** Name and version of the observing tool. */
  observer: { name: string; version: string };
}

/**
 * How a finding maps onto the shared outcome vocabulary.
 *
 * Only one finding produces a negative, and it is the one the analyser is
 * willing to stand behind. Everything else is `notEvaluated`, which is the
 * value that exists precisely so "we could not tell" never reads as a verdict.
 */
function outcomeFor(finding: Observation["finding"]): Outcome {
  switch (finding) {
    case "disclosed":
      return "supports";
    case "no-disclosure-found":
      return "doesNotSupport";
    case "no-interactive-surface":
      return "notApplicable";
    case "inconclusive-client-rendered":
      return "notEvaluated";
  }
}

function rationaleFor(observation: Observation, url: string): string {
  const surfaces = observation.surfaceEvidence.map((e) => e.reason).join("; ");
  switch (observation.finding) {
    case "disclosed":
      return `The page at ${url} presents an interaction surface (${surfaces}) and states that the counterpart is an AI system in the markup served to an unauthenticated visitor.`;
    case "no-disclosure-found":
      return `The page at ${url} presents an interaction surface (${surfaces}) and the markup served to an unauthenticated visitor contains no statement that the counterpart is an AI system.`;
    case "inconclusive-client-rendered":
      return `The page at ${url} presents an interaction surface (${surfaces}), but defers its content to script, so the served markup does not show what a visitor reads. No conclusion is drawn.`;
    case "no-interactive-surface":
      return `The page at ${url} presents no surface for direct interaction with a natural person that this tool recognises, so the duty is not raised by this page.`;
  }
}

/** Build the record for one observation. */
export function toStatement(
  observation: Observation,
  options: RecordOptions,
): ConformanceStatement {
  const digest = createHash("sha256").update(options.body, "utf8").digest("hex");
  const where = locateRequirement(REQUIREMENT);

  return {
    _type: STATEMENT_TYPE,
    subject: [
      {
        name: options.url,
        // Pinned to the response examined, not to the page — a live surface
        // changes between requests, and a record that claimed otherwise would
        // be asserting something it cannot know.
        digest: { sha256: digest },
      },
    ],
    predicateType: PREDICATE_TYPE,
    predicate: {
      profile: { id: PROFILE_ID, version: "0.1" },
      assessment: [
        {
          requirement: REQUIREMENT,
          outcome: outcomeFor(observation.finding),
          rationale: rationaleFor(observation, options.url),
          ...(observation.finding === "disclosed" || observation.finding === "no-disclosure-found"
            ? { bindingFrom: "2026-08-02" }
            : {}),
          evidence: [
            ...observation.surfaceEvidence.map((e) => ({ name: `surface: ${e.reason}` })),
            ...observation.disclosureEvidence.map((e) => ({ name: `disclosure: ${e.reason}` })),
          ],
        },
      ],
      method: {
        techniques: ["servedMarkupInspection"],
        tools: [{ name: options.observer.name, version: options.observer.version }],
        coverage: { surfaces: 1, sampling: "single page as served" },
      },
      scope: { surfaces: [options.url] },
      limitations: [
        ...observation.limitations,
        where?.sourceUrl
          ? `The requirement is Article 50(1) of ${where.instrumentName}; its text is published at ${where.sourceUrl} and was not restated here.`
          : "The requirement is Article 50(1); its text was not restated here.",
      ],
      assessor: { name: options.observer.name, independence: "third-party" },
      validity: { issued: options.observedAt },
    },
  };
}


/**
 * How a marking finding maps onto the shared outcome vocabulary.
 *
 * Only a signed manifest reaches `supports`, and even then the record says in
 * its limitations that presence was checked rather than validity. An unsigned
 * tag is machine-readable and unvouched-for, which is neither support nor its
 * absence — `notEvaluated` is the honest place for it, and is exactly why the
 * vocabulary has that value.
 */
function markOutcomeFor(finding: MarkObservation["finding"]): Outcome {
  switch (finding) {
    case "signed-mark-present":
      return "supports";
    case "no-mark-found":
      return "doesNotSupport";
    case "unsigned-mark-only":
    case "container-not-recognised":
      return "notEvaluated";
  }
}

function markRationaleFor(observation: MarkObservation, url: string): string {
  const found = observation.evidence.map((e) => e.marker).join("; ");
  switch (observation.finding) {
    case "signed-mark-present":
      return `The file at ${url} carries a provenance manifest in the box its container reserves for one (${found}). Presence was checked; the signature was not verified.`;
    case "unsigned-mark-only":
      return `The file at ${url} carries a metadata tag naming its source as generated by a trained model (${found}), and no signed provenance manifest. The tag is machine-readable and unsigned: anybody can write one. No conclusion is drawn.`;
    case "no-mark-found":
      return `The file at ${url} is a recognised ${observation.container} container and the bytes examined carry neither a provenance manifest in the box the format reserves for one, nor a metadata tag naming a generated source.`;
    case "container-not-recognised":
      return `The container of the file at ${url} was not recognised, so no format-specific location was examined. No conclusion is drawn.`;
  }
}

export interface MarkRecordOptions extends Omit<RecordOptions, "body"> {
  /** The bytes examined — digested, so the record is pinned to what was seen. */
  bytes: Uint8Array;
}

/** Build the record for one marking observation. */
export function toMarkStatement(
  observation: MarkObservation,
  options: MarkRecordOptions,
): ConformanceStatement {
  const digest = createHash("sha256").update(options.bytes).digest("hex");
  const where = locateRequirement(MARKING_REQUIREMENT);

  return {
    _type: STATEMENT_TYPE,
    subject: [{ name: options.url, digest: { sha256: digest } }],
    predicateType: PREDICATE_TYPE,
    predicate: {
      profile: { id: PROFILE_ID, version: "0.1" },
      assessment: [
        {
          requirement: MARKING_REQUIREMENT,
          outcome: markOutcomeFor(observation.finding),
          rationale: markRationaleFor(observation, options.url),
          // The date the marking duty binds a system already on the market.
          // A file published before it is not late; it is early.
          ...(observation.finding === "signed-mark-present" ||
          observation.finding === "no-mark-found"
            ? { bindingFrom: "2026-12-02" }
            : {}),
          evidence: observation.evidence.map((e) => ({
            name: `${e.strength}: ${e.marker} at byte ${e.offset}`,
          })),
        },
      ],
      method: {
        techniques: ["containerMetadataInspection"],
        tools: [{ name: options.observer.name, version: options.observer.version }],
        coverage: { surfaces: 1, sampling: "single file as served" },
      },
      scope: { surfaces: [options.url] },
      limitations: [
        ...observation.limitations,
        where?.sourceUrl
          ? `The requirement is Article 50(2) of ${where.instrumentName}; its text is published at ${where.sourceUrl} and was not restated here.`
          : "The requirement is Article 50(2); its text was not restated here.",
      ],
      assessor: { name: options.observer.name, independence: "third-party" },
      validity: { issued: options.observedAt },
    },
  };
}
