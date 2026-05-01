from __future__ import annotations

from sqlalchemy import select

from grillmi.cli import admin_init, admin_reset
from grillmi.models import PasswordResetToken, Session as SessionRow, User
from grillmi.repos.sessions_repo import create_session


async def test_admin_init_idempotent_on_existing_email(
    db_session, make_user, smtp_outbox, monkeypatch
) -> None:
    await make_user(email="adminit@example.com")

    # The CLI uses its own session_maker; route fixtures rolled-back transactions
    # don't affect what the CLI sees. We instead point the CLI at the existing
    # row by reusing the same database via DATABASE_URL_OVERRIDE that the
    # session fixture is already using.
    rc = await admin_init._run("adminit@example.com")
    assert rc == 0
    # No second invitation sent — admin_init exits early before attempting to
    # send because the user already exists.
    assert all(msg["to"] != "adminit@example.com" for msg in smtp_outbox)


async def test_admin_reset_emails_link_and_keeps_sessions(
    db_session, make_user, smtp_outbox
) -> None:
    user = await make_user(email="reset-cli@example.com")
    original_hash = user.password_hash
    pre = await create_session(db_session, user_id=user.id, ip="127.0.0.1", user_agent="ua")
    await db_session.commit()

    rc = await admin_reset._run("reset-cli@example.com")
    assert rc == 0

    # Existing session must NOT be invalidated by sending a reset link — the
    # password only changes when /set-password consumes the token.
    rows = (
        await db_session.execute(select(SessionRow).where(SessionRow.user_id == user.id))
    ).scalars().all()
    assert any(r.token == pre.token for r in rows)

    # The user's password_hash must be untouched.
    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    await db_session.refresh(fresh)
    assert fresh.password_hash == original_hash

    # A reset-kind token row was inserted.
    tokens = (
        await db_session.execute(
            select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
        )
    ).scalars().all()
    assert len(tokens) == 1
    assert tokens[0].kind == "reset"

    # An email was sent to the user.
    assert any(msg["to"] == "reset-cli@example.com" for msg in smtp_outbox)
