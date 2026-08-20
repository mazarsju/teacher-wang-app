"""Request ID + one-line access log for CloudWatch / Grafana correlation.

Accepts inbound ``X-Request-Id`` (or generates one), echoes it on the response,
and prints ``request_id=…`` to stdout (awslogs).

Uses print+flush instead of logging.getLogger: under gunicorn, app loggers
often have no working handlers, so logger.info never reaches CloudWatch.
"""

from __future__ import annotations

import uuid

from flask import Flask, g, has_request_context, request

_HEADER = "X-Request-Id"


def current_request_id() -> str:
    if has_request_context():
        return getattr(g, "request_id", None) or "-"
    return "-"


def progress_log(step: str, **fields) -> None:
    """Emit a progress line tagged with the current request_id (Grafana-friendly)."""
    parts = [f"request_id={current_request_id()}", f"step={step}"]
    for key, value in fields.items():
        # Single-token values so CloudWatch/Grafana line filters stay simple.
        text = str(value).replace(" ", "_").replace("\n", "\\n")
        parts.append(f"{key}={text}")
    print(" ".join(parts), flush=True)


def _assign_request_id() -> None:
    incoming = (request.headers.get(_HEADER) or "").strip()
    g.request_id = incoming or uuid.uuid4().hex


def _log_and_set_header(response):
    request_id = getattr(g, "request_id", None) or "-"
    response.headers[_HEADER] = request_id
    cognito_sub = getattr(g, "cognito_sub", None) or "-"
    # stdout → Docker → awslogs → Grafana (must flush; no logging handlers under gunicorn)
    print(
        f"request_id={request_id} method={request.method} path={request.path} "
        f"status={response.status_code} cognito_sub={cognito_sub}",
        flush=True,
    )
    return response


def register_request_logging(app: Flask) -> None:
    app.before_request(_assign_request_id)
    app.after_request(_log_and_set_header)
