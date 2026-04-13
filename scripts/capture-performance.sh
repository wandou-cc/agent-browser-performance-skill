#!/bin/bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: capture-performance.sh <url> [label] [output-root] [options]

Collect a repeatable browser-performance sample with agent-browser.

Arguments:
  url          Target page to profile.
  label        Optional run label. Default: baseline
  output-root  Optional artifact root. Default: $PWD/.codex/artifacts/agent-browser-performance

Options:
  --profile <path>       Reuse a persistent browser profile.
  --state <path>         Load storage state JSON before opening the page.
  --session-name <name>  Reuse agent-browser's saved session state.
  --headed               Show the browser window.
  --manual               Pause after opening so a human can finish login/CAPTCHA.
  --ready-selector <sel> Wait for a selector after navigation/manual auth.
  --ready-text <text>    Wait for page text after navigation/manual auth.
  --ready-url <pattern>  Wait for a URL pattern after navigation/manual auth.
  --load-state <state>   Final load wait: load, domcontentloaded, networkidle, none.
                          Default: networkidle
  --settle-ms <ms>       Extra wait after page is ready. Default: 0
EOF
}

BROWSER_PROFILE=""
BROWSER_STATE=""
PERSIST_SESSION_NAME=""
HEADED=0
MANUAL_AUTH=0
READY_SELECTOR=""
READY_TEXT=""
READY_URL=""
LOAD_STATE="networkidle"
SETTLE_MS=0
POSITIONAL_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --profile)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --profile" >&2
        exit 1
      fi
      BROWSER_PROFILE="$2"
      shift 2
      ;;
    --state)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --state" >&2
        exit 1
      fi
      BROWSER_STATE="$2"
      shift 2
      ;;
    --session-name)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --session-name" >&2
        exit 1
      fi
      PERSIST_SESSION_NAME="$2"
      shift 2
      ;;
    --headed)
      HEADED=1
      shift
      ;;
    --manual)
      MANUAL_AUTH=1
      shift
      ;;
    --ready-selector)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --ready-selector" >&2
        exit 1
      fi
      READY_SELECTOR="$2"
      shift 2
      ;;
    --ready-text)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --ready-text" >&2
        exit 1
      fi
      READY_TEXT="$2"
      shift 2
      ;;
    --ready-url)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --ready-url" >&2
        exit 1
      fi
      READY_URL="$2"
      shift 2
      ;;
    --load-state)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --load-state" >&2
        exit 1
      fi
      LOAD_STATE="$2"
      shift 2
      ;;
    --settle-ms)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --settle-ms" >&2
        exit 1
      fi
      SETTLE_MS="$2"
      shift 2
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        POSITIONAL_ARGS+=("$1")
        shift
      done
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      POSITIONAL_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ "${#POSITIONAL_ARGS[@]}" -lt 1 || "${#POSITIONAL_ARGS[@]}" -gt 3 ]]; then
  usage >&2
  exit 1
fi

TARGET_URL="${POSITIONAL_ARGS[0]}"
RUN_LABEL="${POSITIONAL_ARGS[1]:-baseline}"
OUTPUT_ROOT="${POSITIONAL_ARGS[2]:-$PWD/.codex/artifacts/agent-browser-performance}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_SLUG="$(node "$SCRIPT_DIR/url-slug.js" "$TARGET_URL")"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
SAFE_LABEL="$(printf '%s' "$RUN_LABEL" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9._-' '-')"
RUN_DIR="$OUTPUT_ROOT/$SITE_SLUG/${TIMESTAMP}-${SAFE_LABEL}"
SESSION="abp-$(date +%H%M%S)-$RANDOM"
SOCKET_DIR="${AGENT_BROWSER_SOCKET_DIR:-${TMPDIR:-/tmp}/abperf}"
METRICS_EXPR="$(tr '\n' ' ' < "$SCRIPT_DIR/page-metrics.js")"

READY_CONDITION_COUNT=0
[[ -n "$READY_SELECTOR" ]] && READY_CONDITION_COUNT=$((READY_CONDITION_COUNT + 1))
[[ -n "$READY_TEXT" ]] && READY_CONDITION_COUNT=$((READY_CONDITION_COUNT + 1))
[[ -n "$READY_URL" ]] && READY_CONDITION_COUNT=$((READY_CONDITION_COUNT + 1))

if [[ "$READY_CONDITION_COUNT" -gt 1 ]]; then
  echo "Use at most one of --ready-selector, --ready-text, or --ready-url." >&2
  exit 1
fi

case "$LOAD_STATE" in
  load|domcontentloaded|networkidle|none)
    ;;
  *)
    echo "Invalid --load-state: $LOAD_STATE" >&2
    exit 1
    ;;
esac

if [[ ! "$SETTLE_MS" =~ ^[0-9]+$ ]]; then
  echo "--settle-ms must be a non-negative integer." >&2
  exit 1
fi

if [[ -n "$BROWSER_STATE" && ! -f "$BROWSER_STATE" ]]; then
  echo "Storage state file not found: $BROWSER_STATE" >&2
  exit 1
fi

if [[ "$MANUAL_AUTH" -eq 1 ]]; then
  HEADED=1
  if [[ ! -t 0 ]]; then
    echo "--manual requires an interactive terminal so you can continue after login/CAPTCHA." >&2
    exit 1
  fi
fi

mkdir -p "$RUN_DIR" "$SOCKET_DIR"
export AGENT_BROWSER_SOCKET_DIR="$SOCKET_DIR"

BROWSER_ARGS=(--session "$SESSION")
if [[ -n "$BROWSER_PROFILE" ]]; then
  BROWSER_ARGS+=(--profile "$BROWSER_PROFILE")
fi
if [[ -n "$BROWSER_STATE" ]]; then
  BROWSER_ARGS+=(--state "$BROWSER_STATE")
fi
if [[ -n "$PERSIST_SESSION_NAME" ]]; then
  BROWSER_ARGS+=(--session-name "$PERSIST_SESSION_NAME")
fi
if [[ "$HEADED" -eq 1 ]]; then
  BROWSER_ARGS+=(--headed)
fi

ab() {
  agent-browser "${BROWSER_ARGS[@]}" "$@"
}

cleanup() {
  ab close >/dev/null 2>&1 || true
}

trap cleanup EXIT

node -e '
const fs = require("fs");
const payload = {
  targetUrl: process.argv[2],
  label: process.argv[3],
  outputRoot: process.argv[4],
  runDir: process.argv[5],
  siteSlug: process.argv[6],
  session: process.argv[7],
  browserProfile: process.argv[8] || null,
  storageState: process.argv[9] || null,
  sessionName: process.argv[10] || null,
  headed: process.argv[11] === "1",
  manual: process.argv[12] === "1",
  loadState: process.argv[13],
  readyWait: {
    selector: process.argv[14] || null,
    text: process.argv[15] || null,
    url: process.argv[16] || null,
    settleMs: Number(process.argv[17] || 0)
  },
  requestedAt: new Date().toISOString()
};
fs.writeFileSync(process.argv[1], JSON.stringify(payload, null, 2));
' \
  "$RUN_DIR/request.json" \
  "$TARGET_URL" \
  "$RUN_LABEL" \
  "$OUTPUT_ROOT" \
  "$RUN_DIR" \
  "$SITE_SLUG" \
  "$SESSION" \
  "$BROWSER_PROFILE" \
  "$BROWSER_STATE" \
  "$PERSIST_SESSION_NAME" \
  "$HEADED" \
  "$MANUAL_AUTH" \
  "$LOAD_STATE" \
  "$READY_SELECTOR" \
  "$READY_TEXT" \
  "$READY_URL" \
  "$SETTLE_MS"

echo "Run directory: $RUN_DIR"
echo "Session: $SESSION"
if [[ -n "$BROWSER_PROFILE" ]]; then
  echo "Profile: $BROWSER_PROFILE"
fi
if [[ -n "$BROWSER_STATE" ]]; then
  echo "State: $BROWSER_STATE"
fi
if [[ -n "$PERSIST_SESSION_NAME" ]]; then
  echo "Session name: $PERSIST_SESSION_NAME"
fi
echo "[1/7] Start profiler"
ab profiler start

echo "[2/7] Open page"
ab open "$TARGET_URL"

if [[ "$MANUAL_AUTH" -eq 1 ]]; then
  echo "Manual mode: finish login/CAPTCHA in the browser window, then press Enter here to continue."
  ab wait --load domcontentloaded >/dev/null 2>&1 || true
  read -r
fi

if [[ -n "$READY_SELECTOR" ]]; then
  echo "Waiting for selector: $READY_SELECTOR"
  ab wait "$READY_SELECTOR"
elif [[ -n "$READY_TEXT" ]]; then
  echo "Waiting for text: $READY_TEXT"
  ab wait --text "$READY_TEXT"
elif [[ -n "$READY_URL" ]]; then
  echo "Waiting for URL: $READY_URL"
  ab wait --url "$READY_URL"
fi

if [[ "$LOAD_STATE" != "none" ]]; then
  echo "Waiting for load state: $LOAD_STATE"
  ab wait --load "$LOAD_STATE"
fi

if [[ "$SETTLE_MS" -gt 0 ]]; then
  echo "Settling for ${SETTLE_MS}ms"
  ab wait "$SETTLE_MS"
fi

echo "[3/7] Stop profiler"
ab profiler stop "$RUN_DIR/profile.json"

echo "[4/7] Capture visual and structural artifacts"
ab screenshot --full "$RUN_DIR/full.png"
ab snapshot -i > "$RUN_DIR/interactive-snapshot.txt"
ab get title > "$RUN_DIR/title.txt"
ab get url > "$RUN_DIR/final-url.txt"

echo "[5/7] Capture page metrics"
ab --json eval "$METRICS_EXPR" > "$RUN_DIR/page-metrics.raw.json"

echo "[6/7] Capture console and errors"
ab --json console > "$RUN_DIR/console.raw.json"
ab --json errors > "$RUN_DIR/errors.raw.json"

echo "[7/7] Generate summaries"
node "$SCRIPT_DIR/summarize-run.js" "$RUN_DIR"

echo "Artifacts ready:"
echo "  summary.json"
echo "  summary.md"
echo "  profile.json"
echo "  full.png"
echo "  interactive-snapshot.txt"
echo "Run complete: $RUN_DIR"
