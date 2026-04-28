# Backend Stack Research, April 2026

The frontend counterpart is `stack-research-apr-2026.md`. Decisions already locked by `~/dev/reference/auth.md` (FastAPI, Argon2id via `argon2-cffi`, server-side sessions, HIBP, CSRF, `aiosmtplib` from `kraftops.ch`) and by `accounts-decision-apr-2026.md` (last-write-wins per timer, IndexedDB on the client, REST-on-resume sync) are not relitigated here. This doc decides the open pieces: ASGI server, DB driver, ORM, migrations, settings loader, scheduled-push worker, Web Push library, structured logging, test stack, and the Postgres deploy shape on the existing prod LXC.

## Bottom line

Build the Grillmi backend on FastAPI 0.136 + Granian 2.x + SQLAlchemy 2.0 (async) + asyncpg 0.31 + Alembic 1.18 + pydantic-settings 2.14 + structlog 25 + pywebpush 2.3, with a single in-process asyncio scheduler that persists pending notifications in the same Postgres 17 DB. Postgres runs apt-installed on the existing prod LXC (PGDG repo, listening on 127.0.0.1, role and DB created via Ansible). No Redis. The LXC needs a small bump to 2 CPU / 4 GB RAM / 32 GB disk before Postgres lands. Granian gets the ASGI slot over uvicorn because the 2025 Rust runtime upgrade and free-threaded wheel support carry no migration cost (it speaks ASGI), and uvicorn stays as the documented fallback.

## At-a-glance matrices

### ASGI server

| Server | Runtime | Throughput vs uvicorn (plaintext) | HTTP/2 | Free-threaded wheels | Operational maturity |
| --- | --- | --- | --- | --- | --- |
| uvicorn 0.34 | Python (uvloop) | baseline | no | no | excellent, default for FastAPI docs |
| Granian 2.x | Rust | +30 to +35% | yes | yes (since 2.0) | strong (Talk Python, others in prod) |
| Hypercorn 0.17 | Python | -10 to flat | yes (incl. HTTP/3) | partial | niche; pick only if HTTP/3 required |

### Postgres driver

| Driver | API | Async | Raw speed | SQLAlchemy story |
| --- | --- | --- | --- | --- |
| asyncpg 0.31 | custom | native | fastest async (5x psycopg per maintainers) | works as `postgresql+asyncpg` dialect |
| psycopg 3.3 | DBAPI | sync + async in one driver | slower than asyncpg, faster API surface | first-class `postgresql+psycopg` dialect |
| psycopg2 2.9 | DBAPI | sync only | fastest sync | legacy only |

### ORM / DB layer

| Option | Async | Pydantic alignment | Migration ergonomics | Fit at Grillmi scale |
| --- | --- | --- | --- | --- |
| SQLAlchemy 2.0 (async) | yes | separate Pydantic schemas | Alembic native | best fit; tiny tables, simple joins |
| SQLModel 0.0.x | yes (via SA) | unified model | Alembic with extra config | one-user app does not need the fusion |
| Raw asyncpg | yes | none | hand-rolled SQL files | overkill DIY for ~5 tables |

### Scheduled-push worker

| Option | Durable | External services | Multi-process safe | Fit |
| --- | --- | --- | --- | --- |
| In-process asyncio + Postgres polling | yes (rows in DB) | none | single-process by design | best fit |
| APScheduler 4 + SQLAlchemy data store | yes | none | yes | viable; more deps, less control |
| arq 0.26 | yes (Redis) | Redis | yes | adds Redis just for one user |
| Celery 5.4 | yes (broker) | Redis or RabbitMQ | yes | enterprise-scale, wrong shape |

## Per-decision deep dive

### 1. ASGI server: Granian 2.x, uvicorn as fallback

Granian 2 ships a Rust HTTP/IO layer with a Python interpreter pool, a backpressure mechanism, and HTTP/1.1, HTTP/2, WebSockets, HTTPS. Independent benchmarks (Talk Python, Cemrehan Cavdar Feb 2026) show roughly +35% RPS over uvicorn on plaintext and tighter tail latency (~2.8x avg-to-max vs uvicorn's ~6.8x). Migration cost is a startup-command change; the app stays vanilla ASGI, so the lock-in is zero. Granian 2.0 publishes free-threaded (`cp314t`) wheels, which keeps the door open to drop the GIL later without a server swap. uvicorn 0.34 remains the documented fallback for cases where a Rust dependency complicates an apt-only LXC; it builds from sdist on noble without issue.

Pin: `granian>=2.0,<3` with `--interface asgi --loop uvloop --workers 1` on the prod LXC. Keep an `uvicorn>=0.34` extra in the lockfile so a one-line systemd flip is possible if Granian misbehaves.

### 2. Postgres driver: asyncpg 0.31

asyncpg is the async PostgreSQL driver of record. The MagicStack project remains healthy in 2026 (0.31.0 published with Python 3.14 free-threaded wheels). For Grillmi the choice is asyncpg because (a) the SQLAlchemy 2.0 async dialect is first-class, (b) the documented 3x SQLAlchemy-on-asyncpg overhead vs raw asyncpg is irrelevant at one-user scale, and (c) asyncpg's connection handling under concurrency is well-behaved where psycopg's discussion #411 documents per-connection slowdowns. psycopg 3.3 is a perfectly sane second choice; pick it only if a future need (template-string queries, sync-and-async-in-one-driver, libpq parity) shows up.

Pin: `asyncpg>=0.31,<0.32`. URL: `postgresql+asyncpg://grillmi:...@127.0.0.1:5432/grillmi`.

### 3. ORM/DB layer: SQLAlchemy 2.0 async

Grillmi's data is roughly: `users`, `sessions`, `audit_log`, `grilladen`, `timer_state`, `push_subscriptions`, `pending_notifications`. Five to seven tables, a few hundred rows total per user. SQLAlchemy 2.0's async ORM (typed `Mapped[...]` declarative) is the cleanest fit: it integrates with Alembic's autogenerate, with FastAPI dependency-injection for sessions, and with pydantic-settings for the connection string. SQLModel removes one schema layer but adds another set of edge cases (autogen quirks, mypy interactions, Pydantic v2 v SQLModel cadence) for a benefit Grillmi does not need: the API has at most a dozen handlers, and writing per-route Pydantic schemas separately is a feature, not a cost. Raw asyncpg is reserved for the one or two reporting queries (history view) where the ORM produces awkward SQL.

Pin: `sqlalchemy[asyncio]>=2.0.49,<2.1`. Use `selectinload` everywhere relationships are loaded inside a request (FastAPI async lazy-load is a footgun).

### 4. Migrations: Alembic 1.18

Alembic is the SQLAlchemy migration tool and the only choice that integrates with autogenerate against an async engine. The 1.18 series (1.18.0 January 2026, 1.18.4 February 2026) added a plugin system and bulk-inspector autogenerate that is materially faster on Postgres. sqitch is fine for hand-written SQL but loses autogenerate; pure SQL files would be a regression for a solo dev. Use Alembic's async template (`alembic init -t async`) and run migrations via `doppler run -- alembic upgrade head` from the management script.

Pin: `alembic>=1.18,<2`.

### 5. Settings/env loader: pydantic-settings 2.14

Doppler injects env vars at process start, so the loader's job is just typed parsing. pydantic-settings 2.14 (April 20, 2026) is the spun-off Pydantic v2 sibling, integrates cleanly with the rest of the FastAPI stack, supports `.env` for local dev (off in prod), and validates types/required fields on startup so a missing secret fails fast instead of crashing on the first DB call. python-decouple has no Pydantic v2 story; raw `os.environ` reads are fine for a five-line script but lose the validation-on-boot property that prevents deployed-but-broken services.

Pin: `pydantic-settings>=2.14,<3`.

### 6. Scheduled-push worker: in-process asyncio + Postgres polling

The grill-side reliability requirement is: when a timer ends, the user's phone notifies even if Grillmi is closed and the screen is locked. iOS Safari makes that a server-sent push (`accounts-decision-apr-2026.md`). Grillmi runs on one host with one process; the worker question is therefore "where do pending pushes live across a restart?"

The chosen pattern: a `pending_notifications` table holds `(id, user_id, fire_at, payload, sent_at)`; when a timer starts, the API inserts a row; an asyncio task started in `lifespan` polls `SELECT ... WHERE fire_at <= now() AND sent_at IS NULL FOR UPDATE SKIP LOCKED LIMIT 100` every 5 seconds, sends via pywebpush in `asyncio.to_thread`, sets `sent_at`. Restart safety is automatic: rows survive in Postgres; the next poll picks them up. There is no Redis dependency, no extra process, no broker. Worst-case latency is the polling interval (5 s), which is well inside acceptable for grill alerts.

APScheduler 4 with the SQLAlchemy data store is the runner-up: it provides the same persistence guarantee with a more featureful API (cron, intervals, retries) at the cost of a meaningful dependency, a still-pre-release status as of April 2026 (4.0 has not shipped final), and the operational hazard of multi-scheduler-per-worker if Granian is ever scaled out. arq is a good design but Redis is overkill for a one-user app and adds a second apt service to maintain. Celery is wrong-shape.

Implementation note: the management script's `status --check` should `SELECT count(*) FROM pending_notifications WHERE fire_at < now() - interval '60 seconds' AND sent_at IS NULL` and fail if non-zero, so a stuck worker is observable.

### 7. Web Push library: pywebpush 2.3 with Declarative Web Push payloads

pywebpush 2.3.0 (February 2026) is still the Python Web Push library with no real competitor; the maintainer has flagged single-maintainer status, but the protocol is stable and the library does little more than VAPID-sign and AES128GCM-encrypt. For Safari 18.4+ the server emits a Declarative Web Push payload (a JSON `notification` object with `title`, `body`, `navigate_url`, `tag`, optional `sound`, plus the `"web_push": "8030"` magic) with the appropriate Content-Type, so the OS renders the alert without invoking the service worker. For Chrome and older iOS, send the legacy encrypted payload; the SW `push` handler always calls `showNotification()` to avoid permission revocation. pywebpush handles VAPID and ECE for both. Generate VAPID keys once with `vapid --gen`, store the private PEM in Doppler as `VAPID_PRIVATE_KEY`, the public application server key as `VAPID_PUBLIC_KEY`, and the contact address as `VAPID_SUB` (`mailto:marco.fruh@me.com`).

Pin: `pywebpush>=2.3,<3`, `py-vapid>=1.9.4`.

### 8. Structured logging: structlog 25

structlog wins on three concrete properties: contextvars-based binding (request_id, user_id, grillade_id flow into every log line inside a request without manual passing), processor pipelines (one config produces colorised dev output and JSON prod output), and orjson rendering for ~85k JSON lines/sec vs stdlib's ~22k. The audit log required by `auth.md` becomes a structlog logger with a fixed bound `logger="audit"` and JSON output to `/var/log/grillmi/audit.jsonl`. Stdlib logging with `python-json-logger` is the fallback if a future ops requirement forces a single logging shape across services; today it costs more boilerplate without an upside.

Pin: `structlog>=25,<26`, `orjson>=3.10`. Route uvicorn/Granian access logs through structlog's `ProcessorFormatter` so dependency logs join the same JSON pipeline.

### 9. Testing stack: pytest 8 + pytest-asyncio 0.25 + httpx AsyncClient + testcontainers-python Postgres

For an async FastAPI app the only sane HTTP-test client is `httpx.AsyncClient(transport=ASGITransport(app=app))` (the FastAPI docs moved to this pattern in 2024). Database fixturing has three options: a per-suite Postgres schema on a long-running test DB, `pg_tmp` for ephemeral clusters, and `testcontainers-python` (>=4.8) which spins a Postgres 17 container per test session. Pick testcontainers: the dev VM already has Docker for other reasons, the container is reused across tests via session-scoped fixtures (`scope="session"`), Alembic migrations run once at fixture setup, and per-test transactions are rolled back. This is closest to prod (real Postgres, real migrations) without the maintenance of a long-lived test cluster. pg_tmp is a fine alternative for CI runners without Docker; not relevant on the dev VM.

Pin: `pytest>=8.3`, `pytest-asyncio>=0.25`, `httpx>=0.28`, `testcontainers[postgres]>=4.8`.

### 10. Postgres deploy: apt PGDG `postgresql-17` on the prod LXC

`new-project-infra.md` mandates apt + systemd on Ubuntu 24.04 LXCs; that locks containers out. PGDG's `noble-pgdg` repo is the source for current minor versions. PostgreSQL 17 is the right LTS-friendly target in April 2026: GA September 2024, supported through November 2029, currently at 17.9 (released February 26, 2026 alongside 18.3 etc). Postgres 18 is GA but new; pick 17 for the longer settled track record on noble. The Ansible role provisions: PGDG repo + signing key, `postgresql-17`, a `grillmi` role with a Doppler-sourced password, a `grillmi` DB owned by it, `listen_addresses = '127.0.0.1'`, `pg_hba.conf` with only local + `host ... 127.0.0.1/32 scram-sha-256` lines, scram-sha-256 password encryption, and `wal_level = replica`. Backups go via Proxmox Backup Server snapshots of the LXC at the existing nightly cadence; document the `pg_dumpall` recovery procedure as a TBD runbook entry until PBS-only is verified to restore cleanly.

Pin: `postgresql-17` from `apt.postgresql.org/pub/repos/apt noble-pgdg`.

### 11. Postgres version: 17

17 is the right answer over 18 because (a) the noble PGDG line carries 17 as the stable default, (b) 17.x has a year of patches in the field, (c) every dependency in this stack (asyncpg, SQLAlchemy 2.0, Alembic 1.18) supports it without flag-gymnastics, and (d) support runs to November 2029 which outlives any reasonable Grillmi runway.

### 12. Resource sizing: bump the prod LXC to 2 CPU / 4 GB RAM / 32 GB disk

Argon2id at the auth-standard parameters consumes 64 MiB per concurrent verify. The asyncio scheduler, FastAPI, Granian, structlog, and Caddy together sit around 200-300 MiB resident. Postgres 17 with `shared_buffers = 512MB` and `work_mem = 16MB` lands around 700 MiB resident under load. Disk: the OS, Postgres data dir, WAL, logs, and `pg_dump` headroom comfortably fit in 32 GB. The current 1 CPU / 2 GB / 16 GB sizing was correct for static-Caddy-only; with the backend it leaves no headroom for an Argon2 burst plus a vacuum. Resize before deploy, not after.

## What changed since 2024

1. Granian 2.0 (March 2025) added free-threaded Python wheels and improved the runtime, moving it from "promising Rust experiment" to a credible uvicorn alternative for FastAPI in production.
2. Psycopg 3.3 (late 2025) added template-string queries, dynamic pool reconfig, and made cursors first-class iterators; psycopg 3 is now feature-complete with psycopg2 plus async.
3. SQLAlchemy 2.0.49 (April 2026) decoupled the greenlet dependency (now an extra), tightened the asyncpg dialect's error handling, and shipped free-threaded wheels.
4. Alembic 1.18 (January 2026) added a plugin system and O(1) bulk-inspector autogenerate on Postgres, materially faster on schema diffs.
5. pywebpush 2.3 (February 2026) is still maintained but single-maintainer; Safari 18.4 Declarative Web Push (March 2025) shifted reliable iOS push from "SW must run" to "JSON payload that the OS renders directly".
6. APScheduler 4 is still pre-release as of April 2026, which removes it from the "boring default" slot for new builds; the in-process asyncio + Postgres pattern is what the FastAPI ecosystem has settled on for single-host single-process services.

## Final recommendation, with version pins

- FastAPI: `fastapi[standard]>=0.136,<0.137`
- ASGI server: `granian>=2.0,<3`; fallback `uvicorn>=0.34`
- DB driver: `asyncpg>=0.31,<0.32`
- ORM: `sqlalchemy[asyncio]>=2.0.49,<2.1`
- Migrations: `alembic>=1.18,<2`
- Settings: `pydantic-settings>=2.14,<3`
- Auth (per `auth.md`): `argon2-cffi>=23.1`, server-side sessions, `aiosmtplib>=3` for SMTP
- Scheduler: in-process asyncio task, Postgres-backed `pending_notifications` table, no external broker
- Web Push: `pywebpush>=2.3,<3`, `py-vapid>=1.9.4`, Declarative Web Push for Safari, classic for Chrome
- Logging: `structlog>=25,<26`, `orjson>=3.10`, JSON to stdout in prod, console renderer in dev
- Tests: `pytest>=8.3`, `pytest-asyncio>=0.25`, `httpx>=0.28` with `ASGITransport`, `testcontainers[postgres]>=4.8`
- Database: `postgresql-17` from PGDG `noble-pgdg`, listen on 127.0.0.1, scram-sha-256
- LXC sizing: bump to 2 CPU / 4 GB RAM / 32 GB disk before backend deploy

## Runner-ups

1. uvicorn 0.34 instead of Granian if the Rust toolchain becomes a footgun on noble or if a future Caddy/cloudflared interaction wants a pure-Python ASGI process. Migration is a systemd unit edit.
2. psycopg 3.3 instead of asyncpg if a future need for prepared-statement caching, libpq features, or single-driver-sync-and-async appears. Same SQLAlchemy URL prefix change.
3. APScheduler 4 (post-final release) instead of the in-process polling pattern if cron-like recurring jobs (weekly summary email, etc.) become a thing; the SQLAlchemy data store keeps the no-Redis property.
4. SQLModel if a second Grillmi-shaped app shows up that benefits from the unified Pydantic+ORM model and the team accepts the autogenerate edge cases.

## Sources

- [FastAPI release notes](https://fastapi.tiangolo.com/release-notes/)
- [FastAPI on PyPI](https://pypi.org/project/fastapi/)
- [Granian on PyPI](https://pypi.org/project/granian/)
- [Talk Python in Production: Running on Rust](https://talkpython.fm/books/python-in-production/chapter-6-running-on-rust)
- [Stop Using Uvicorn: Granian Is the Fastest Python ASGI Server (The Nerd Nook)](https://www.thenerdnook.io/p/stop-using-uvicorn)
- [Cemrehan Cavdar: Benchmarking Gin, Elysia, BlackSheep, FastAPI (Feb 2026)](https://cemrehancavdar.com/2026/02/10/framework-benchmark/)
- [Python Application Servers in 2026 (DeployHQ)](https://www.deployhq.com/blog/python-application-servers-in-2025-from-wsgi-to-modern-asgi-solutions)
- [asyncpg on PyPI](https://pypi.org/project/asyncpg/)
- [asyncpg GitHub](https://github.com/MagicStack/asyncpg)
- [Tiger Data: Top PostgreSQL Drivers for Python](https://www.tigerdata.com/learn/top-postgresql-drivers-for-python)
- [Fernando Arteaga: Psycopg 3 vs Asyncpg](https://fernandoarteaga.dev/blog/psycopg-vs-asyncpg/)
- [PostgreSQL News: Psycopg 3.3 released](https://www.postgresql.org/about/news/psycopg-33-released-3187/)
- [psycopg on PyPI](https://pypi.org/project/psycopg/)
- [SQLAlchemy 2.0.48 release notes](https://www.sqlalchemy.org/blog/2026/03/02/sqlalchemy-2.0.48-released/)
- [SQLAlchemy on PyPI](https://pypi.org/project/SQLAlchemy/)
- [SQLAlchemy asyncio docs](https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html)
- [SQLModel docs](https://sqlmodel.tiangolo.com/)
- [Alembic changelog 1.18.4](https://alembic.sqlalchemy.org/en/latest/changelog.html)
- [Alembic on PyPI](https://pypi.org/project/alembic/)
- [pydantic-settings on PyPI](https://pypi.org/project/pydantic-settings/)
- [pydantic-settings releases](https://github.com/pydantic/pydantic-settings/releases)
- [APScheduler version history](https://apscheduler.readthedocs.io/en/master/versionhistory.html)
- [APScheduler 4 migration guide](https://apscheduler.readthedocs.io/en/master/migration.html)
- [arq vs FastAPI BackgroundTasks (David Muraya)](https://davidmuraya.com/blog/fastapi-background-tasks-arq-vs-built-in/)
- [pywebpush on PyPI](https://pypi.org/project/pywebpush/)
- [pywebpush GitHub](https://github.com/web-push-libs/pywebpush)
- [py-vapid on PyPI](https://pypi.org/project/py-vapid/)
- [Meet Declarative Web Push (WebKit)](https://webkit.org/blog/16535/meet-declarative-web-push/)
- [structlog performance docs](https://www.structlog.org/en/stable/performance.html)
- [Structlog JSON Logs with OpenTelemetry 2026](https://johal.in/structlog-json-logs-middleware-opentelemetry-python-2026/)
- [Apitally: A complete guide to logging in FastAPI](https://apitally.io/blog/fastapi-logging-guide)
- [FastAPI Async Tests docs](https://fastapi.tiangolo.com/advanced/async-tests/)
- [Testcontainers with FastAPI and asyncpg](https://lealre.github.io/fastapi-testcontainer-asyncpg/)
- [PostgreSQL Apt repository (PGDG)](https://wiki.postgresql.org/wiki/Apt)
- [PostgreSQL Linux downloads (Ubuntu)](https://www.postgresql.org/download/linux/ubuntu/)
- [Install PostgreSQL 17 on Ubuntu 24.04 (LinuxCapable)](https://linuxcapable.com/how-to-install-postgresql-17-on-ubuntu-linux/)
