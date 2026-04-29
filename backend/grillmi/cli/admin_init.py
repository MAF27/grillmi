import argparse
import asyncio
import hashlib
import secrets
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from grillmi.config import get_settings
from grillmi.db import async_session_maker
from grillmi.email import sender as email_sender
from grillmi.email.templates import render_activation
from grillmi.logging import configure_logging
from grillmi.models import PasswordResetToken, User

INVITATION_EXPIRY_HOURS = 1


async def _run(email: str) -> int:
    settings = get_settings()
    factory = async_session_maker()

    async with factory() as session:
        existing = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if existing is not None:
            print(f"user with email {email!r} already exists; nothing to do", file=sys.stderr)
            return 0

        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("utf-8")).digest()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=INVITATION_EXPIRY_HOURS)
        link = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/set-password?token={token}"
        rendered = render_activation(
            link=link, expires_hours=INVITATION_EXPIRY_HOURS, recipient=email
        )

        try:
            await email_sender.send(email, rendered.subject, rendered.text, rendered.html)
        except Exception as exc:
            print(f"send failed; aborting before any DB writes: {exc}", file=sys.stderr)
            return 2

        user = User(
            email=email,
            password_hash="!disabled_" + secrets.token_hex(8),
        )
        session.add(user)
        await session.flush()
        session.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                kind="invitation",
                expires_at=expires_at,
            )
        )
        await session.commit()

    print(f"invitation sent to {email}; expires in {INVITATION_EXPIRY_HOURS}h")
    return 0


def main() -> None:
    configure_logging(json=False)
    parser = argparse.ArgumentParser(prog="grillmi-admin-init")
    parser.add_argument("--email", required=True)
    args = parser.parse_args()
    sys.exit(asyncio.run(_run(args.email)))


if __name__ == "__main__":
    main()
