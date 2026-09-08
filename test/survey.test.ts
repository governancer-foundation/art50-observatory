// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * How the survey behaves while it works, which is the part an operator sees.
 *
 * The findings are the analyser's business and are tested there. What matters
 * here is that a host is asked before it is measured, that its answer is
 * obeyed including when it could not be obtained, and that a page which
 * produced nothing conclusive produces no record either.
 */
import { describe, expect, it } from "vitest";
import { validateStatement } from "@governancer-foundation/conformance-attestation";

import { survey } from "../src/survey.js";

const UA = "art50-observatory/0.2.0";
const AT = "2026-09-08T00:00:00.000Z";

const CHAT = `<div role="dialog" aria-label="Chat"><input type="text" placeholder="Ask a question"></div>`;
const page = (body: string): string => `<!doctype html><html><body>${body}</body></html>`;

interface Entry {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}

function harness(table: Record<string, Entry>) {
  const asked: string[] = [];
  const slept: number[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    const entry = table[url];
    if (!entry) throw new Error("connection refused");
    return new Response(entry.body ?? "", {
      status: entry.status ?? 200,
      headers: entry.headers ?? { "content-type": "text/html" },
    });
  }) as unknown as typeof fetch;

  const sleep = async (ms: number): Promise<void> => {
    slept.push(ms);
  };

  return {
    asked,
    slept,
    options: { userAgent: UA, observerVersion: "0.2.0", observedAt: AT, fetchImpl, sleep },
  };
}

describe("asking before measuring", () => {
  it("observes a page the operator permits, and files it as a valid record", async () => {
    const h = harness({
      "https://e.org/robots.txt": { body: "User-agent: *\nDisallow:" },
      "https://e.org/support": { body: page(CHAT) },
    });
    const [result] = await survey(["https://e.org/support"], h.options);

    expect(result?.kind).toBe("observed");
    if (result?.kind !== "observed") return;
    expect(validateStatement(result.statement).valid).toBe(true);
  });

  it("declines a page the rules exclude, without requesting it", async () => {
    const h = harness({
      "https://e.org/robots.txt": { body: "User-agent: *\nDisallow: /private" },
      "https://e.org/private/chat": { body: page(CHAT) },
    });
    const [result] = await survey(["https://e.org/private/chat"], h.options);

    expect(result?.kind).toBe("declined");
    expect(h.asked).not.toContain("https://e.org/private/chat");
  });

  it("declines a host whose rules could not be read", async () => {
    // The operator may have said no in a file we failed to fetch. Surveying
    // anyway would be assuming the answer we wanted.
    const h = harness({
      "https://e.org/robots.txt": { status: 500 },
      "https://e.org/support": { body: page(CHAT) },
    });
    const [result] = await survey(["https://e.org/support"], h.options);

    expect(result?.kind).toBe("declined");
    expect(h.asked).not.toContain("https://e.org/support");
  });

  it("surveys a host that publishes no rules at all", async () => {
    const h = harness({
      "https://e.org/robots.txt": { status: 404 },
      "https://e.org/support": { body: page(CHAT) },
    });
    expect((await survey(["https://e.org/support"], h.options))[0]?.kind).toBe("observed");
  });

  it("asks each host once, however many of its pages are surveyed", async () => {
    const h = harness({
      "https://e.org/robots.txt": { body: "User-agent: *\nDisallow:" },
      "https://e.org/a": { body: page(CHAT) },
      "https://e.org/b": { body: page(CHAT) },
    });
    await survey(["https://e.org/a", "https://e.org/b"], h.options);

    expect(h.asked.filter((u) => u.endsWith("/robots.txt"))).toHaveLength(1);
  });
});

describe("pace", () => {
  it("waits at least the floor between requests to a host", async () => {
    const h = harness({
      "https://e.org/robots.txt": { body: "User-agent: *\nDisallow:" },
      "https://e.org/a": { body: page(CHAT) },
    });
    await survey(["https://e.org/a"], { ...h.options, minIntervalMs: 500 });

    expect(Math.max(...h.slept)).toBeGreaterThan(0);
    expect(Math.max(...h.slept)).toBeLessThanOrEqual(500);
  });

  it("slows to the interval the operator asked for", async () => {
    const h = harness({
      "https://e.org/robots.txt": { body: "User-agent: *\nCrawl-delay: 30\nDisallow:" },
      "https://e.org/a": { body: page(CHAT) },
    });
    await survey(["https://e.org/a"], { ...h.options, minIntervalMs: 500 });

    expect(Math.max(...h.slept)).toBeGreaterThan(25_000);
  });

  it("does not speed up because the operator asked for less than the floor", async () => {
    const h = harness({
      "https://e.org/robots.txt": { body: "User-agent: *\nCrawl-delay: 0\nDisallow:" },
      "https://e.org/a": { body: page(CHAT) },
    });
    await survey(["https://e.org/a"], { ...h.options, minIntervalMs: 2_000 });

    expect(Math.max(...h.slept)).toBeGreaterThan(1_000);
  });
});

describe("what produces no record", () => {
  it("reports something that is not a URL rather than trying it", async () => {
    const h = harness({});
    const [result] = await survey(["not a url"], h.options);

    expect(result?.kind).toBe("unusable");
    expect(h.asked).toHaveLength(0);
  });

  it("reports a page that would not load", async () => {
    const h = harness({
      "https://e.org/robots.txt": { body: "User-agent: *\nDisallow:" },
      "https://e.org/a": { status: 404 },
    });
    expect((await survey(["https://e.org/a"], h.options))[0]?.kind).toBe("unusable");
  });

  it("draws nothing from a body that was cut at the size limit", async () => {
    // The disclosure could have been in the part discarded, so a negative
    // here would be a finding about text we chose not to read.
    const h = harness({
      "https://e.org/robots.txt": { body: "User-agent: *\nDisallow:" },
      "https://e.org/a": { body: page(CHAT) + "x".repeat(5_000) },
    });
    const [result] = await survey(["https://e.org/a"], { ...h.options, maxBytes: 100 });

    expect(result?.kind).toBe("unusable");
    expect(result?.kind === "unusable" && result.reason).toContain("cut");
  });
});

describe("the subject of a record", () => {
  it("is the page that answered, not the one that was asked for", async () => {
    const h = harness({
      "https://e.org/robots.txt": { body: "User-agent: *\nDisallow:" },
      "https://e.org/a": { status: 301, headers: { location: "/b" } },
      "https://e.org/b": { body: page(CHAT) },
    });
    const [result] = await survey(["https://e.org/a"], h.options);

    expect(result?.kind === "observed" && result.statement.subject[0]?.name).toBe("https://e.org/b");
  });
});
