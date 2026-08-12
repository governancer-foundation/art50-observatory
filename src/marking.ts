// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * Is this file marked as artificially generated, as Article 50(2) requires?
 *
 * The duty is to mark synthetic output in a machine-readable format, by
 * technical solutions that are "effective, interoperable, robust and reliable".
 * The disclosure SDK emits the values a signing tool should embed and never
 * claims the mark exists. This reads published media and finds out.
 *
 * ── Two kinds of mark, and they are not equal ──────────────────────────────
 *
 * A provenance manifest is cryptographically signed: tampering with it is
 * detectable, and the signature says who asserted what. A metadata tag is not
 * signed at all — anybody can write it and anybody can edit it. Both are
 * machine-readable and only one is evidence, so this reports them apart and
 * never adds them together.
 *
 * ── What presence does not prove ───────────────────────────────────────────
 *
 * Finding a manifest means bytes claiming to be one are present. It does not
 * mean the signature verifies, the certificate chains to anything, or the
 * claim inside is about this file — establishing that needs the full
 * verification toolchain, which this package deliberately is not. And a mark
 * that survives being read here may not survive a re-encode, which is the
 * property the Regulation's word "robust" is reaching for.
 *
 * Absence is weaker still: this reads a prefix of the file, and a mark placed
 * unusually late would be missed.
 *
 * Formats: JPEG carries the manifest in an APP11 segment, PNG in a `caBX`
 * chunk, WebP in a `c2pa` chunk, MP4 in a top-level `uuid` box. Tools that
 * strip only EXIF leave all of them intact — a fact worth knowing before
 * concluding anything from a file that has been through a pipeline.
 */

/** How strongly a mark can be relied on. */
export type MarkStrength =
  /** A signed provenance manifest: tampering is detectable. */
  | "signed-manifest"
  /** An unsigned metadata tag: readable by anyone, writable by anyone. */
  | "unsigned-tag";

export interface MarkEvidence {
  strength: MarkStrength;
  /** What was found, named in the terms of the format that carries it. */
  marker: string;
  /** Byte offset where it was found, so a reader can go and look. */
  offset: number;
  reason: string;
}

export type MarkFinding =
  /** At least one signed provenance manifest is present. */
  | "signed-mark-present"
  /** Only an unsigned tag is present — machine-readable, but nobody vouches for it. */
  | "unsigned-mark-only"
  /** Nothing found in the bytes examined. */
  | "no-mark-found"
  /** The container is not one this reader understands. */
  | "container-not-recognised";

export interface MarkObservation {
  finding: MarkFinding;
  /** The container this reader believes it is looking at. */
  container?: "jpeg" | "png" | "webp" | "mp4" | "gif";
  evidence: MarkEvidence[];
  /** Never empty. */
  limitations: string[];
}

/** The IPTC term that says a generative model made this, in both accepted forms. */
const DIGITAL_SOURCE_TYPE = {
  uri: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
  compositeUri:
    "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia",
  // Readers must accept the bare identifier too: some publishers write only that.
  id: "trainedAlgorithmicMedia",
  compositeId: "compositeWithTrainedAlgorithmicMedia",
} as const;

function ascii(bytes: Uint8Array, at: number, length: number): string {
  let out = "";
  for (let i = at; i < Math.min(at + length, bytes.length); i++) out += String.fromCharCode(bytes[i]!);
  return out;
}

function indexOfAscii(bytes: Uint8Array, needle: string, from = 0): number {
  const first = needle.charCodeAt(0);
  for (let i = from; i <= bytes.length - needle.length; i++) {
    if (bytes[i] !== first) continue;
    let hit = true;
    for (let j = 1; j < needle.length; j++) {
      if (bytes[i + j] !== needle.charCodeAt(j)) {
        hit = false;
        break;
      }
    }
    if (hit) return i;
  }
  return -1;
}

function detectContainer(bytes: Uint8Array): MarkObservation["container"] | undefined {
  if (bytes.length < 12) return undefined;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (ascii(bytes, 1, 3) === "PNG") return "png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  if (ascii(bytes, 4, 4) === "ftyp") return "mp4";
  if (ascii(bytes, 0, 3) === "GIF") return "gif";
  return undefined;
}

/** Walk the JPEG marker chain looking for APP11, which is where a manifest lives. */
function findJpegApp11(bytes: Uint8Array): number[] {
  const found: number[] = [];
  let i = 2; // past the start-of-image marker
  while (i + 4 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1]!;
    // Start of scan: image data follows and there are no more headers to read.
    if (marker === 0xda) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (length < 2) break;
    if (marker === 0xeb) found.push(i);
    i += 2 + length;
  }
  return found;
}

/** Walk PNG chunks. The manifest chunk is `caBX`; siblings are `caMs` and `caSt`. */
function findPngChunks(bytes: Uint8Array, names: string[]): { name: string; at: number }[] {
  const found: { name: string; at: number }[] = [];
  let i = 8; // past the signature
  while (i + 8 <= bytes.length) {
    const length =
      ((bytes[i]! << 24) >>> 0) + (bytes[i + 1]! << 16) + (bytes[i + 2]! << 8) + bytes[i + 3]!;
    const name = ascii(bytes, i + 4, 4);
    if (names.includes(name)) found.push({ name, at: i });
    if (name === "IEND" || length > bytes.length) break;
    i += 12 + length;
  }
  return found;
}

export interface MarkOptions {
  /**
   * Say so when only part of the file was read. Absence in a prefix is a much
   * weaker statement than absence in a whole file, and the record should show
   * which one it is.
   */
  truncated?: boolean;
}

/**
 * Examine a file's bytes for a machine-readable mark.
 *
 * Pure, and reads no more than it is given. Parsing is structural rather than
 * a scan for magic strings wherever they fall: a manifest is reported because
 * it sits in the box the format puts it in, not because the bytes appear
 * somewhere in the file.
 */
export function detectMark(bytes: Uint8Array, options: MarkOptions = {}): MarkObservation {
  const container = detectContainer(bytes);
  const evidence: MarkEvidence[] = [];

  if (container === "jpeg") {
    for (const at of findJpegApp11(bytes)) {
      // An APP11 segment is only a C2PA one if the JUMBF container is inside it.
      const window = ascii(bytes, at, 64);
      if (window.includes("jumb") || window.includes("JP")) {
        evidence.push({
          strength: "signed-manifest",
          marker: "JPEG APP11 segment carrying a JUMBF box",
          offset: at,
          reason: "the box the format reserves for a provenance manifest is present",
        });
      }
    }
  } else if (container === "png") {
    for (const { name, at } of findPngChunks(bytes, ["caBX", "caMs", "caSt"])) {
      evidence.push({
        strength: "signed-manifest",
        marker: `PNG ${name} chunk`,
        offset: at,
        reason: "the chunk the format reserves for a provenance manifest is present",
      });
    }
  } else if (container === "webp" || container === "mp4") {
    const at = indexOfAscii(bytes, "c2pa");
    if (at >= 0) {
      evidence.push({
        strength: "signed-manifest",
        marker: `${container} container carrying a c2pa box`,
        offset: at,
        reason: "the box the format reserves for a provenance manifest is present",
      });
    }
  }

  // The metadata tag, in either accepted spelling, in any container. Unsigned,
  // and reported as such: it says somebody wrote this, not that it is true.
  for (const [key, needle] of Object.entries(DIGITAL_SOURCE_TYPE)) {
    const at = indexOfAscii(bytes, needle);
    if (at < 0) continue;
    // The bare identifier is a substring of the full URI; do not report both.
    if ((key === "id" || key === "compositeId") && evidence.some((e) => e.marker.includes("URI"))) {
      continue;
    }
    evidence.push({
      strength: "unsigned-tag",
      marker: key.endsWith("Uri") || key === "uri" ? "IPTC digital source type, full URI" : "IPTC digital source type, bare identifier",
      offset: at,
      reason: "a metadata tag naming the source as generated by a trained model",
    });
  }

  const limitations = [
    "Presence was checked, not validity. A manifest found here is bytes claiming to be one; whether its signature verifies, its certificate chains, or its claim is about this file needs the full verification toolchain, which this is not.",
    "An unsigned metadata tag is a statement by whoever wrote the file. Anybody can write one and anybody can edit one; it is machine-readable, and it is not evidence.",
    "Article 50(2) asks for solutions that are effective, interoperable, robust and reliable. Finding a mark says nothing about whether it survives a re-encode, which is what robust is reaching for.",
  ];
  if (options.truncated) {
    limitations.push(
      "Only the beginning of the file was read. A mark placed unusually late would have been missed, so absence here is weaker than absence from a whole file.",
    );
  }
  if (!container) {
    limitations.push(
      "The container was not recognised, so no format-specific box was looked for; only the metadata tag was searched.",
    );
  }

  let finding: MarkFinding;
  if (evidence.some((e) => e.strength === "signed-manifest")) finding = "signed-mark-present";
  else if (evidence.length > 0) finding = "unsigned-mark-only";
  else if (!container) finding = "container-not-recognised";
  else finding = "no-mark-found";

  return { finding, ...(container ? { container } : {}), evidence, limitations };
}
