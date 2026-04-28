# Grillmi Accounts and Sync: Infrastructure

## Meta

- Spec: 260428-accounts-and-sync.md
- Timing: Run before the spec's Phase 13 deploy. Dev tasks first, then the prod LXC resize, then prod tasks.

---

## LXC resize (atlas, CTID 114)

The prod LXC currently runs at 1 CPU / 2 GB / 16 GB. Argon2id verifies allocate 64 MiB transiently and Postgres 17 wants `shared_buffers = 512MB` headroom (per `stack-research-backend-apr-2026.md` §12). Bump to 2 CPU / 4 GB / 32 GB before any backend work lands.

Run on atlas as root, with the user's BBQ window cleared:

1. `pct stop 114`.
2. `pct set 114 --cores 2 --memory 4096`.
3. `pct resize 114 rootfs +16G`.
4. `pct start 114`.
5. From the Mac, `ssh grillmi 'nproc && free -h && df -h /'` confirms 2 CPU, 4 GB, 32 GB.
6. Update `~/dev/reference/infrastructure-inventory.md` with the new sizing for CTID 114.

The dev VM `grillmi-dev` (atticus, VMID 480) is already at 2 CPU / 4 GB / 32 GB; no resize required.

---

## Postgres 17 install via Ansible (`app_grillmi` role extension)

All tasks are added to `~/dev/ansible/roles/app_grillmi/tasks/postgres.yml` and included from `tasks/main.yml` after the Node and Caddy tasks but before the FastAPI service deploy. The tasks run on both `grillmi_dev` and `grillmi_prod` because the dev VM also needs a real Postgres for parity.

1. Add the PGDG signing key under `/usr/share/keyrings/postgresql-archive-keyring.gpg` via `ansible.builtin.get_url` against `https://www.postgresql.org/media/keys/ACCC4CF8.asc` piped through `gpg --dearmor`.
2. Add the apt source `/etc/apt/sources.list.d/pgdg.list` containing `deb [signed-by=/usr/share/keyrings/postgresql-archive-keyring.gpg] https://apt.postgresql.org/pub/repos/apt noble-pgdg main`.
3. `ansible.builtin.apt: update_cache=yes name=postgresql-17 state=present`. Also installs `postgresql-contrib-17` for `citext`.
4. Template `/etc/postgresql/17/main/postgresql.conf` (only the diff): `listen_addresses = 'localhost'`, `password_encryption = scram-sha-256`, `shared_buffers = 512MB`, `work_mem = 16MB`, `wal_level = replica`. Notify a `Restart postgresql-17` handler.
5. Template `/etc/postgresql/17/main/pg_hba.conf` containing only: `local all postgres peer`, `local all all peer`, `host grillmi grillmi 127.0.0.1/32 scram-sha-256`. Notify the same handler.
6. Generate and store the database password in Doppler if not set: `doppler secrets get DATABASE_PASSWORD --project grillmi --config <env> --plain` and, if the value is `REPLACE_ME`, set it via `doppler secrets set DATABASE_PASSWORD="$(openssl rand -hex 24)" --project grillmi --config <env>`. Done once per env from the controller; not in the role itself.
7. Create the `grillmi` Postgres role with `community.postgresql.postgresql_user`, `password={{ database_password }}` (read via the Doppler lookup), `encrypted=yes`, `state=present`. Run with `become: true become_user: postgres`.
8. Create the `grillmi` database with `community.postgresql.postgresql_db`, `owner=grillmi`, `encoding=UTF8`, `lc_collate=C.UTF-8`, `lc_ctype=C.UTF-8`, `template=template0`.
9. Enable the `citext` extension on `grillmi` via `community.postgresql.postgresql_ext name=citext db=grillmi`.

---

## Doppler secrets

The `grillmi` Doppler project already exists with `dev` and `prd` configs (from spec 260424-1). Add the following secrets via the controller (run once per environment, not in Ansible):

1. `DATABASE_PASSWORD`: generate with `openssl rand -hex 24`. Bootstrap command:

   ```bash
   doppler secrets set DATABASE_PASSWORD="$(openssl rand -hex 24)" --project grillmi --config dev
   doppler secrets set DATABASE_PASSWORD="$(openssl rand -hex 24)" --project grillmi --config prd
   ```

2. `HIBP_USER_AGENT`: stored as a placeholder so it is editable later. Bootstrap:

   ```bash
   doppler secrets set HIBP_USER_AGENT='Grillmi/1.0 (marco.fruh@me.com)' --project grillmi --config dev
   doppler secrets set HIBP_USER_AGENT='Grillmi/1.0 (marco.fruh@me.com)' --project grillmi --config prd
   ```

3. `HOSTPOINT_SMTP_USER` and `HOSTPOINT_SMTP_PASSWORD`: cross-project refs to `smtp/prd`. Bootstrap:

   ```bash
   doppler secrets set HOSTPOINT_SMTP_USER='${smtp.HOSTPOINT_SMTP_USER}' --project grillmi --config dev
   doppler secrets set HOSTPOINT_SMTP_PASSWORD='${smtp.HOSTPOINT_SMTP_PASSWORD}' --project grillmi --config dev
   doppler secrets set HOSTPOINT_SMTP_USER='${smtp.HOSTPOINT_SMTP_USER}' --project grillmi --config prd
   doppler secrets set HOSTPOINT_SMTP_PASSWORD='${smtp.HOSTPOINT_SMTP_PASSWORD}' --project grillmi --config prd
   ```

Update `~/dev/reference/email-services-inventory.md` with a new "Grillmi" entry referencing `kraftops.ch`, `Grillmi <noreply@kraftops.ch>`, secrets via cross-project refs to `smtp/prd`, behaviour identical to Vigil and Spamnesia.

---

## /etc/grillmi/config.env (Ansible template)

Drop a template at `~/dev/ansible/roles/app_grillmi/templates/config.env.j2` rendered to `/etc/grillmi/config.env`, owner `root`, group `maf`, mode `0640`. No fallbacks. No `| default()` on any required variable. The directory `/etc/grillmi/` is created with mode `0750`, owner `root`, group `maf`.

Contents (every variable is required; missing values fail render):

```text
# Grillmi config (managed by Ansible - do not edit manually)
APP_ENV={{ grillmi_environment }}
PUBLIC_BASE_URL={{ grillmi_public_base_url }}
DATABASE_HOST=127.0.0.1
DATABASE_PORT=5432
DATABASE_NAME=grillmi
DATABASE_USER=grillmi
SMTP_HOST=asmtp.mail.hostpoint.ch
SMTP_PORT=587
SMTP_FROM_ADDRESS=Grillmi <noreply@kraftops.ch>
SESSION_MAX_AGE_HOURS=24
SESSION_COOKIE_NAME=grillmi_session
RATE_LIMIT_LOGIN_IP_PER_MIN=5
RATE_LIMIT_LOGIN_ACCOUNT_PER_HOUR=10
AUDIT_RETENTION_DAYS=365
TOMBSTONE_RETENTION_DAYS=30
OPENAPI_ENABLED={{ 'true' if grillmi_environment == 'dev' else 'false' }}
```

Secrets `DATABASE_PASSWORD`, `HOSTPOINT_SMTP_USER`, `HOSTPOINT_SMTP_PASSWORD`, `HIBP_USER_AGENT` come from `doppler run` at process start; they are not in this file.

---

## FastAPI Granian systemd unit

Drop `~/dev/ansible/roles/app_grillmi/templates/grillmi-api.service.j2` rendered to `/etc/systemd/system/grillmi-api.service`. No `-` prefix on `EnvironmentFile`. `Type=notify` so systemd waits for Granian's readiness signal.

```ini
[Unit]
Description=Grillmi API (FastAPI on Granian)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=notify
User=maf
Group=maf
WorkingDirectory=/opt/grillmi/backend
EnvironmentFile=/etc/grillmi/config.env
Environment=DOPPLER_PROJECT=grillmi
Environment=DOPPLER_CONFIG={{ grillmi_environment }}
ExecStart=/usr/bin/doppler run -- /opt/grillmi/backend/.venv/bin/granian \
    --interface asgi --loop uvloop --workers 1 \
    --host 127.0.0.1 --port 8000 \
    grillmi.main:app
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

Notify a `Restart grillmi-api` handler on every change to the unit, the config.env, or the deployed code (the role's git task already registers the diff).

---

## Caddy `/api` reverse-proxy block

Update the existing Caddyfile template `~/dev/ansible/roles/app_grillmi/templates/Caddyfile.j2` to add a path-based reverse-proxy. The static block stays exactly as today; the new block is inserted before `file_server`:

```caddy
:80 {
{% if grillmi_environment == 'prod' %}
    bind 127.0.0.1
{% endif %}
    handle /api/* {
        reverse_proxy 127.0.0.1:8000
    }
    handle {
        root * /opt/grillmi/build
        try_files {path} /index.html
        file_server
    }
}
```

Run `caddy validate --config /etc/caddy/Caddyfile` as a `command` task after the template task; non-zero exit fails the playbook before reload.

---

## Sudoers extension

Update `~/dev/ansible/roles/app_grillmi/templates/sudoers-grillmi.j2` to extend the existing entry with the new units. Deploy with `validate: 'visudo -cf %s'`:

```text
{{ ansible_user }} ALL=(ALL) NOPASSWD: /bin/grep, \
                                      /bin/cat, \
                                      /bin/sed, \
                                      /bin/tail, \
                                      /bin/journalctl, \
                                      /bin/systemctl restart grillmi-api, \
                                      /bin/systemctl start   grillmi-api, \
                                      /bin/systemctl stop    grillmi-api, \
                                      /bin/systemctl status  grillmi-api, \
                                      /bin/systemctl restart grillmi-backup-daily.timer, \
                                      /bin/systemctl start   grillmi-backup-daily.timer, \
                                      /bin/systemctl stop    grillmi-backup-daily.timer, \
                                      /bin/systemctl restart grillmi-tombstone-gc.timer, \
                                      /bin/systemctl start   grillmi-tombstone-gc.timer, \
                                      /bin/systemctl stop    grillmi-tombstone-gc.timer, \
                                      /bin/systemctl restart caddy, \
                                      /bin/systemctl reload  caddy, \
                                      /bin/systemctl status  caddy, \
                                      /bin/systemctl restart cloudflared, \
                                      /bin/systemctl status  cloudflared
```

`pg_dump` runs with the `grillmi` Postgres role credentials from Doppler against the local database, so no `sudo -u postgres` grant is required.

---

## Backup systemd timer plus service unit

Drop `~/dev/ansible/roles/app_grillmi/templates/grillmi-backup-daily.service.j2` rendered to `/etc/systemd/system/grillmi-backup-daily.service`:

```ini
[Unit]
Description=Grillmi nightly Postgres dump

[Service]
Type=oneshot
User=maf
Group=maf
Environment=DOPPLER_PROJECT=grillmi
Environment=DOPPLER_CONFIG={{ grillmi_environment }}
ExecStart=/usr/local/bin/grillmi backup daily
```

And `~/dev/ansible/roles/app_grillmi/templates/grillmi-backup-daily.timer.j2` rendered to `/etc/systemd/system/grillmi-backup-daily.timer`:

```ini
[Unit]
Description=Grillmi nightly Postgres dump (timer)

[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable both via `systemd_service: name=grillmi-backup-daily.timer enabled=true state=started`.

The `grillmi backup` script promotes Sunday's daily dump into `weekly/` and the first-of-month daily dump into `monthly/`, with retention 7/4/6 enforced inside the script. Backups land under `/var/backups/grillmi/{daily,weekly,monthly,manual}/`. Ansible creates the directory tree owned by `maf:maf` mode `0750`.

---

## Tombstone GC plus audit retention timer

Drop `~/dev/ansible/roles/app_grillmi/templates/grillmi-tombstone-gc.service.j2` rendered to `/etc/systemd/system/grillmi-tombstone-gc.service`:

```ini
[Unit]
Description=Grillmi tombstone and audit-log GC

[Service]
Type=oneshot
User=maf
Group=maf
WorkingDirectory=/opt/grillmi/backend
EnvironmentFile=/etc/grillmi/config.env
Environment=DOPPLER_PROJECT=grillmi
Environment=DOPPLER_CONFIG={{ grillmi_environment }}
ExecStart=/usr/bin/doppler run -- /opt/grillmi/backend/.venv/bin/python -m grillmi.cli.gc
```

And `~/dev/ansible/roles/app_grillmi/templates/grillmi-tombstone-gc.timer.j2` rendered to the same path with `OnCalendar=*-*-* 03:45:00 Persistent=true`. The CLI deletes rows where `deleted_at < now() - interval '30 days'` and `audit_log` rows older than 365 days.

---

## First user creation

In `~/dev/ansible/roles/app_grillmi/tasks/main.yml`, after the `grillmi-api.service` is active and `migrate` has run, add:

```yaml
- name: Seed the first user (prod only, idempotent)
  ansible.builtin.command:
    cmd: /usr/local/bin/grillmi admin-init --email marco.fruh@me.com
  when: grillmi_environment == "prod"
  failed_when: false
  changed_when: false
```

`failed_when: false` keeps non-prod deploys unaffected even if the grant ever shifts.

---

## Vigil add (manual step on nexus)

Vigil itself is not deployed by this spec. After the prod deploy is verified, log in to Vigil's admin UI on `nexus`, add a new check named `grillmi`, probe type `command`, command `ssh grillmi /usr/local/bin/grillmi status --check`, expected exit codes `0=ok, 1=degraded, 2=down`. Notification policy: same as the existing `cognel` and `azooco` checks (email plus ntfy). Record the new check in `~/dev/reference/infrastructure-inventory.md` under Vigil monitored services.
