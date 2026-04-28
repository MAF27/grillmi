from __future__ import annotations

from datetime import datetime, timedelta, timezone

from grillmi.repos import grilladen_repo


async def test_list_for_user_with_since_filter(db_session, make_user) -> None:
    import asyncio
    user = await make_user()
    g_old = await grilladen_repo.create(
        db_session, user.id, {"name": "old", "status": "finished"}
    )
    await db_session.commit()
    cutoff = g_old.updated_at + timedelta(milliseconds=1)
    await asyncio.sleep(0.05)
    # Bump cutoff above old, then create a new row in a fresh transaction.
    g_new = await grilladen_repo.create(
        db_session, user.id, {"name": "new", "status": "planned"}
    )
    await db_session.commit()

    rows = await grilladen_repo.list_for_user(db_session, user.id, since=cutoff)
    names = [r.name for r in rows]
    assert "new" in names
    assert "old" not in names


async def test_create_with_explicit_uuid_and_dates(db_session, make_user) -> None:
    import uuid

    user = await make_user()
    given_id = uuid.uuid4()
    g = await grilladen_repo.create(
        db_session,
        user.id,
        {
            "id": str(given_id),
            "name": "explicit",
            "status": "planned",
            "target_finish_at": "2026-04-28T18:00:00+00:00",
            "started_at": datetime.now(timezone.utc),
            "ended_at": None,
        },
    )
    assert g.id == given_id
    assert g.target_finish_at is not None
