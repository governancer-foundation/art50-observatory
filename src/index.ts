// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * art50-observatory — does a public deployment say it is an AI system?
 *
 * Two halves, kept apart on purpose. `analyse` is pure: markup in, observation
 * out, no network and no clock, so it can be tested exhaustively and its
 * results reproduce. `toStatement` turns an observation into a conformance
 * record, because a screenshot proves nothing to anyone who was not there.
 *
 * Fetching is the caller's: this package will not decide for you what to
 * request, how often, or whether you are welcome to.
 */

export { analyse, type AnalyseOptions, type Evidence, type Finding, type Observation } from "./analyse.js";
export {
  toStatement,
  toMarkStatement,
  PROFILE_ID,
  REQUIREMENT,
  MARKING_REQUIREMENT,
  type RecordOptions,
  type MarkRecordOptions,
} from "./record.js";

export {
  detectMark,
  type MarkEvidence,
  type MarkFinding,
  type MarkObservation,
  type MarkOptions,
  type MarkStrength,
} from "./marking.js";
