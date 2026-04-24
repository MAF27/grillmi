# Grillmi v1 — Infrastructure

## Meta

- Status: Draft
- Branch: feature/grillmi-infrastructure

---

## Business

### Goal

Stand up the hosting, networking, secrets, and deployment pipeline that Grillmi v1 needs before any app code runs. Dev work happens on a VM on `atticus`; prod serves a static SvelteKit build on an LXC on `atlas`. This spec ends when Marco can push a scaffold commit to the Git remote on `alcazar`, trigger an Ansible run, and see a placeholder page at both the dev and prod URLs.

### Proposal

Provision one dev VM and one prod LXC, wire up internal NPM routing and a Cloudflare Tunnel for public access (no open inbound ports anywhere), install Node + pnpm + Caddy + cloudflared on both hosts, and add the Ansible inventory and role so a single `ansible-playbook grillmi-deploy.yml` command does a `git pull` on the target from the alcazar remote, installs dependencies, builds the SvelteKit `adapter-static` output on-host, and reloads Caddy — which binds to localhost only.

### Behaviors

- Marco SSHs to `grillmi-dev` (via VS Code Remote-SSH) and develops against a fully provisioned Linux environment: Node, pnpm, git, and the grillmi repo cloned from alcazar.
- Running `ansible-playbook playbooks/applications/grillmi-deploy.yml --limit grillmi_dev` pulls the latest commit from alcazar on `grillmi-dev`, builds it, and reloads Caddy to serve `grillmi.krafted.cc` (internal).
- Running the same playbook with `--limit grillmi_prod` does the same on `grillmi` and serves `grillmi.cloud` (public).
- Both URLs serve HTTPS with valid certificates. The internal URL is routed through NPM on argus with a `*.krafted.cc` wildcard issued via DNS-01. The public URL is served through a Cloudflare Tunnel on the prod LXC — Cloudflare terminates TLS with its own cert; no inbound ports are open on atlas or any home-lab host.
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

Follow the established convention from `azooco`, `carraway`, and `spamnesia`: a Doppler project named after the app, an Ansible role `app_grillmi`, a deploy playbook wrapping the role, inventory entries under the relevant host groups, and `host_vars` providing per-environment configuration. Diverge from the reference apps in two ways: (1) prod uses an LXC (not a VM) — smaller footprint, same capabilities for this workload, (2) the role builds a static `adapter-static` output and has Caddy serve it, instead of running a Node server under PM2. The deploy mechanism matches azooco's: SSH into the target, `git pull` from `alcazar:/git/grillmi.git`, `pnpm install --frozen-lockfile`, `pnpm build`, reload Caddy. Both dev and prod hosts have Node 22 LTS, pnpm, and Caddy installed.

Public access uses Cloudflare Tunnel — the mandatory pattern for any home-lab service that needs to be reachable from the public internet (see global CLAUDE.md, and the reference role at `~/dev/ansible/roles/app_azooco/tasks/cloudflared.yml`). `grillmi.cloud` has its nameservers on Cloudflare; a named tunnel on the `grillmi` prod LXC registers a public hostname mapping `grillmi.cloud → http://localhost:80`. Caddy on the LXC binds to localhost only. Cloudflare serves the public TLS cert; no DNS A record points at home infrastructure and no inbound ports are opened anywhere.

Internal access for `grillmi.krafted.cc` is unchanged from the prior pattern: NPM on argus terminates TLS with a `*.krafted.cc` wildcard (DNS-01 against Cloudflare) and proxies to the dev VM's internal IP. LAN-only; Tailscale covers off-LAN access to internal URLs.

Secrets live in Doppler project `grillmi` with configs `dev` and `prd`. The required secrets are become passwords, a deploy token, and the Cloudflare Tunnel token for the prod tunnel. Generated secrets use `openssl rand -hex 24`; Cloudflare-issued tokens are `PLACEHOLDER_NEEDS_REAL_VALUE` until Marco pastes them in from the Zero Trust dashboard.

### Approach Validation

- **Reference implementations** — `~/dev/ansible/playbooks/applications/azooco-deploy.yml`, `~/dev/ansible/playbooks/applications/spamnesia-deploy.yml`, `~/dev/ansible/roles/app_spamnesia/tasks/main.yml`. Both follow the thin-playbook-thick-role pattern; Grillmi copies this. Spamnesia's Doppler/systemd/template approach is the closest match structurally, minus the Python service layer.
- **Infrastructure inventory** — `~/dev/ops/resources/docs/260109-infrastructure-inventory.md` confirms atticus is the lab Proxmox host and atlas is always-on prod, with LXC and VM sizing precedents (`carraway`, `spamnesia`, `azooco-prod`) that we're sizing under.
- **Domain conventions** — `~/dev/ops/resources/docs/260218-domain-inventory.md` documents the NPM-on-argus pattern for `*.krafted.me` (LAN-only internal) and the Cloudflare-Tunnel-on-`krafted.cloud` pattern (public, no open ports) as the two sanctioned paths.
- **Public exposure** — `azooco.ch` is served via Cloudflare Tunnel from `azooco-prod`. Role pattern at `~/dev/ansible/roles/app_azooco/tasks/cloudflared.yml` handles `cloudflared` install; the tunnel itself is registered manually via `cloudflared tunnel login` and routed in the Cloudflare Zero Trust dashboard. `karakeep.krafted.cloud` and other services follow the same pattern on `dockerhost`. No home-lab host has inbound ports open to the internet.
- **Adapter choice** — `resources/docs/stack-research-apr-2026.md` confirms `adapter-static` for SvelteKit is the smallest, simplest fit for an offline-first PWA with no server-side rendering requirement. Caddy serves the static build locally; Cloudflare fronts it for public access.
- **Trade-off decided** — build-on-prod over artifact-transfer. Prod is sized at 1 CPU / 2 GB RAM: web research ([technetexperts.com, sveltejs/kit #7989](https://github.com/sveltejs/kit/discussions/7989)) shows small SvelteKit + Tailwind builds peak around 1 GB heap with default settings, so 2 GB gives a 2× margin; single-CPU is fine because Rollup is mostly serial and Caddy at runtime is idle. A git-pull-and-build deploy is simpler than an artifact pipeline, keeps the repo as single source of truth, and removes the need for a `dist` branch. If a specific build later OOMs, the first-line fix is `build.sourcemap: false` + `rollupOptions.maxParallelFileOps: 2` + `NODE_OPTIONS=--max-old-space-size=1536`, not a resize.

### Risks

| Risk | Mitigation |
| --- | --- |
| Prod LXC outgrows its sizing later (e.g. push-notification worker in v2) | 1 CPU / 2 GB / 16 GB covers the Vite build and Caddy today; if v2 needs a Node worker, resize or rebuild as a VM — a 15-minute operation. First OOM response is build-config tuning (sourcemap off, Rollup throttle, explicit `--max-old-space-size`), not a resize. |
| Cloudflare Tunnel misconfigured (tunnel token wrong, route missing) on first deploy | Phase 2 verifies `cloudflared tunnel list` shows the grillmi tunnel as healthy and the Zero Trust dashboard shows the `grillmi.cloud → http://localhost:80` public hostname mapping before any deploy. If the tunnel is unhealthy, `systemctl status cloudflared` on the prod LXC surfaces the reason (usually: bad token, missing route). |
| grillmi.cloud nameservers not on Cloudflare | Tunnel requires the zone on Cloudflare. Phase 2 includes moving nameservers to Cloudflare if not already there; verification step `dig NS grillmi.cloud` must show `*.ns.cloudflare.com` before tunnel config. |
| Doppler secret rotation breaks Ansible runs | `~/dev/scripts/get_secret` retries via Touch ID on Mac; on Linux the Ansible controller uses a service token stored on disk. Document the rotation procedure in the role's README. |
| VS Code Remote-SSH on 4 GB dev VM runs out of memory under long builds | Vite builds on Svelte 5 + Tailwind 4 with <200 source files use <1 GB RAM in practice. Watch `grillmi-dev` memory during first real build; resize to 8 GB if needed. |
| Wildcard cert on `*.krafted.cc` fails to issue or expire silently | This project first activates `krafted.cc` for internal use. Issue the wildcard in NPM via DNS-01 (registrar API) as part of Phase 2; NPM auto-renews thereafter. Include a manual verification step that `grillmi.krafted.cc` serves HTTPS green on first deploy. |

### Implementation Plan

**Phase 1: Doppler setup**

- [ ] Create Doppler project `grillmi` with configs `dev` and `prd` via the Doppler CLI under Marco's account.
- [ ] In `grillmi/dev`: add `BECOME_PASSWORD` as a generated secret via `openssl rand -hex 24`, add `DEPLOY_TOKEN` as a generated service token.
- [ ] In `grillmi/prd`: add `BECOME_PASSWORD` (generated), `DEPLOY_TOKEN` (generated).
- [ ] In existing `infra/prd` Doppler project: mirror `BECOME_GRILLMI_DEV` and `BECOME_GRILLMI_PROD` (both referencing the same values as above) per the infra-become-password convention.
- [ ] In existing `deploy-tokens/prd` Doppler project: add `GRILLMI_DEPLOY_TOKEN` matching the service token from `grillmi/prd`.
- [ ] Add `CLOUDFLARE_TUNNEL_TOKEN` as `PLACEHOLDER_NEEDS_REAL_VALUE` in `grillmi/prd` — generated in the Zero Trust dashboard when creating the grillmi tunnel in Phase 2; installed into `cloudflared`'s systemd unit by the Ansible role.

**Phase 2: Domains, Cloudflare Tunnel, internal routing**

- [x] `grillmi.cloud` registered (Marco, April 2026).
- [ ] Ensure `grillmi.cloud` nameservers are on Cloudflare. Verify with `dig NS grillmi.cloud +short` returning `*.ns.cloudflare.com`. If not, add the zone in the Cloudflare dashboard and update nameservers at the registrar; wait for propagation before proceeding.
- [ ] In the Cloudflare Zero Trust dashboard → Networks → Tunnels, create a new named tunnel `grillmi`. Copy the generated tunnel token into Doppler `grillmi/prd` under `CLOUDFLARE_TUNNEL_TOKEN`.
- [ ] In the same tunnel, configure a Public Hostname: `grillmi.cloud` → Service `http://localhost:80`. Cloudflare creates the DNS CNAME automatically (no A record pointing at home IPs).
- [ ] Ensure `krafted.cc` nameservers are on Cloudflare (same as above — verify with `dig NS krafted.cc +short`). This enables the `*.krafted.cc` wildcard issuance via DNS-01 against the Cloudflare API.
- [ ] In NPM on argus (`npm.krafted.me`), issue a `*.krafted.cc` wildcard certificate via DNS-01 (Cloudflare API), the first `.krafted.cc` service. Register the cert in NPM as a wildcard SSL cert entry.
- [ ] In NPM, create proxy host `grillmi.krafted.cc → <grillmi-dev internal IP>:80` using the new `*.krafted.cc` wildcard. LAN-only; no public DNS entry for this hostname.
- [ ] Update `~/dev/ops/resources/docs/260218-domain-inventory.md`: add `grillmi.cloud` (public, Cloudflare Tunnel → grillmi LXC) and `grillmi.krafted.cc` (internal, NPM → grillmi-dev); promote `krafted.cc` from "reserved for future use" to "active internal domain".

**Phase 3: Provision hosts**

Address allocation is plain DHCP — no Fixed IP reservations (matches Marco's convention for app hosts). Findability comes from setting the hostname correctly at creation so UniFi's DHCP service auto-registers it in DNS; the Ansible inventory uses hostnames, not IPs, so lease drift doesn't matter. If the hostname ever fails to resolve, verification is "ask Proxmox from the host": `pct exec` or `qm guest exec` reports the container's actual IP.

- [ ] Create `grillmi-dev` VM on atticus via `qm create` (or the Proxmox UI) with: 2 vCPU, 4 GB RAM, 32 GB disk, Ubuntu 24.04 LTS cloud image, `--name grillmi-dev`, cloud-init `hostname: grillmi-dev` (critical — without this UniFi registers a generic name and the host is unfindable), `--net0 virtio,bridge=vmbr1,tag=400,ip=dhcp`, `--tags "400-development;grillmi"`, qemu-guest-agent enabled. Start the VM.
- [ ] Create `grillmi` LXC on atlas via `pct create` with: CT ID in the 4xx range, template `debian-12-standard` (or equivalent Ubuntu 24.04 container), 1 vCPU, 2 GB RAM, 16 GB disk, `--hostname grillmi`, `--net0 name=eth0,bridge=vmbr1,tag=100,ip=dhcp`, `--tags "100-production;grillmi"`, `--unprivileged 1`, `--features nesting=1`, `--start 1`.
- [ ] Confirm each host booted and got a DHCP lease by asking Proxmox directly: `ssh atticus "sudo qm guest exec <vmid> -- hostname -I"` for the VM (requires qemu-guest-agent running) and `ssh atlas "sudo pct exec <ctid> -- hostname -I"` for the LXC. Each should print an IP in the expected VLAN range.
- [ ] From the Mac, verify hostname → IP resolves: `dig +short grillmi-dev` and `dig +short grillmi` return the same IPs Proxmox just reported. If either is empty, the cloud-init / `--hostname` step was wrong — redo it (the DHCP client announces the hostname UniFi registers, and a generic default name won't resolve).
- [ ] SSH from the Mac: `ssh grillmi-dev` and `ssh grillmi` both succeed on first try after accepting the new host key.
- [ ] From the Ansible controller, run `ansible grillmi-dev -m ping` and `ansible grillmi -m ping` — both return `SUCCESS`. If either fails, stop and fix; do not proceed with ambiguous connectivity.
- [ ] Verify Proxmox tags: `sudo qm config <vmid>` on atticus shows `tags: 400-development;grillmi`; `sudo pct config <ctid>` on atlas shows `tags: 100-production;grillmi`.
- [ ] Record CT/VM IDs, MAC addresses, and tags in `~/dev/ops/resources/docs/260109-infrastructure-inventory.md`. IP addresses are not recorded — they're ephemeral under DHCP and resolution is via hostname.

**Phase 4: Ansible inventory and role**

- [ ] Add `grillmi-dev` and `grillmi-prod` entries to `~/dev/ansible/inventory/hosts.yml` under `dev_servers` and `production_servers` respectively, following the `azooco` entry format (host IP, user, become_pass via `get_secret`, use_tailscale flags).
- [ ] Add `grillmi_apps`, `grillmi_dev`, and `grillmi_prod` group definitions at the bottom of `hosts.yml` mirroring the `azooco_apps`/`azooco_dev`/`azooco_prod` structure.
- [ ] Create Ansible role `app_grillmi` at `~/dev/ansible/roles/app_grillmi/` with `tasks/main.yml`, `templates/Caddyfile.j2`, `handlers/main.yml`, `defaults/main.yml`, and `README.md`.
- [ ] Role tasks in order: (a) install Node 22 LTS via `nodesource` APT repo and `corepack enable pnpm`, (b) install Caddy from the official APT repo, (c) on the prod host only: import `cloudflared.yml` (the shared install pattern from `app_azooco`) and drop a systemd override that sets `TUNNEL_TOKEN` from Doppler, (d) ensure `/opt/grillmi` exists with ownership `maf:maf`, (e) clone `alcazar:/git/grillmi.git` into `/opt/grillmi` on first run (idempotent — skip if already a git repo), (f) `git fetch origin && git reset --hard origin/main` to pull latest, (g) `pnpm install --frozen-lockfile`, (h) `pnpm build` to produce `/opt/grillmi/build`, (i) deploy the `Caddyfile` from template, (j) reload Caddy via handler, (k) ensure `cloudflared` systemd service is enabled and started on the prod host. Use `ansible.builtin.assert` to validate `grillmi_domain`, `grillmi_environment`, `grillmi_repo_url` before proceeding.
- [ ] Caddyfile template: single site block for `:80` bound to `127.0.0.1` (loopback only — never `0.0.0.0`), `root * /opt/grillmi/build`, `file_server`, `try_files {path} /index.html` for SvelteKit SPA routing. No Caddy TLS configuration — the prod host's public TLS is terminated by Cloudflare at the tunnel edge, and the dev host's internal TLS is terminated by NPM on argus. UFW on both hosts keeps inbound closed except SSH.
- [ ] Create `~/dev/ansible/playbooks/applications/grillmi-deploy.yml` as a thin wrapper calling the `app_grillmi` role against `grillmi_apps`, tagged `grillmi`.
- [ ] Per-environment `host_vars` at `~/dev/ansible/inventory/host_vars/grillmi-dev/vars.yml` and `.../grillmi-prod/vars.yml`: set `grillmi_domain` (`grillmi.krafted.cc` vs `grillmi.cloud`), `grillmi_environment` (`dev` / `prod`), `grillmi_public_base_url` (full `https://...`), `grillmi_repo_url: alcazar:/git/grillmi.git`, `grillmi_git_ref: main`.

**Phase 5: Dev-side developer setup**

- [ ] On `grillmi-dev`: confirm Node 22 LTS, pnpm, git, and build-essential are present (installed by the role in Phase 4). VS Code Remote-SSH server bootstraps on first connect.
- [ ] Configure `~/.gitconfig` on the VM matching Marco's identity from `~/dev/ansible/roles/base_setup`.
- [ ] On both hosts, the first `ansible-playbook ... grillmi-deploy.yml` run clones the repo and builds it end-to-end. Until Spec 2 ships real app code, `main` carries a minimal SvelteKit scaffold with an `app.html` that reads "Grillmi — coming soon" so the deploy path can be verified before the full app is written.

**Phase 6: Git remote on alcazar**

- [x] Bare repo `alcazar:/git/grillmi.git` created and scaffold commit pushed from Marco's Mac (April 2026).
- [ ] On `grillmi-dev`, clone from `alcazar:/git/grillmi.git` into `/home/maf/dev/grillmi` for interactive development. Working-copy checkouts at `/opt/grillmi` on both hosts are managed by the Ansible role, not by hand.

**Phase 7: End-to-end deploy verification**

- [ ] Run `ansible-playbook playbooks/applications/grillmi-deploy.yml --limit grillmi_dev` from Marco's Mac; verify `grillmi.krafted.cc` serves the placeholder page over HTTPS (NPM-issued wildcard).
- [ ] Run the same with `--limit grillmi_prod`; verify `grillmi.cloud` serves the placeholder page over HTTPS via the Cloudflare-issued cert. Verify from the prod LXC: `ss -tlnp | grep -E ':80|:443'` shows Caddy bound to `127.0.0.1:80` only, never `0.0.0.0`, and `sudo ufw status` shows inbound still closed except SSH.
- [ ] Re-run both to confirm idempotency (no unexpected "changed" tasks on a no-op run).

---

## Testing

### Integration Tests (`~/dev/ansible/tests/` or equivalent)

- [ ] `test_grillmi_role_idempotent` — second consecutive role run reports zero `changed` tasks against a clean host.
- [ ] `test_grillmi_caddyfile_valid` — `caddy validate /etc/caddy/Caddyfile` exits zero on the rendered template for both environments.
- [ ] `test_grillmi_inventory_parses` — `ansible-inventory --graph` resolves both `grillmi_dev` and `grillmi_prod` groups and lists the correct hosts.

### Manual Verification (Marco)

- [ ] Open `https://grillmi.krafted.cc` in Safari — see the placeholder "Grillmi — coming soon" page with a green lock icon in the URL bar.
- [ ] Open `https://grillmi.cloud` in Safari — see the same placeholder page with a green lock icon.
- [ ] On the Mac, run `ssh grillmi-dev` and confirm you land in a working shell with `/home/maf/dev/grillmi` present as a clone of the alcazar remote.
- [ ] Open VS Code, connect via Remote-SSH to `grillmi-dev`, open the `grillmi` workspace — the editor opens files and the terminal works.
- [ ] In Doppler's web UI, confirm the `grillmi` project exists with `dev` and `prd` configs populated, and that `infra/prd` has `BECOME_GRILLMI_DEV` / `BECOME_GRILLMI_PROD` entries, and that `deploy-tokens/prd` has `GRILLMI_DEPLOY_TOKEN`.
