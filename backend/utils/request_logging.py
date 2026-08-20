"""Request ID + one-line access log for CloudWatch / Grafana correlation.

Accepts inbound ``X-Request-Id`` (or generates one), echoes it on the response,
and logs ``request_id=…`` so Explore can filter a single request.
"""

from __future__ import annotations

import logging
import uuid

from flask import Flask, g, request

logger = logging.getLogger(__name__)

_HEADER = "X-Request-Id"


def _assign_request_id() -> None:
    incoming = (request.headers.get(_HEADER) or "").strip()
    g.request_id = incoming or uuid.uuid4().hex


def _log_and_set_header(response):
    request_id = getattr(g, "request_id", None) or "-"
    response.headers[_HEADER] = request_id
    cognito_sub = getattr(g, "cognito_sub", None) or "-"
    logger.info(
        "request_id=%s method=%s path=%s status=%s cognito_sub=%s",
        request_id,
        request.method,
        request.path,
        response.status_code,
        cognito_sub,
    )
    return response


def register_request_logging(app: Flask) -> None:
    app.before_request(_assign_request_id)
    app.after_request(_log_and_set_header)
