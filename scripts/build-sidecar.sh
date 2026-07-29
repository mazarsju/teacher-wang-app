#!/usr/bin/env bash
# Build the Flask API as a Tauri sidecar binary with the required target-triple suffix.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f "$ROOT_DIR/venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT_DIR/venv/bin/activate"
fi

if ! command -v pyinstaller >/dev/null 2>&1; then
  echo "PyInstaller is required. Install with:"
  echo "  python3 -m pip install -r backend/requirements-desktop.txt"
  exit 1
fi

if ! command -v rustc >/dev/null 2>&1; then
  if [[ -f "$HOME/.cargo/env" ]]; then
    # shellcheck disable=SC1091
    source "$HOME/.cargo/env"
  fi
fi

TARGET_TRIPLE="$(rustc -vV | sed -n 's/^host: //p')"
if [[ -z "$TARGET_TRIPLE" ]]; then
  echo "Could not determine Rust host target triple (is rustc installed?)."
  exit 1
fi

BINARIES_DIR="$ROOT_DIR/frontend/src-tauri/binaries"
mkdir -p "$BINARIES_DIR"

SIDECAR_NAME="teacher-wang-api"
OUTPUT_PATH="$BINARIES_DIR/${SIDECAR_NAME}-${TARGET_TRIPLE}"

echo "Building sidecar for ${TARGET_TRIPLE}..."
pyinstaller \
  --noconfirm \
  --clean \
  --onefile \
  --name "$SIDECAR_NAME" \
  --paths "$ROOT_DIR" \
  --distpath "$BINARIES_DIR" \
  --workpath "$ROOT_DIR/build/pyinstaller" \
  --specpath "$ROOT_DIR/build/pyinstaller" \
  --hidden-import "backend" \
  --hidden-import "backend.routes" \
  --hidden-import "waitress" \
  --collect-submodules "backend" \
  --collect-all "langchain_core" \
  --collect-all "langchain_openai" \
  --collect-all "openai" \
  --add-data "$ROOT_DIR/backend/hsk.json:backend" \
  --add-data "$ROOT_DIR/backend/token_price.json:backend" \
  "$ROOT_DIR/backend/desktop_server.py"

BUILT_BINARY="$BINARIES_DIR/$SIDECAR_NAME"
if [[ ! -f "$BUILT_BINARY" ]]; then
  echo "Expected PyInstaller output missing: $BUILT_BINARY"
  exit 1
fi

mv -f "$BUILT_BINARY" "$OUTPUT_PATH"
chmod +x "$OUTPUT_PATH"

# Keep a stable unsuffixed copy for local manual runs.
cp -f "$OUTPUT_PATH" "$BINARIES_DIR/$SIDECAR_NAME"

echo "Sidecar ready: $OUTPUT_PATH"
