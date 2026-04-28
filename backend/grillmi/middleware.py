import uuid

import structlog
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from grillmi.security.csrf import validate_csrf
from grillmi.security.headers import apply_security_headers


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        try:
            response: Response = await call_next(request)
        finally:
            structlog.contextvars.clear_contextvars()
        response.headers["X-Request-ID"] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        apply_security_headers(response, is_https=request.url.scheme == "https")
        return response


class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # CSRF only applies to state-changing methods on /api/* writes.
        # Auth dependency populates request.state.session before this returns.
        # We cannot inspect the session here cheaply, so the route-level
        # `Depends(require_csrf)` enforces the check; this middleware is a
        # placeholder for future global enforcement.
        return await call_next(request)


def register_middleware(app) -> None:
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestIdMiddleware)


__all__ = ["register_middleware", "validate_csrf"]
