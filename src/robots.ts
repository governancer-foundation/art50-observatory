// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * Whether this observatory is welcome on a page, according to the operator.
 *
 * An observatory that measures other people's sites without asking is a
 * scraper with a mission statement. The exclusion protocol is the one place
 * an operator can say no in a way a machine reads, so it is honoured before
 * anything is requested — not as etiquette, but because a record obtained
 * against a published refusal is a record the observatory cannot cite.
 *
 * The rules here follow RFC 9309: groups are selected by the most specific
 * matching user-agent, the longest matching path rule decides, and a tie goes
 * to `allow`. Two details of that standard matter more than they look:
 *
 *   - An **absent** exclusion file (4xx) permits everything. Most sites have
 *     none, and refusing to look at them would leave the observatory able to
 *     measure only the sites organised enough to publish rules.
 *   - An **unreachable** file (5xx, timeout) forbids everything. The operator
 *     may well have said no in a file we could not read, and guessing in our
 *     own favour is exactly the overstatement this project refuses elsewhere.
 *
 * Parsing is pure: text in, rules out, no network and no clock.
 */

/** One path rule from a group, kept with the verdict it carries. */
interface Rule {
  allow: boolean;
  /** The path pattern as written, `*` and `$` included. */
  pattern: string;
  /** Length of the pattern, which is what decides between competing rules. */
  length: number;
}

export interface RobotsRules {
  /** Groups by lowercased user-agent token, `*` included when present. */
  groups: Map<string, Rule[]>;
  /** Seconds an operator asked callers to wait between requests, when stated. */
  crawlDelay?: number;
  /** Sitemap URLs advertised in the file, in the order they appeared. */
  sitemaps: string[];
}

/** What to do when the exclusion file itself could not be read. */
export type FetchOutcome =
  /** The file was served. */
  | { kind: "served"; body: string }
  /** There is no file. Everything is permitted. */
  | { kind: "absent" }
  /** The file could not be read. Nothing is permitted. */
  | { kind: "unreachable"; reason: string };

const EMPTY: RobotsRules = { groups: new Map(), sitemaps: [] };

/**
 * Parse an exclusion file.
 *
 * Unknown fields are ignored rather than rejected: the file is written by
 * hand on millions of sites and a strict parser would mostly be measuring
 * typos. A malformed line costs its own rule, never the whole file.
 */
export function parseRobots(body: string): RobotsRules {
  const groups = new Map<string, Rule[]>();
  const sitemaps: string[] = [];
  let crawlDelay: number | undefined;

  // Consecutive user-agent lines share one group of rules. A rule line closes
  // the run, so the next user-agent line starts a new group.
  let current: string[] = [];
  let openingGroup = false;

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") continue;

    const at = line.indexOf(":");
    if (at < 0) continue;
    const field = line.slice(0, at).trim().toLowerCase();
    const value = line.slice(at + 1).trim();

    if (field === "user-agent") {
      if (!openingGroup) {
        current = [];
        openingGroup = true;
      }
      if (value !== "") current.push(value.toLowerCase());
      continue;
    }

    if (field === "sitemap") {
      if (value !== "") sitemaps.push(value);
      continue;
    }

    if (field === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        crawlDelay = crawlDelay === undefined ? seconds : Math.max(crawlDelay, seconds);
      }
      openingGroup = false;
      continue;
    }

    if (field !== "allow" && field !== "disallow") continue;
    openingGroup = false;
    if (current.length === 0) continue;

    // An empty `Disallow` is the documented way to permit everything, and it
    // carries no path — recording it as a rule would make it compete with real
    // ones on length and win nothing.
    if (field === "disallow" && value === "") continue;
    if (value === "") continue;

    const rule: Rule = { allow: field === "allow", pattern: value, length: value.length };
    for (const agent of current) {
      const existing = groups.get(agent);
      if (existing) existing.push(rule);
      else groups.set(agent, [rule]);
    }
  }

  return { groups, sitemaps, ...(crawlDelay === undefined ? {} : { crawlDelay }) };
}

/**
 * The group that governs a given caller.
 *
 * The most specific matching user-agent wins, which the standard defines as
 * the longest one that the caller's token starts with. `*` is the fallback and
 * never competes on length — a site that names us explicitly has overridden
 * its own general rule, however long that rule's name happens to be.
 */
function groupFor(rules: RobotsRules, userAgent: string): Rule[] {
  const token = userAgent.toLowerCase();
  let best: { agent: string; rules: Rule[] } | undefined;

  for (const [agent, group] of rules.groups) {
    if (agent === "*") continue;
    if (!token.startsWith(agent)) continue;
    if (!best || agent.length > best.agent.length) best = { agent, rules: group };
  }

  return best?.rules ?? rules.groups.get("*") ?? [];
}

/** Turn a path pattern into a matcher, honouring `*` and a trailing `$`. */
function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;

  const source = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");

  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path);
}

/**
 * May this caller request this path?
 *
 * The longest matching pattern decides. When an `allow` and a `disallow` match
 * at the same length the `allow` wins, which is the standard's way of letting
 * an operator carve an exception out of a broad refusal.
 */
export function isAllowed(rules: RobotsRules, userAgent: string, path: string): boolean {
  let verdict = true;
  let decidedAt = -1;

  for (const rule of groupFor(rules, userAgent)) {
    if (!matches(rule.pattern, path)) continue;
    if (rule.length > decidedAt || (rule.length === decidedAt && rule.allow)) {
      verdict = rule.allow;
      decidedAt = rule.length;
    }
  }

  return verdict;
}

/**
 * Read an exclusion outcome into rules, or into a refusal.
 *
 * Returns `undefined` when nothing may be requested from the host at all,
 * which is the deliberate reading of an unreachable file.
 */
export function rulesFrom(outcome: FetchOutcome): RobotsRules | undefined {
  switch (outcome.kind) {
    case "served":
      return parseRobots(outcome.body);
    case "absent":
      return EMPTY;
    case "unreachable":
      return undefined;
  }
}
