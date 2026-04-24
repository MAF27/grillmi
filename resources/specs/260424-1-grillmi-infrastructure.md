# Grillmi v1 — Infrastructure

## Meta

- Status: Draft
- Branch: feature/grillmi-infrastructure

---

## Business

### Goal

Stand up the hosting, networking, secrets, and deployment pipeline that Grillmi v1 needs before any app code runs. Dev work happens on a VM on `atticus`; prod serves a static SvelteKit build on an LXC on `atlas`. This spec ends when Marco can push a scaffold commit to the Git remote on `alcazar`, trigger an Ansible run, and see a placeholder page at both the dev and prod URLs.

### Proposal

Register the public domain, provision one dev VM and one prod LXC under the project's Doppler-managed credentials, wire up internal and public DNS, install Caddy on both hosts with automatic TLS, and add the Ansible inventory and role so a single `ansible-playbook grillmi-deploy.yml` command deploys a SvelteKit `adapter-static` build artifact end-to-end.

### Behaviors

- Marco SSHs to `grillmi-dev` (via VS Code Remote-SSH) and develops against a fully provisioned Linux environment: Node, pnpm, git, and the grillmi repo cloned from alcazar.
- Running `ansible-playbook playbooks/applications/grillmi-deploy.yml --limit grillmi_dev` deploys the local dev build to `grillmi-dev.krafted.me`.
- Running the same playbook with `--limit grillmi_prod` deploys to `grillmi.cloud`.
- Both URLs serve HTTPS with valid certificates — the dev URL via the existing `*.krafted.me` wildcard routed through NPM on argus, the prod URL via Caddy's automatic HTTP-01 Let's Encrypt flow.
- `doppler run -p grillmi -c prd -- <command>` (and `-c dev`) resolves all secrets. No `.env` files, no hardcoded credentials anywhere in the repo.

### Out of scope

- SvelteKit scaffold, component code, PWA manifest, service worker, grill-data pipeline — all handled in Spec 2.
- GitHub mirroring, CI/CD runners, GitHub Actions — alcazar Git remote only for v1.
- Monitoring, log shipping, uptime alerting — Grillmi is personal-only; add later if desired.
- Push-notification worker or any backend service — v1 is static PWA.
- Backups beyond what Proxmox Backup Server already captures at the host level.

---

## Technical

### Approach

Follow the established convention from `azooco`, `carraway`, and `spamnesia`: a Doppler project named after the app, an Ansible role `app_grillmi`, a deploy playbook wrapping the role, inventory entries under the relevant host groups, and `host_vars` providing per-environment configuration. Diverge from the reference apps in three ways: (1) prod uses an LXC (not a VM) because the workload is a static Caddy server, (2) the role installs and configures Caddy rather than a Node/systemd service, (3) deployment rsyncs a pre-built static artifact (`build/` from the dev machine) rather than building on the target.

DNS is two-headed. The public domain `grillmi.cloud` is registered at Hostpoint and its A record points to atlas's public IP; Caddy on the prod LXC handles Let's Encrypt automatically. The dev URL `grillmi-dev.krafted.me` is configured as a proxy host in NPM on argus, pointing at the dev VM's internal IP; NPM terminates TLS with the existing `*.krafted.me` wildcard.

Secrets live in Doppler project `grillmi` with configs `dev` and `prd`. The required secrets are minimal — become passwords and a deploy token. Generated secrets use `openssl rand -hex 24`; non-generatable secrets (domain registrar credentials) are `PLACEHOLDER_NEEDS_REAL_VALUE` until Marco fills them in.

### Approach Validation

- **Reference implementations** — `~/dev/ansible/playbooks/applications/azooco-deploy.yml`, `~/dev/ansible/playbooks/applications/spamnesia-deploy.yml`, `~/dev/ansible/roles/app_spamnesia/tasks/main.yml`. Both follow the thin-playbook-thick-role pattern; Grillmi copies this. Spamnesia's Doppler/systemd/template approach is the closest match structurally, minus the Python service layer.
- **Infrastructure inventory** — `~/dev/ops/resources/docs/260109-infrastructure-inventory.md` confirms atticus is the lab Proxmox host and atlas is always-on prod, with LXC and VM sizing precedents (`carraway`, `spamnesia`, `azooco-prod`) that we're sizing under.
- **Domain conventions** — `~/dev/ops/resources/docs/260218-domain-inventory.md` documents the NPM-on-argus pattern for `*.krafted.me` and establishes that dev services never get public DNS.
- **Adapter choice** — `resources/docs/stack-research-apr-2026.md` confirms `adapter-static` for SvelteKit is the smallest, simplest fit for an offline-first PWA with no server-side rendering requirement. Caddy is the lightest auto-TLS static server that matches the existing Linux-on-Proxmox toolchain.
- **Trade-off decided** — build-on-prod was considered and rejected. The dev VM is where builds happen; the prod LXC stays minimal (512 MB RAM is enough for Caddy + static files but not for Node + vite build). Artifact-transfer deploys are faster and safer.

### Risks

| Risk | Mitigation |
| --- | --- |
| Prod LXC (1 CPU / 512 MB) is too small for future growth | Adapter-static + Caddy has a known memory ceiling well under 100 MB. If push-notification or server features ever ship in v2, resize the LXC or rebuild as a VM — it's a 15-minute operation. |
| Caddy HTTP-01 challenge fails on first deploy | Ensure atlas firewall allows inbound :80 and :443 from the public internet before the first `ansible-playbook` run. Spec verifies this before provisioning. |
| grillmi.cloud domain registration delays first deploy | Register the domain in Phase 2 before infra provisioning; DNS propagation takes 5–30 min but doesn't block internal dev work since `grillmi-dev.krafted.me` is independent. |
| Doppler secret rotation breaks Ansible runs | `~/dev/scripts/get_secret` retries via Touch ID on Mac; on Linux the Ansible controller uses a service token stored on disk. Document the rotation procedure in the role's README. |
| VS Code Remote-SSH on 4 GB dev VM runs out of memory under long builds | Vite builds on Svelte 5 + Tailwind 4 with <200 source files use <1 GB RAM in practice. Watch `grillmi-dev` memory during first real build; resize to 8 GB if needed. |
| Wildcard cert on `*.krafted.me` expires without notice | NPM on argus auto-renews; failure surfaces in the NPM UI. Include a once-per-spec manual verification step that `grillmi-dev.krafted.me` serves HTTPS green. |

### Implementation Plan

**Phase 1: Doppler setup**

- [ ] Create Doppler project `grillmi` with configs `dev` and `prd` via the Doppler CLI under Marco's account.
- [ ] In `grillmi/dev`: add `BECOME_PASSWORD` as a generated secret via `openssl rand -hex 24`, add `DEPLOY_TOKEN` as a generated service token.
- [ ] In `grillmi/prd`: add `BECOME_PASSWORD` (generated), `DEPLOY_TOKEN` (generated).
- [ ] In existing `infra/prd` Doppler project: mirror `BECOME_GRILLMI_DEV` and `BECOME_GRILLMI_PROD` (both referencing the same values as above) per the infra-become-password convention.
- [ ] In existing `deploy-tokens/prd` Doppler project: add `GRILLMI_DEPLOY_TOKEN` matching the service token from `grillmi/prd`.
- [ ] Add `REGISTRAR_API_TOKEN` as `PLACEHOLDER_NEEDS_REAL_VALUE` in `grillmi/prd` — Marco fills in after Hostpoint registration completes, used only for DNS automation and is optional for v1.

**Phase 2: Domain and DNS**

- [ ] Register `grillmi.cloud` at Hostpoint. Registrant: Marco's personal account.
- [ ] Create A record `grillmi.cloud → <atlas public IP>` at the Hostpoint DNS.
- [ ] In NPM on argus (`npm.krafted.me`), create proxy host `grillmi-dev.krafted.me → <grillmi-dev internal IP>:80` using the existing `*.krafted.me` wildcard cert (ID 4).
- [ ] Update `~/dev/ops/resources/docs/260218-domain-inventory.md` with the new `grillmi.cloud` (production) and `grillmi-dev.krafted.me` (lab) entries.

**Phase 3: Provision hosts**

- [ ] Create `grillmi-dev` VM on atticus via the Proxmox UI: 2 vCPU, 4 GB RAM, 32 GB disk, Ubuntu 24.04 LTS, attached to `vmbr0` on VLAN 400-development. Record the assigned IP.
- [ ] Create `grillmi` LXC on atlas via the Proxmox UI: 1 vCPU, 512 MB RAM, 4 GB disk, Ubuntu 24.04 LTS, attached to `vmbr0` on VLAN 200-production. Record the assigned IP.
- [ ] Install base SSH access from Marco's Mac and from the Ansible controller on both hosts; verify the become passwords pulled from Doppler work.
- [ ] Update `~/dev/ops/resources/docs/260109-infrastructure-inventory.md` with both new hosts.

**Phase 4: Ansible inventory and role**

- [ ] Add `grillmi-dev` and `grillmi-prod` entries to `~/dev/ansible/inventory/hosts.yml` under `dev_servers` and `production_servers` respectively, following the `azooco` entry format (host IP, user, become_pass via `get_secret`, use_tailscale flags).
- [ ] Add `grillmi_apps`, `grillmi_dev`, and `grillmi_prod` group definitions at the bottom of `hosts.yml` mirroring the `azooco_apps`/`azooco_dev`/`azooco_prod` structure.
- [ ] Create Ansible role `app_grillmi` at `~/dev/ansible/roles/app_grillmi/` with `tasks/main.yml`, `templates/Caddyfile.j2`, `handlers/main.yml`, `defaults/main.yml`, and `README.md`.
- [ ] Role tasks: install Caddy from the official APT repo, deploy the `Caddyfile` from the template, ensure the `/opt/grillmi` directory exists, rsync the local `build/` artifact to `/opt/grillmi`, reload Caddy. Use `ansible.builtin.assert` to validate required variables like `grillmi_domain` and `grillmi_environment` before proceeding.
- [ ] Caddyfile template: single site block for the configured domain, `root * /opt/grillmi`, `file_server`, and `try_files {path} /index.html` for SvelteKit SPA routing. Automatic HTTPS kicks in when the domain is public; the dev host uses plain HTTP on port 80 and lets NPM terminate TLS.
- [ ] Create `~/dev/ansible/playbooks/applications/grillmi-deploy.yml` as a thin wrapper calling the `app_grillmi` role against `grillmi_apps`, tagged `grillmi`.
- [ ] Per-environment `host_vars` at `~/dev/ansible/inventory/host_vars/grillmi-dev.yml` and `.../grillmi-prod.yml`: set `grillmi_domain` (grillmi-dev.krafted.me vs grillmi.cloud), `grillmi_environment` (dev/prod), `grillmi_public_base_url`.

**Phase 5: Dev-side developer setup**

- [ ] On `grillmi-dev`: install Node 22 LTS via `nvm` under the `maf` user, `pnpm` globally, git, build-essential, and the VS Code Remote-SSH server bootstrap (triggered on first connect).
- [ ] Configure `~/.gitconfig` on the VM matching Marco's identity from `~/dev/ansible/roles/base_setup`.
- [ ] Create a minimal placeholder `index.html` at `/opt/grillmi` on both hosts — "Grillmi — coming soon" — so that the deploy can be end-to-end verified before Spec 2 ships real app code.

**Phase 6: Git remote on alcazar**

- [ ] Create bare repo `grillmi.git` on alcazar under the existing git server's hosting path.
- [ ] On Marco's Mac: `git init /Users/marco/dev/grillmi`, add `alcazar:grillmi.git` as `origin`, push the current scaffold.
- [ ] On `grillmi-dev`: clone from `alcazar:grillmi.git` into `/home/maf/dev/grillmi`.

**Phase 7: End-to-end deploy verification**

- [ ] Run `ansible-playbook playbooks/applications/grillmi-deploy.yml --limit grillmi_dev` from Marco's Mac; verify `grillmi-dev.krafted.me` serves the placeholder page over HTTPS.
- [ ] Run the same with `--limit grillmi_prod`; verify `grillmi.cloud` serves the placeholder page over HTTPS with a valid Let's Encrypt cert.
- [ ] Re-run both to confirm idempotency (no unexpected "changed" tasks on a no-op run).

---

## Testing

### Integration Tests (`~/dev/ansible/tests/` or equivalent)

- [ ] `test_grillmi_role_idempotent` — second consecutive role run reports zero `changed` tasks against a clean host.
- [ ] `test_grillmi_caddyfile_valid` — `caddy validate /etc/caddy/Caddyfile` exits zero on the rendered template for both environments.
- [ ] `test_grillmi_inventory_parses` — `ansible-inventory --graph` resolves both `grillmi_dev` and `grillmi_prod` groups and lists the correct hosts.

### Manual Verification (Marco)

- [ ] Open `https://grillmi-dev.krafted.me` in Safari — see the placeholder "Grillmi — coming soon" page with a green lock icon in the URL bar.
- [ ] Open `https://grillmi.cloud` in Safari — see the same placeholder page with a green lock icon.
- [ ] On the Mac, run `ssh grillmi-dev` and confirm you land in a working shell with `/home/maf/dev/grillmi` present as a clone of the alcazar remote.
- [ ] Open VS Code, connect via Remote-SSH to `grillmi-dev`, open the `grillmi` workspace — the editor opens files and the terminal works.
- [ ] In Doppler's web UI, confirm the `grillmi` project exists with `dev` and `prd` configs populated, and that `infra/prd` has `BECOME_GRILLMI_DEV` / `BECOME_GRILLMI_PROD` entries, and that `deploy-tokens/prd` has `GRILLMI_DEPLOY_TOKEN`.
