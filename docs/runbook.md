# Ticket Dashboard operations

Run from the repository root on a dedicated Linux Docker host. The reference deployment
uses Linux/amd64, Docker Engine and a current Compose plugin supporting `up --wait`.
Python 3 is needed on the host; Node runs inside the application image. Start with 2 CPU
cores, 4 GB RAM and 30 GB free SSD space, then measure actual resource use.

## Prepare the host and repository

Install Docker from the [official distribution instructions](https://docs.docker.com/engine/install/).
Use a reviewed checkout containing these implementation files at `/opt/ticket-poc`.
Host administration and Docker access are privileged. The example systemd units run as
root on this lab host; restrict write access to the checkout and runtime state.

```sh
cd /opt/ticket-poc
docker version
docker compose version
python3 --version
df -h
docker info --format '{{.DockerRootDir}}'
```

Inspect Docker's storage root. Set `DOCKER_DATA_ROOT` in `.env` if it differs from
`/var/lib/docker`. cAdvisor's mounts and `/dev/kmsg` are for native Linux; validate its
metrics on that host. Docker Desktop is not the reference environment for host metrics.

Use a root operator shell for the managed commands below:

```sh
sudo -i
cd /opt/ticket-poc
export STATE_DIR=/var/lib/ticket-poc
export BACKUP_DIR=/var/backups/ticket-poc
install -d -m 700 "$STATE_DIR" "$BACKUP_DIR"
cp .env.example .env
chmod 600 .env
docker network inspect ticket-poc-net >/dev/null 2>&1 || docker network create ticket-poc-net
```

The same `STATE_DIR`, `BACKUP_DIR`, checkout, `.env`, network and app volume must be
used for every manual command and timer. Defaults without these exports are repository
local `.state/` and `backups/`. The `.env` file is read by Compose; export host-script
settings in the shell or configure them in the unit files.

Before the first managed deployment, use a fresh `ticket-poc-app-data` volume. If an
older deployment already owns data, make and verify a database-aware backup and agree
on adoption before replacing it. The README local Docker example uses a different
`ticket-poc-local-data` volume. Stop that local project to release port 3001.

## Configure GitHub and publish the first image

Commit and merge the reviewed implementation through a PR. In repository settings,
require the workflow's `verify` check on main and require review where supported.
Demonstrate a red check in a temporary PR, then fix it. Keep PR jobs on GitHub-hosted
runners. Do not register this Docker host as a PR runner.

The main workflow checks the source, builds a candidate image, checks persistence and
restore, and scans the same release image it publishes. Trivy reports all vulnerabilities
to a JSON artifact. Fixable HIGH/CRITICAL findings or scanner failures block publication
and promotion. There are no preapproved vulnerability exceptions. Review findings and
update dependencies or image pins through PRs; do not disable the gate to make it green.

Only the publish job has `packages: write`. It uses `GITHUB_TOKEN`, publishes a source
SHA tag and moves `poc` only when that SHA is still main's head. Releases are serialized.
An older successful run can retain its source tag without changing the promotion tag.
The run summary and short-lived artifact record the registry digest and source SHA.

Set the GHCR package's visibility to public if anonymous polling is intended. Confirm
an unauthenticated pull separately; repository visibility does not configure package
visibility. For a private package, provision a host credential restricted to package
reads outside Git. The implementation has not changed either visibility setting.

## First manual deployment

Copy the approved digest from the successful workflow summary. Replace the placeholder:

```sh
./scripts/deploy.sh ghcr.io/vagharshak777/team-ticket-hub@sha256:REPLACE_WITH_64_HEX_DIGEST
curl -fsS http://127.0.0.1:3001/api/health/ready
docker compose --env-file .env -f compose.app.yml ps
cat "$STATE_DIR/release.json"
```

`deploy.sh` accepts only a full digest from the expected repository. It validates Compose,
checks disk space, pulls the candidate and validates its source label. Subsequent releases
first check the current app and take a consistent pre-deployment snapshot. It recreates
only `app`, waits for Docker health, then checks readiness, the homepage and revision.

State is committed after verification. On failure, the script recreates the last successful
image and verifies it. The command exits nonzero even after successful rollback. If the
first deployment fails, it stops the candidate and records no successful release. An
interrupted operation leaves `pending` state; the next operation recovers the last known
release before considering another candidate. A rollback failure keeps `pending` for
operator recovery and must be investigated immediately.

Avoid running app `up` using the example image from `.env` after a managed deployment.
For manual Compose work, load the recorded image explicitly:

```sh
export APP_IMAGE="$(python3 -c 'import json,os; print(json.load(open(os.environ["STATE_DIR"] + "/release.json"))["current"])')"
docker compose --env-file .env -f compose.app.yml logs --tail=100 app
```

The scripts supply the candidate/current image directly to Compose; they do not rewrite
`.env`. Successful current/previous digests, pending candidate and most recently failed
digest live in `release.json`. `history.jsonl` records deployment and backup outcomes.

## Start operations tools

Generate Grafana and Dozzle credentials interactively:

```sh
python3 scripts/setup-secrets.py
docker compose --env-file .env -f compose.ops.yml config --quiet
docker compose --env-file .env -f compose.ops.yml up -d
docker compose --env-file .env -f compose.ops.yml ps
```

The helper asks for unique passwords and preserves existing files. It passes Dozzle's
password through stdin to the pinned image's generator, without Docker socket access.
The generated Dozzle account has view-only roles; shell and actions are also disabled
on the server. Secrets are ignored by Git and excluded from the image build context.

The `secrets/` directory is mode 0700. Its files are readable by the container users
because local Compose file secrets are bind mounts; a host mode-0600 root file cannot
be read by Grafana's UID 472. Keep the directory private. Bootstrap passwords do not
reset an existing Grafana database; manage subsequent password changes through Grafana.

Complete Portainer and Kuma's first-run administrator setup promptly through their
loopback ports. Portainer uses 9443; the Edge Agent port is not published. Portainer
inspects CLI-managed containers and can stop/start the app, while Git and Compose remain
the authority for lasting configuration and releases.

Portainer and Dozzle have Docker socket access. A `:ro` socket bind does not restrict
Docker API permissions. cAdvisor has privileged Linux host mounts. Keep all of these
on the trusted lab host; their UI ports bind to loopback. Prometheus and cAdvisor have
no published host ports.

For access from another laptop, substitute the real SSH user and host:

```sh
ssh -L 3001:127.0.0.1:3001 -L 3000:127.0.0.1:3000 \
  -L 9443:127.0.0.1:9443 -L 3002:127.0.0.1:3002 \
  -L 8081:127.0.0.1:8081 operator@poc-host
```

Open the localhost URLs listed in the README after the tunnel is established.

## Verify metrics, availability and logs

Grafana's provisioned **Ticket POC / Ticket Dashboard · Containers** dashboard uses
Prometheus at `http://prometheus:9090`. CPU is measured in cores; memory in bytes;
network panels show bytes per second. Inspect available cAdvisor labels on the actual
host. The queries use Compose project/service labels, avoiding changing container IDs.
Allow several scrapes for rate queries. Missing resource series show **No data**. A zero
fresh-app count means the app has no recent series or collection is unavailable; check
scrape health alongside it. There are no API latency or error-rate metrics in this baseline.

Prometheus keeps at most seven days or approximately 2 GB of time series. Docker logs
rotate at 10 MB × 3 files per container. These limits do not cap image storage, SQLite
WAL files, tool databases or backups; check `df -h` and `docker system df` daily.

In Kuma, create an HTTP monitor for:

```text
http://app:3001/api/health/ready
```

Use a 30-second interval and one retry after the first failed check, then confirm the
selected Kuma release's behavior with a measured outage. Configure the agreed email
or messaging notification destination in Kuma and send a test alert. Notification
credentials and the real recipient are intentionally host configuration. A second
homepage monitor can check that frontend files are served.

Dozzle should show JSON startup, request, shutdown and unexpected-error events. Trigger
a safe 404 or validation error and correlate the generated `X-Request-ID` with the log.
Successful health probes are suppressed. Logs omit raw paths, query strings, bodies,
passwords, cookies and user records. Rotated or removed container logs are not a durable
archive. Kuma on this same host cannot notify during total host or internet failure.

## Pause, deploy and roll back

```sh
python3 scripts/operations.py pause
systemctl stop ticket-deploy.timer ticket-deploy.service
```

The pause flag is created even if another operation holds the lock. An in-progress
deployment can finish; stopping the service may instead leave a pending candidate.
Inspect state before intentional maintenance. Use the same pause procedure before
stopping the app for the outage demo so polling cannot undo the exercise.

To roll back to the recorded previous successful image while paused:

```sh
python3 scripts/operations.py rollback
curl -fsS http://127.0.0.1:3001/api/health/ready
```

The rollback command accepts only the recorded previous digest and attempts a backup
before replacement. Explicit paused rollback can continue when that backup is unavailable;
it records `rollback_backup_unavailable` and preserves the original volume. Normal upgrades
still require a successful backup. An image rollback cannot undo an incompatible schema change.
The POC deliberately preserves the existing schema.

Unattended polling suppresses the most recent failed digest until a new release arrives.
After fixing the external cause, an operator can deliberately retry while unpaused:

```sh
python3 scripts/operations.py resume
./scripts/deploy.sh ghcr.io/vagharshak777/team-ticket-hub@sha256:REPLACE_WITH_REVIEWED_DIGEST --retry
```

Resuming the timer while `poc` still identifies a newer release can replace a deliberate
rollback. Leave maintenance paused until the promoted channel is suitable to follow.

## Back up and restore

```sh
./scripts/backup.sh
```

The backup helper opens the existing SQLite database read-only and uses its online
backup API, including live WAL changes. It rejects a missing or unrelated source,
checks `PRAGMA integrity_check`, then copies the snapshot outside the app volume.
Metadata records checksum, timestamp, revision, schema version and image digest.
Backups and metadata are mode 0600. Keep seven helper-created daily snapshots and the
most recent pre-deployment snapshot. Copy a verified pair to protected off-host storage
to cover host/disk loss. The scripts do not configure an off-host destination.

For a restore drill, keep production running and create an isolated volume. Choose a
snapshot path actually returned by the helper:

```sh
./scripts/restore.sh /var/backups/ticket-poc/REPLACE_WITH_SNAPSHOT.sqlite ticket-poc-restore-drill
docker network create ticket-poc-restore-net
```

Restore checks the checksum and database integrity, fixes ownership for the non-root
app, and refuses to overwrite an existing volume. It uses the image recorded in snapshot
metadata unless `--image` supplies an explicitly reviewed compatible digest.

Start the restored instance with that same image and an isolated project, port and
network. Set `SNAPSHOT` to the real snapshot file first:

```sh
SNAPSHOT=/var/backups/ticket-poc/REPLACE_WITH_SNAPSHOT.sqlite
RESTORE_IMAGE="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["image"])' "${SNAPSHOT%.sqlite}.json")"
APP_IMAGE="$RESTORE_IMAGE" APP_VOLUME=ticket-poc-restore-drill APP_PORT=3101 \
  POC_NETWORK=ticket-poc-restore-net docker compose --env-file .env \
  -p ticket-restore -f compose.app.yml up -d --wait
```

Open port 3101 locally or add an SSH tunnel. Verify login, a known ticket, checklist
content and session persistence. Record restore duration and snapshot time. The separate
network prevents the restored `app` DNS alias from confusing production Kuma checks.
Stop the restore project after the drill using the same environment settings and
`down`, retaining its volume until the evidence has been reviewed.

For real data recovery, pause both timers, stop the production app, preserve its original
volume, perform the drill above, and review the resulting records before switching
production's `APP_VOLUME`. Never copy only the active main SQLite file or erase the
original volume as part of ordinary recovery.

## Enable timers after acceptance

After a successful manual release, second release, rollback and restore drill:

```sh
install -m 644 systemd/ticket-deploy.service systemd/ticket-deploy.timer /etc/systemd/system/
install -m 644 systemd/ticket-backup.service systemd/ticket-backup.timer /etc/systemd/system/
systemctl daemon-reload
python3 scripts/operations.py resume
systemctl enable --now ticket-deploy.timer ticket-backup.timer
systemctl list-timers ticket-deploy.timer ticket-backup.timer
journalctl -u ticket-deploy.service -u ticket-backup.service -n 50 --no-pager
```

Deployment polls after boot and once per minute after an invocation ends. Backups run
at 02:00 UTC daily (06:00 in Armenia) and catch up after a missed run. All host operations
use one nonblocking lock. Contention returns failure; the backup service retries after
five minutes. Check its recorded success. Review failed systemd units and `history.jsonl` daily;
deployment errors are local journal/state signals, without an automatically configured
notification channel. The units are bounded but a slow or interrupted operation can
leave `pending` state for the next invocation to recover.

## Troubleshooting and demo

| Symptom | Check and action |
| --- | --- |
| App unreachable | Confirm HOST=0.0.0.0 inside Docker, published port and Docker health |
| SQLite permission error | Inspect stable volume identity, UID 1000 ownership and free disk |
| Missing frontend | Check `dist/` and assets in the image; readiness alone checks only SQLite access |
| Pull denied | Check GHCR package visibility and host read access |
| Failed release repeats | Inspect failed/pending state and journal; investigate before `--retry` |
| Grafana has no data | Inspect scrape health, cAdvisor mounts/labels, datasource and time range |
| Grafana cannot read secret | Ensure the private parent directory and container-readable file modes |
| Kuma cannot reach app | Use Docker DNS `app:3001`, the correct shared network and ready endpoint |
| Portainer initial setup expired | Restart only Portainer, then complete administrator setup promptly |
| HTTPS writes return 403 | Validate the proxy Host/protocol boundary before configuring proxy trust |

Public HTTPS is a separate extension: configure one trusted reverse proxy, secure
cookies, forwarded headers and client identity together, then test real browser writes
and rejection of foreign origins. Do not globally enable Express `trust proxy`.

For the 15–20 minute demo, show PR red/green checks, an approved digest and revision,
the original ticket surviving an upgrade, Grafana metrics, Dozzle logs and Portainer
container state. Pause deployment, stop/start the app, show Kuma DOWN/UP and real
notifications, then confirm the original ticket. Finish with restore evidence and a
rollback. Record measured pipeline, deployment, detection and restoration durations in
[POC_ACCEPTANCE.md](POC_ACCEPTANCE.md). Avoid routine volume pruning or `down -v`.
