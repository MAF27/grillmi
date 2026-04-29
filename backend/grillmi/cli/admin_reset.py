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
from grillmi.email.templates import render_reset
from grillmi.logging import configure_logging
from grillmi.models import PasswordResetToken, User

RESET_EXPIRY_MINUTES = 30


async def _run(email: str) -> int:
    settings = get_settings()
    factory = async_session_maker()

    async with factory() as session:
        user = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if user is None:
            print(f"no user found for email {email!r}", file=sys.stderr)
            return 2

        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("utf-8")).digest()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=RESET_EXPIRY_MINUTES)
        link = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/set-password?token={token}"
        rendered = render_reset(
            link=link, expires_minutes=RESET_EXPIRY_MINUTES, recipient=user.email
        )

        try:
            await email_sender.send(user.email, rendered.subject, rendered.text, rendered.html)
        except Exception as exc:
            print(f"send failed; aborting before any DB writes: {exc}", file=sys.stderr)
            return 2

        session.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                kind="reset",
                expires_at=expires_at,
            )
        )
        await session.commit()

    print(f"reset link sent to {email}; expires in {RESET_EXPIRY_MINUTES}m")
    return 0


def main() -> None:
    configure_logging(json=False)
    parser = argparse.ArgumentParser(prog="grillmi-admin-reset")
    parser.add_argument("--email", required=True)
    args = parser.parse_args()
    sys.exit(asyncio.run(_run(args.email)))


if __name__ == "__main__":
    main()
