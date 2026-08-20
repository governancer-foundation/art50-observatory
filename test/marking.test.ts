// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * Reading a file for the mark Article 50(2) requires.
 *
 * The distinction the suite is built around: a signed manifest and an unsigned
 * tag are both machine-readable and only one is evidence. Conflating them
 * would let anybody claim provenance by typing a string into their metadata.
 */
import { describe, expect, it } from "vitest";
import { validateStatement } from "@governancer-foundation/conformance-attestation";

import { detectMark } from "../src/marking.js";
import { toMarkStatement } from "../src/record.js";

const enc = new TextEncoder();

function bytes(...parts: (string | number[] | Uint8Array)[]): Uint8Array {
  const chunks = parts.map((p) =>
    typeof p === "string" ? enc.encode(p) : p instanceof Uint8Array ? p : Uint8Array.from(p),
  );
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** A JPEG with one APP11 segment of the given payload. */
function jpegWithApp11(payload: string): Uint8Array {
  const body = enc.encode(payload);
  const len = body.length + 2;
  return bytes([0xff, 0xd8], [0xff, 0xeb, (len >> 8) & 0xff, len & 0xff], payload, [0xff, 0xda], "imagedata");
}

/** A JPEG with an ordinary EXIF segment and nothing else. */
function plainJpeg(): Uint8Array {
  const payload = "Exif\0\0some ordinary metadata";
  const body = enc.encode(payload);
  const len = body.length + 2;
  return bytes([0xff, 0xd8], [0xff, 0xe1, (len >> 8) & 0xff, len & 0xff], payload, [0xff, 0xda], "imagedata");
}

/** A PNG with the named chunk. */
function pngWithChunk(name: string, payload = "x"): Uint8Array {
  const body = enc.encode(payload);
  const n = body.length;
  return bytes(
    [0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a],
    [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff], name, payload, [0, 0, 0, 0],
    [0, 0, 0, 0], "IEND", [0, 0, 0, 0],
  );
}

function plainPng(): Uint8Array {
  return pngWithChunk("IDAT", "pixels");
}

describe("recognising the container", () => {
  it("names each container it understands", () => {
    expect(detectMark(plainJpeg()).container).toBe("jpeg");
    expect(detectMark(plainPng()).container).toBe("png");
    expect(detectMark(bytes("RIFF", [0, 0, 0, 0], "WEBP")).container).toBe("webp");
    expect(detectMark(bytes([0, 0, 0, 0], "ftypmp42")).container).toBe("mp4");
  });

  it("draws no conclusion from an error page served in place of an image", () => {
    // A scanner meets this constantly: a host declines the request and returns
    // HTML where a file was expected. Reporting that as "no mark found" would
    // record a publisher as unmarked on the strength of a refusal. Observed
    // against a live image host on the first real run.
    const errorPage = enc.encode(
      "<!DOCTYPE html>\n<html><body><h1>Forbidden</h1><p>Your request was denied.</p></body></html>",
    );
    const o = detectMark(errorPage);
    expect(o.finding).toBe("container-not-recognised");
    expect(toMarkStatement(o, {
      url: "https://example.test/clip.png",
      bytes: errorPage,
      observedAt: "2026-08-12T00:00:00.000Z",
      observer: { name: "obs", version: "0.1.0" },
    }).predicate.assessment[0]?.outcome).toBe("notEvaluated");
  });

  it("draws no conclusion from a container it does not understand", () => {
    const o = detectMark(enc.encode("just some text, not a media file at all"));
    expect(o.finding).toBe("container-not-recognised");
    expect(o.limitations.join(" ")).toMatch(/container was not recognised/i);
  });
});

describe("a signed manifest", () => {
  it("is found in the JPEG segment the format reserves for it", () => {
    const o = detectMark(jpegWithApp11("JP\0\0jumb c2pa manifest bytes"));
    expect(o.finding).toBe("signed-mark-present");
    expect(o.evidence[0]?.strength).toBe("signed-manifest");
  });

  it("is found in each PNG chunk the format reserves for it", () => {
    for (const chunk of ["caBX", "caMs", "caSt"]) {
      expect(detectMark(pngWithChunk(chunk)).finding, chunk).toBe("signed-mark-present");
    }
  });

  it("is found in a WebP or MP4 container", () => {
    expect(detectMark(bytes("RIFF", [0, 0, 0, 0], "WEBP", "c2pa", "payload")).finding).toBe(
      "signed-mark-present",
    );
  });

  it("is not claimed for an APP11 segment that carries something else", () => {
    // APP11 is a general-purpose segment. Reporting every one of them as a
    // manifest would be the same class of error as reading a search box as a
    // chatbot.
    expect(detectMark(jpegWithApp11("some other application data")).finding).toBe("no-mark-found");
  });

  it("is not claimed for an ordinary file", () => {
    expect(detectMark(plainJpeg()).finding).toBe("no-mark-found");
    expect(detectMark(plainPng()).finding).toBe("no-mark-found");
  });
});

describe("an unsigned tag", () => {
  it("is recognised as the full published URI", () => {
    const o = detectMark(
      bytes(plainJpeg(), "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"),
    );
    expect(o.finding).toBe("unsigned-mark-only");
    expect(o.evidence[0]?.strength).toBe("unsigned-tag");
  });

  it("is recognised as the bare identifier, which some publishers write instead", () => {
    const o = detectMark(bytes(plainJpeg(), "<Iptc4xmpExt:DigitalSourceType>trainedAlgorithmicMedia"));
    expect(o.finding).toBe("unsigned-mark-only");
  });

  it("is never mistaken for a signed one", () => {
    // The distinction the whole module turns on: anybody can write this string.
    const o = detectMark(bytes(plainJpeg(), "trainedAlgorithmicMedia"));
    expect(o.evidence.every((e) => e.strength === "unsigned-tag")).toBe(true);
    expect(o.finding).not.toBe("signed-mark-present");
  });

  it("says in the record that nobody vouches for it", () => {
    const o = detectMark(bytes(plainJpeg(), "trainedAlgorithmicMedia"));
    expect(o.limitations.join(" ")).toMatch(/anybody can write one/i);
  });
});

describe("what it always says it did not do", () => {
  it("checked presence, not validity", () => {
    const o = detectMark(jpegWithApp11("JP\0\0jumb c2pa"));
    expect(o.limitations.join(" ")).toMatch(/presence was checked, not validity/i);
  });

  it("says nothing about whether the mark survives a re-encode", () => {
    expect(detectMark(plainJpeg()).limitations.join(" ")).toMatch(/re-encode/i);
  });

  it("marks a weaker absence when only a prefix was read", () => {
    const whole = detectMark(plainJpeg());
    const prefix = detectMark(plainJpeg(), { truncated: true });
    expect(prefix.limitations.length).toBeGreaterThan(whole.limitations.length);
    expect(prefix.limitations.join(" ")).toMatch(/only the beginning/i);
  });
});

describe("the record it produces", () => {
  const OPTS = {
    url: "https://example.org/clip.jpg",
    observedAt: "2026-08-12T00:00:00.000Z",
    observer: { name: "@governancer-foundation/art50-disclosure-sdk", version: "0.1.0" },
  };

  it("validates for every finding the detector can reach", () => {
    const cases: Uint8Array[] = [
      jpegWithApp11("JP\0\0jumb c2pa"),
      bytes(plainJpeg(), "trainedAlgorithmicMedia"),
      plainJpeg(),
      enc.encode("not a media file"),
    ];
    for (const b of cases) {
      const s = toMarkStatement(detectMark(b), { ...OPTS, bytes: b });
      expect(validateStatement(s).errors).toEqual([]);
    }
  });

  it("only reaches support on a signed manifest", () => {
    const signed = toMarkStatement(detectMark(jpegWithApp11("JP\0\0jumb c2pa")), {
      ...OPTS, bytes: jpegWithApp11("JP\0\0jumb c2pa"),
    });
    expect(signed.predicate.assessment[0]?.outcome).toBe("supports");

    const tagged = bytes(plainJpeg(), "trainedAlgorithmicMedia");
    const unsigned = toMarkStatement(detectMark(tagged), { ...OPTS, bytes: tagged });
    expect(unsigned.predicate.assessment[0]?.outcome).toBe("notEvaluated");
  });

  it("carries the December date, not the August one", () => {
    // The marking duty binds a system already on the market from a later date
    // than the rest of the article. A record dated against the wrong one would
    // call a publisher late who is not.
    const b = plainJpeg();
    const s = toMarkStatement(detectMark(b), { ...OPTS, bytes: b });
    expect(s.predicate.assessment[0]?.bindingFrom).toBe("2026-12-02");
  });

  it("names the marking requirement, not the interaction one", () => {
    const b = plainJpeg();
    const s = toMarkStatement(detectMark(b), { ...OPTS, bytes: b });
    expect(s.predicate.assessment[0]?.requirement).toBe("EU-2024-1689:Art50.2");
  });
});
