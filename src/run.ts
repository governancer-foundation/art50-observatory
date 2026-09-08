// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * Running a survey, as the command line asks for it.
 *
 * The observatory's claim is that transparency duties can be measured from
 * outside, by anyone. That claim is only worth making if anyone can run the
 * measurement: a finding nobody can reproduce is a press release.
 *
 * So this takes a list of pages, produces one record per page it was allowed
 * to observe, and prints what it did with the rest. The records are the
 * output; the summary on the error stream is for the person watching.
 *
 * Nothing here starts on import, and nothing here exits the process. The
 * executable that does both is cli.ts — kept apart so the argument handling
 * and the record naming can be tested without a run happening as a side
 * effect of loading them.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

import { survey, type SurveyOutcome } from "./survey.js";

const USAGE = `art50-observatory — does a public page say it is an AI system?

  art50-observatory <file>        survey the URLs in a file, one per line
  art50-observatory -             read the list from standard input
  art50-observatory --help

Options:
  --out <dir>          where records are written (default: records)
  --interval <ms>      slowest-allowed pace per host (default: 1000)
  --timeout <ms>       give up on a request after this long (default: 15000)
  --user-agent <name>  how to identify to operators, so they can name us in
                       their exclusion rules (default: art50-observatory/<version>)

Lines that are empty or begin with # are ignored. Exit status is 0 when the
run completed, whatever the findings were: a finding is not an error.
`;

interface Args {
  source?: string;
  out: string;
  intervalMs: number;
  timeoutMs: number;
  userAgent?: string;
  help: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { out: "records", intervalMs: 1_000, timeoutMs: 15_000, help: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} needs a value`);
      return value;
    };
    switch (arg) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--out":
        args.out = next();
        break;
      case "--interval":
        args.intervalMs = Number(next());
        break;
      case "--timeout":
        args.timeoutMs = Number(next());
        break;
      case "--user-agent":
        args.userAgent = next();
        break;
      default:
        if (arg !== undefined && arg.startsWith("-") && arg !== "-") {
          throw new Error(`unknown option ${arg}`);
        }
        args.source = arg;
    }
  }

  return args;
}

/** URLs from a list, ignoring blanks and comments so a list can be annotated. */
export function parseList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

/** A stable, filesystem-safe name for a record, derived from what it is about. */
export function recordName(url: string): string {
  const digest = createHash("sha256").update(url, "utf8").digest("hex").slice(0, 12);
  const slug = url.replace(/^https?:\/\//, "").replace(/[^A-Za-z0-9.-]+/g, "-").slice(0, 60);
  return `${slug}-${digest}.json`;
}

function summarise(results: readonly SurveyOutcome[]): string {
  const counts = new Map<string, number>();
  for (const r of results) {
    const key = r.kind === "observed" ? r.observation.finding : r.kind;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([k, n]) => `  ${String(n).padStart(5)}  ${k}`).join("\n");
}

/** Run one survey. Returns the exit status; never exits the process itself. */
export async function run(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.help || args.source === undefined) {
    process.stdout.write(USAGE);
    return args.help ? 0 : 1;
  }

  const version = process.env["npm_package_version"] ?? "0.2.0";
  const text =
    args.source === "-"
      ? readFileSync(0, "utf8")
      : readFileSync(args.source, "utf8");
  const urls = parseList(text);
  if (urls.length === 0) {
    process.stderr.write("nothing to survey — the list is empty\n");
    return 1;
  }

  const results = await survey(urls, {
    userAgent: args.userAgent ?? `art50-observatory/${version}`,
    observerVersion: version,
    // Fixed for the whole run, so every record in it carries the same instant
    // and the run can be re-stated as one observation of one moment.
    observedAt: new Date().toISOString(),
    minIntervalMs: args.intervalMs,
    timeoutMs: args.timeoutMs,
  });

  mkdirSync(args.out, { recursive: true });
  let written = 0;
  for (const result of results) {
    if (result.kind !== "observed") {
      process.stderr.write(`  ${result.kind}  ${result.url}\n            ${result.reason}\n`);
      continue;
    }
    writeFileSync(
      join(args.out, recordName(result.url)),
      `${JSON.stringify(result.statement, null, 2)}\n`,
      "utf8",
    );
    written++;
  }

  process.stderr.write(`\n${summarise(results)}\n\n${written} record(s) written to ${args.out}/\n`);
  return 0;
}
