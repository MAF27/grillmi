from __future__ import annotations

import uuid

from sqlalchemy import select

from grillmi.models import GrilladeItem


async def test_stranded_item_returns_409(auth_client) -> None:
    client, user, session = await auth_client()

    bogus_grillade = uuid.uuid4()
    resp = await client.post(
        f"/api/grilladen/{bogus_grillade}/items",
        json={
            "label": "Ribeye",
            "cut_id": "ribeye",
            "cook_seconds_min": 240,
            "cook_seconds_max": 360,
            "flip_fraction": "0.5",
            "rest_seconds": 120,
        },
    )
    assert resp.status_code == 409


async def test_delete_grillade_cascades_items(auth_client, db_session) -> None:
    client, user, session = await auth_client()

    create_resp = await client.post(
        "/api/grilladen", json={"name": "G", "status": "planned"}
    )
    grillade_id = create_resp.json()["id"]

    for label in ("Ribeye", "Sausage"):
        r = await client.post(
            f"/api/grilladen/{grillade_id}/items",
            json={
                "label": label,
                "cut_id": "ribeye",
                "cook_seconds_min": 60,
                "cook_seconds_max": 120,
                "flip_fraction": "0.5",
                "rest_seconds": 30,
            },
        )
        assert r.status_code == 201

    # Hard-delete the grillade row from the database (the route only
    # soft-deletes); cascading FK should remove items.
    from grillmi.models import Grillade
    g = (
        await db_session.execute(select(Grillade).where(Grillade.id == uuid.UUID(grillade_id)))
    ).scalar_one()
    await db_session.delete(g)
    await db_session.commit()

    items = (
        await db_session.execute(
            select(GrilladeItem).where(GrilladeItem.grillade_id == uuid.UUID(grillade_id))
        )
    ).scalars().all()
    assert items == []
