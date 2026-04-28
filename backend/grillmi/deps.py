from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from grillmi.config import get_settings
from grillmi.db import get_session
from grillmi.models import Session, User
from grillmi.repos.sessions_repo import get_session_by_token
from grillmi.security.csrf import validate_csrf


@dataclass
class CurrentUser:
    user: User
    session: Session

    @property
    def id(self) -> UUID:
        return self.user.id


async def current_user(
    request: Request, db: AsyncSession = Depends(get_session)
) -> CurrentUser:
    settings = get_settings()
    cookie_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not cookie_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not_authenticated")

    session_row = await get_session_by_token(db, cookie_token)
    if session_row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not_authenticated")

    user = await db.get(User, session_row.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not_authenticated")

    request.state.user_id = user.id
    request.state.session_token = cookie_token
    return CurrentUser(user=user, session=session_row)


async def require_csrf(
    request: Request, current: CurrentUser = Depends(current_user)
) -> CurrentUser:
    validate_csrf(request, current.session)
    return current
