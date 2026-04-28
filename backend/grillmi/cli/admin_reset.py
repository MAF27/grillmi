import argparse
import asyncio
import sys

from sqlalchemy import select, update

from grillmi.db import async_session_maker
from grillmi.logging import configure_logging
from grillmi.models import User
from grillmi.repos.sessions_repo import delete_sessions_for_user
from grillmi.security.argon2 import hash_password


async def _run(email: str, password: str) -> int:
    factory = async_session_maker()
    async with factory() as session:
        user = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if user is None:
            print(f"no user found for email {email!r}", file=sys.stderr)
            return 2
        new_hash = await hash_password(password)
        await session.execute(update(User).where(User.id == user.id).values(password_hash=new_hash))
        await delete_sessions_for_user(session, user.id)
        await session.commit()
    print(f"password reset for {email}")
    return 0


def main() -> None:
    configure_logging(json=False)
    parser = argparse.ArgumentParser(prog="grillmi-admin-reset")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password-stdin", action="store_true",
                        help="read the new password from stdin (recommended)")
    args = parser.parse_args()

    if args.password_stdin:
        password = sys.stdin.readline().rstrip("\n")
    else:
        import getpass
        password = getpass.getpass("New password: ")
    if len(password) < 12:
        print("password must be at least 12 characters", file=sys.stderr)
        sys.exit(2)
    sys.exit(asyncio.run(_run(args.email, password)))


if __name__ == "__main__":
    main()
