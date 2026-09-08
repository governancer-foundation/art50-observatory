// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * Whether the observatory reads a refusal correctly.
 *
 * The expensive mistake here is the generous one: reading "no" as "yes", or
 * reading silence as consent when the file that would have said no could not
 * be fetched. Those cases are tested first and hardest.
 */
import { describe, expect, it } from "vitest";

import { isAllowed, parseRobots, rulesFrom } from "../src/robots.js";

const UA = "art50-observatory";

const allows = (body: string, path: string, agent = UA): boolean =>
  isAllowed(parseRobots(body), agent, path);

describe("reading a refusal", () => {
  it("permits everything when the file has no rules", () => {
    expect(allows("", "/anything")).toBe(true);
  });

  it("honours a blanket refusal", () => {
    expect(allows("User-agent: *\nDisallow: /", "/anything")).toBe(false);
  });

  it("treats an empty Disallow as permission, which is what it means", () => {
    expect(allows("User-agent: *\nDisallow:", "/anything")).toBe(true);
  });

  it("refuses only the paths named", () => {
    const body = "User-agent: *\nDisallow: /private";
    expect(allows(body, "/private/page")).toBe(false);
    expect(allows(body, "/public/page")).toBe(true);
  });

  it("lets the longer pattern decide", () => {
    // The operator carved an exception out of their own refusal, and the
    // exception is the more specific statement of intent.
    const body = "User-agent: *\nDisallow: /docs\nAllow: /docs/public";
    expect(allows(body, "/docs/internal")).toBe(false);
    expect(allows(body, "/docs/public/a")).toBe(true);
  });

  it("gives a tie to permission, as the standard says", () => {
    const body = "User-agent: *\nDisallow: /a\nAllow: /a";
    expect(allows(body, "/a")).toBe(true);
  });
});

describe("choosing whose rules apply", () => {
  it("prefers a group naming this caller over the general one", () => {
    const body = "User-agent: *\nDisallow: /\n\nUser-agent: art50-observatory\nAllow: /";
    expect(allows(body, "/page")).toBe(true);
  });

  it("still obeys the general group when this caller is not named", () => {
    const body = "User-agent: somebody-else\nAllow: /\n\nUser-agent: *\nDisallow: /";
    expect(allows(body, "/page")).toBe(false);
  });

  it("prefers the more specific of two matching names", () => {
    const body = [
      "User-agent: art50",
      "Disallow: /",
      "",
      "User-agent: art50-observatory",
      "Allow: /",
    ].join("\n");
    expect(allows(body, "/page")).toBe(true);
  });

  it("applies one group of rules to every name that opened it", () => {
    const body = "User-agent: alpha\nUser-agent: art50-observatory\nDisallow: /shared";
    expect(allows(body, "/shared/x")).toBe(false);
    expect(allows(body, "/elsewhere")).toBe(true);
  });

  it("does not care about the case a name was written in", () => {
    const body = "USER-AGENT: ART50-Observatory\nDISALLOW: /x";
    expect(allows(body, "/x")).toBe(false);
  });
});

describe("patterns", () => {
  it("expands a wildcard", () => {
    expect(allows("User-agent: *\nDisallow: /*/secret", "/any/secret")).toBe(false);
  });

  it("anchors a pattern ending in a dollar sign", () => {
    const body = "User-agent: *\nDisallow: /page$";
    expect(allows(body, "/page")).toBe(false);
    expect(allows(body, "/page/child")).toBe(true);
  });

  it("treats regular-expression characters in a path as literal text", () => {
    // A path is not a pattern language beyond `*` and `$`; letting `.` or `+`
    // through would refuse pages the operator never named.
    const body = "User-agent: *\nDisallow: /a.b+c";
    expect(allows(body, "/a.b+c")).toBe(false);
    expect(allows(body, "/axbbc")).toBe(true);
  });
});

describe("surviving a file written by hand", () => {
  it("ignores comments", () => {
    expect(allows("# nothing here\nUser-agent: * # everyone\nDisallow: /x", "/x")).toBe(false);
  });

  it("loses a malformed line without losing the file", () => {
    const body = "User-agent: *\nthis line has no colon\nDisallow: /x";
    expect(allows(body, "/x")).toBe(false);
  });

  it("ignores a rule that belongs to no group", () => {
    expect(allows("Disallow: /x\nUser-agent: *\nAllow: /", "/x")).toBe(true);
  });

  it("ignores fields it does not know", () => {
    expect(allows("User-agent: *\nRequest-rate: 1/10\nDisallow: /x", "/x")).toBe(false);
  });
});

describe("what else the file says", () => {
  it("reads a crawl delay", () => {
    expect(parseRobots("User-agent: *\nCrawl-delay: 10").crawlDelay).toBe(10);
  });

  it("takes the longest delay stated, not the friendliest", () => {
    const body = "User-agent: *\nCrawl-delay: 2\n\nUser-agent: other\nCrawl-delay: 30";
    expect(parseRobots(body).crawlDelay).toBe(30);
  });

  it("ignores a delay that is not a number", () => {
    expect(parseRobots("User-agent: *\nCrawl-delay: soon").crawlDelay).toBeUndefined();
  });

  it("collects advertised sitemaps", () => {
    const body = "Sitemap: https://example.org/a.xml\nSitemap: https://example.org/b.xml";
    expect(parseRobots(body).sitemaps).toEqual([
      "https://example.org/a.xml",
      "https://example.org/b.xml",
    ]);
  });

  it("does not let a crawl delay swallow the rules that follow it", () => {
    const body = "User-agent: *\nCrawl-delay: 5\nDisallow: /x";
    expect(allows(body, "/x")).toBe(false);
  });
});

describe("when the file itself could not be read", () => {
  it("permits everything when there is no file", () => {
    const rules = rulesFrom({ kind: "absent" });
    expect(rules && isAllowed(rules, UA, "/anything")).toBe(true);
  });

  it("permits nothing when the file was unreachable", () => {
    // The operator may have said no in a file we failed to fetch. Guessing in
    // our own favour is the overstatement this project refuses everywhere else.
    expect(rulesFrom({ kind: "unreachable", reason: "timeout" })).toBeUndefined();
  });

  it("reads the rules when the file was served", () => {
    const rules = rulesFrom({ kind: "served", body: "User-agent: *\nDisallow: /x" });
    expect(rules && isAllowed(rules, UA, "/x")).toBe(false);
  });
});
