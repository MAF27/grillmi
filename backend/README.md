# Grillmi Backend

FastAPI + Postgres backend providing accounts, sessions, and per-entity sync for the Grillmi PWA.

## Dev loop

```sh
cd backend
uv sync
uv run alembic upgrade head
uv run granian --interface asgi grillmi.main:app
```

The full spec lives at `resources/specs/260428-accounts-and-sync.md`.

## Layout

- `grillmi/config.py`: pydantic-settings config, fail-fast on missing env.
- `grillmi/db.py`: async SQLAlchemy engine and `get_session` dependency.
- `grillmi/main.py`: FastAPI app factory and route registration.
- `grillmi/security/`: argon2, csrf, rate_limit, headers, hibp, device_label.
- `grillmi/repos/`: per-entity persistence; every public function takes `session, user_id` first.
- `grillmi/routes/`: HTTP endpoints under `/api`.
- `grillmi/cli/`: `grillmi-admin-init` and `grillmi-admin-reset` entry points.
- `grillmi/email/`: aiosmtplib sender + Jinja2 templates.
- `grillmi/sync/`: bulk import + delta endpoints.
- `migrations/`: Alembic migrations.
- `tests/unit/` and `tests/integration/`: mirrors source tree.
