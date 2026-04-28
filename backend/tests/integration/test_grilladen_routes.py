from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from grillmi.repos import grilladen_repo


async def test_get_with_since_returns_only_newer_rows(auth_client, db_session) -> None:
    client, user, session = await auth_client()

    # Create one row (finished, so the partial unique index for "active"
    # grilladen doesn't apply), then create a second row.
    g1 = await grilladen_repo.create(db_session, user.id, {"name": "old", "status": "finished"})
    await db_session.commit()
    cutoff = g1.updated_at + timedelta(milliseconds=1)
    # Postgres timestamptz is microsecond precision; sleep briefly to ensure
    # the second row's updated_at is strictly later.
    await asyncio.sleep(0.01)
    g2 = await grilladen_repo.create(db_session, user.id, {"name": "new", "status": "planned"})
    await db_session.commit()
    assert g2.updated_at > cutoff

    resp = await client.get("/api/grilladen", params={"since": cutoff.isoformat()})
    assert resp.status_code == 200
    rows = resp.json()["rows"]
    names = [r["name"] for r in rows]
    assert "new" in names
    assert "old" not in names


async def test_patch_with_older_updated_at_returns_409(auth_client, db_session) -> None:
    client, user, session = await auth_client()

    g = await grilladen_repo.create(db_session, user.id, {"name": "G", "status": "planned"})
    await db_session.commit()

    stale = (g.updated_at - timedelta(hours=1)).isoformat()
    resp = await client.patch(
        f"/api/grilladen/{g.id}",
        json={"name": "stale-write", "updated_at": stale},
    )
    assert resp.status_code == 409


async def test_one_active_grillade_per_user_partial_index_enforced(auth_client, db_session) -> None:
    client, user, session = await auth_client()

    r1 = await client.post(
        "/api/grilladen",
        json={"name": "first", "status": "running"},
    )
    assert r1.status_code == 201

    r2 = await client.post(
        "/api/grilladen",
        json={"name": "second", "status": "running"},
    )
    assert r2.status_code == 409
