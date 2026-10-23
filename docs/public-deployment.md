# Public VPS deployment

This is the small-server path: GitHub tests and scans each PR, then tests, scans and
publishes the main release. The VPS checks GHCR every minute, deploys an immutable
digest, and restores the last successful image if the new release fails. No inbound
CI connection or GitHub-hosted SSH private key is needed.

## Fill in the hosting details later

The account and server do not have to exist while preparing the repository. Copy
`deployment.env.example` to `deployment.env` and fill in the blank values when ready:

```sh
cp deployment.env.example deployment.env
```

The worksheet has spaces for the account email, project, location, plan, monthly
budget, server IPv4, SSH username/key path, administrator IP range, and public hostname.
`deployment.env` is ignored by Git. It is a reference worksheet; neither CI nor the
application reads it automatically. The application's separate `.env` is created on
the server by the setup script.

Keep passwords, API tokens and private key contents outside both the worksheet and
Git. The current pull-based setup does not need a Hetzner API token or a GitHub SSH
deployment secret. Account login and payment setup happen in the provider console.
Use your own SSH key if this machine's `~/.ssh/team-ticket-hub-deploy` key is unavailable.

When ready, follow the numbered steps below using the completed worksheet. Until the
server exists, public HTTPS and automatic deployment remain unverified.

## 1. Prepare GitHub

Merge the reviewed changes into `main`. Wait for both `verify` and `publish` in the
CI workflow to pass. The main branch workflow can also be started manually from
Actions → CI → Run workflow. A green PR verifies the code but does not publish.

Make the `ghcr.io/vagharshak777/team-ticket-hub` container package public in its package
settings if the server will pull anonymously. A public Git repository does not make
its packages public. For a private package, log in to GHCR on the server using
`docker login ghcr.io --username YOUR_GITHUB_USER` and enter a package-read token
at its password prompt. Never put the token in Git, a command argument, or chat.

In repository settings, protect `main` and require the `verify` check before merging.
The scan is now part of that check, including on pull requests.

## 2. Create the VPS

Use a fresh Ubuntu 24.04 **x86/amd64** VPS with at least 2 GB RAM; 4 GB is a useful
starting point if you also want monitoring. The image is currently built for amd64,
so do not choose an ARM server for this pipeline.

For Hetzner, choose a CX23 in Germany or Finland if available, a primary IPv4 address,
and your SSH public key. Check the final price including IPv4 and applicable tax
before creating it. Use the provider firewall to allow TCP 80/443 from the internet
and SSH TCP 22 only from your administrator IP. UDP 443 is optional for HTTP/3.
Do not publish ports 3001, 3000, 3002, 8081 or 9443 to the internet.

The free hostname `YOUR-IP-WITH-DASHES.sslip.io` resolves to your public IPv4; for
example, `203-0-113-10.sslip.io`. This is a third-party DNS dependency. Later replace
it with your own domain. Caddy obtains and renews a public HTTPS certificate; DNS
must resolve and ports 80 and 443 must be reachable before certificate issuance.

## 3. Bootstrap once

Connect using the SSH key selected in the provider console. On the fresh VPS:

```sh
sudo apt-get update
sudo apt-get install -y git
sudo git clone https://github.com/Vagharshak777/team-ticket-hub.git /opt/ticket-poc
cd /opt/ticket-poc
sudo bash scripts/setup-server.sh YOUR-IP-WITH-DASHES.sslip.io
```

The script installs Docker from its official apt repository, prepares private state
and backup directories, creates the application network, performs the first deployment,
starts Caddy, and enables deployment and backup timers. Existing application volumes
are preserved. Use a fresh server/volume for the first installation; do not use this
script to adopt an unrecorded production deployment.

If the approved image cannot be pulled, setup stops before enabling timers. Fix
package visibility or GHCR login, then rerun. A pre-existing `.env` is preserved and
must contain the same `PUBLIC_HOST`, `COOKIE_SECURE=true` and `TRUST_PROXY=true`.
The proxy setting trusts one hop; keep app port 3001 loopback-only and the Docker
network private. Caddy sets the public Host and forwarded protocol for origin checks.

Open `https://YOUR-IP-WITH-DASHES.sslip.io` and create an account and a ticket.
The raw IP is not the HTTPS application address. Management services remain optional;
see the full runbook to enable them through an SSH tunnel.

## 4. Prove automatic delivery

Merge a small visible application change into `main`. After `publish` is green, allow
one polling interval plus pull/startup time. Check the public page and compare its
`/api/health/ready` revision to the merged commit. Confirm the original account and
ticket survive. This is the acceptance test for the live pipeline, not just a green CI.

```sh
sudo systemctl status ticket-deploy.timer ticket-backup.timer
sudo journalctl -u ticket-deploy.service -n 40 --no-pager
sudo journalctl -u ticket-backup.service -n 40 --no-pager
```

Polling updates application images, not the host checkout or Compose configuration.
Review infrastructure changes separately, pause deployment, update `/opt/ticket-poc`
with `git pull --ff-only`, and rerun the relevant setup steps before resuming.

## 5. Recovery and limits

Backups run daily at 02:00 UTC into `/var/backups/ticket-poc`. Run the restore drill
in the runbook and copy verified snapshots and metadata off-host. Daily local backups
alone do not protect against server loss. Operations lock contention now returns a
failure; the backup unit retries after a short delay. Check the unit journal for
failures; external alert delivery is not configured automatically.

For a rollback, pause polling using the same state directory as the timer:

```sh
sudo env STATE_DIR=/var/lib/ticket-poc BACKUP_DIR=/var/backups/ticket-poc python3 scripts/operations.py pause
sudo env STATE_DIR=/var/lib/ticket-poc BACKUP_DIR=/var/backups/ticket-poc python3 scripts/operations.py rollback
```

An explicit paused rollback attempts a snapshot, but can proceed if the broken app
cannot produce one; it logs `rollback_backup_unavailable` and preserves the data volume.
It does not reverse incompatible database changes. Leave deployment paused until the
release channel is corrected. Normal upgrades still stop if their backup fails.

The setup uses one application container and has brief deployment downtime. There is
no high availability, external monitoring, automatic off-host backup, or schema migration
rollback. These are follow-up work after the basic public pipeline has been exercised.

References: [Docker Ubuntu installation](https://docs.docker.com/engine/install/ubuntu/),
[Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https),
[free IP-based DNS](https://sslip.io/).
