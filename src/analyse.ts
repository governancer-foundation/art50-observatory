// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * Does this page tell a visitor they are about to talk to a machine?
 *
 * Article 50(1) is the least ambiguous of the transparency duties and the only
 * one observable from outside: a system that interacts directly with people
 * must inform them it is an AI system, at the latest at the time of the first
 * interaction. On a public page that is a fact about the markup a visitor is
 * served, and it can be checked without an account, without interacting, and
 * without asking the operator anything.
 *
 * ── What this refuses to conclude ──────────────────────────────────────────
 *
 * Not finding a disclosure is not the same as there being none, and this
 * module will not pretend otherwise. A notice can be painted by script after
 * load, live inside a third-party frame, or appear only once the widget is
 * opened. Every observation therefore carries what was examined and what was
 * not, and the strongest negative it will state is that no disclosure was
 * found in the served markup — which is a fact, where "the operator is in
 * breach" would be a guess wearing a fact's clothes.
 *
 * That restraint is the point. An observatory that overstates once is an
 * observatory nobody cites again.
 */

import { DISCLOSURES, LOCALES, type Locale } from "@governancer-foundation/art50-disclosure-sdk";

/** How confident the observation is, and why it cannot be more. */
export type Finding =
  /** A chat surface was found and a disclosure was found with it. */
  | "disclosed"
  /** A chat surface was found and no disclosure was found in the served markup. */
  | "no-disclosure-found"
  /** A chat surface was found but the page defers its content to script. */
  | "inconclusive-client-rendered"
  /** No interactive surface was found; the duty is not raised by this page. */
  | "no-interactive-surface";

export interface Evidence {
  /** What matched, in the page's own words, trimmed. */
  excerpt: string;
  /** Why the match counted. */
  reason: string;
}

export interface Observation {
  finding: Finding;
  /** Signals that a surface interacts directly with a person. */
  surfaceEvidence: Evidence[];
  /** Signals that the page says it is an AI system. */
  disclosureEvidence: Evidence[];
  /** The language the disclosure was recognised in, when one was. */
  disclosureLocale?: Locale;
  /** What this observation did not examine. Never empty. */
  limitations: string[];
}

/**
 * Markup that indicates a surface a person types into and gets answers from.
 *
 * Deliberately conservative. A contact form is not an AI system, and a false
 * positive here produces a finding about a duty that was never raised — which
 * costs an operator time to rebut and costs the observatory its standing.
 */
/**
 * Markup that means an input is for searching rather than conversing.
 *
 * Checked before the signals below, because a search box in a dialog matches
 * several of them and is never the subject of this duty.
 */
const SEARCH_SIGNALS: RegExp[] = [
  /<input[^>]+\btype=["']?search["']?/i,
  /\brole=["']?search["']?/i,
  /<(input|textarea)[^>]+\b(?:id|name|class|aria-label|placeholder)=["'][^"']*\bsearch\b[^"']*["']/i,
];

const SURFACE_SIGNALS: { pattern: RegExp; reason: string }[] = [
  {
    // A dialog holding an input is not enough on its own. Search boxes live in
    // dialogs, and calling one a conversational surface produces a finding
    // about a duty that was never raised — observed on a legal-database page
    // whose search dialog was read as a chatbot. The region has to name itself
    // conversationally as well.
    pattern:
      /<[^>]+\brole=["']?(dialog|log)["']?[^>]*\b(?:id|class|aria-label|data-testid)=["'][^"']*\b(chat|assistant|bot|conversation|message)\b[^"']*["'][^>]*>(?=[\s\S]{0,4000}?<(input|textarea)\b)/i,
    reason: "a dialog region named as a conversation, containing a text input",
  },
  {
    pattern: /\b(?:id|class|data-testid)=["'][^"']*\b(chat|chatbot|messenger|livechat|assistant)\b[^"']*["']/i,
    reason: "an element named as a chat surface",
  },
  {
    pattern: /aria-label=["'][^"']*\b(chat|chatbot|assistant|virtual agent|send message)\b[^"']*["']/i,
    reason: "an accessible name describing a chat surface",
  },
  {
    pattern: /<script[^>]+src=["'][^"']*\b(intercom|drift|tawk|crisp|livechat|zendesk|hubspot|freshchat|tidio)\b/i,
    reason: "a known conversational widget loaded by script",
  },
  {
    pattern: /<(input|textarea)[^>]+placeholder=["'][^"']*\b(ask|message|question|type your|how can (?:i|we) help)\b/i,
    reason: "an input inviting a question",
  },
];

/** Phrases that assert the counterpart is a machine, beyond the shipped notices. */
const DISCLOSURE_PHRASES: RegExp[] = [
  /\b(?:you (?:are|'re) (?:now )?(?:talking|chatting|interacting|speaking) (?:with|to) (?:an? )?(?:ai|bot|virtual assistant|automated|machine))\b/i,
  /\b(?:this is|i am|i'm) (?:an? )?(?:ai|chatbot|bot|virtual assistant|automated assistant)\b/i,
  /\b(?:ai|automated) (?:assistant|agent|chatbot)\b/i,
  /\b(?:powered by|responses generated by) (?:ai|artificial intelligence)\b/i,
  /\bkünstliche intelligenz\b|\bKI-System\b/i,
  /\bsystème d'ia\b|\bintelligence artificielle\b/i,
  /\bsistema de ia\b|\binteligencia artificial\b/i,
  /\bsistema di ia\b|\bintelligenza artificiale\b/i,
  /\bAI-system\b|\bartificiell intelligens\b/i,
];

/** Markup that means the page's real content arrives later, from script. */
const CLIENT_RENDERED: RegExp[] = [
  /<div[^>]+\bid=["'](root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/i,
  /<noscript>[\s\S]{0,400}?\b(enable javascript|requires javascript)\b/i,
];

const TAGS = /<[^>]+>/g;
const WHITESPACE = /\s+/g;

/** Visible text, roughly: enough to find a sentence, not a rendering engine. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(TAGS, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(WHITESPACE, " ")
    .trim();
}

function excerptAround(haystack: string, match: string): string {
  const at = haystack.toLowerCase().indexOf(match.toLowerCase());
  if (at < 0) return match.slice(0, 120);
  return haystack.slice(Math.max(0, at - 40), at + match.length + 40).trim();
}

/** The disclosure wording the SDK ships, in every language it ships it in. */
function shippedNotices(): { locale: Locale; text: string }[] {
  return LOCALES.flatMap((locale) => [
    { locale, text: DISCLOSURES[locale].interaction },
    { locale, text: DISCLOSURES[locale].interactionReminder },
  ]);
}

export interface AnalyseOptions {
  /**
   * Treat the page as client-rendered without guessing. A caller that fetched
   * with a real browser knows the answer and should say so.
   */
  clientRendered?: boolean;
}

/**
 * Examine served markup for an interaction surface and a disclosure.
 *
 * Pure: no network, no filesystem, no clock. The same markup gives the same
 * observation, which is what lets an observation be filed as evidence.
 */
export function analyse(html: string, options: AnalyseOptions = {}): Observation {
  const text = visibleText(html);

  const surfaceEvidence: Evidence[] = [];
  for (const { pattern, reason } of SURFACE_SIGNALS) {
    const m = pattern.exec(html);
    if (!m) continue;
    // A match that is plainly a search control is discarded rather than
    // reported: this duty has nothing to do with searching, and a wrong
    // positive is the expensive kind of error here.
    if (SEARCH_SIGNALS.some((sp) => sp.test(m[0]))) continue;
    surfaceEvidence.push({ excerpt: m[0].slice(0, 160).trim(), reason });
  }

  const disclosureEvidence: Evidence[] = [];
  let disclosureLocale: Locale | undefined;

  // The wording this project publishes, first: an operator using it should be
  // recognised in the language they used.
  for (const { locale, text: notice } of shippedNotices()) {
    if (text.toLowerCase().includes(notice.toLowerCase())) {
      disclosureEvidence.push({
        excerpt: excerptAround(text, notice),
        reason: `the published notice wording, in ${locale}`,
      });
      disclosureLocale ??= locale;
    }
  }
  for (const pattern of DISCLOSURE_PHRASES) {
    const m = pattern.exec(text);
    if (m) {
      disclosureEvidence.push({
        excerpt: excerptAround(text, m[0]),
        reason: "a phrase asserting the counterpart is a machine",
      });
    }
  }

  const clientRendered =
    options.clientRendered === true ||
    (options.clientRendered !== false && CLIENT_RENDERED.some((p) => p.test(html)));

  const limitations = [
    "Only the markup served to an unauthenticated visitor was examined. Nothing was interacted with, and nothing behind a login was seen.",
    "A notice painted by script after load, or served inside a third-party frame, would not be visible here.",
    "Surface detection is conservative: a page using an unrecognised widget may hold an interaction surface this did not see.",
  ];
  if (clientRendered) {
    limitations.push(
      "The page defers its content to script, so the served markup is not what a visitor reads.",
    );
  }

  let finding: Finding;
  if (surfaceEvidence.length === 0) {
    finding = "no-interactive-surface";
  } else if (disclosureEvidence.length > 0) {
    finding = "disclosed";
  } else if (clientRendered) {
    // A page whose content arrives from script cannot support a negative. Saying
    // so is the difference between an observation and an accusation.
    finding = "inconclusive-client-rendered";
  } else {
    finding = "no-disclosure-found";
  }

  return {
    finding,
    surfaceEvidence,
    disclosureEvidence,
    ...(disclosureLocale ? { disclosureLocale } : {}),
    limitations,
  };
}
