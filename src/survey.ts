// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * Walking a list of public pages and coming back with records.
 *
 * The library half of this package is deliberately pure and leaves fetching to
 * the caller. That boundary is right for a library and wrong for an
 * observatory: left to each caller, the exclusion rules and the pacing are
 * what get skipped, and the first thing an operator notices about a project
 * that measures them is how it behaved while doing it.
 *
 * So the survey owns the manners. Per host it asks once for the exclusion
 * file, obeys the answer, and paces itself at whatever interval the operator
 * asked for or a default floor, whichever is slower. A host that could not be
 * asked is not surveyed at all.
 *
 * Three outcomes, kept apart because they mean different things to a reader:
 * a page was observed, a page was declined by its operator, or a page produced
 * nothing we can conclude from. Only the first becomes a record.
 */

import type { ConformanceStatement } from "@governancer-foundation/conformance-attestation";

import { analyse, type AnalyseOptions, type Observation } from "./analyse.js";
import { toStatement } from "./record.js";
import { isAllowed, rulesFrom, type RobotsRules } from "./robots.js";
import { retrieve, retrieveRobots, type RetrieveOptions } from "./retrieve.js";

export type SurveyOutcome =
  | { url: string; kind: "observed"; observation: Observation; statement: ConformanceStatement }
  /** The operator's published rules refused this page, or the whole host. */
  | { url: string; kind: "declined"; reason: string }
  /** Nothing arrived that a conclusion could rest on. */
  | { url: string; kind: "unusable"; reason: string };

export interface SurveyOptions extends RetrieveOptions, AnalyseOptions {
  /** Version of this tool, recorded as the observer in every statement. */
  observerVersion: string;
  /** Slowest-allowed pace per host, in milliseconds. An operator may ask for slower. */
  minIntervalMs?: number;
  /** ISO instant for the run. Supplied, never read from the clock, so runs reproduce. */
  observedAt: string;
  /** Injected for tests; defaults to a real wait. */
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_INTERVAL_MS = 1_000;
const OBSERVER_NAME = "art50-observatory";

const wait = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

/** What we learned about one host, asked for once and reused. */
interface HostState {
  rules: RobotsRules | undefined;
  reason?: string;
  intervalMs: number;
  lastRequestAt: number;
}

/**
 * Survey a list of pages, in order, one at a time.
 *
 * Sequential on purpose. Concurrency across hosts would be faster and would
 * also make the pacing per host a thing to reason about rather than a thing
 * that is obviously true, and this project would rather be obviously polite
 * than quick.
 */
export async function survey(
  urls: readonly string[],
  options: SurveyOptions,
): Promise<SurveyOutcome[]> {
  const pause = options.sleep ?? wait;
  const floor = options.minIntervalMs ?? DEFAULT_INTERVAL_MS;
  const hosts = new Map<string, HostState>();
  const results: SurveyOutcome[] = [];

  for (const url of urls) {
    let origin: string;
    let path: string;
    try {
      const parsed = new URL(url);
      origin = parsed.origin;
      path = parsed.pathname + parsed.search;
    } catch {
      results.push({ url, kind: "unusable", reason: `${url} is not a URL that can be requested.` });
      continue;
    }

    let host = hosts.get(origin);
    if (!host) {
      const outcome = await retrieveRobots(origin, options);
      const rules = rulesFrom(outcome);
      host = {
        rules,
        ...(outcome.kind === "unreachable" ? { reason: outcome.reason } : {}),
        intervalMs: Math.max(floor, (rules?.crawlDelay ?? 0) * 1000),
        lastRequestAt: Date.now(),
      };
      hosts.set(origin, host);
    }

    if (!host.rules) {
      // The exclusion file could not be read, so the host has not been asked.
      // Surveying it anyway would be assuming the answer we wanted.
      results.push({
        url,
        kind: "declined",
        reason: `${origin} could not be asked whether it permits this: ${host.reason ?? "its exclusion file was unreachable"}`,
      });
      continue;
    }

    if (!isAllowed(host.rules, options.userAgent, path)) {
      results.push({
        url,
        kind: "declined",
        reason: `${origin} publishes rules that exclude ${path} for this caller.`,
      });
      continue;
    }

    const elapsed = Date.now() - host.lastRequestAt;
    await pause(host.intervalMs - elapsed);

    const retrieved = await retrieve(url, options);
    host.lastRequestAt = Date.now();

    if (retrieved.kind === "failed") {
      results.push({ url, kind: "unusable", reason: retrieved.reason });
      continue;
    }

    if (retrieved.truncated) {
      // A cut body is not the page a visitor read. A disclosure could be in
      // the part we discarded, so no finding rests on it.
      results.push({
        url,
        kind: "unusable",
        reason: `The response from ${retrieved.url} exceeded the size limit and was cut, so it is not the page a visitor reads.`,
      });
      continue;
    }

    const observation = analyse(retrieved.body, options);
    results.push({
      url,
      kind: "observed",
      observation,
      statement: toStatement(observation, {
        // The page that answered, not the one we asked for.
        url: retrieved.url,
        body: retrieved.body,
        observedAt: options.observedAt,
        observer: { name: OBSERVER_NAME, version: options.observerVersion },
      }),
    });
  }

  return results;
}
