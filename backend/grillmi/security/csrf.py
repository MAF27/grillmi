import secrets

from fastapi import HTTPException, Request, status

from grillmi.models import Session

_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def validate_csrf(request: Request, session: Session) -> None:
    if request.method in _SAFE_METHODS:
        return
    header = request.headers.get("X-CSRFToken")
    if not header or not secrets.compare_digest(header, session.csrf_token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="csrf_invalid")
