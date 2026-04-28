from __future__ import annotations

import uuid

from sqlalchemy import select

from grillmi.models import Favorite, Grillade


async def test_import_attributes_to_caller_user_id(auth_client, db_session) -> None:
    client, user, session = await auth_client()

    g_id = str(uuid.uuid4())
    f_id = str(uuid.uuid4())
    resp = await client.post(
        "/api/sync/import",
        json={
            "grilladen": [{"id": g_id, "name": "imported", "status": "planned"}],
            "favorites": [{"id": f_id, "label": "fav", "cut_id": "ribeye"}],
        },
    )
    assert resp.status_code == 200

    g = (
        await db_session.execute(select(Grillade).where(Grillade.id == uuid.UUID(g_id)))
    ).scalar_one()
    assert g.user_id == user.id

    f = (
        await db_session.execute(select(Favorite).where(Favorite.id == uuid.UUID(f_id)))
    ).scalar_one()
    assert f.user_id == user.id


async def test_import_is_idempotent_on_duplicate_ids(auth_client, db_session) -> None:
    client, user, session = await auth_client()

    g_id = str(uuid.uuid4())
    payload = {"grilladen": [{"id": g_id, "name": "once", "status": "planned"}]}

    r1 = await client.post("/api/sync/import", json=payload)
    r2 = await client.post("/api/sync/import", json=payload)
    assert r1.status_code == r2.status_code == 200
    assert r1.json()["imported_counts"]["grilladen"] == 1
    assert r2.json()["imported_counts"]["grilladen"] == 0

    rows = (
        await db_session.execute(select(Grillade).where(Grillade.id == uuid.UUID(g_id)))
    ).scalars().all()
    assert len(rows) == 1
