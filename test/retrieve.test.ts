// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * Whether retrieval reports what it did, including when it did nothing.
 *
 * The cases worth testing are the ones where a careless client would return
 * something that looks like a page: a truncated body, a redirect chain that
 * never settles, an exclusion file the server refused to serve.
 */
import { describe, expect, it } from "vitest";

import { retrieve, retrieveRobots } from "../src/retrieve.js";

const UA = "art50-observatory/0.2.0";

/** A transport that answers from a table, and records what it was asked. */
function transport(
  table: Record<string, { status?: number; body?: string; headers?: Record<string, string> }>,
): { fetchImpl: typeof fetch; asked: string[]; sentHeaders: Record<string, string>[] } {
  const asked: string[] = [];
  const sentHeaders: Record<string, string>[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    asked.push(url);
    sentHeaders.push((init?.headers ?? {}) as Record<string, string>);
    const entry = table[url];
    if (!entry) throw new Error("connection refused");
    return new Response(entry.body ?? "", {
      status: entry.status ?? 200,
      headers: entry.headers ?? { "content-type": "text/html" },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, asked, sentHeaders };
}

describe("requesting a page", () => {
  it("returns the body it was served", async () => {
    const { fetchImpl } = transport({ "https://e.org/a": { body: "<p>hi</p>" } });
    const r = await retrieve("https://e.org/a", { userAgent: UA, fetchImpl });
    expect(r.kind === "ok" && r.body).toBe("<p>hi</p>");
  });

  it("identifies itself, so an operator can name it in their rules", async () => {
    const t = transport({ "https://e.org/a": { body: "" } });
    await retrieve("https://e.org/a", { userAgent: UA, fetchImpl: t.fetchImpl });
    expect(t.sentHeaders[0]?.["user-agent"]).toBe(UA);
  });

  it("reports a refusal as a failure, not as an empty page", async () => {
    // An empty body from a 403 analysed as a page would produce a finding that
    // the operator did not disclose, from a page we were never shown.
    const { fetchImpl } = transport({ "https://e.org/a": { status: 403, body: "" } });
    const r = await retrieve("https://e.org/a", { userAgent: UA, fetchImpl });
    expect(r.kind).toBe("failed");
    expect(r.kind === "failed" && r.status).toBe(403);
  });

  it("blames its own deadline for a timeout, not the network", async () => {
    // A record that blamed the network for our deadline would send a reader
    // looking for a fault that was never there.
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      })) as unknown as typeof fetch;

    const r = await retrieve("https://e.org/slow", { userAgent: UA, fetchImpl, timeoutMs: 10 });
    expect(r.kind === "failed" && r.reason).toContain("did not complete within 10 ms");
  });

  it("reports a transport error rather than throwing at the caller", async () => {
    const { fetchImpl } = transport({});
    const r = await retrieve("https://e.org/gone", { userAgent: UA, fetchImpl });
    expect(r.kind).toBe("failed");
    expect(r.kind === "failed" && r.reason).toContain("could not be made");
  });
});

describe("redirects", () => {
  it("follows one, and names the URL that finally answered", async () => {
    // The record's subject has to be the page that replied. Naming the URL we
    // asked for, when another one answered, describes the wrong page.
    const { fetchImpl } = transport({
      "https://e.org/a": { status: 301, headers: { location: "/b" } },
      "https://e.org/b": { body: "<p>b</p>" },
    });
    const r = await retrieve("https://e.org/a", { userAgent: UA, fetchImpl });
    expect(r.kind === "ok" && r.url).toBe("https://e.org/b");
  });

  it("gives up on a chain that never settles", async () => {
    const { fetchImpl } = transport({
      "https://e.org/a": { status: 302, headers: { location: "/a" } },
    });
    const r = await retrieve("https://e.org/a", { userAgent: UA, fetchImpl, maxRedirects: 2 });
    expect(r.kind === "failed" && r.reason).toContain("did not settle");
  });

  it("treats a redirect with nowhere to go as a failure", async () => {
    const { fetchImpl } = transport({ "https://e.org/a": { status: 302 } });
    const r = await retrieve("https://e.org/a", { userAgent: UA, fetchImpl });
    expect(r.kind === "failed" && r.reason).toContain("without saying where");
  });
});

describe("size", () => {
  it("keeps a body within the limit whole, and says so", async () => {
    const { fetchImpl } = transport({ "https://e.org/a": { body: "12345" } });
    const r = await retrieve("https://e.org/a", { userAgent: UA, fetchImpl, maxBytes: 10 });
    expect(r.kind === "ok" && r.truncated).toBe(false);
  });

  it("cuts an oversized body and marks it, rather than concluding from a fragment", async () => {
    const { fetchImpl } = transport({ "https://e.org/a": { body: "x".repeat(50) } });
    const r = await retrieve("https://e.org/a", { userAgent: UA, fetchImpl, maxBytes: 10 });
    expect(r.kind === "ok" && r.truncated).toBe(true);
    expect(r.kind === "ok" && r.body.length).toBe(10);
  });
});

describe("asking for the exclusion file", () => {
  it("asks the origin's root, whatever path it started from", async () => {
    const t = transport({ "https://e.org/robots.txt": { body: "User-agent: *" } });
    await retrieveRobots("https://e.org/deep/page", { userAgent: UA, fetchImpl: t.fetchImpl });
    expect(t.asked[0]).toBe("https://e.org/robots.txt");
  });

  it("reads a 404 as there being no file", async () => {
    const { fetchImpl } = transport({ "https://e.org/robots.txt": { status: 404 } });
    expect((await retrieveRobots("https://e.org", { userAgent: UA, fetchImpl })).kind).toBe("absent");
  });

  it("reads a server error as unreachable, not as permission", async () => {
    // The distinction is the whole point: a file we could not read may have
    // said no.
    const { fetchImpl } = transport({ "https://e.org/robots.txt": { status: 503 } });
    expect((await retrieveRobots("https://e.org", { userAgent: UA, fetchImpl })).kind).toBe(
      "unreachable",
    );
  });

  it("reads a transport failure as unreachable too", async () => {
    const { fetchImpl } = transport({});
    expect((await retrieveRobots("https://e.org", { userAgent: UA, fetchImpl })).kind).toBe(
      "unreachable",
    );
  });
});
