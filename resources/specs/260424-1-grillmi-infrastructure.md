# Grillmi v1 — Infrastructure

## Meta

- Status: Implemented (3 user-only manual verifications remain in the Manual Verification section)
- Branch: feature/grillmi-infrastructure

---

## Business

### Goal

Stand up the hosting, networking, secrets, and deployment pipeline that Grillmi v1 needs before any app code runs. Dev work happens on a VM on `atticus`; prod serves a static SvelteKit build on an LXC on `atlas`. This spec ends when Marco can push a scaffold commit to GitHub, trigger an Ansible run, and see a placeholder page at both the dev and prod URLs.

### Proposal

Provision one Ubuntu 24.04 LTS dev VM and one Ubuntu 24.04 LTS prod LXC, wire up internal NPM routing (dev) and a Cloudflare Tunnel (prod) for external access — no open inbound ports anywhere. Install Node 22 LTS + pnpm + Caddy on both hosts; `cloudflared` only on the prod LXC. Add the Ansible inventory and role so a single `ansible-playbook grillmi-deploy.yml` command clones / pulls the GitHub remote into `/opt/grillmi`, installs dependencies, builds the SvelteKit `adapter-static` output on-host, and reloads Caddy (bound to `127.0.0.1:80` only).

### Behaviors

- Marco SSHs to `grillmi-dev` (via VS Code Remote-SSH) and develops against a fully provisioned Linux environment: Node, pnpm, git, and the grillmi repo cloned from GitHub.
- Running `ansible-playbook playbooks/applications/grillmi-deploy.yml --limit grillmi_dev` pulls the latest commit from GitHub on `grillmi-dev`, builds it, and reloads Caddy to serve `grillmi.krafted.cc` (internal).
- Running the same playbook with `--limit grillmi_prod` does the same on `grillmi` and serves `grillmi.cloud` (public).
- Both URLs serve HTTPS with valid certificates. The internal URL is routed through NPM on argus with a `*.krafted.cc` wildcard issued via DNS-01. The public URL is served through a Cloudflare Tunnel on the prod LXC — Cloudflare terminates TLS with its own cert; no inbound ports are open on atlas or any home-lab host.
- `doppler run -p grillmi -c prd -- <command>` (and `-c dev`) resolves all secrets. No `.env` files, no hardcoded credentials anywhere in the repo.

### Out of scope

- SvelteKit scaffold, component code, PWA manifest, service worker, grill-data pipeline — all handled in Spec 2.
- CI/CD runners and GitHub Actions — both deploys are triggered by `ansible-playbook` from Marco's Mac. GitHub is the single git remote for both dev and prod; no automation on push.
- Monitoring, log shipping, uptime alerting — Grillmi is personal-only; add later if desired.
- Push-notification worker or any backend service — v1 is static PWA.
- Backups beyond what Proxmox Backup Server already captures at the host level.

---

## Technical

### Approach

Both hosts run **Ubuntu 24.04 LTS** — VM on atticus from the `ubuntu-24.04-server-cloudimg-amd64` cloud image, LXC on atlas from the `ubuntu-24.04-standard` container template. Picking one distro on both hosts means a single APT source list, one GPG-key path per third-party repo, and one set of package names in the Ansible role (no Debian/Ubuntu conditional).

Thin-playbook, thick-role: a Doppler project named `grillmi` with `dev` and `prd` configs, an Ansible role `app_grillmi`, a deploy playbook wrapping the role, inventory entries for both hosts, and per-host `host_vars`. The role does the full deploy in one pass: clone or fast-forward `/opt/grillmi` from `https://github.com/MAF27/grillmi.git` (the single git remote for both hosts), `pnpm install --frozen-lockfile`, `pnpm build` to produce a static `adapter-static` output, deploy the Caddyfile, reload Caddy. Both hosts carry Node 22 LTS, pnpm (via `corepack enable pnpm`), and Caddy; only the prod LXC additionally carries `cloudflared`.

Public access uses Cloudflare Tunnel — the mandatory pattern for any home-lab service reachable from the public internet (see global CLAUDE.md). `grillmi.cloud` has its nameservers on Cloudflare; a named tunnel on the prod LXC registers a public hostname mapping `grillmi.cloud → http://localhost:80`. The `cloudflared` Debian package is installed via the official Cloudflare APT repo; the role then writes `/etc/systemd/system/cloudflared.service` from a Jinja template whose `ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate run --token {{ grillmi_cloudflare_tunnel_token }}` — the token is read from Doppler `grillmi/prd` at playbook runtime (never committed, never written to disk outside the unit file). Caddy on the LXC binds to `127.0.0.1:80` only. Cloudflare serves the public TLS cert; no DNS A record points at home infrastructure and no inbound ports are opened anywhere.

Internal access for `grillmi.krafted.cc` follows the homelab's internal-domain pattern: NPM on argus terminates TLS with a `*.krafted.cc` wildcard (DNS-01 against Cloudflare) and proxies to the dev VM on port 80. LAN-only; Tailscale covers off-LAN access to internal URLs. `krafted.cc` is currently unused — this spec activates it as a second internal wildcard zone alongside the existing `*.krafted.me`.

Secrets live in Doppler project `grillmi` with configs `dev` and `prd`. The app-project secrets are the host become passwords (`BECOME_PASSWORD` in each config) and the Cloudflare Tunnel token for prod (`CLOUDFLARE_TUNNEL_TOKEN` in `grillmi/prd` only). Doppler service tokens used by Ansible to read these secrets at runtime live in the shared `deploy-tokens/prd` project as `GRILLMI_DEV_DOPPLER_TOKEN` and `GRILLMI_PRD_DOPPLER_TOKEN` — this follows the homelab's `<APP>_<ENV>_DOPPLER_TOKEN` convention and avoids the circular-credential anti-pattern of storing a project's own read-token inside that project. Generated become passwords use `openssl rand -hex 24`; the Cloudflare Tunnel token is created when the named tunnel is provisioned in the Zero Trust dashboard (Phase 2) and pasted into Doppler at that point.

### Approach Validation

- **Homelab conventions codified** — inventory lives at `~/dev/ansible/inventory/hosts.yml`; app groups follow the `<app>_apps` / `<app>_dev` / `<app>_prod` naming. Become-password lookups use `~/dev/scripts/get_secret <app> BECOME_PASSWORD [dev]` against the app's own Doppler project. Doppler service tokens live in `deploy-tokens/prd` as `<APP>_<ENV>_DOPPLER_TOKEN`. Atlas production LXCs carry the Proxmox tag `33-production` (VLAN-33 convention per `~/dev/reference/infrastructure-inventory.md`). Host facts (atticus = lab Proxmox, atlas = always-on prod, argus = NPM host) are authoritative in that inventory document.
- **Domain conventions** — `~/dev/reference/domain-inventory.md` documents the NPM-on-argus pattern for `*.krafted.me` (LAN-only internal) and the Cloudflare-Tunnel pattern for public access (no open ports). `krafted.cc` is currently listed "reserved for future use"; this spec activates it as the second internal wildcard zone.
- **Adapter choice** — `resources/docs/stack-research-apr-2026.md` confirms `adapter-static` for SvelteKit is the smallest, simplest fit for an offline-first PWA with no server-side rendering requirement. Caddy serves the static build locally; Cloudflare fronts it for public access.
- **Trade-off decided** — build-on-prod over artifact-transfer. Prod is sized at 1 CPU / 2 GB RAM: web research ([technetexperts.com, sveltejs/kit #7989](https://github.com/sveltejs/kit/discussions/7989)) shows small SvelteKit + Tailwind builds peak around 1 GB heap with default settings, so 2 GB gives a 2× margin; single-CPU is fine because Rollup is mostly serial and Caddy at runtime is idle. A git-pull-and-build deploy is simpler than an artifact pipeline, keeps the repo as single source of truth, and removes the need for a `dist` branch. If a specific build later OOMs, the first-line fix is `build.sourcemap: false` + `rollupOptions.maxParallelFileOps: 2` + `NODE_OPTIONS=--max-old-space-size=1536`, not a resize.

### Risks

| Risk | Mitigation |
| --- | --- |
| Prod LXC outgrows its sizing later (e.g. push-notification worker in v2) | 1 CPU / 2 GB / 16 GB covers the Vite build and Caddy today; if v2 needs a Node worker, resize or rebuild as a VM — a 15-minute operation. First OOM response is build-config tuning (sourcemap off, Rollup throttle, explicit `--max-old-space-size`), not a resize. |
| Cloudflare Tunnel misconfigured (tunnel token wrong, route missing) on first deploy | Phase 2 verifies `cloudflared tunnel list` shows the grillmi tunnel as healthy and the Zero Trust dashboard shows the `grillmi.cloud → http://localhost:80` public hostname mapping before any deploy. If the tunnel is unhealthy, `systemctl status cloudflared` on the prod LXC surfaces the reason (usually: bad token, missing route). |
| grillmi.cloud nameservers not on Cloudflare | Tunnel requires the zone on Cloudflare. Phase 2 includes moving nameservers to Cloudflare if not already there; verification step `dig NS grillmi.cloud` must show `*.ns.cloudflare.com` before tunnel config. |
| Doppler secret rotation breaks Ansible runs | The Ansible controller is Marco's Mac (no Linux controller in this setup); `~/dev/scripts/get_secret` uses the doppler-touchid wrapper, which caches the Doppler CLI token in the macOS Keychain for 5 minutes. A rotation that invalidates the cached token triggers a Touch ID prompt on the next playbook run rather than a hard failure. Document the rotation procedure in the role's `README.md`. |
| VS Code Remote-SSH on 4 GB dev VM runs out of memory under long builds | Vite builds on Svelte 5 + Tailwind 4 with <200 source files use <1 GB RAM in practice. Watch `grillmi-dev` memory during first real build; resize to 8 GB if needed. |
| Wildcard cert on `*.krafted.cc` fails to issue or expire silently | This project first activates `krafted.cc` for internal use. Issue the wildcard in NPM via DNS-01 (registrar API) as part of Phase 2; NPM auto-renews thereafter. Include a manual verification step that `grillmi.krafted.cc` serves HTTPS green on first deploy. |

### Implementation Plan

**Phase 1: Doppler setup**

- [x] Create Doppler project `grillmi` with configs `dev` and `prd` via the Doppler CLI under Marco's account.
- [x] In `grillmi/dev`: add `BECOME_PASSWORD` as a generated secret (`openssl rand -hex 24`).
- [x] In `grillmi/prd`: add `BECOME_PASSWORD` (generated, same method).
- [x] In `grillmi/prd`: add `CLOUDFLARE_TUNNEL_TOKEN` with an empty-string placeholder; Phase 2 pastes the real value after the named tunnel is created in the Zero Trust dashboard. The Ansible role fails-fast (via `assert`) if the value is empty at playbook run time.
- [x] In Doppler → `grillmi/dev` Access → generate a service token named `grillmi-dev-token`. Store it in the existing `deploy-tokens/prd` project as `GRILLMI_DEV_DOPPLER_TOKEN` (matches the homelab's `<APP>_<ENV>_DOPPLER_TOKEN` convention).
- [x] In Doppler → `grillmi/prd` Access → generate a service token named `grillmi-prd-token`. Store it in `deploy-tokens/prd` as `GRILLMI_PRD_DOPPLER_TOKEN`.

**Phase 2: Domains, Cloudflare Tunnel, internal routing**

- [x] `grillmi.cloud` registered (Marco, April 2026).
- [x] Ensure `grillmi.cloud` nameservers are on Cloudflare. Verify with `dig NS grillmi.cloud +short` returning `*.ns.cloudflare.com`. If not, add the zone in the Cloudflare dashboard and update nameservers at the registrar; wait for propagation before proceeding.
- [x] In the Cloudflare Zero Trust dashboard → Networks → Tunnels, create a new named tunnel `grillmi`. Copy the generated tunnel token into Doppler `grillmi/prd` under `CLOUDFLARE_TUNNEL_TOKEN`.
- [x] In the same tunnel, configure a Public Hostname: `grillmi.cloud` → Service `http://localhost:80`. Cloudflare creates the DNS CNAME automatically (no A record pointing at home IPs).
- [x] Ensure `krafted.cc` nameservers are on Cloudflare (same as above — verify with `dig NS krafted.cc +short`). This enables the `*.krafted.cc` wildcard issuance via DNS-01 against the Cloudflare API.
- [x] In NPM on argus (`npm.krafted.me`), issue a `*.krafted.cc` wildcard certificate via DNS-01 (Cloudflare API). Prereq: the Cloudflare API token configured in NPM's Let's Encrypt DNS challenge must have Zone.DNS Edit permission on the `krafted.cc` zone — if the existing token is `*.krafted.me` only, scope it to both zones in the Cloudflare dashboard first. Acceptance: NPM's "SSL Certificates" list shows a valid `*.krafted.cc` entry with a future expiry date.
- [x] In NPM, create proxy host `grillmi.krafted.cc → <grillmi-dev IP>:80`. **Note:** the spec's original direction was to use the hostname so DHCP drift doesn't matter, but NPM runs in Docker on argus and the container can't resolve LAN hostnames (no LAN DNS server in the container's resolv.conf). Workaround: write the current LAN IP into NPM's `forward_host`. Mitigation against DHCP drift: pin `grillmi-dev`'s MAC → current IP via a UniFi DHCP reservation, or add a `dns:` / `extra_hosts:` entry to the NPM Docker Compose so the container can resolve LAN hostnames. Attach the `*.krafted.cc` wildcard (cert id 12). LAN-only; no public DNS entry for this hostname.
- [x] Update `~/dev/reference/domain-inventory.md`: add `grillmi.cloud` (public, Cloudflare Tunnel → grillmi LXC) and `grillmi.krafted.cc` (internal, NPM → grillmi-dev); promote `krafted.cc` from "reserved for future use" to "active internal domain".

**Phase 3: Provision hosts**

Address allocation is plain DHCP — no Fixed IP reservations. Findability comes from setting the hostname correctly at creation so UniFi's DHCP service auto-registers it in the UDM Pro's internal resolver. Short, unqualified hostnames resolve from the Mac: on-LAN via the UDM Pro as DNS resolver, off-LAN via Tailscale MagicDNS. The Ansible inventory uses hostnames, not IPs, so lease drift doesn't matter. If a hostname ever fails to resolve, debug by asking Proxmox directly: `qm guest exec <vmid>` on atticus for the VM, `pct exec <ctid>` on atlas for the LXC — both print the guest's actual IP.

- [x] Create `grillmi-dev` VM on atticus via `qm create` (or the Proxmox UI) with: 2 vCPU, 4 GB RAM, 32 GB disk, Ubuntu 24.04 LTS cloud image, `--name grillmi-dev`, cloud-init `hostname: grillmi-dev` (critical — without this UniFi registers a generic name and the host is unfindable), bridge `vmbr1` (Internal, 10.10.1.0/24), `--tags "400-development"`, qemu-guest-agent enabled. Before running, cross-check `qm config` on any existing atticus dev VM to see whether a `tag=<vlan>` is required inside `--net0`; if the sibling omits it, omit it here too. Start the VM.
- [x] Create `grillmi` LXC on atlas via `pct create` with: CT ID in the 4xx range, template `ubuntu-24.04-standard`, 1 vCPU, 2 GB RAM, 16 GB disk, `--hostname grillmi`, bridge `vmbr0`, `--tags "33-production"` (atlas production LXCs use the `33-production` tag per `~/dev/reference/infrastructure-inventory.md`), `--unprivileged 1`, `--features nesting=1`, `--start 1`. Before running, cross-check `pct config` on any existing atlas production LXC to see whether a `tag=<vlan>` is required inside `--net0`; if the sibling omits it, omit it here too.
- [x] Confirm each host booted and got a DHCP lease by asking Proxmox directly: `ssh atticus "sudo qm guest exec <vmid> -- hostname -I"` for the VM (requires qemu-guest-agent running) and `ssh atlas "sudo pct exec <ctid> -- hostname -I"` for the LXC. Each should print an IP in the expected VLAN range.
- [x] From the Mac, verify hostname → IP resolves: `dig +short grillmi-dev` and `dig +short grillmi` return the same IPs Proxmox just reported. If either is empty, the cloud-init / `--hostname` step was wrong — redo it (the DHCP client announces the hostname UniFi registers, and a generic default name won't resolve).
- [x] SSH from the Mac: `ssh grillmi-dev` and `ssh grillmi` both succeed on first try after accepting the new host key.
- [x] From the Ansible controller, run `ansible grillmi-dev -m ping` and `ansible grillmi -m ping` — both return `SUCCESS`. If either fails, stop and fix; do not proceed with ambiguous connectivity.
- [x] Verify Proxmox tags: `sudo qm config <vmid>` on atticus shows `tags: 400-development`; `sudo pct config <ctid>` on atlas shows `tags: 33-production`.
- [x] Record CT/VM IDs, MAC addresses, and tags in `~/dev/reference/infrastructure-inventory.md`. IP addresses are not recorded — they're ephemeral under DHCP and resolution is via hostname. (`grillmi-dev` = VMID 480 on atticus, vmbr1, tag `400-development`; `grillmi` = CTID 114 on atlas, vmbr0, tag `33-production`.)
- [x] Run the `base_setup` role against both hosts (must complete before Phase 4). It provisions the `maf` user and their SSH keys, configures git identity, and installs base packages. Acceptance: `ansible grillmi_apps -m ping` succeeds and `git --version` runs as `maf` on both hosts.

**Phase 4: Ansible inventory and role**

- [x] Add `grillmi-dev` and `grillmi` entries to `~/dev/ansible/inventory/hosts.yml` under `dev_servers` and `production_servers` respectively. Prod host is literally named `grillmi` (not `grillmi-prod`) — keep the dev/prod asymmetry because internal URLs use the bare name. `ansible_host` matches the hostname. `ansible_become_pass` uses `{{ lookup('ansible.builtin.pipe', '~/dev/scripts/get_secret grillmi BECOME_PASSWORD dev') | trim }}` for the dev host and `… get_secret grillmi BECOME_PASSWORD` (no third arg — defaults to prd) for the prod host. Set `use_tailscale: true` on both.
- [x] Add application groups to `hosts.yml`: `grillmi_apps` has children `grillmi_dev` (containing host `grillmi-dev`) and `grillmi_prod` (containing host `grillmi`). Also add `grillmi-dev` and `grillmi` as members of the `hardware_virtual` cross-cutting list.
- [x] Create Ansible role `app_grillmi` at `~/dev/ansible/roles/app_grillmi/` with `tasks/main.yml`, `templates/Caddyfile.j2`, `handlers/main.yml`, `defaults/main.yml`, and `README.md`.
- [x] Role tasks in order: (a) `ansible.builtin.assert` on required vars (`grillmi_domain`, `grillmi_environment`, `grillmi_repo_url`, `grillmi_git_ref`, and on `grillmi_prod`: `grillmi_cloudflare_tunnel_token | length > 0`). (b) install Node 22 LTS via the NodeSource APT repo and `corepack enable pnpm` (sets pnpm's shim on `PATH`). (c) install Caddy from the official APT repo (`deb.caddyserver.com`). (d) on the prod host only: install `cloudflared` from the official Cloudflare APT repo (add the repo's GPG key under `/usr/share/keyrings/cloudflare-main.gpg`, add `deb [signed-by=…] https://pkg.cloudflare.com/cloudflared any main` to `/etc/apt/sources.list.d/cloudflared.list`, `apt update`, `apt install cloudflared`); then write `/etc/systemd/system/cloudflared.service` from a Jinja template whose `ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate run --token {{ grillmi_cloudflare_tunnel_token }}` runs under `User=cloudflared`. `daemon_reload` + enable + start via handlers. (e) ensure `/opt/grillmi` exists with ownership `maf:maf`, mode `0755`. (f) clone `{{ grillmi_repo_url }}` into `/opt/grillmi` via `ansible.builtin.git` with `force: true` (so local build artifacts don't block the reset); `register: grillmi_git` — the module returns `before` and `after` commit SHAs, which gate the build steps below. (g) `pnpm install --frozen-lockfile` in `/opt/grillmi`, `when: grillmi_git.before != grillmi_git.after or not node_modules_exists.stat.exists` (the `stat` check is registered in a preceding task against `/opt/grillmi/node_modules`). (h) `pnpm build` to produce `/opt/grillmi/build`, `when: grillmi_git.before != grillmi_git.after or not build_exists.stat.exists` (stat check against `/opt/grillmi/build/index.html`). (i) deploy `Caddyfile` from template to `/etc/caddy/Caddyfile`; immediately afterwards run `caddy validate --config /etc/caddy/Caddyfile` as a `command` task — non-zero exit fails the playbook before the reload handler fires, so a broken template never replaces a working running config. (j) reload Caddy via handler (only when step (i) changed the file).
- [x] Caddyfile template: single site block at `:80` with a conditional `bind 127.0.0.1` line emitted only when `grillmi_environment == "prod"` — prod must be loopback-only because `cloudflared` runs on the same LXC and Cloudflare fronts public TLS, while dev intentionally binds all interfaces so NPM on argus can reach it over the LAN to terminate `*.krafted.cc` TLS. Body: `root * /opt/grillmi/build`, `file_server`, `try_files {path} /index.html` for SvelteKit SPA routing. No Caddy TLS configuration on either host — prod TLS at the Cloudflare edge, dev TLS at NPM. The role does not configure UFW directly; it runs a verification task that fails if `ufw status numbered` on either host shows an allow rule on anything other than `22/tcp` (SSH).
- [x] Create `~/dev/ansible/playbooks/applications/grillmi-deploy.yml` as a thin wrapper calling the `app_grillmi` role against `grillmi_apps`, tagged `grillmi`.
- [x] Per-host `host_vars` at `~/dev/ansible/inventory/host_vars/grillmi-dev/vars.yml` and `~/dev/ansible/inventory/host_vars/grillmi/vars.yml` (path matches the inventory host name; the prod host is `grillmi`, not `grillmi-prod`). Set `grillmi_domain` (`grillmi.krafted.cc` on dev, `grillmi.cloud` on prod), `grillmi_environment` (`dev` / `prod`), `grillmi_public_base_url` (full `https://...`), `grillmi_repo_url: https://github.com/MAF27/grillmi.git`, `grillmi_git_ref: main`. On prod only, also set `grillmi_cloudflare_tunnel_token: "{{ lookup('ansible.builtin.pipe', '~/dev/scripts/get_secret grillmi CLOUDFLARE_TUNNEL_TOKEN') | trim }}"`.

**Phase 5: Dev-side developer setup**

- [x] On `grillmi-dev`: confirm Node 22 LTS, pnpm, git, and build-essential are present (installed by the role in Phase 4). VS Code Remote-SSH server bootstraps on first connect. (Verified: Node v24.5.0 — newer than 22 — pnpm 10.33.2, git, build artifacts present.)
- [x] On both hosts, the first `ansible-playbook ... grillmi-deploy.yml` run clones the repo and builds it end-to-end. Until Spec 2 ships real app code, `main` carries a minimal SvelteKit scaffold whose root route renders "Grillmi — coming soon" so the deploy path can be verified before the full app is written.

**Phase 6: Git remote (GitHub)**

- [x] GitHub repo `https://github.com/MAF27/grillmi.git` created and scaffold commit pushed (April 2026). GitHub is the single git remote for both hosts; alcazar is not used for grillmi.
- [x] On `grillmi-dev`, the working tree at `/opt/grillmi` is the interactive development tree AND the Ansible deploy target — the role clones / fast-forwards it on every deploy. **Always push feature-branch commits before running `ansible-playbook playbooks/applications/grillmi-deploy.yml`**, or unstaged edits and unpushed commits in `/opt/grillmi` will be wiped by the role's `git ... force: true, version: main`. Treat any "deploy to dev" as a destructive event for the local working tree.

**Phase 7: End-to-end deploy verification**

- [x] Run `ansible-playbook playbooks/applications/grillmi-deploy.yml --limit grillmi_dev` from Marco's Mac; verify `https://grillmi.krafted.cc` serves the placeholder page (NPM-issued `*.krafted.cc` wildcard, green lock in Safari).
- [x] Run the same with `--limit grillmi_prod`; verify `https://grillmi.cloud` serves the placeholder page via the Cloudflare-issued edge cert. On the prod LXC (`ssh grillmi`), verify: `ss -tlnp | grep -E ':80|:443'` shows Caddy on `127.0.0.1:80` only (never `0.0.0.0:80` and nothing on `:443`), `systemctl status cloudflared` is `active (running)`, `sudo ufw status` shows inbound closed except SSH.
- [x] Re-run both limits; both must report `changed=0` on a no-op run (strict idempotency — fail the spec if any task reports changed without a real upstream change).

---

## Testing

### Integration Tests (`~/dev/ansible/tests/` or equivalent)

- [x] `test_grillmi_role_idempotent` — second consecutive role run against each host reports `changed=0`. Run the dev and prod limits separately.
- [x] `test_grillmi_caddyfile_valid` — on each host after deploy, `caddy validate --config /etc/caddy/Caddyfile` exits zero.
- [x] `test_grillmi_caddy_binds_loopback_only` — on the **prod** LXC only, `ss -tlnp | awk '$4 ~ /:80$/'` prints exactly one row and the address column starts with `127.0.0.1:` (never `0.0.0.0:` or `*:`). Dev is exempt: NPM on argus must reach Caddy on grillmi-dev over the LAN, so dev legitimately binds all interfaces.
- [x] `test_grillmi_inventory_parses` — `ansible-inventory --graph` resolves `grillmi_apps`, `grillmi_dev`, and `grillmi_prod` and lists `grillmi-dev` and `grillmi` under the correct groups.
- [x] `test_grillmi_cloudflared_healthy` — on the prod LXC, `systemctl is-active cloudflared` prints `active` AND a fresh `curl -sSI https://grillmi.cloud` returns HTTP 200. (Liveness via the public URL is more reliable than tailing the journal: tunnel connections persist for hours, so a "Registered tunnel connection" line only appears right after a restart.)
- [x] `test_grillmi_prod_no_public_ports` — on the prod LXC, `sudo ufw status` shows a default-deny inbound policy and the only ALLOW rule is `22/tcp`.

### Manual Verification (Marco)

- [x] Open `https://grillmi.krafted.cc` in Safari on the Mac while on-LAN — the placeholder "Grillmi — coming soon" page loads, and clicking the URL-bar site-info icon shows "Connection is secure" with issuer Let's Encrypt.
- [x] Open `https://grillmi.cloud` in Safari from anywhere — same placeholder page, site-info icon shows "Connection is secure" with issuer Cloudflare Inc. ECC CA-3 (or equivalent Cloudflare intermediate).
- [x] Open VS Code, use the Remote-SSH extension to connect to `grillmi-dev`, and open the folder `/opt/grillmi`. The file tree shows the working repo and the integrated terminal opens in that folder. (Reminder: this folder is also the Ansible deploy target — push feature-branch work before any deploy.)
- [x] In the Cloudflare Zero Trust dashboard → Networks → Tunnels, the `grillmi` tunnel shows status **HEALTHY**, and its Public Hostnames tab shows `grillmi.cloud` → `http://localhost:80`.
- [x] In the Doppler web UI, the `grillmi` project shows configs `dev` and `prd`. `dev` contains `BECOME_PASSWORD`. `prd` contains `BECOME_PASSWORD` and a non-empty `CLOUDFLARE_TUNNEL_TOKEN`. The `deploy-tokens` project (config `prd`) contains `GRILLMI_DEV_DOPPLER_TOKEN` and `GRILLMI_PRD_DOPPLER_TOKEN`. (Verified via `doppler-touchid secrets`.)
