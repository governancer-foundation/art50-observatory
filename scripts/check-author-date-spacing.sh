#!/usr/bin/env bash
# check-author-date-spacing.sh — enforce ≥10 min gap between consecutive
# commit author-dates on the current branch.
#
# Prevents the AI-batch-commit tell: a sequence of commits whose author-dates
# are within seconds of each other reads as «automated batch» to outside
# readers and contributors regardless of engineering quality.
#
# Usage:
#   bash scripts/check-author-date-spacing.sh               # pre-commit mode: HEAD vs HEAD~1
#   bash scripts/check-author-date-spacing.sh --range A..B  # check all consecutive pairs in range
#   bash scripts/check-author-date-spacing.sh --allow-batch # skip check (rebase / pre-approved batch)
#
# Environment:
#   ALLOW_FAST_COMMITS=1   skip check (same as --allow-batch, for use in commit loops)
#   MIN_SPACING_SECONDS    override 600s default (useful for tests)
#
# Exit codes:
#   0  OK — spacing requirement met (or bypassed)
#   1  VIOLATION — at least one consecutive pair < MIN_SPACING_SECONDS apart
#   2  BAD USAGE — bad arguments, not in a git repo, empty history
#
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 Agonist Development AB

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MIN_SPACING_SECONDS="${MIN_SPACING_SECONDS:-600}"  # 10 minutes default
RANGE=""
ALLOW_BATCH=0

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-batch)
      ALLOW_BATCH=1
      shift
      ;;
    --range)
      if [[ -z "${2:-}" ]]; then
        echo "ERROR: --range requires an argument (e.g. --range origin/main..HEAD)" >&2
        exit 2
      fi
      RANGE="$2"
      shift 2
      ;;
    --range=*)
      RANGE="${1#--range=}"
      shift
      ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument '$1'. Run with --help for usage." >&2
      exit 2
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Bypass checks
# ---------------------------------------------------------------------------
if [[ "${ALLOW_FAST_COMMITS:-0}" = "1" || "$ALLOW_BATCH" = "1" ]]; then
  echo "check-author-date-spacing: bypass active (ALLOW_FAST_COMMITS or --allow-batch). Skipping."
  exit 0
fi

# ---------------------------------------------------------------------------
# Verify we are in a git repository
# ---------------------------------------------------------------------------
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "ERROR: not in a git repository." >&2
  exit 2
fi

# ---------------------------------------------------------------------------
# Helper: check a pair of Unix timestamps
# Returns 0 if OK, 1 if violation; prints human-readable output on violation
# ---------------------------------------------------------------------------
check_pair() {
  local sha_newer="$1"
  local ts_newer="$2"
  local sha_older="$3"
  local ts_older="$4"

  local gap=$(( ts_newer - ts_older ))

  if [[ "$gap" -lt "$MIN_SPACING_SECONDS" ]]; then
    local gap_s="$gap"
    local min_s="$MIN_SPACING_SECONDS"

    # Format dates for humans (works on macOS + GNU date)
    local date_newer date_older
    if date --version >/dev/null 2>&1; then
      # GNU date
      date_newer=$(date -d "@${ts_newer}" '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || echo "@${ts_newer}")
      date_older=$(date -d "@${ts_older}" '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || echo "@${ts_older}")
    else
      # macOS BSD date
      date_newer=$(date -r "${ts_newer}" '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || echo "@${ts_newer}")
      date_older=$(date -r "${ts_older}" '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || echo "@${ts_older}")
    fi

    echo ""
    echo "  SPACING VIOLATION"
    echo "  ─────────────────────────────────────────────────────────────"
    echo "  older commit : ${sha_older:0:12}  (${date_older})"
    echo "  newer commit : ${sha_newer:0:12}  (${date_newer})"
    echo "  gap          : ${gap_s}s  (minimum required: ${min_s}s = 10 min)"
    echo ""
    echo "  Outside readers see timestamps, not your intent."
    echo "  A gap < 10 min between consecutive commits pattern-matches as"
    echo "  an automated batch to outside readers and contributors."
    echo ""
    echo "  Fixes:"
    echo "    a) Wait at least $(( min_s - gap_s )) more seconds before committing."
    echo "    b) Merge the changes into the previous commit:"
    echo "         git add <files> && git commit --amend --no-edit"
    echo "    c) If this IS a pre-approved batch (rebase / Day-0 extraction):"
    echo "         ALLOW_FAST_COMMITS=1 git commit ..."
    echo "       or  bash scripts/check-author-date-spacing.sh --allow-batch"
    echo "  ─────────────────────────────────────────────────────────────"
    echo ""
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# Mode 1: pre-commit hook — compare the about-to-be-committed moment (NOW)
#          against HEAD's author-date.
# ---------------------------------------------------------------------------
if [[ -z "$RANGE" ]]; then
  # Check if there is at least one existing commit
  if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
    # No commits yet — first commit always allowed
    echo "check-author-date-spacing: first commit on branch — OK."
    exit 0
  fi

  # Count commits
  COMMIT_COUNT=$(git rev-list --count HEAD 2>/dev/null || echo 0)
  if [[ "$COMMIT_COUNT" -lt 1 ]]; then
    echo "check-author-date-spacing: fewer than 2 commits — nothing to compare. OK."
    exit 0
  fi

  HEAD_TS=$(git log -1 --format="%at" HEAD 2>/dev/null || echo 0)
  HEAD_SHA=$(git log -1 --format="%H" HEAD 2>/dev/null || echo "HEAD")
  NOW_TS=$(date +%s)
  NOW_LABEL="(about to commit)"

  GAP=$(( NOW_TS - HEAD_TS ))
  if [[ "$GAP" -lt "$MIN_SPACING_SECONDS" ]]; then
    REMAINING=$(( MIN_SPACING_SECONDS - GAP ))

    # Format HEAD date
    if date --version >/dev/null 2>&1; then
      HEAD_DATE=$(date -d "@${HEAD_TS}" '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || echo "@${HEAD_TS}")
    else
      HEAD_DATE=$(date -r "${HEAD_TS}" '+%Y-%m-%d %H:%M:%S %Z' 2>/dev/null || echo "@${HEAD_TS}")
    fi

    echo ""
    echo "  SPACING VIOLATION — pre-commit check"
    echo "  ─────────────────────────────────────────────────────────────"
    echo "  previous commit  : ${HEAD_SHA:0:12}  (${HEAD_DATE})"
    echo "  now              : ${NOW_LABEL}"
    echo "  gap so far       : ${GAP}s  (minimum required: ${MIN_SPACING_SECONDS}s = 10 min)"
    echo "  wait at least    : ${REMAINING} more seconds ($(( REMAINING / 60 ))m $(( REMAINING % 60 ))s)"
    echo ""
    echo "  Option A: wait ${REMAINING}s before committing."
    echo "  Option B: amend the previous commit instead of making a new one:"
    echo "              git add <files> && git commit --amend --no-edit"
    echo "  Option C: pre-approved batch — bypass:"
    echo "              ALLOW_FAST_COMMITS=1 git commit ..."
    echo "  ─────────────────────────────────────────────────────────────"
    echo ""
    exit 1
  fi

  echo "check-author-date-spacing: gap = ${GAP}s (>= ${MIN_SPACING_SECONDS}s required). OK."
  exit 0
fi

# ---------------------------------------------------------------------------
# Mode 2: --range A..B — check all consecutive pairs in the range
# ---------------------------------------------------------------------------
if ! git rev-parse --verify "${RANGE%%..*}" >/dev/null 2>&1 2>&1 || \
   ! git rev-parse --verify "${RANGE##*..}" >/dev/null 2>&1 2>&1; then
  # Soft-check: just verify the range resolves at all
  if ! git log "$RANGE" --oneline -1 >/dev/null 2>&1; then
    echo "ERROR: git range '$RANGE' did not resolve. Check the ref names." >&2
    exit 2
  fi
fi

# Collect list of (sha, author-timestamp) pairs, oldest-first
# Note: mapfile / readarray is bash 4+ only; macOS ships bash 3.2.
# Use a while-read loop for portability.
COMMIT_LIST=$(git log "$RANGE" --format="%H %at" --reverse 2>/dev/null)
COMMIT_COUNT_RANGE=$(echo "$COMMIT_LIST" | grep -c '.' 2>/dev/null || echo 0)

if [[ "$COMMIT_COUNT_RANGE" -lt 2 ]]; then
  echo "check-author-date-spacing: range '$RANGE' has fewer than 2 commits — nothing to compare. OK."
  exit 0
fi

VIOLATIONS=0
PREV_SHA=""
PREV_TS=""

while IFS=" " read -r SHA TS; do
  [[ -z "$SHA" ]] && continue

  if [[ -n "$PREV_SHA" ]]; then
    if ! check_pair "$SHA" "$TS" "$PREV_SHA" "$PREV_TS"; then
      VIOLATIONS=$(( VIOLATIONS + 1 ))
    fi
  fi

  PREV_SHA="$SHA"
  PREV_TS="$TS"
done <<< "$COMMIT_LIST"

if [[ "$VIOLATIONS" -gt 0 ]]; then
  echo "check-author-date-spacing: FAIL — ${VIOLATIONS} spacing violation(s) in range '$RANGE'."
  echo ""
  echo "  To fix: combine clustered commits via interactive rebase:"
  echo "    git rebase -i \$(git merge-base HEAD origin/main)"
  echo "    (use 'squash' or 'fixup' to merge close-together commits)"
  echo ""
  echo "  Or for a pre-approved batch: re-run with --allow-batch"
  exit 1
fi

echo "check-author-date-spacing: PASS — all $COMMIT_COUNT_RANGE commits in '$RANGE' satisfy ≥${MIN_SPACING_SECONDS}s spacing."
exit 0
