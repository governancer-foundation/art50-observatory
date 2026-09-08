// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * The parts of the runner that decide what gets surveyed and what a record is
 * called. Both are places where a quiet mistake produces a survey of the wrong
 * pages, or two pages overwriting each other's record.
 */
import { describe, expect, it } from "vitest";

import { parseList, recordName } from "../src/run.js";

describe("reading a list of pages", () => {
  it("takes one URL per line", () => {
    expect(parseList("https://a.org/x\nhttps://b.org/y")).toEqual([
      "https://a.org/x",
      "https://b.org/y",
    ]);
  });

  it("ignores blank lines and comments, so a list can carry its own notes", () => {
    const text = "# public bodies, sampled 2026-09\n\nhttps://a.org/x\n\n  # skipped: redirects\n";
    expect(parseList(text)).toEqual(["https://a.org/x"]);
  });

  it("survives the line endings a list will actually arrive with", () => {
    expect(parseList("https://a.org/x\r\nhttps://b.org/y\r\n")).toHaveLength(2);
  });
});

describe("naming a record", () => {
  it("is stable for a URL, so a re-run overwrites rather than accumulates", () => {
    expect(recordName("https://a.org/x")).toBe(recordName("https://a.org/x"));
  });

  it("separates URLs that differ only past the length a name keeps", () => {
    // Two long URLs sharing a prefix must not collide: one record silently
    // overwriting another would lose an observation without any error.
    const long = "https://a.org/" + "p".repeat(200);
    expect(recordName(`${long}/one`)).not.toBe(recordName(`${long}/two`));
  });

  it("produces a name a filesystem will accept", () => {
    const name = recordName("https://a.org/a b?q=1&r=2#frag");
    expect(name).toMatch(/^[A-Za-z0-9.-]+\.json$/);
  });
});
