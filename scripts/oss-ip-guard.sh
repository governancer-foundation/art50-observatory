#!/usr/bin/env bash
# oss-ip-guard.sh — anti-leak IP/secret boundary guard for this repository.
#
# Scans content destined for the public repo and BLOCKS if it matches the
# negative-list: private corpus paths, internal monorepo paths/imports,
# secrets/credentials, or AI-authorship trailers. Wired into the local git
# hooks (pre-commit / pre-push) and the CI content-gate workflow.
#
# Modes:
#   oss-ip-guard.sh --staged          scan `git diff --cached` (pre-commit/pre-push)
#   oss-ip-guard.sh --dir <path>      scan every text file under <path> (pre-publish sweep)
#   oss-ip-guard.sh --files f1 f2 …   scan named files
#   oss-ip-guard.sh --selftest        run the built-in known-bad/known-good assertions
#
# Exit: 0 clean · 1 negative-list match (BLOCKED) · 2 invocation error.

set -uo pipefail

# ── Negative list (case-insensitive). A line matching BLOCK but also matching
#    WHITELIST is suppressed (the server's own public API surface documents the
#    funnel-base:// scheme + FUNNEL_BASE_ROOT, which are NOT leaks). ─────────────

# Class A — private corpus paths + internal doc names. The token list is loaded at
# runtime from a git-IGNORED sidecar (.oss-ip-guard-corpus) so this PUBLISHED file
# never enumerates the private inventory it protects (a leak-detector must not ship
# the list it guards). Absent (e.g. in a public clone) → corpus detection is a no-op
# and only the generic path/secret/trailer rules below apply.
_CORPUS_FILE="${OSS_GUARD_CORPUS_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." 2>/dev/null && pwd)/.oss-ip-guard-corpus}"
if [ -f "$_CORPUS_FILE" ]; then
  BLOCK_CORPUS="$(grep -vE '^[[:space:]]*(#|$)' "$_CORPUS_FILE" | paste -sd '|' -)"
else
  BLOCK_CORPUS=''
fi

# Class B — internal monorepo paths / imports (forbidden in OSS)
BLOCK_INTERNAL='/Users/[a-z]+/|@ariada-org/|@agonist/|from ['"'"'"]@(agonist|ariada-org)/|\.\./\.\./\.\./adult|\.\./\.\./governancer/adult'

# Class C — secrets / credentials / customer data
BLOCK_SECRET='ANTHROPIC_API_KEY|sk-ant-[A-Za-z0-9_-]{10,}|CF_API_TOKEN|CF_ACCOUNT_ID|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[0-9A-Za-z]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|DATABASE_URL[[:space:]]*='

# Class D — AI-authorship trailers. Literals are broken with char-classes
# (Cl[a]ude / Co-Authored-B[y]) so this file does not itself contain the exact
# forbidden trailer string; the runtime regex still matches the real trailers.
BLOCK_TRAILER='Co-Authored-B[y]:[[:space:]]*Cl[a]ude|Generated with[[:space:]]+Cl[a]ude|Source:[[:space:]]*Cl[a]ude'

# Assemble only the non-empty classes — an empty BLOCK_CORPUS must not become an
# empty alternation `(|...)` that matches every line.
_parts=()
[ -n "$BLOCK_CORPUS" ] && _parts+=("$BLOCK_CORPUS")
_parts+=("$BLOCK_INTERNAL" "$BLOCK_SECRET" "$BLOCK_TRAILER")
BLOCKLIST="($(IFS='|'; printf '%s' "${_parts[*]}"))"

# Whitelist — suppress a matching line only for the package self-name + .env.example
# + the guard's own identifiers. FUNNEL_BASE_ROOT / funnel-base:// are intentionally
# NOT whitelisted (the legit interfaces funnel-base://law-texts and
# funnel-base://VALIDATION-SUMMARY do not match the refined block list anyway).
WHITELIST='@governancer-foundation/art50-observatory|\.env\.example|oss-ip-guard|negative-list|BLOCK_CORPUS|BLOCK_INTERNAL|BLOCK_SECRET|BLOCK_TRAILER|WHITELIST'

scan_content() {  # reads stdin, prints offending "line:match" rows, returns 1 if any
  local hits
  hits="$(grep -nEi "$BLOCKLIST" 2>/dev/null | grep -vEi "$WHITELIST" || true)"
  if [ -n "$hits" ]; then printf '%s\n' "$hits"; return 1; fi
  return 0
}

collect_staged() {  # added lines of the staged diff
  # Skip the files whose job is to enumerate the forbidden patterns: they
  # necessarily contain them, so scanning them reports the detector as the
  # leak. Both are internal tooling that never reaches the published tree.
  git diff --cached --no-color -- . \
    ':(exclude)*oss-ip-guard.sh' \
    ':(exclude)*release-pipeline.sh' 2>/dev/null | grep -E '^\+' | sed 's/^+//'
}

collect_dir() {  # $1 = dir; cat the PUBLISHABLE text files only.
  # Scope note: this scans the file set that can actually reach the public
  # repository, not the whole working tree. The canonical tree also carries the
  # release machinery, the orchestration rules and the operator manual, which
  # legitimately name local paths and the private remotes — sweeping those in
  # produces guaranteed hits and trains the operator to ignore a red gate. The
  # set below mirrors the allowlist in sync-canonical-to-public.sh; the two must
  # be changed together. In a public clone every file is publishable, so the
  # filter is a no-op there.
  #
  # Skips this guard itself (a leak-detector necessarily contains the patterns
  # it detects) and any git-ignored file.
  ( cd "$1" 2>/dev/null || return 0
    { find ./src ./test ./.github -type f \
        \( -name '*.ts' -o -name '*.js' -o -name '*.json' -o -name '*.md' -o -name '*.sh' \
           -o -name '*.yml' -o -name '*.yaml' -o -name '*.txt' -o -name '*.toml' \) \
        -not -path '*/node_modules/*' -not -path '*/dist/*' 2>/dev/null
      for f in README.md LICENSE NOTICE CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md \
               GOVERNANCE.md CHANGELOG.md REUSE.toml package.json tsconfig.json \
               tsconfig.test.json vitest.config.ts .gitignore .gitattributes \
               .npmrc .editorconfig; do
        [ -f "./$f" ] && printf './%s\n' "$f"
      done
    } | while IFS= read -r f; do
        git check-ignore -q "$f" 2>/dev/null && continue
        printf "\n==FILE %s==\n" "$f"; cat "$f"
      done )
}

run_selftest() {
  local bad good rc=0 trailer
  # build the trailer at runtime from \x43 ('C') so this file does not itself contain
  # the literal forbidden trailer string.
  trailer="$(printf '\x43o-Authored-By: \x43laude <noreply@anthropic.com>')"
  bad="$(printf 'import x from "/Users/dev/internal/secret-notes.md"\nANTHROPIC_API_KEY=sk-ant-abcdef1234567890\n%s' "$trailer")"
  good=$'export const root = process.env.FUNNEL_BASE_ROOT ?? "./funnel-base";\n// resource scheme: funnel-base://law-texts/<slug>\nimport { z } from "zod";'
  echo "[selftest] known-BAD sample (must BLOCK):"
  if printf '%s' "$bad" | scan_content; then echo "  ✗ FAIL — bad sample passed!"; rc=1; else echo "  ✓ blocked as expected"; fi
  echo "[selftest] known-GOOD sample (must PASS):"
  if printf '%s' "$good" | scan_content >/dev/null; then echo "  ✓ passed as expected"; else echo "  ✗ FAIL — good sample blocked (false positive)!"; rc=1; fi
  return $rc
}

MODE="${1:---staged}"
case "$MODE" in
  --selftest) run_selftest; exit $? ;;
  --staged)   content="$(collect_staged)" ;;
  --dir)      [ $# -ge 2 ] || { echo "usage: $0 --dir <path>" >&2; exit 2; }; content="$(collect_dir "$2")" ;;
  --files)    shift; content="$(cat "$@" 2>/dev/null)" ;;
  *)          echo "usage: $0 [--staged|--dir <path>|--files <f…>|--selftest]" >&2; exit 2 ;;
esac

if printf '%s' "$content" | scan_content > /tmp/oss-ip-guard.hits; then
  echo "oss-ip-guard: ✅ clean — no corpus/secret/internal/trailer leak in scanned content."
  exit 0
else
  echo "oss-ip-guard: 🛑 BLOCKED — negative-list match(es) found (must not reach a public repo):" >&2
  sed 's/^/  /' /tmp/oss-ip-guard.hits >&2
  echo "  → see CONTRIBUTING.md (anti-leak policy)." >&2
  exit 1
fi
