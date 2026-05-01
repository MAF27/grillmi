import argparse
import asyncio
import sys

from sqlalchemy import select

from grillmi.db import async_session_maker
from grillmi.logging import configure_logging
from grillmi.models import User
from grillmi.services.account_access import RESET_EXPIRY_MINUTES, AccountAccess


async def _run(email: str) -> int:
    factory = async_session_maker()

    async with factory() as session:
        user = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if user is None:
            print(f"no user found for email {email!r}", file=sys.stderr)
            return 2

        try:
            await AccountAccess.request_password_reset(session, email=email, ip=None)
        except Exception as exc:
            print(f"send failed; aborting before any DB writes: {exc}", file=sys.stderr)
            return 2

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
