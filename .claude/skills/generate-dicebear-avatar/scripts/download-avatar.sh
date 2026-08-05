#!/usr/bin/env bash
# Download a DiceBear Notionists SVG (or PNG) avatar, then (for SVG) apply a
# circular colored background like frontend/src/assets/avatars/teacher.svg.
# Usage:
#   download-avatar.sh --out avatar.svg --seed "teacher-wang" \
#     --param glassesProbability=100 --param glassesVariant=variant03 \
#     --param hairProbability=100 --param hairVariant=variant25
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_BASE="${DICEBEAR_API_BASE:-https://api.dicebear.com/10.x/notionists}"
FORMAT="svg"
OUT=""
SEED=""
PARAMS=()
BG_COLOR=""
SKIP_CIRCLE=0

usage() {
  cat <<'EOF'
Download a DiceBear Notionists avatar.

Required:
  --out <path>           Output file (e.g. avatar.svg)
  --seed <string>        Avatar seed

Optional:
  --format svg|png       Default: svg
  --param key=value      Repeatable style/query options
  --bg-color #RRGGBB     Circle background fill (default: random pastel)
  --skip-circle-bg       Skip circular background post-process (SVG only)
  --help                 Show this help

Example:
  download-avatar.sh --out avatar.svg --seed teacher-wang \
    --param glassesProbability=100 --param glassesVariant=variant03 \
    --param beardProbability=100 --param beardVariant=variant05 \
    --param hairProbability=100 --param hairVariant=variant25 \
    --bg-color '#dbeafe'
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      OUT="${2:?}"
      shift 2
      ;;
    --seed)
      SEED="${2:?}"
      shift 2
      ;;
    --format)
      FORMAT="${2:?}"
      shift 2
      ;;
    --param)
      PARAMS+=("${2:?}")
      shift 2
      ;;
    --bg-color)
      BG_COLOR="${2:?}"
      shift 2
      ;;
    --skip-circle-bg)
      SKIP_CIRCLE=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$OUT" || -z "$SEED" ]]; then
  echo "Error: --out and --seed are required." >&2
  usage >&2
  exit 1
fi

if [[ "$FORMAT" != "svg" && "$FORMAT" != "png" ]]; then
  echo "Error: --format must be svg or png." >&2
  exit 1
fi

# Build query string (seed first). Values are URL-encoded via python3.
QUERY=$(
  SEED="$SEED" PARAMS_JSON="$(printf '%s\n' "${PARAMS[@]}")" python3 - <<'PY'
import os, urllib.parse

seed = os.environ["SEED"]
params = [("seed", seed)]
for line in os.environ.get("PARAMS_JSON", "").splitlines():
    line = line.strip()
    if not line:
        continue
    if "=" not in line:
        raise SystemExit(f"Invalid --param (expected key=value): {line}")
    key, value = line.split("=", 1)
    params.append((key, value))

print(urllib.parse.urlencode(params))
PY
)

URL="${API_BASE}/${FORMAT}?${QUERY}"

curl -fsSL "$URL" -o "$OUT"

# Basic sanity check for SVG
if [[ "$FORMAT" == "svg" ]]; then
  if ! head -c 200 "$OUT" | grep -q "<svg"; then
    echo "Error: downloaded file does not look like SVG: $OUT" >&2
    echo "URL was: $URL" >&2
    exit 1
  fi

  if [[ "$SKIP_CIRCLE" -eq 0 ]]; then
    APPLY_ARGS=("$OUT" -o "$OUT" --seed "$SEED")
    if [[ -n "$BG_COLOR" ]]; then
      APPLY_ARGS+=(--color "$BG_COLOR")
    fi
    python3 "$SCRIPT_DIR/apply-circle-background.py" "${APPLY_ARGS[@]}"
  fi
fi

echo "Wrote $OUT"
echo "URL: $URL"
