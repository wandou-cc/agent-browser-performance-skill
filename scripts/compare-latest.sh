#!/bin/bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: compare-latest.sh <url|site-slug|site-dir> [output-root]

Compare the two newest runs for the same site and write comparison artifacts.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 1
fi

TARGET="$1"
OUTPUT_ROOT="${2:-$PWD/.codex/artifacts/agent-browser-performance}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -d "$TARGET" ]]; then
  SITE_DIR="$(cd "$TARGET" && pwd)"
elif [[ "$TARGET" == *"://"* ]]; then
  SITE_SLUG="$(node "$SCRIPT_DIR/url-slug.js" "$TARGET")"
  SITE_DIR="$OUTPUT_ROOT/$SITE_SLUG"
else
  SITE_DIR="$OUTPUT_ROOT/$TARGET"
fi

if [[ ! -d "$SITE_DIR" ]]; then
  echo "Site artifact directory not found: $SITE_DIR" >&2
  exit 1
fi

RUN_DIRS=()
while IFS= read -r run_dir; do
  RUN_DIRS+=("$run_dir")
done < <(find "$SITE_DIR" -mindepth 1 -maxdepth 1 -type d ! -name comparisons | sort)

if [[ "${#RUN_DIRS[@]}" -lt 2 ]]; then
  echo "Need at least two runs under $SITE_DIR" >&2
  exit 1
fi

RUN_A="${RUN_DIRS[$((${#RUN_DIRS[@]} - 2))]}"
RUN_B="${RUN_DIRS[$((${#RUN_DIRS[@]} - 1))]}"
OUTPUT_DIR="$SITE_DIR/comparisons/$(basename "$RUN_A")__vs__$(basename "$RUN_B")"

node "$SCRIPT_DIR/compare-runs.js" "$RUN_A" "$RUN_B" --output-dir "$OUTPUT_DIR"
echo "Latest comparison:"
echo "  $OUTPUT_DIR/comparison.md"
