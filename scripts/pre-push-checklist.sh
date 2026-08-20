#!/usr/bin/env bash
#
# Pre-push checklist — the single command that runs every locally-runnable
# gate before a push, so "ready to push" is a verified claim rather than an
# impression. The pre-commit hook runs a narrow subset on the staged diff
# only; this is the superset over the whole tree and the whole push range.
#
# Usage:
#
#   bash scripts/pre-push-checklist.sh [<range>] [--public] [--cheap-only]
#
# - <range> defaults to the unpushed range (`@{u}..HEAD`). For a first push
#   use `<base-branch>..HEAD`.
# - --public tightens the audit for a push that reaches the public repo.
# - --cheap-only skips the slow gates (typecheck / test / build) so the git
#   pre-push hook stays responsive on routine canonical pushes. The slow
#   gates still run in CI and are mandatory before any public push.
#
# Exit codes:
#   0 — every required gate green
#   1 — at least one gate failed; do NOT push
#   2 — invocation error
#
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 Agonist Development AB

set -uo pipefail

CANONICAL_AUTHOR="Alexander Brichkin (Agonist Development AB) <git@governancer.com>"

DEFAULT_RANGE='@{u}..HEAD'
RANGE=""
PUBLIC_MODE=0
CHEAP_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --public)     PUBLIC_MODE=1 ;;
    --cheap-only) CHEAP_ONLY=1 ;;
    *)
      if [[ -z "$RANGE" ]]; then RANGE="$arg"; fi
      ;;
  esac
done
[[ -z "$RANGE" ]] && RANGE="$DEFAULT_RANGE"

# ────────────────────────────────────────────────────────────────────────────
# State + reporting
# ────────────────────────────────────────────────────────────────────────────

PASSED=()
FAILED=()
WARNED=()

ok()   { PASSED+=("$1"); printf '\033[32m✓\033[0m %s\n' "$1"; }
fail() { FAILED+=("$1"); printf '\033[31m✗\033[0m %s\n' "$1"; }
warn() { WARNED+=("$1"); printf '\033[33m⚠\033[0m %s\n' "$1"; }

run_gate() {
  local name="$1"; shift
  local out rc
  out=$("$@" 2>&1); rc=$?
  if [[ $rc -eq 0 ]]; then
    ok "$name"
  else
    fail "$name (exit $rc)"
    printf '  └─ %s\n' "$(echo "$out" | tail -1)"
  fi
  return $rc
}

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo "ERROR: must run inside a git worktree" >&2; exit 2
}
[[ "$PWD" == "$REPO_ROOT" ]] || {
  echo "ERROR: must run from repo root ($REPO_ROOT)" >&2; exit 2
}

printf '\n═══ pre-push checklist — range %s ═══\n\n' "$RANGE"

# ────────────────────────────────────────────────────────────────────────────
# Build + correctness gates
# ────────────────────────────────────────────────────────────────────────────

printf '── Build + correctness ──\n'

if (( CHEAP_ONLY == 0 )); then
  run_gate "typecheck (source + specs)" npm run typecheck
  run_gate "test (vitest)" npm test
  run_gate "build (tsc → dist/)" npm run build
  if [[ -f dist/index.js ]]; then
    # Import what would ship and exercise the public entry points: the suite
    # runs against the sources, so a broken build output or a dropped export
    # would otherwise pass unnoticed.
    if node --input-type=module -e '
        import { resolveObligations, planDisclosures, buildManifest } from "./dist/index.js";
        const p = { interactsWithPersons: true };
        if (!resolveObligations(p).applicable.includes("50(1)")) process.exit(1);
        if (planDisclosures(p, { locale: "de" }).notices.length === 0) process.exit(1);
        if (buildManifest(p, { generatedAt: "2026-01-01T00:00:00.000Z", sdkVersion: "x" })
              .obligations.length !== 4) process.exit(1);
      ' >/dev/null 2>&1; then
      ok "smoke — built package works when imported"
    else
      fail "smoke — built package failed on import"
    fi
  else
    warn "smoke skipped — dist/index.js absent"
  fi
else
  warn "typecheck + test + build SKIPPED (--cheap-only) — mandatory before any public push"
fi

# ────────────────────────────────────────────────────────────────────────────
# Anti-leak gates
# ────────────────────────────────────────────────────────────────────────────

printf '\n── Anti-leak ──\n'

run_gate "oss-ip-guard selftest" bash scripts/oss-ip-guard.sh --selftest
run_gate "oss-ip-guard full tree" bash scripts/oss-ip-guard.sh --dir .

# The published tarball must carry only the product. A test fixture, a local
# audit artifact or a corpus path inside it is a leak that CI cannot see.
PACK_OUT=$(npm pack --dry-run --json 2>/dev/null)
if [[ -n "$PACK_OUT" ]]; then
  PACK_FILES=$(printf '%s' "$PACK_OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log((j[0].files||[]).map(f=>f.path).join("\n"))}catch{process.exit(1)}})' 2>/dev/null)
  if [[ -z "$PACK_FILES" ]]; then
    warn "pack manifest could not be parsed — inspect 'npm pack --dry-run' by hand"
  elif printf '%s' "$PACK_FILES" | grep -qE '^(test/|var/|coverage/|scripts/|\.claude/|\.github/)'; then
    fail "pack manifest ships non-product files: $(printf '%s' "$PACK_FILES" | grep -E '^(test/|var/|coverage/|scripts/|\.claude/|\.github/)' | head -3 | tr '\n' ' ')"
  else
    ok "pack manifest ships product files only ($(printf '%s' "$PACK_FILES" | grep -c . ) entries)"
  fi
else
  warn "npm pack --dry-run produced no output — skipped"
fi

# ────────────────────────────────────────────────────────────────────────────
# History gates (range-scoped)
# ────────────────────────────────────────────────────────────────────────────

printf '\n── History ──\n'

if git rev-parse "$RANGE" >/dev/null 2>&1; then
  run_gate "commit-message discipline ($RANGE)" bash scripts/check-commit-messages.sh "$RANGE"
  run_gate "commit-size budget ($RANGE)" bash scripts/check-commit-size.sh "$RANGE"
  run_gate "author-date spacing ($RANGE)" bash scripts/check-author-date-spacing.sh --range "$RANGE"

  AI_TRAILER_PATTERN='^Co-Authored-By:[[:space:]]*(Claude|Anthropic|AI|GPT|Copilot)'
  if git log "$RANGE" --format='%B' 2>/dev/null | grep -qE "$AI_TRAILER_PATTERN"; then
    fail "AI co-author trailer found in a commit body"
  else
    ok "no AI co-author trailer in commit bodies"
  fi

  NON_CANON=()
  while IFS= read -r line; do
    [[ -n "$line" && "$line" != "$CANONICAL_AUTHOR" ]] && NON_CANON+=("$line")
  done < <(git log "$RANGE" --format='%an <%ae>' 2>/dev/null || true)
  if (( ${#NON_CANON[@]} == 0 )); then
    ok "canonical author on every commit in range"
  else
    fail "non-canonical author(s): ${NON_CANON[*]}"
  fi

  MISSING_DCO=$(git log "$RANGE" --format='%H %s' 2>/dev/null | while read -r sha subject; do
    git log -1 --format='%B' "$sha" | grep -q '^Signed-off-by: ' || echo "$subject"
  done)
  if [[ -z "$MISSING_DCO" ]]; then
    ok "every commit in range carries a sign-off"
  else
    fail "commit(s) without a Signed-off-by: $(echo "$MISSING_DCO" | head -2 | tr '\n' ';')"
  fi
else
  warn "range '$RANGE' did not resolve — history gates skipped"
fi

# ────────────────────────────────────────────────────────────────────────────
# Soft gates — surfaced, not blocking
# ────────────────────────────────────────────────────────────────────────────

printf '\n── Soft ──\n'

if command -v actionlint >/dev/null 2>&1; then
  if ACTIONLINT_OUT=$(actionlint .github/workflows/*.yml 2>&1); then
    ok "actionlint"
  else
    warn "actionlint: $(echo "$ACTIONLINT_OUT" | head -1)"
  fi
else
  warn "actionlint not installed — workflow lint skipped"
fi

if (( CHEAP_ONLY == 0 )); then
  if PUBLINT_OUT=$(npx --yes publint 2>&1); then
    ok "publint"
  else
    warn "publint: $(echo "$PUBLINT_OUT" | head -3 | tr '\n' ' ')"
  fi
fi

# ────────────────────────────────────────────────────────────────────────────
# Items the operator must be able to answer YES to
# ────────────────────────────────────────────────────────────────────────────

printf '\n── Operator-confirmed items ──\n\n'
cat <<'EOF'
  [ ] An independent review ran on this exact diff (not on an earlier state)?
  [ ] If a review finding triggered a fix, the review re-ran on the post-fix
      state and returned GO before this push?
  [ ] Everything in the range is intended for this push target — no stray
      internal-only paths, no half-finished edits?
  [ ] The diff was read at least once by eye (git diff --stat + spot checks)?
EOF

if (( PUBLIC_MODE == 1 )); then
  printf '\n── Public-mode additions ──\n\n'
  cat <<'EOF'
  [ ] At most ONE new commit lands in this push (one-commit-per-push rule)?
  [ ] Branch protection respected — no force-push, no merge while CI pending?
  [ ] Review comments from the external reviewers addressed or waived with a
      stated reason?
  [ ] The additive sync workflow was used, not a replay that rewrites history?
EOF
fi

# ────────────────────────────────────────────────────────────────────────────
# Summary
# ────────────────────────────────────────────────────────────────────────────

printf '\n═══ summary ═══\n'
printf '  passed: %d\n' "${#PASSED[@]}"
printf '  failed: %d\n' "${#FAILED[@]}"
printf '  warned: %d\n' "${#WARNED[@]}"

if (( ${#FAILED[@]} > 0 )); then
  printf '\n\033[31mDO NOT PUSH\033[0m — failed gates:\n'
  for f in "${FAILED[@]}"; do printf '  - %s\n' "$f"; done
  printf '\n'
  exit 1
fi

printf '\n\033[32mVERDICT: auto-gates green.\033[0m The operator-confirmed items above\n'
printf 'must also be YES before pushing.\n\n'
exit 0
