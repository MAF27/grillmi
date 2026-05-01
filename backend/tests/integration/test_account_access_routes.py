from __future__ import annotations

import uuid

from sqlalchemy import select

from grillmi.models import (
    Favorite,
    Grillade,
    Menu,
    PasswordResetToken,
    Session as SessionRow,
    User,
    UserSettingsRow,
)
from grillmi.repos.sessions_repo import create_session


async def test_revoke_session_via_http_clears_cookie_when_revoking_own_session(
    auth_client,
):
    client, user, session = await auth_client()
    resp = await client.post(f"/api/auth/sessions/{session.row_id}/revoke")
    assert resp.status_code == 204
    set_cookie = resp.headers.get("set-cookie", "")
    assert "grillmi_session=" in set_cookie
    assert "Max-Age=0" in set_cookie or "expires=" in set_cookie.lower()


async def test_revoke_session_via_http_does_not_clear_cookie_when_revoking_other_session(
    auth_client, db_session,
):
    client, user, session = await auth_client()
    other = await create_session(db_session, user_id=user.id, ip="127.0.0.1", user_agent="other")
    await db_session.commit()

    resp = await client.post(f"/api/auth/sessions/{other.row_id}/revoke")
    assert resp.status_code == 204
    set_cookie = resp.headers.get("set-cookie", "")
    assert "grillmi_session=" not in set_cookie


async def test_delete_account_via_http_cascades_to_all_owned_rows(auth_client, db_session):
    client, user, _ = await auth_client()
    db_session.add(Grillade(user_id=user.id, name="g", status="planned"))
    db_session.add(Menu(user_id=user.id, name="m"))
    db_session.add(Favorite(user_id=user.id, label="f", cut_id="rinds-entrecote"))
    db_session.add(UserSettingsRow(user_id=user.id, value={}))
    await db_session.commit()

    resp = await client.delete("/api/auth/account")
    assert resp.status_code == 204

    for Model in (Grillade, Menu, Favorite, SessionRow, PasswordResetToken, UserSettingsRow):
        rows = (
            await db_session.execute(select(Model).where(Model.user_id == user.id))
        ).scalars().all()
        assert rows == [], f"{Model.__name__} rows survived account delete"

    survived = (
        await db_session.execute(select(User).where(User.id == user.id))
    ).scalar_one_or_none()
    assert survived is None
