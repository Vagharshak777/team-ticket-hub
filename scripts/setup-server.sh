#!/usr/bin/env bash
# Run on a fresh Ubuntu 24.04 VPS from a reviewed /opt/ticket-poc checkout.
set -euo pipefail
public_host="${1:?Usage: sudo bash scripts/setup-server.sh PUBLIC_HOST}"
if [[ ! "$public_host" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z0-9-]+$ ]]; then
  echo 'Supply a DNS hostname, for example 203-0-113-10.sslip.io.' >&2
  exit 1
fi
if [[ "$EUID" != 0 ]]; then
  echo 'Run this script with sudo on the VPS.' >&2
  exit 1
fi
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(dirname "$script_dir")"
if [[ "$project_dir" != /opt/ticket-poc ]]; then
  echo 'Clone the reviewed repository into /opt/ticket-poc first.' >&2
  exit 1
fi
# shellcheck source=/dev/null
source /etc/os-release
if [[ "$ID" != ubuntu || "$VERSION_ID" != 24.04 ]]; then
  echo 'This bootstrap supports a fresh Ubuntu 24.04 server.' >&2
  exit 1
fi
if [[ "$(dpkg --print-architecture)" != amd64 ]]; then
  echo 'Choose an x86/amd64 VPS; the current release image is amd64.' >&2
  exit 1
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates wget git python3 jq
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  wget -q https://download.docker.com/linux/ubuntu/gpg -O /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  printf '%s\n' \
    'Types: deb' \
    'URIs: https://download.docker.com/linux/ubuntu' \
    "Suites: $VERSION_CODENAME" \
    'Components: stable' \
    "Architectures: $(dpkg --print-architecture)" \
    'Signed-By: /etc/apt/keyrings/docker.asc' > /etc/apt/sources.list.d/docker.sources
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version
systemctl enable --now docker
cd "$project_dir"
umask 077
export STATE_DIR=/var/lib/ticket-poc BACKUP_DIR=/var/backups/ticket-poc
install -d -m 700 "$STATE_DIR" "$BACKUP_DIR"
if [[ ! -f .env ]]; then
  printf '%s\n' \
    'APP_IMAGE=ticket-dashboard:local' 'APP_PORT=3001' \
    'APP_VOLUME=ticket-poc-app-data' 'POC_NETWORK=ticket-poc-net' \
    'COOKIE_SECURE=true' 'TRUST_PROXY=true' "PUBLIC_HOST=$public_host" > .env
fi
if ! docker compose --env-file .env -f compose.app.yml config --format json |
  jq -e '.services.app.environment | .COOKIE_SECURE == "true" and .TRUST_PROXY == "true"' >/dev/null; then
  echo 'Existing .env must set COOKIE_SECURE=true and TRUST_PROXY=true for public hosting.' >&2
  exit 1
fi
configured_host="$(docker compose --env-file .env -f compose.public.yml config --format json |
  jq -r '.services.caddy.environment.PUBLIC_HOST')"
if [[ "$configured_host" != "$public_host" ]]; then
  echo 'Existing .env PUBLIC_HOST differs; review it before rerunning setup.' >&2
  exit 1
fi
docker network inspect ticket-poc-net >/dev/null 2>&1 || docker network create ticket-poc-net
# Failure leaves timers disabled. Publish the image / configure registry reads, then rerun.
python3 scripts/operations.py poll
docker compose --env-file .env -f compose.public.yml up -d
install -m 644 systemd/ticket-deploy.service systemd/ticket-deploy.timer /etc/systemd/system/
install -m 644 systemd/ticket-backup.service systemd/ticket-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ticket-deploy.timer ticket-backup.timer
printf '\nPublic address: https://%s\nAutomatic deployment: every minute. Daily backups: 02:00 UTC.\n' "$public_host"
