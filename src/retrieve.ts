// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * Getting the bytes, under limits that are part of the method rather than
 * defensive trivia.
 *
 * Every bound here shows up later in a record. A response truncated at a size
 * limit is not the page a visitor read, so the retrieval says it was truncated
 * and the analysis downgrades rather than concluding from a fragment. A
 * request that timed out is not evidence of anything. The point of naming the
 * limits in the result is that a reader of the record can tell a finding from
 * a failure without trusting us about which it was.
 *
 * The fetch implementation is injected. That keeps the tests hermetic, and it
 * lets a caller who is already inside a browser or behind their own proxy
 * supply the transport they are permitted to use.
 */

/** What came back, or why nothing did. */
export type Retrieval =
  | {
      kind: "ok";
      /** The URL finally served, after any redirects. */
      url: string;
      status: number;
      body: string;
      contentType: string;
      /** True when the body was cut at the size limit and is not the whole page. */
      truncated: boolean;
    }
  | {
      kind: "failed";
      /** A sentence naming what stopped us, fit to appear in a record. */
      reason: string;
      /** Present when the server answered and the answer was the problem. */
      status?: number;
    };

export interface RetrieveOptions {
  /** How this caller identifies itself. Sent, and matched against exclusion rules. */
  userAgent: string;
  /** Milliseconds before a request is abandoned. */
  timeoutMs?: number;
  /** How many redirects to follow before treating the chain as a refusal to answer. */
  maxRedirects?: number;
  /** Bytes of body to keep. Beyond this the response is truncated and marked so. */
  maxBytes?: number;
  /** Transport. Defaults to the platform's. */
  fetchImpl?: typeof fetch;
}

const DEFAULTS = {
  timeoutMs: 15_000,
  maxRedirects: 5,
  // Large enough for any page written for people to read, small enough that a
  // single hostile response cannot exhaust the surveyor.
  maxBytes: 4_000_000,
};

/** Read a response body up to a limit, reporting whether it was cut. */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<{ body: string; truncated: boolean }> {
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength <= maxBytes) {
    return { body: new TextDecoder().decode(bytes), truncated: false };
  }
  return {
    body: new TextDecoder().decode(bytes.subarray(0, maxBytes)),
    truncated: true,
  };
}

/**
 * Request one URL.
 *
 * Redirects are followed by hand rather than by the transport, so the chain
 * can be capped and so the URL that finally answered is known — a record whose
 * subject is the URL we asked for, when a different one replied, is naming the
 * wrong page.
 */
export async function retrieve(url: string, options: RetrieveOptions): Promise<Retrieval> {
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const maxRedirects = options.maxRedirects ?? DEFAULTS.maxRedirects;
  const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes;
  const call = options.fetchImpl ?? fetch;

  let current = url;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await call(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": options.userAgent, accept: "text/html,*/*;q=0.5" },
      });
    } catch (error) {
      // If we aborted it, the timer is the explanation, whatever the transport
      // chose to throw. A record that blamed the network for our own deadline
      // would send a reader looking for a fault that was never there.
      if (controller.signal.aborted) {
        return {
          kind: "failed",
          reason: `The request to ${current} did not complete within ${timeoutMs} ms.`,
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        kind: "failed",
        reason: `The request to ${current} could not be made: ${message}.`,
      };
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return {
          kind: "failed",
          status: response.status,
          reason: `The server answered ${response.status} for ${current} without saying where to go.`,
        };
      }
      current = new URL(location, current).toString();
      continue;
    }

    if (response.status >= 400) {
      return {
        kind: "failed",
        status: response.status,
        reason: `The server answered ${response.status} for ${current}.`,
      };
    }

    const { body, truncated } = await readCapped(response, maxBytes);
    return {
      kind: "ok",
      url: current,
      status: response.status,
      body,
      contentType: response.headers.get("content-type") ?? "",
      truncated,
    };
  }

  return {
    kind: "failed",
    reason: `The chain of redirects from ${url} did not settle within ${maxRedirects} hops.`,
  };
}

/**
 * Ask a host for its exclusion file.
 *
 * The three answers are kept apart deliberately, because they mean different
 * things: served, absent, or unreadable. Collapsing the last two into "no
 * rules" is the mistake that turns a polite crawler into an impolite one.
 */
export async function retrieveRobots(
  origin: string,
  options: RetrieveOptions,
): Promise<{ kind: "served"; body: string } | { kind: "absent" } | { kind: "unreachable"; reason: string }> {
  const url = new URL("/robots.txt", origin).toString();
  const result = await retrieve(url, options);

  if (result.kind === "ok") return { kind: "served", body: result.body };
  if (result.status !== undefined && result.status >= 400 && result.status < 500) {
    return { kind: "absent" };
  }
  return { kind: "unreachable", reason: result.reason };
}
