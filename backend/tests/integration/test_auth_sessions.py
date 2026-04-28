from __future__ import annotations

from sqlalchemy import select

from grillmi.models import Session as SessionRow
from grillmi.repos.sessions_repo import create_session


async def test_get_sessions_returns_only_callers_sessions(
    auth_client, db_session, make_user
) -> None:
    other = await make_user(email="other@example.com")
    await create_session(db_session, user_id=other.id, ip="10.0.0.2", user_agent="other-ua")
    await db_session.commit()

    client, user, session = await auth_client()
    resp = await client.get("/api/auth/sessions")
    assert resp.status_code == 200
    rows = resp.json()
    # Caller sees their own session (1 row); the other user's session is not
    # visible.
    assert len(rows) == 1
    assert rows[0]["is_current"] is True


async def test_revoke_session_removes_row(auth_client, db_session) -> None:
    client, user, session = await auth_client()

    other_session = await create_session(
        db_session, user_id=user.id, ip="10.0.0.3", user_agent="other-device"
    )
    await db_session.commit()

    resp = await client.post(f"/api/auth/sessions/{other_session.row_id}/revoke")
    assert resp.status_code == 204

    row = (
        await db_session.execute(
            select(SessionRow).where(SessionRow.id == other_session.row_id)
        )
    ).scalar_one_or_none()
    assert row is None

    # Subsequent /me with revoked cookie returns 401
    client.cookies.set("grillmi_session", other_session.token)
    resp2 = await client.get("/api/auth/me")
    assert resp2.status_code == 401
