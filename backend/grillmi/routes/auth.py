import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.config import get_settings
from grillmi.db import get_session
from grillmi.deps import CurrentUser, current_user, require_csrf
from grillmi.email import sender as email_sender
from grillmi.email.templates import render_reset
from grillmi.models import PasswordResetToken, User
from grillmi.repos import audit_log_repo
from grillmi.repos.sessions_repo import (
    create_session,
    delete_session,
    delete_session_by_id,
    delete_sessions_for_user,
    list_sessions_for_user,
)
from grillmi.security.argon2 import (
    check_needs_rehash,
    hash_password,
    verify_password_timing_safe,
)
from grillmi.security.hibp import check_password
from grillmi.security.rate_limit import login_account_limiter, login_ip_limiter

router = APIRouter(tags=["auth"])

INVITATION_EXPIRY_HOURS = 72
RESET_EXPIRY_MINUTES = 30
GENERIC_LOGIN_ERROR = {"detail": "invalid_credentials", "message": "Invalid email or password"}


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=512)


class ForgotIn(BaseModel):
    email: EmailStr


class SetPasswordIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=12, max_length=512)


def _client_ip(request: Request) -> str | None:
    if request.client:
        return request.client.host
    return None


def _set_session_cookie(response: Response, token: str, expires_at: datetime) -> None:
    settings = get_settings()
    is_prod = settings.IS_PROD
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.SESSION_MAX_AGE_HOURS * 3600,
        expires=expires_at,
        httponly=True,
        secure=is_prod,
        samesite="strict" if is_prod else "lax",
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(key=settings.SESSION_COOKIE_NAME, path="/")


def _hash_token(raw_token: str) -> bytes:
    return hashlib.sha256(raw_token.encode("utf-8")).digest()


@router.post("/login")
async def login(
    payload: LoginIn,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_session),
) -> dict:
    ip = _client_ip(request)
    login_ip_limiter.check_and_record(ip or "unknown")
    login_account_limiter.check_and_record(payload.email.lower())

    user = (
        await db.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()

    password_hash = user.password_hash if user else None
    valid = await verify_password_timing_safe(payload.password, password_hash)

    if user is not None and (
        password_hash is not None and password_hash.startswith("!disabled_")
    ):
        valid = False

    if not user or not valid:
        await audit_log_repo.record(
            action="login", email=payload.email, ip=ip, success=False
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

    if check_needs_rehash(user.password_hash):
        new_hash = await hash_password(payload.password)
        await db.execute(update(User).where(User.id == user.id).values(password_hash=new_hash))

    created = await create_session(
        db, user_id=user.id, ip=ip, user_agent=request.headers.get("User-Agent")
    )
    await db.execute(
        update(User).where(User.id == user.id).values(last_login_at=datetime.now(timezone.utc))
    )
    await db.commit()

    _set_session_cookie(response, created.token, created.expires_at)
    await audit_log_repo.record(
        action="login", user_id=user.id, email=user.email, ip=ip, success=True
    )
    return {
        "user": {"id": str(user.id), "email": user.email},
        "csrfToken": created.csrf_token,
    }


@router.post("/logout", status_code=204)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_session),
) -> Response:
    settings = get_settings()
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if token:
        await delete_session(db, token)
        await db.commit()
    _clear_session_cookie(response)
    response.status_code = 204
    return response


@router.get("/me")
async def me(current: Annotated[CurrentUser, Depends(current_user)]) -> dict:
    return {
        "user": {"id": str(current.user.id), "email": current.user.email},
        "csrfToken": current.session.csrf_token,
    }


@router.post("/forgot-password")
async def forgot_password(
    payload: ForgotIn, request: Request, db: AsyncSession = Depends(get_session)
) -> dict:
    settings = get_settings()
    ip = _client_ip(request)
    user = (
        await db.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()

    if user is not None:
        token = secrets.token_urlsafe(32)
        token_hash = _hash_token(token)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=RESET_EXPIRY_MINUTES)
        link = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/set-password?token={token}"
        subject, body = render_reset(
            link=link, expires_minutes=RESET_EXPIRY_MINUTES, recipient=user.email
        )

        try:
            await email_sender.send(user.email, subject, body)
        except Exception:
            await audit_log_repo.record(
                action="forgot_password", user_id=user.id, email=user.email, ip=ip, success=False
            )
            raise HTTPException(status_code=502, detail="email_failed")

        db.add(
            PasswordResetToken(
                user_id=user.id, token_hash=token_hash, kind="reset", expires_at=expires_at
            )
        )
        await db.commit()
        await audit_log_repo.record(
            action="forgot_password", user_id=user.id, email=user.email, ip=ip, success=True
        )
    else:
        await audit_log_repo.record(
            action="forgot_password", email=payload.email, ip=ip, success=False
        )

    return {"ok": True}


@router.post("/set-password")
async def set_password(
    payload: SetPasswordIn,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_session),
) -> dict:
    ip = _client_ip(request)
    token_hash = _hash_token(payload.token)

    consumed = await db.execute(
        update(PasswordResetToken)
        .where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > datetime.now(timezone.utc),
        )
        .values(used_at=datetime.now(timezone.utc))
        .returning(PasswordResetToken.id, PasswordResetToken.user_id, PasswordResetToken.kind)
    )
    row = consumed.first()
    if row is None:
        existing = (
            await db.execute(
                select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
            )
        ).scalar_one_or_none()
        await db.commit()
        if existing is None:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail={"error_code": "token_used", "message": "Link ungueltig"},
            )
        if existing.used_at is not None:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail={"error_code": "token_used", "message": "Link bereits verwendet"},
            )
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"error_code": "token_expired", "message": "Link abgelaufen"},
        )

    _, user_id, kind = row

    if await check_password(payload.password):
        await db.rollback()
        raise HTTPException(status_code=422, detail="password_breached")

    new_hash = await hash_password(payload.password)
    await db.execute(update(User).where(User.id == user_id).values(password_hash=new_hash))
    await delete_sessions_for_user(db, user_id)
    await db.commit()

    user = await db.get(User, user_id)
    await audit_log_repo.record(
        action="set_password", user_id=user_id, email=user.email if user else None,
        ip=ip, success=True
    )

    if kind == "invitation" and user is not None:
        created = await create_session(
            db, user_id=user.id, ip=ip, user_agent=request.headers.get("User-Agent")
        )
        await db.commit()
        _set_session_cookie(response, created.token, created.expires_at)
        return {
            "user": {"id": str(user.id), "email": user.email},
            "csrfToken": created.csrf_token,
            "kind": "invitation",
        }

    return {"kind": "reset"}


@router.get("/sessions")
async def get_sessions(
    request: Request,
    current: Annotated[CurrentUser, Depends(current_user)],
    db: AsyncSession = Depends(get_session),
) -> list[dict]:
    settings = get_settings()
    cookie_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    return await list_sessions_for_user(db, current.user.id, cookie_token)


@router.post("/sessions/{session_id}/revoke", status_code=204)
async def revoke_session(
    session_id: uuid.UUID,
    request: Request,
    response: Response,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> Response:
    deleted = await delete_session_by_id(db, current.user.id, session_id)
    if deleted == 0:
        raise HTTPException(status_code=404, detail="not_found")
    await db.commit()
    if current.session.id == session_id:
        _clear_session_cookie(response)
    await audit_log_repo.record(
        action="session_revoke",
        user_id=current.user.id,
        email=current.user.email,
        ip=_client_ip(request),
        success=True,
    )
    response.status_code = 204
    return response


@router.delete("/account", status_code=204)
async def delete_account(
    request: Request,
    response: Response,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> Response:
    user_id = current.user.id
    email = current.user.email
    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()
    _clear_session_cookie(response)
    await audit_log_repo.record(
        action="account_delete", user_id=None, email=email, ip=_client_ip(request), success=True
    )
    response.status_code = 204
    return response
