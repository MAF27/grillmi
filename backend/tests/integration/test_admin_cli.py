from __future__ import annotations

from sqlalchemy import select

from grillmi.cli import admin_init, admin_reset
from grillmi.models import PasswordResetToken, Session as SessionRow, User
from grillmi.repos.sessions_repo import create_session


async def test_admin_init_idempotent_on_existing_email(
    db_session, make_user, smtp_outbox, monkeypatch
) -> None:
    user = await make_user(email="adminit@example.com")

    # The CLI uses its own session_maker; route fixtures rolled-back transactions
    # don't affect what the CLI sees. We instead point the CLI at the existing
    # row by reusing the same database via DATABASE_URL_OVERRIDE that the
    # session fixture is already using.
    rc = await admin_init._run("adminit@example.com")
    assert rc == 0
    # No second invitation sent — admin_init exits early before attempting to
    # send because the user already exists.
    assert all(msg["to"] != "adminit@example.com" for msg in smtp_outbox)


async def test_admin_reset_invalidates_all_sessions(db_session, make_user) -> None:
    user = await make_user(email="reset-cli@example.com")
    pre = await create_session(db_session, user_id=user.id, ip="127.0.0.1", user_agent="ua")
    await db_session.commit()

    rc = await admin_reset._run("reset-cli@example.com", "brand-new-passw0rd")
    assert rc == 0

    # The CLI uses its own session_maker (commits to a fresh connection), so we
    # confirm via a fresh query: the previous session should be gone.
    rows = (
        await db_session.execute(select(SessionRow).where(SessionRow.user_id == user.id))
    ).scalars().all()
    assert all(r.token != pre.token for r in rows)

    # The user's password_hash should now be a fresh argon2 hash.
    fresh = (await db_session.execute(select(User).where(User.id == user.id))).scalar_one()
    await db_session.refresh(fresh)
    assert fresh.password_hash.startswith("$argon2")
    # Reset-token rows from the CLI flow are not created (admin-reset writes
    # the new hash directly), so the password_reset_tokens table stays empty
    # for this user.
    tokens = (
        await db_session.execute(
            select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
        )
    ).scalars().all()
    assert tokens == []
