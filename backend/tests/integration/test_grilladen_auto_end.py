from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from grillmi.models import Grillade
from grillmi.repos.grilladen_repo import sweep_stale_running


async def test_sweep_finishes_running_grilladen_past_threshold(db_session, make_user) -> None:
    # The unique partial index `one_active_grillade_per_user` means each
    # active row needs its own user.
    stale_user = await make_user(email="stale@example.com")
    fresh_user = await make_user(email="fresh@example.com")
    planned_user = await make_user(email="planned@example.com")
    finished_user = await make_user(email="finished@example.com")
    now = datetime.now(timezone.utc)

    stale = Grillade(user_id=stale_user.id, status="running", name="stale")
    fresh = Grillade(user_id=fresh_user.id, status="running", name="fresh")
    planned = Grillade(user_id=planned_user.id, status="planned", name="planned-stale")
    finished = Grillade(user_id=finished_user.id, status="finished", name="already-done")
    db_session.add_all([stale, fresh, planned, finished])
    await db_session.flush()

    # Backdate updated_at directly; the ORM's onupdate would otherwise reset it.
    await db_session.execute(
        Grillade.__table__.update()
        .where(Grillade.id == stale.id)
        .values(updated_at=now - timedelta(hours=9))
    )
    await db_session.execute(
        Grillade.__table__.update()
        .where(Grillade.id == planned.id)
        .values(updated_at=now - timedelta(hours=9))
    )
    await db_session.commit()

    cutoff = now - timedelta(hours=8)
    ended = await sweep_stale_running(db_session, cutoff)
    await db_session.commit()

    ended_ids = {row.id for row in ended}
    assert ended_ids == {stale.id}, "only running rows past cutoff should end"

    refreshed = {
        row.id: row
        for row in (await db_session.execute(select(Grillade))).scalars().all()
    }
    assert refreshed[stale.id].status == "finished"
    assert refreshed[stale.id].ended_at is not None
    assert refreshed[fresh.id].status == "running"
    assert refreshed[planned.id].status == "planned"  # planned is left alone
    assert refreshed[finished.id].status == "finished"


async def test_sweep_skips_soft_deleted(db_session, make_user) -> None:
    user = await make_user(email="sweep-deleted@example.com")
    now = datetime.now(timezone.utc)

    deleted = Grillade(
        user_id=user.id,
        status="running",
        name="deleted",
        deleted_at=now - timedelta(days=1),
    )
    db_session.add(deleted)
    await db_session.flush()
    await db_session.execute(
        Grillade.__table__.update()
        .where(Grillade.id == deleted.id)
        .values(updated_at=now - timedelta(hours=12))
    )
    await db_session.commit()

    ended = await sweep_stale_running(db_session, now - timedelta(hours=8))
    await db_session.commit()
    assert ended == []
