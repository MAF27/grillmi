from starlette.responses import Response

_REQUIRED_HEADERS = {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
}


def apply_security_headers(response: Response, is_https: bool = False) -> None:
    for k, v in _REQUIRED_HEADERS.items():
        response.headers.setdefault(k, v)
    if is_https:
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
