#!/usr/bin/env bash
# cross-pollinate.sh — run a cross-pollination prompt through the Codex CLI (OpenAI models)
# and print the model's final answer, so the main session can merge it without copy and paste.
#
# Usage:
#   bash cross-pollinate.sh [-o output-file] [-m model] prompt-file
#   bash cross-pollinate.sh -o codex-round-1.md prompt.md 2> codex-round-1.log
#
# Options:
#   -o FILE   also write the final answer to FILE; written only after a successful run, so a failed
#             run never leaves an empty or truncated file behind
#   -m MODEL  override the model in the user's Codex config (default: whatever ~/.codex/config.toml says)
#
# Behaviour:
#   - Runs `codex exec` non-interactively in a read-only sandbox with no persisted session, so the
#     run cannot touch files and leaves nothing behind in ~/.codex/sessions.
#   - Runs in a fresh empty directory with project-document loading disabled, so Codex sees only the
#     prompt: no AGENTS.md, no project files, no .codex config from the caller's directory. The round
#     is meant to be an independent model's take, and anything else in context would colour it.
#   - Model and reasoning effort come from the user's own Codex config unless -m is given; the skill
#     does not pick a model for them.
#   - Codex's own transcript (model, token count, session id, and an echo of the prompt) goes to
#     stderr; only the final answer goes to stdout. Redirect stderr to a log file and read its tail
#     only when the run fails.
#
# Exit codes:
#   0        answer delivered
#   2        usage error (missing or unreadable prompt file, bad option)
#   3        codex not installed
#   4        could not create a temporary file or directory
#   5        codex exited 0 but returned no final message
#   6        answer produced but could not be written to -o FILE
#   10 + N   codex itself exited with status N (read the stderr log: most often a sign-in problem,
#            a network or sandbox denial, or quota)
#
# Test by hand after editing: a prompt file reading "Reply with exactly the three words: codex test ok"
# must print those three words and exit 0; a missing prompt file must exit 2; with codex absent from
# PATH the script must exit 3 with a message naming the install.

set -u

OUT=""
MODEL=""

while getopts ":o:m:" opt; do
  case "$opt" in
    o) OUT="$OPTARG" ;;
    m) MODEL="$OPTARG" ;;
    *) echo "usage: $0 [-o output-file] [-m model] prompt-file" >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))

PROMPT="${1:-}"
if [ -z "$PROMPT" ] || [ ! -r "$PROMPT" ]; then
  echo "usage: $0 [-o output-file] [-m model] prompt-file   (prompt file missing or unreadable)" >&2
  exit 2
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI not found on PATH. Install with: npm install -g @openai/codex   (or: brew install codex), then run: codex login" >&2
  exit 3
fi

# Resolve the prompt path before changing directory: codex runs with -C in a scratch directory.
case "$PROMPT" in
  /*) PROMPT_ABS="$PROMPT" ;;
  *)  PROMPT_ABS="$PWD/$PROMPT" ;;
esac

TMP_OUT="$(mktemp "${TMPDIR:-/tmp}/cross-pollinate.XXXXXX")" || { echo "could not create a temporary file" >&2; exit 4; }
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/cross-pollinate-work.XXXXXX")" || { rm -f "$TMP_OUT"; echo "could not create a temporary directory" >&2; exit 4; }
trap 'rm -rf "$TMP_OUT" "$WORKDIR"' EXIT

ARGS=(exec --skip-git-repo-check --ephemeral -s read-only --color never
      -C "$WORKDIR" -c 'project_doc_max_bytes=0'
      -o "$TMP_OUT")
if [ -n "$MODEL" ]; then
  ARGS+=(-m "$MODEL")
fi
ARGS+=(-)

# Codex prints its running transcript to stdout; send that to stderr so stdout holds only the answer.
codex "${ARGS[@]}" < "$PROMPT_ABS" 1>&2
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  echo "codex exec exited with status $STATUS; see the messages above (sign-in: codex login; network or sandbox denial; quota)" >&2
  exit $((10 + STATUS))
fi

if [ ! -s "$TMP_OUT" ]; then
  echo "codex exited 0 but returned no final message" >&2
  exit 5
fi

if ! cat "$TMP_OUT"; then
  echo "answer produced but could not be written to stdout" >&2
  exit 6
fi
if [ -n "$OUT" ]; then
  if ! cp "$TMP_OUT" "$OUT"; then
    echo "answer printed above but could not be written to $OUT" >&2
    exit 6
  fi
fi
exit 0
