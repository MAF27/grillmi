from __future__ import annotations

from sqlalchemy import select

from grillmi.cli import admin_init
from grillmi.models import PasswordResetToken, User


async def test_admin_init_creates_user_and_token_on_fresh_email(
    db_session, smtp_outbox
) -> None:
    rc = await admin_init._run("brand-new@example.com")
    assert rc == 0

    user = (
        await db_session.execute(select(User).where(User.email == "brand-new@example.com"))
    ).scalar_one()
    assert user.password_hash.startswith("!disabled_")

    token = (
        await db_session.execute(
            select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
        )
    ).scalar_one()
    assert token.kind == "invitation"

    # SMTP fixture captured the activation email.
    assert any(
        msg["to"] == "brand-new@example.com" and "set-password" in msg["body"]
        for msg in smtp_outbox
    )


async def test_admin_init_smtp_failure_aborts_before_db_writes(
    db_session, smtp_outbox_fail
) -> None:
    rc = await admin_init._run("smtp-fail@example.com")
    assert rc == 2

    user = (
        await db_session.execute(select(User).where(User.email == "smtp-fail@example.com"))
    ).scalar_one_or_none()
    assert user is None
