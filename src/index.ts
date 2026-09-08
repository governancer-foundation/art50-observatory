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
 * `analyse` stays pure and takes no view on fetching. Above it sits `survey`,
 * which does: it asks each host's exclusion file before requesting anything,
 * obeys the answer including when it could not be read, and paces itself per
 * host. That belongs here rather than in each caller, because left to callers
 * the manners are the part that gets skipped — and how a project behaved while
 * measuring an operator is the first thing that operator notices about it.
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

export { survey, type SurveyOptions, type SurveyOutcome } from "./survey.js";
export {
  retrieve,
  retrieveRobots,
  type Retrieval,
  type RetrieveOptions,
} from "./retrieve.js";
export {
  parseRobots,
  isAllowed,
  rulesFrom,
  type FetchOutcome,
  type RobotsRules,
} from "./robots.js";

export {
  detectMark,
  type MarkEvidence,
  type MarkFinding,
  type MarkObservation,
  type MarkOptions,
  type MarkStrength,
} from "./marking.js";
