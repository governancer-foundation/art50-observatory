#!/usr/bin/env bash
# check-commit-size.sh — enforce the per-commit size budget for public-bound
# commits (see the commit-size budget rule).
#
# Counts hand-authored added lines in a commit (or each commit in a range),
# excluding generated/vendored/legal/data files, and fails past the caps.
# A commit that adds 1000+ hand-authored lines reads as a generated dump to an
# outside reader regardless of how genuine the work is; small commits read as
# steady human construction.
#
# Usage:
#   bash scripts/check-commit-size.sh                 # pre-commit mode: HEAD
#   bash scripts/check-commit-size.sh HEAD            # one commit
#   bash scripts/check-commit-size.sh A..B            # every commit in a range
#   bash scripts/check-commit-size.sh --warn-only HEAD
#
# Environment:
#   ALLOW_LARGE_COMMIT=1   skip the check (genuinely indivisible change; the
#                          commit body must carry a `Size-note:` line)
#   SOFT_CAP   override 200 default (advisory)
#   HARD_CAP   override 400 default (blocking)
#
# Exit codes:
#   0  OK — every commit within budget (or bypassed / warn-only)
#   1  VIOLATION — a commit exceeds the hard cap (or soft cap in blocking mode)
#   2  BAD USAGE
#
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 Alexander Brichkin (Agonist Development AB)

set -euo pipefail

SOFT_CAP="${SOFT_CAP:-200}"
HARD_CAP="${HARD_CAP:-400}"
WARN_ONLY=0
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --warn-only) WARN_ONLY=1; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) TARGET="$1"; shift ;;
  esac
done

if [[ "${ALLOW_LARGE_COMMIT:-0}" == "1" ]]; then
  echo "check-commit-size: bypassed via ALLOW_LARGE_COMMIT=1 (expect a Size-note in the body)."
  exit 0
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "check-commit-size: not a git repository." >&2
  exit 2
fi

# Resolve the list of commits to check.
if [[ -z "$TARGET" ]]; then
  COMMITS="$(git rev-parse HEAD)"
elif [[ "$TARGET" == *..* ]]; then
  COMMITS="$(git rev-list --reverse "$TARGET")"
else
  COMMITS="$(git rev-parse "$TARGET")"
fi

if [[ -z "$COMMITS" ]]; then
  echo "check-commit-size: no commits to check for '$TARGET'."
  exit 0
fi

# A path is exempt (its added lines don't count) when it is generated,
# vendored, legal, data, or a binary/build artifact.
is_exempt() {
  local p="$1"
  case "$p" in
    *-lock.yaml|*.lock|pnpm-lock.yaml|package-lock.json|yarn.lock) return 0 ;;
    LICENSE|LICENSE.*|*/LICENSE|*/LICENSE.*) return 0 ;;
    LICENSES/*|*/LICENSES/*|NOTICE|*/NOTICE) return 0 ;;
    */fixtures/*|*/__fixtures__/*|*.fixture.*|*/testdata/*) return 0 ;;
    *.snap|*.min.*|*-weights.json) return 0 ;;
    dist/*|*/dist/*|build/*|*/build/*|out/*|*/out/*|coverage/*|*/coverage/*) return 0 ;;
    *.png|*.jpg|*.jpeg|*.gif|*.ico|*.svg|*.pdf|*.woff|*.woff2|*.ttf|*.eot) return 0 ;;
    *) return 1 ;;
  esac
}

rc=0
for sha in $COMMITS; do
  short="$(git rev-parse --short "$sha")"
  subject="$(git log -1 --format='%s' "$sha")"

  # Sum added lines per file from numstat, skipping exempt paths and binaries
  # (numstat reports '-' for binary files).
  counted=0
  while IFS=$'\t' read -r added _deleted path; do
    [[ -z "${path:-}" ]] && continue
    [[ "$added" == "-" ]] && continue
    is_exempt "$path" && continue
    counted=$((counted + added))
  done < <(git show --numstat --format='' "$sha")

  if [[ "$counted" -gt "$HARD_CAP" ]]; then
    echo "❌ $short  $counted counted lines (> hard cap $HARD_CAP)  — $subject"
    [[ "$WARN_ONLY" -eq 1 ]] || rc=1
  elif [[ "$counted" -gt "$SOFT_CAP" ]]; then
    echo "⚠️  $short  $counted counted lines (> soft cap $SOFT_CAP)  — $subject"
    # soft-cap breach is advisory only; does not fail unless you choose to.
  else
    echo "✅ $short  $counted counted lines  — $subject"
  fi
done

if [[ "$rc" -ne 0 ]]; then
  echo ""
  echo "  A commit exceeds the hard cap. Split it into smaller coherent commits"
  echo "  (the commit-size budget rule), or — if genuinely indivisible —"
  echo "  re-commit with ALLOW_LARGE_COMMIT=1 and a 'Size-note:' line explaining why."
fi
exit "$rc"
