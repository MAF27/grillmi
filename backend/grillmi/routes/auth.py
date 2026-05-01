import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.config import get_settings
from grillmi.db import get_session
from grillmi.deps import CurrentUser, current_user, require_csrf
from grillmi.services.account_access import (
    GENERIC_LOGIN_ERROR,
    AccountAccess,
    AuthSuccess,
)

router = APIRouter(tags=["auth"])


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


@router.post("/login")
async def login(
    payload: LoginIn,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_session),
) -> dict:
    result = await AccountAccess.authenticate(
        db,
        email=payload.email,
        password=payload.password,
        ip=_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    if not isinstance(result, AuthSuccess):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=GENERIC_LOGIN_ERROR)

    _set_session_cookie(response, result.session_token, result.session_expires_at)
    return {
        "user": {"id": str(result.user_id), "email": result.user_email},
        "csrfToken": result.session_csrf_token,
    }


@router.post("/logout", status_code=204)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_session),
) -> Response:
    settings = get_settings()
    await AccountAccess.logout(db, request.cookies.get(settings.SESSION_COOKIE_NAME))
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
    await AccountAccess.request_password_reset(db, email=payload.email, ip=_client_ip(request))
    return {"ok": True}


@router.post("/set-password")
async def set_password(
    payload: SetPasswordIn,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_session),
) -> dict:
    result = await AccountAccess.set_password(
        db,
        raw_token=payload.token,
        new_password=payload.password,
        ip=_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )
    if result.kind == "invitation":
        assert result.session_token is not None
        assert result.session_expires_at is not None
        _set_session_cookie(response, result.session_token, result.session_expires_at)
        return {
            "user": {"id": str(result.user_id), "email": result.user_email},
            "csrfToken": result.session_csrf_token,
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
    return await AccountAccess.list_sessions(db, current.user.id, cookie_token)


@router.post("/sessions/{session_id}/revoke", status_code=204)
async def revoke_session(
    session_id: uuid.UUID,
    request: Request,
    response: Response,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> Response:
    await AccountAccess.revoke_session(
        db,
        user_id=current.user.id,
        session_id=session_id,
        user_email=current.user.email,
        ip=_client_ip(request),
    )
    if current.session.id == session_id:
        _clear_session_cookie(response)
    response.status_code = 204
    return response


@router.delete("/account", status_code=204)
async def delete_account(
    request: Request,
    response: Response,
    current: Annotated[CurrentUser, Depends(require_csrf)],
    db: AsyncSession = Depends(get_session),
) -> Response:
    await AccountAccess.delete_account(
        db,
        user_id=current.user.id,
        user_email=current.user.email,
        ip=_client_ip(request),
    )
    _clear_session_cookie(response)
    response.status_code = 204
    return response
