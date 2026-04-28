from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from grillmi.models import Session as SessionRow
from grillmi.repos.sessions_repo import (
    cleanup_expired,
    create_session,
    delete_session,
    delete_sessions_for_user,
    list_sessions_for_user,
)


async def test_cleanup_expired_removes_only_expired(db_session, make_user) -> None:
    user = await make_user(email="cleanup@example.com")

    fresh = await create_session(db_session, user_id=user.id, ip="1.1.1.1", user_agent="ua")
    expired_token = "expired-" + "x" * 28
    db_session.add(
        SessionRow(
            token=expired_token,
            user_id=user.id,
            csrf_token="cx",
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
    )
    await db_session.commit()

    deleted = await cleanup_expired(db_session)
    await db_session.commit()
    assert deleted == 1

    rows = (
        await db_session.execute(select(SessionRow).where(SessionRow.user_id == user.id))
    ).scalars().all()
    tokens = {r.token for r in rows}
    assert fresh.token in tokens
    assert expired_token not in tokens


async def test_delete_session_and_user_helpers(db_session, make_user) -> None:
    user = await make_user(email="bulkdel@example.com")
    one = await create_session(db_session, user_id=user.id, ip="1.1.1.1", user_agent="ua-one")
    two = await create_session(db_session, user_id=user.id, ip="1.1.1.2", user_agent="ua-two")
    await db_session.commit()

    listed = await list_sessions_for_user(db_session, user.id, current_token=one.token)
    assert len(listed) == 2
    current = next(r for r in listed if r["is_current"])
    assert current["id"] == str(one.row_id)

    await delete_session(db_session, two.token)
    await db_session.commit()
    listed_again = await list_sessions_for_user(db_session, user.id, current_token=None)
    assert len(listed_again) == 1

    await delete_sessions_for_user(db_session, user.id)
    await db_session.commit()
    assert await list_sessions_for_user(db_session, user.id, current_token=None) == []
