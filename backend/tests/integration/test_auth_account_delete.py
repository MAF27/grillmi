from __future__ import annotations

from sqlalchemy import select

from grillmi.models import (
    Favorite,
    Grillade,
    GrilladeItem,
    Menu,
    MenuItem,
    PasswordResetToken,
    Session as SessionRow,
    User,
    UserSettingsRow,
)
from grillmi.repos import (
    favorites_repo,
    grillade_items_repo,
    grilladen_repo,
    menus_repo,
    settings_repo,
)


async def test_delete_account_cascades_grilladen_menus_favorites_settings_sessions(
    auth_client, db_session
) -> None:
    client, user, session = await auth_client()
    user_id = user.id

    grillade = await grilladen_repo.create(
        db_session, user_id, {"name": "to delete", "status": "planned"}
    )
    await db_session.flush()
    await grillade_items_repo.create(
        db_session,
        user_id,
        grillade.id,
        {
            "label": "x",
            "cut_id": "ribeye",
            "cook_seconds_min": 60,
            "cook_seconds_max": 120,
            "flip_fraction": "0.5",
            "rest_seconds": 60,
        },
    )
    await menus_repo.create(db_session, user_id, {"name": "M"})
    await db_session.flush()
    await favorites_repo.create(db_session, user_id, {"label": "F", "cut_id": "ribeye"})
    await settings_repo.upsert(db_session, user_id, {"theme": "dark"})
    await db_session.commit()

    resp = await client.delete("/api/auth/account")
    assert resp.status_code == 204

    # User row gone
    assert (await db_session.execute(select(User).where(User.id == user_id))).scalar_one_or_none() is None
    # All owned rows cascade-deleted
    for Model in (Grillade, Menu, Favorite, UserSettingsRow, SessionRow, PasswordResetToken):
        col = Model.user_id if Model is not UserSettingsRow else UserSettingsRow.user_id
        rows = (await db_session.execute(select(Model).where(col == user_id))).scalars().all()
        assert rows == [], f"{Model.__name__} still has rows for the deleted user"
    # Item rows are cascaded via grillade_id; the grillade is gone, so the
    # items must be gone too.
    items = (await db_session.execute(select(GrilladeItem))).scalars().all()
    assert items == []
    menu_items = (await db_session.execute(select(MenuItem))).scalars().all()
    assert menu_items == []
