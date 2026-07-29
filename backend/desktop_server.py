"""Production entry point for the Teacher Wang desktop (Tauri) API sidecar."""

from __future__ import annotations

import os
import sys
import threading


def _watch_stdin_for_shutdown() -> None:
    """Exit when Tauri asks the PyInstaller sidecar to shut down via stdin."""
    try:
        for line in sys.stdin:
            if "sidecar shutdown" in line.lower():
                os._exit(0)
    except Exception:
        # Stdin may be closed when the parent exits; process teardown handles the rest.
        return


def main() -> None:
    # Ensure repo-root imports resolve when running from source (not frozen).
    if not getattr(sys, "frozen", False):
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        if repo_root not in sys.path:
            sys.path.insert(0, repo_root)

    port = int(os.environ.get("PORT", "17831"))
    host = os.environ.get("HOST", "127.0.0.1")

    from waitress import serve

    from backend import create_app

    app = create_app()
    threading.Thread(target=_watch_stdin_for_shutdown, daemon=True).start()
    print(f"teacher-wang-api listening on http://{host}:{port}", flush=True)
    serve(app, host=host, port=port, threads=8)


if __name__ == "__main__":
    main()
