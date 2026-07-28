#!/usr/bin/env bash
# Build a native desktop installer (Tauri + Flask sidecar) for the current machine.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/frontend"

if [[ -f "$HOME/.cargo/env" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust/Cargo is required. Install from https://rustup.rs and reopen your terminal."
  exit 1
fi

if [[ -f "$ROOT_DIR/venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT_DIR/venv/bin/activate"
fi

if ! command -v pyinstaller >/dev/null 2>&1; then
  echo "Installing desktop Python packaging dependencies..."
  python3 -m pip install -r "$ROOT_DIR/backend/requirements-desktop.txt"
fi

npm run tauri:build

BUNDLE_DIR="$ROOT_DIR/frontend/src-tauri/target/release/bundle"
if [[ -n "${CARGO_TARGET_DIR:-}" ]]; then
  BUNDLE_DIR="$CARGO_TARGET_DIR/release/bundle"
fi

echo
echo "Desktop build finished."
if [[ -d "$BUNDLE_DIR" ]]; then
  echo "Artifacts:"
  find "$BUNDLE_DIR" -maxdepth 3 \( -name '*.dmg' -o -name '*.app' -o -name '*.msi' -o -name '*.exe' -o -name '*.AppImage' -o -name '*.deb' \) -print
else
  echo "Look under frontend/src-tauri/target/release/bundle/ for installers."
fi
