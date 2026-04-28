# Grillmi Accounts and Sync: Runbook

## Meta

- Spec: 260428-accounts-and-sync.md
- Owner: Marco
- Last-validated: 2026-04-28 automated dev/prod infrastructure checks completed. Prod account activation link now renders and works after the asset-cache fix. Dev manual account walk-through and iPhone-specific checks remain manual. Divergence: Vigil currently supports JSON/HTTP checks, not command probes, so Grillmi was added as a JSON check against `https://grillmi.cloud/api/health`.

---

## Pre-requisites

Confirm before running staging checks:

- [x] The infra side file `260428-accounts-and-sync.md` has been executed end-to-end on `grillmi-dev` and (for prod tests) on `grillmi`. Every Acceptance item is green.
- [x] `feature/accounts-and-sync` is pushed to GitHub and the dev deploy playbook (`grillmi-deploy.yml --limit grillmi_dev`) has completed without unhandled errors. Hard-reset of `/opt/grillmi` to the branch tip is expected as part of the playbook.
- [ ] Test SMTP capture for the dev staging walk-through is the developer's own Hostpoint webmail mailbox; choose a `<test-email>` value the Mac can read. For prod, the email is `marco.fruh@me.com`.
- [x] The Mac has SSH aliases `grillmi` and `grillmi-dev` in `~/.ssh/config`.
- [x] The Doppler CLI on the Mac is logged in to a token with read access to `grillmi/dev`, `grillmi/prd`, and `smtp/prd`.
- [x] The current date and time on both hosts matches the Mac within 60 seconds (`ssh <host> date`); audit-log and session-expiry checks rely on accurate clocks.

---

## Staging checks (run on grillmi-dev)

Run these from the Mac after the dev deploy completes. Each step prints what to expect; stop and investigate on the first divergence.

- [x] `ssh grillmi-dev 'systemctl is-active postgresql'` returns `active`. The Postgres 17 cluster is up.
- [x] `ssh grillmi-dev 'sudo -u postgres psql -c "\\du grillmi"'` shows the `grillmi` role with `Login` attribute. The database role exists.
- [x] `ssh grillmi-dev 'sudo -u postgres psql -c "\\l grillmi"'` shows the `grillmi` database owned by `grillmi`. The database exists.
- [x] `ssh grillmi-dev 'cd /opt/grillmi/backend && doppler run -- alembic current'` prints the latest migration revision id (matches `head` from `alembic history`). Migrations are applied.
- [x] `ssh grillmi-dev 'systemctl is-active grillmi-api.service'` returns `active`. FastAPI is up.
- [x] `curl -fsS https://grillmi.krafted.cc/api/health` returns `{"status":"ok","db":true,"smtp_reachable":true}` with HTTP 200.
- [x] `ssh grillmi-dev '/usr/local/bin/grillmi status --check'` prints `ok` and exits 0.
- [ ] `ssh grillmi-dev '/usr/local/bin/grillmi admin-init --email <test-email>'` sends an invitation email. Verify the email arrives in Hostpoint webmail or local Mail.app within thirty seconds. The link points to `https://grillmi.krafted.cc/set-password?token=...`.
- [ ] Open the link in Safari. The set-password page loads, the form accepts a strong password, and on submit lands on Home logged-in.
- [ ] Log out from the account chip. The login page renders. `indexedDB.databases()` (DevTools console) shows the Grillmi DB but its stores are empty.
- [ ] Log back in. `GET /api/auth/me` (DevTools Network tab) returns 200 with the user object and `csrfToken`.
- [ ] `ssh grillmi-dev 'sudo -u postgres psql -d grillmi -c "SELECT action, success FROM audit_log ORDER BY occurred_at DESC LIMIT 5"'` shows recent entries: `password_set, true`, `login, true`, `logout, true`, `login, true`. The audit log is wired.
- [ ] Create a Grillade in Safari. In a second Safari profile (or Firefox) on the same Mac, log in with the same credentials, foreground the app. The Grillade appears within five seconds. Sync round-trip works.
- [x] `ssh grillmi-dev '/usr/local/bin/grillmi backup manual'` writes a dump to `/var/backups/grillmi/manual/<timestamp>.dump.gz`. `ssh grillmi-dev '/usr/local/bin/grillmi restore /var/backups/grillmi/manual/<timestamp>.dump.gz'` restores cleanly. Backup and restore round-trip works.
- [x] `ssh grillmi-dev '/usr/local/bin/grillmi status --check'` still returns `ok` after restore.

---

## Production smoke tests (run on grillmi prod LXC)

Run these from the Mac after the prod deploy completes. The first user (Marco) is seeded by the `admin-init` Ansible task.

- [x] `ssh grillmi 'systemctl is-active postgresql grillmi-api.service'` both return `active`.
- [x] `curl -fsS https://grillmi.cloud/api/health` returns 200 `{"status":"ok","db":true,"smtp_reachable":true}`.
- [x] `ssh grillmi '/usr/local/bin/grillmi status --check'` returns `ok` and exits 0.
- [x] The activation email lands at `marco.fruh@me.com`. Sender is `Grillmi <noreply@kraftops.ch>`. Subject and body are German. Link points to `https://grillmi.cloud/set-password?token=...`.
- [x] Open the link on the Mac in Safari. The set-password page loads, the form accepts a strong password, and the emailed link works.
- [x] `ssh grillmi 'cd /opt/grillmi/backend && sudo -u postgres psql -d grillmi -c "SELECT email, password_hash IS NOT NULL FROM users"'` shows one row, `marco.fruh@me.com`, with a password hash present.
- [x] `ssh grillmi 'cd /opt/grillmi/backend && sudo -u postgres psql -d grillmi -c "SELECT action, success, occurred_at FROM audit_log ORDER BY occurred_at DESC LIMIT 10"'` shows the `set_password, true` activation entry.
- [ ] On the iPhone, open `/account`. The session list shows two entries (Mac and iPhone). Tap "Abmelden" on the Mac row. Foreground Safari on the Mac; within ten seconds it bounces to `/login`.
- [ ] Log back in on the Mac. Create a Grillade. On the iPhone, foreground; the Grillade appears.
- [x] `ssh grillmi 'ls -la /var/backups/grillmi/daily/'` shows at least one dump after the first scheduled backup window (03:15 local). Otherwise run `ssh grillmi '/usr/local/bin/grillmi backup daily'` manually and confirm.
- [x] `ssh grillmi 'ss -tlnp | awk "/:80\\b/ || /:8000\\b/"'` shows Caddy on `127.0.0.1:80` and Granian on `127.0.0.1:8000`. Neither binds to `0.0.0.0`.
- [x] `ssh grillmi 'sudo ufw status'` shows the default-deny inbound policy with only `22/tcp` open.
- [x] Vigil dashboard on nexus shows the `grillmi` check green.
- [x] First-prod-deploy only destructive deletion test skipped on this run because it destroys live account data. Steady-state account verification passed via the seeded user row, password hash, audit entry, health check, backup check, bind check, UFW check, and Vigil check.

---

## Rollback reference

These are conditional recovery procedures, not outstanding deploy work.

### Postgres install fails

- Stop the dependent service: `ssh <host> 'sudo systemctl stop grillmi-api.service'`.
- Remove the package: `ssh <host> 'sudo apt-get purge -y postgresql-17 postgresql-contrib-17 && sudo apt-get autoremove -y'`.
- Remove the apt source: `ssh <host> 'sudo rm /etc/apt/sources.list.d/pgdg.list /usr/share/keyrings/postgresql-archive-keyring.gpg && sudo apt-get update'`.
- Revert the `app_grillmi` role to the pre-spec revision via `git checkout <prior-sha> -- roles/app_grillmi/tasks/postgres.yml` and re-run the role with `--tags grillmi`.
- Investigate the journal: `ssh <host> 'journalctl -u postgresql --no-pager'`.

### Alembic migration fails

- The deploy gate (`uv run pytest`) catches schema-incompatible migrations before service restart, so a runtime migration failure means the test run was bypassed or the migration introduced data corruption past the test set.
- Restore from the latest daily backup: `ssh <host> '/usr/local/bin/grillmi restore /var/backups/grillmi/daily/<timestamp>.dump.gz'`. The restore script runs `doppler run -- pg_restore --clean --if-exists` so it is idempotent.
- Downgrade the Alembic head to the prior revision: `ssh <host> 'cd /opt/grillmi/backend && doppler run -- alembic downgrade -1'`.
- Roll the working tree to the prior commit and redeploy the role.
- Investigate the migration locally against a fresh `grillmi_test` DB before re-attempting.

### FastAPI service fails to start

- Inspect the journal: `ssh <host> 'sudo journalctl -u grillmi-api.service -n 200 --no-pager'`. Common causes: missing config var, missing Doppler secret, port conflict.
- Compare `/etc/grillmi/config.env` to the prior deploy. If the diff looks wrong, revert: `ssh <host> 'sudo cp /etc/grillmi/config.env.dpkg-old /etc/grillmi/config.env'` (Ansible writes a backup with that suffix on every change), then `sudo systemctl restart grillmi-api`.
- If a Doppler secret is missing, set it via `doppler secrets set <KEY>=<value> --project grillmi --config <env>` and restart. Hostpoint cross-project refs that resolve to empty strings indicate `smtp/prd` is missing the underlying value; fix at the source.
- If Postgres is unreachable, `ssh <host> 'sudo systemctl restart postgresql'` and re-run the health check.

### Tunnel breaks (prod only)

- No code change is implied by a tunnel outage. Use SSH directly to investigate: `ssh grillmi 'systemctl status cloudflared'`. The prod LXC is reachable on the LAN even when the tunnel is down.
- If `cloudflared` is failing, check the journal: `ssh grillmi 'sudo journalctl -u cloudflared -n 100 --no-pager'`. Token problems land here as `failed to connect with token`.
- Re-pull the token from Doppler: `doppler secrets get CLOUDFLARE_TUNNEL_TOKEN --project grillmi --config prd --plain` and confirm it matches the value in the Cloudflare Zero Trust dashboard. Re-run the prod deploy if mismatched.
- The Vigil check fails closed when the tunnel is down because it executes over SSH, not over the public URL. Confirm Vigil is still red until the tunnel recovers.

### Account deletion or admin-init mistake

- To re-seed Marco: `ssh grillmi '/usr/local/bin/grillmi admin-init --email marco.fruh@me.com'`. Idempotent; safe to re-run.
- To force a password reset out-of-band when SMTP is broken: `ssh grillmi '/usr/local/bin/grillmi admin-reset'`. Follows the `read -s` plus temp-file plus pipe pattern; prompts for the new password interactively and invalidates all existing sessions.

---

## Diagnostic reference

These do not change state and are safe to run any time the system feels off. They are reference commands, not outstanding deploy work.

- Recent audit events: `ssh grillmi 'cd /opt/grillmi/backend && sudo -u postgres psql -d grillmi -c "SELECT action, success, occurred_at FROM audit_log ORDER BY occurred_at DESC LIMIT 20"'`. Look for unexpected `login_failed` bursts.
- Active sessions: `ssh grillmi 'cd /opt/grillmi/backend && sudo -u postgres psql -d grillmi -c "SELECT user_agent, ip_address, expires_at FROM sessions WHERE expires_at > now()"'`.
- Grillade row counts per user (helpful for debugging sync drift): `ssh grillmi 'cd /opt/grillmi/backend && sudo -u postgres psql -d grillmi -c "SELECT u.email, count(g.id) FROM users u LEFT JOIN grilladen g ON g.user_id = u.id AND g.deleted_at IS NULL GROUP BY u.email"'`.
- Recent FastAPI logs: `ssh grillmi 'sudo journalctl -u grillmi-api.service -n 200 --no-pager'`. JSON-formatted via structlog; pipe through `jq` for filtering.
- Caddy service logs: `ssh grillmi 'sudo journalctl -u caddy -n 200 --no-pager'`.
- Backup timer next-run: `ssh grillmi 'systemctl list-timers grillmi-backup-daily.timer'`.
- SMTP probe (matches the `/api/health` check): `ssh grillmi 'nc -zv asmtp.mail.hostpoint.ch 587'`. Connection refused means the Hostpoint endpoint is down or the LXC has lost outbound 587.
- Last successful timer runs (Vigil does not cover these): `ssh grillmi 'systemctl is-failed grillmi-backup-daily.service grillmi-tombstone-gc.service'`. `inactive` means the last oneshot run did not fail.

---

## Update this runbook after each run

- [x] After running staging or production checks, update the `Last-validated` field in Meta with the date and any divergences. If a step is added or removed, edit it here so the next run is faithful to the current system. The runbook is the live record of how this app is verified, not a one-shot artefact.
