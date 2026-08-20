#!/usr/bin/env bash
# check-commit-messages.sh — flag AI co-author trailers in commit messages.
#
# Regex-only check. Per the project's legitimate-regex use cases, AI co-author
# trailer detection is an exact-string lookup with zero ambiguity (per the
# project rule on pre-push verification, §4-quater "What still uses regex").
# A subshell LLM dispatch was used previously but cannot inherit the parent
# Claude Code session, returning "Not logged in" inside scripts.
#
# Usage:
#   bash scripts/check-commit-messages.sh                          # default: origin/main..HEAD
#   bash scripts/check-commit-messages.sh "origin/main..HEAD"      # explicit range
#   bash scripts/check-commit-messages.sh "ALL"                    # full history
#
# Exit codes:
#   0 — clean
#   1 — trailer-like phrasing found in at least one commit
#   2 — invocation error (bad range, not in a repo, etc.)
#
# SPDX-License-Identifier: Apache-2.0

set -uo pipefail

RANGE="${1:-origin/main..HEAD}"

if [[ "$RANGE" == "ALL" ]]; then
  RANGE_FLAG=""
else
  RANGE_FLAG="$RANGE"
fi

if [[ -z "$RANGE_FLAG" ]]; then
  if ! git log --oneline -1 >/dev/null 2>&1; then
    echo "ERROR: not in a git repo (or empty repo)." >&2
    exit 2
  fi
  COMMIT_DUMP=$(git log --pretty=format:'=== %H%n%s%n%n%b%n%n' 2>/dev/null || true)
  TOTAL_COMMITS=$(git log --oneline 2>/dev/null | wc -l | tr -d ' ')
else
  if ! git log "$RANGE_FLAG" --oneline -1 >/dev/null 2>&1; then
    echo "ERROR: git range '$RANGE' did not resolve." >&2
    exit 2
  fi
  COMMIT_DUMP=$(git log "$RANGE_FLAG" --pretty=format:'=== %H%n%s%n%n%b%n%n' 2>/dev/null || true)
  TOTAL_COMMITS=$(git log "$RANGE_FLAG" --oneline 2>/dev/null | wc -l | tr -d ' ')
fi

if [[ -z "$COMMIT_DUMP" || "$TOTAL_COMMITS" -eq 0 ]]; then
  echo "PASS — empty range."
  exit 0
fi

echo "scanning range: $RANGE"
echo "total commits in range: $TOTAL_COMMITS"
echo

# Trailer regex — pinned to `Co-Authored-By:` line start, then any of the
# vendor brand strings. Adding a new vendor is a one-token edit.
TRAILER_VENDORS='Claude|Anthropic|GPT|ChatGPT|OpenAI|Codex|Copilot|Cursor|Grok|xAI|Mistral|Codestral|Gemini|Bard|Llama|Meta AI|DeepSeek|Qwen|Cohere|Command|Bedrock|Vertex AI|Replit Agent|Devin'

# Long-form patterns. Each pattern is matched as a whole phrase; bare
# mentions of "AI" outside these phrases are NOT flagged (so prose like
# "the EU AI Act" stays clean).
LONGFORM_PATTERNS=(
  'Drafted with AI'
  'Generated (with|by) (the )?(Claude|Anthropic|OpenAI|GPT|ChatGPT|Codex|Copilot|Gemini|Mistral|Llama|DeepSeek)'
  'AI-assisted (drafting|review|generation|authoring)'
  '🤖 Generated with \[Claude Code\]'
)

HITS=""
HIT_COUNT=0
CURRENT_SHA=""
CURRENT_SUBJECT=""
IN_BODY=0

# Walk the dump line-by-line. Format from git log above:
#   === <sha>
#   <subject>
#   <blank>
#   <body line>
#   ...
#   <blank line separator>
#   === <sha>
#   ...
while IFS= read -r line; do
  if [[ "$line" == "=== "* ]]; then
    CURRENT_SHA="${line#=== }"
    CURRENT_SUBJECT=""
    IN_BODY=0
    continue
  fi
  if [[ -z "$CURRENT_SUBJECT" && -n "$line" ]]; then
    CURRENT_SUBJECT="$line"
    continue
  fi
  if [[ "$IN_BODY" -eq 0 && -z "$line" ]]; then
    IN_BODY=1
    continue
  fi

  # Trailer check. Two-step: the line must be a Co-Authored-By trailer,
  # AND must mention any AI vendor anywhere on that line (covers
  # "Co-Authored-By: GitHub Copilot <...>" where the vendor name is not
  # directly after the colon).
  if [[ "$line" =~ ^Co-Authored-By: ]] && [[ "$line" =~ ($TRAILER_VENDORS) ]]; then
    HITS+="  ${CURRENT_SHA:0:12}  ${CURRENT_SUBJECT}"$'\n'
    HITS+="    line: ${line}"$'\n'
    HITS+="    reason: AI vendor in Co-Authored-By trailer"$'\n'$'\n'
    HIT_COUNT=$((HIT_COUNT + 1))
    continue
  fi

  # Long-form check.
  for pat in "${LONGFORM_PATTERNS[@]}"; do
    if [[ "$line" =~ $pat ]]; then
      HITS+="  ${CURRENT_SHA:0:12}  ${CURRENT_SUBJECT}"$'\n'
      HITS+="    line: ${line}"$'\n'
      HITS+="    reason: long-form AI-authorship disclosure"$'\n'$'\n'
      HIT_COUNT=$((HIT_COUNT + 1))
      break
    fi
  done
done <<< "$COMMIT_DUMP"

if [[ "$HIT_COUNT" -eq 0 ]]; then
  echo "PASS — no AI co-author trailers in $RANGE."
  exit 0
fi

echo "LEAK — found $HIT_COUNT AI co-author trailer hit(s):"
echo
printf '%s' "$HITS"
exit 1
