from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.config import get_settings
from grillmi.email import sender as email_sender
from grillmi.email.templates import render_activation, render_reset
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

RESET_EXPIRY_MINUTES = 30
INVITATION_EXPIRY_HOURS = 1
GENERIC_LOGIN_ERROR = {"detail": "invalid_credentials", "message": "Invalid email or password"}


def _hash_token(raw_token: str) -> bytes:
    return hashlib.sha256(raw_token.encode("utf-8")).digest()


@dataclass
class AuthSuccess:
    user_id: uuid.UUID
    user_email: str
    session_token: str
    session_csrf_token: str
    session_expires_at: datetime


@dataclass
class AuthFailure:
    reason: str = "invalid_credentials"


@dataclass
class PasswordSetResult:
    kind: Literal["invitation", "reset"]
    user_id: uuid.UUID | None = None
    user_email: str | None = None
    session_token: str | None = None
    session_csrf_token: str | None = None
    session_expires_at: datetime | None = None


@dataclass
class InvitationCreated:
    user_id: uuid.UUID
    expires_hours: int


class AccountAccess:
    """All non-HTTP authentication and account flows. HTTP routes and CLI
    callers share this single entry point so audit_log, rate limiting, and
    Argon2 timing live in one place."""

    @staticmethod
    async def authenticate(
        db: AsyncSession,
        email: str,
        password: str,
        ip: str | None,
        user_agent: str | None,
    ) -> AuthSuccess | AuthFailure:
        login_ip_limiter.check_and_record(ip or "unknown")
        login_account_limiter.check_and_record(email.lower())

        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()

        password_hash = user.password_hash if user else None
        valid = await verify_password_timing_safe(password, password_hash)

        if user is not None and (
            password_hash is not None and password_hash.startswith("!disabled_")
        ):
            valid = False

        if not user or not valid:
            await audit_log_repo.record(action="login", email=email, ip=ip, success=False)
            return AuthFailure()

        if check_needs_rehash(user.password_hash):
            new_hash = await hash_password(password)
            await db.execute(update(User).where(User.id == user.id).values(password_hash=new_hash))

        created = await create_session(db, user_id=user.id, ip=ip, user_agent=user_agent)
        await db.execute(
            update(User).where(User.id == user.id).values(last_login_at=datetime.now(timezone.utc))
        )
        await db.commit()

        await audit_log_repo.record(
            action="login", user_id=user.id, email=user.email, ip=ip, success=True
        )
        return AuthSuccess(
            user_id=user.id,
            user_email=user.email,
            session_token=created.token,
            session_csrf_token=created.csrf_token,
            session_expires_at=created.expires_at,
        )

    @staticmethod
    async def logout(db: AsyncSession, token: str | None) -> None:
        if token:
            await delete_session(db, token)
            await db.commit()

    @staticmethod
    async def request_password_reset(
        db: AsyncSession, email: str, ip: str | None
    ) -> None:
        settings = get_settings()
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()

        if user is not None:
            token = secrets.token_urlsafe(32)
            token_hash = _hash_token(token)
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=RESET_EXPIRY_MINUTES)
            link = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/set-password?token={token}"
            rendered = render_reset(
                link=link,
                expires_minutes=RESET_EXPIRY_MINUTES,
                recipient=user.email,
                first_name=user.first_name,
            )

            try:
                await email_sender.send(user.email, rendered.subject, rendered.text, rendered.html)
            except Exception:
                await audit_log_repo.record(
                    action="forgot_password",
                    user_id=user.id,
                    email=user.email,
                    ip=ip,
                    success=False,
                )
                raise HTTPException(status_code=502, detail="email_failed")

            db.add(
                PasswordResetToken(
                    user_id=user.id, token_hash=token_hash, kind="reset", expires_at=expires_at
                )
            )
            await db.commit()
            await audit_log_repo.record(
                action="forgot_password",
                user_id=user.id,
                email=user.email,
                ip=ip,
                success=True,
            )
        else:
            await audit_log_repo.record(
                action="forgot_password", email=email, ip=ip, success=False
            )

    @staticmethod
    async def set_password(
        db: AsyncSession,
        raw_token: str,
        new_password: str,
        ip: str | None,
        user_agent: str | None,
    ) -> PasswordSetResult:
        token_hash = _hash_token(raw_token)

        consumed = await db.execute(
            update(PasswordResetToken)
            .where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used_at.is_(None),
                PasswordResetToken.expires_at > datetime.now(timezone.utc),
            )
            .values(used_at=datetime.now(timezone.utc))
            .returning(
                PasswordResetToken.id, PasswordResetToken.user_id, PasswordResetToken.kind
            )
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

        if await check_password(new_password):
            await db.rollback()
            raise HTTPException(status_code=422, detail="password_breached")

        new_hash = await hash_password(new_password)
        await db.execute(update(User).where(User.id == user_id).values(password_hash=new_hash))
        await delete_sessions_for_user(db, user_id)
        await db.commit()

        user = await db.get(User, user_id)
        await audit_log_repo.record(
            action="set_password",
            user_id=user_id,
            email=user.email if user else None,
            ip=ip,
            success=True,
        )

        if kind == "invitation" and user is not None:
            created = await create_session(db, user_id=user.id, ip=ip, user_agent=user_agent)
            await db.commit()
            return PasswordSetResult(
                kind="invitation",
                user_id=user.id,
                user_email=user.email,
                session_token=created.token,
                session_csrf_token=created.csrf_token,
                session_expires_at=created.expires_at,
            )

        return PasswordSetResult(kind="reset")

    @staticmethod
    async def list_sessions(
        db: AsyncSession, user_id: uuid.UUID, current_token: str | None
    ) -> list[dict]:
        return await list_sessions_for_user(db, user_id, current_token)

    @staticmethod
    async def revoke_session(
        db: AsyncSession,
        user_id: uuid.UUID,
        session_id: uuid.UUID,
        user_email: str,
        ip: str | None,
    ) -> int:
        deleted = await delete_session_by_id(db, user_id, session_id)
        if deleted == 0:
            raise HTTPException(status_code=404, detail="not_found")
        await db.commit()
        await audit_log_repo.record(
            action="session_revoke",
            user_id=user_id,
            email=user_email,
            ip=ip,
            success=True,
        )
        return deleted

    @staticmethod
    async def delete_account(
        db: AsyncSession,
        user_id: uuid.UUID,
        user_email: str,
        ip: str | None,
    ) -> None:
        await db.execute(delete(User).where(User.id == user_id))
        await db.commit()
        await audit_log_repo.record(
            action="account_delete",
            user_id=None,
            email=user_email,
            ip=ip,
            success=True,
        )

    @staticmethod
    async def create_user_with_invitation(
        db: AsyncSession, email: str, first_name: str | None
    ) -> InvitationCreated | None:
        """CLI flow: provisions a user with a disabled hash and emails an
        invitation reset-token. Returns None if the email already exists.
        Raises if the email send fails (so the DB write is aborted)."""
        settings = get_settings()
        existing = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if existing is not None:
            return None

        token = secrets.token_urlsafe(32)
        token_hash = _hash_token(token)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=INVITATION_EXPIRY_HOURS)
        link = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/set-password?token={token}"
        rendered = render_activation(
            link=link,
            expires_hours=INVITATION_EXPIRY_HOURS,
            recipient=email,
            first_name=first_name,
        )

        await email_sender.send(email, rendered.subject, rendered.text, rendered.html)

        user = User(
            email=email,
            first_name=first_name,
            password_hash="!disabled_" + secrets.token_hex(8),
        )
        db.add(user)
        await db.flush()
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                kind="invitation",
                expires_at=expires_at,
            )
        )
        await db.commit()
        return InvitationCreated(user_id=user.id, expires_hours=INVITATION_EXPIRY_HOURS)
