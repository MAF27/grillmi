import argparse
import asyncio
import sys

from grillmi.db import async_session_maker
from grillmi.logging import configure_logging
from grillmi.services.account_access import AccountAccess


async def _run(email: str, first_name: str | None = None) -> int:
    factory = async_session_maker()

    async with factory() as session:
        try:
            result = await AccountAccess.create_user_with_invitation(session, email, first_name)
        except Exception as exc:
            print(f"send failed; aborting before any DB writes: {exc}", file=sys.stderr)
            return 2

    if result is None:
        print(f"user with email {email!r} already exists; nothing to do", file=sys.stderr)
        return 0

    print(f"invitation sent to {email}; expires in {result.expires_hours}h")
    return 0


def main() -> None:
    configure_logging(json=False)
    parser = argparse.ArgumentParser(prog="grillmi-admin-init")
    parser.add_argument("--email", required=True)
    parser.add_argument("--first-name", dest="first_name", default=None)
    args = parser.parse_args()
    sys.exit(asyncio.run(_run(args.email, args.first_name)))


if __name__ == "__main__":
    main()
