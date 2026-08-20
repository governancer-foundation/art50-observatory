// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * What the analyser will and will not say.
 *
 * The cases that matter are the ones where it declines. An observatory that
 * overstates once is an observatory nobody cites again, so the restraint is
 * tested as carefully as the detection.
 */
import { describe, expect, it } from "vitest";
import { validateStatement } from "@governancer-foundation/conformance-attestation";
import { DISCLOSURES } from "@governancer-foundation/art50-disclosure-sdk";

import { analyse } from "../src/analyse.js";
import { toStatement } from "../src/record.js";

const page = (body: string): string =>
  `<!doctype html><html lang="en"><head><title>t</title></head><body>${body}</body></html>`;

const CHAT = `<div role="dialog" aria-label="Chat"><input type="text" placeholder="Ask a question"></div>`;

describe("finding an interaction surface", () => {
  it("recognises a dialog holding a text input", () => {
    expect(analyse(page(CHAT)).surfaceEvidence.length).toBeGreaterThan(0);
  });

  it("recognises a known conversational widget", () => {
    const o = analyse(page(`<script src="https://widget.intercom.io/w.js"></script>`));
    expect(o.surfaceEvidence.some((e) => e.reason.includes("widget"))).toBe(true);
  });

  it("recognises an element named as a chat surface", () => {
    expect(analyse(page(`<div id="chatbot-root"></div>`)).surfaceEvidence.length).toBeGreaterThan(0);
  });

  it("does not mistake an ordinary contact form for one", () => {
    // A false positive produces a finding about a duty that was never raised:
    // it costs the operator time to rebut and costs the observatory its
    // standing.
    const o = analyse(page(`<form><label>Your email</label><input type="email"><textarea name="body"></textarea><button>Send</button></form>`));
    expect(o.finding).toBe("no-interactive-surface");
  });

  it("does not mistake a search dialog for a conversation", () => {
    // Observed on a live legal-database page: a search dialog was read as a
    // chat surface, and the record that followed said the operator did not
    // disclose a duty they were never under. Fixtures had not caught it; a
    // real page did.
    const o = analyse(
      page(`<div role="dialog" aria-label="Search"><input type="search" placeholder="Search legislation"></div>`),
    );
    expect(o.finding).toBe("no-interactive-surface");
  });

  it("does not mistake a site search box for a conversation", () => {
    const o = analyse(page(`<form role="search"><input name="q" placeholder="Search"></form>`));
    expect(o.finding).toBe("no-interactive-surface");
  });

  it("still recognises a dialog that names itself a conversation", () => {
    const o = analyse(
      page(`<div role="dialog" class="chat-window"><input type="text" placeholder="Type your message"></div>`),
    );
    expect(o.surfaceEvidence.length).toBeGreaterThan(0);
  });

  it("says the duty is not raised when there is no surface", () => {
    expect(analyse(page(`<p>A page about cheese.</p>`)).finding).toBe("no-interactive-surface");
  });
});

describe("finding a disclosure", () => {
  it("recognises the wording this project publishes, in English", () => {
    const o = analyse(page(`<p>${DISCLOSURES.en.interaction}</p>${CHAT}`));
    expect(o.finding).toBe("disclosed");
    expect(o.disclosureLocale).toBe("en");
  });

  it("recognises it in every language the SDK ships", () => {
    for (const [locale, strings] of Object.entries(DISCLOSURES)) {
      const o = analyse(page(`<p>${strings.interaction}</p>${CHAT}`));
      expect(o.finding, locale).toBe("disclosed");
    }
  });

  it("recognises wording nobody took from us", () => {
    for (const phrase of [
      "You are chatting with an AI assistant.",
      "This is a chatbot. Responses are generated automatically.",
      "Powered by AI",
      "Sie sprechen mit einem KI-System.",
    ]) {
      expect(analyse(page(`<p>${phrase}</p>${CHAT}`)).finding, phrase).toBe("disclosed");
    }
  });

  it("reports the absence as an absence in the served markup, not as a breach", () => {
    const o = analyse(page(CHAT));
    expect(o.finding).toBe("no-disclosure-found");
    expect(o.limitations.join(" ")).toMatch(/unauthenticated visitor/i);
    expect(o.limitations.join(" ")).toMatch(/painted by script/i);
  });
});

describe("declining to conclude", () => {
  it("draws no negative from a page that defers its content to script", () => {
    // The restraint that keeps the whole exercise credible.
    const o = analyse(`<!doctype html><html><body><div id="root"></div><script src="/app.js"></script>${CHAT}</body></html>`);
    expect(o.finding).toBe("inconclusive-client-rendered");
  });

  it("takes the caller's word when the caller used a real browser", () => {
    expect(analyse(page(CHAT), { clientRendered: true }).finding).toBe("inconclusive-client-rendered");
    expect(analyse(page(CHAT), { clientRendered: false }).finding).toBe("no-disclosure-found");
  });

  it("always says what it did not examine", () => {
    for (const html of [page(CHAT), page("<p>nothing</p>"), page(`<p>${DISCLOSURES.en.interaction}</p>${CHAT}`)]) {
      expect(analyse(html).limitations.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("ignores text inside script and style", () => {
    // A disclosure in a comment or a script string is not shown to anybody.
    const o = analyse(page(`${CHAT}<script>const notice = "You are chatting with an AI assistant";</script>`));
    expect(o.finding).toBe("no-disclosure-found");
  });
});

describe("the record it produces", () => {
  const OPTS = {
    url: "https://example.org/support",
    body: page(CHAT),
    observedAt: "2026-08-12T00:00:00.000Z",
    observer: { name: "@governancer-foundation/art50-disclosure-sdk", version: "0.1.0" },
  };

  it("validates against the shared schema", () => {
    const statement = toStatement(analyse(OPTS.body), OPTS);
    expect(validateStatement(statement).errors).toEqual([]);
  });

  it("validates for every finding the analyser can reach", () => {
    const bodies = [
      page(CHAT),
      page(`<p>${DISCLOSURES.en.interaction}</p>${CHAT}`),
      page(`<p>nothing here</p>`),
      `<!doctype html><html><body><div id="root"></div>${CHAT}</body></html>`,
    ];
    for (const body of bodies) {
      const s = toStatement(analyse(body), { ...OPTS, body });
      expect(validateStatement(s).errors, body.slice(0, 60)).toEqual([]);
    }
  });

  it("pins the subject to the response examined, not to the page", () => {
    // A live surface changes between requests; claiming the page is fixed
    // would assert something the observation cannot know.
    const s = toStatement(analyse(OPTS.body), OPTS);
    expect(s.subject[0]?.digest?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(s.subject[0]?.name).toBe(OPTS.url);
  });

  it("reports only the one finding it will stand behind as a negative", () => {
    const negative = toStatement(analyse(page(CHAT)), OPTS);
    expect(negative.predicate.assessment[0]?.outcome).toBe("doesNotSupport");

    const unsure = toStatement(analyse(page(CHAT), { clientRendered: true }), OPTS);
    expect(unsure.predicate.assessment[0]?.outcome).toBe("notEvaluated");
  });

  it("points at the requirement's published text instead of restating it", () => {
    const s = toStatement(analyse(OPTS.body), OPTS);
    expect(s.predicate.limitations.join(" ")).toMatch(/eur-lex\.europa\.eu/);
  });

  it("declares itself a third-party assessment", () => {
    expect(toStatement(analyse(OPTS.body), OPTS).predicate.assessor.independence).toBe("third-party");
  });
});
