#!/usr/bin/env bash
# Run only against disposable containers and volumes, including on GitHub-hosted CI.
set -euo pipefail
image="${1:?Pass the locally built image tag}"
task_dir="$(mktemp -d)"
nonce="$(basename "$task_dir" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')"
container="ticket-ci-$nonce"
volume="ticket-ci-data-$nonce"
restore_volume="ticket-ci-restore-$nonce"
restored="ticket-ci-restored-$nonce"
cleanup() {
  docker rm -f "$container" "$restored" >/dev/null 2>&1 || true
  docker volume rm "$volume" "$restore_volume" >/dev/null 2>&1 || true
  # Only this run's synthetic account, snapshot and metadata are removed.
  rm -rf -- "$task_dir"
}
trap cleanup EXIT
docker volume create "$volume" >/dev/null
docker volume create "$restore_volume" >/dev/null
start() {
  docker run -d --name "$container" --mount "type=volume,src=$volume,dst=/app/data" \
    -p 127.0.0.1::3001 "$image" >/dev/null
}
wait_ready() {
  local attempt
  for ((attempt=0; attempt<40; attempt++)); do
    if [ "$(docker inspect --format '{{.State.Health.Status}}' "$1")" = healthy ]; then
      return
    fi
    sleep 2
  done
  docker logs "$1" >&2
  return 1
}
base_url() {
  printf 'http://%s' "$(docker port "$1" 3001/tcp)"
}
start
wait_ready "$container"
test "$(docker exec "$container" id -u)" != 0
node scripts/smoke-test.mjs "$(base_url "$container")" seed "$task_dir/account.json"
docker exec "$container" node /app/scripts/db-backup.mjs \
  /app/data/dashboard.sqlite /app/data/ci-snapshot.sqlite > "$task_dir/backup.json"
docker cp "$container:/app/data/ci-snapshot.sqlite" "$task_dir/snapshot.sqlite"
docker stop --time 30 "$container" >/dev/null
test "$(docker inspect --format '{{.State.ExitCode}}' "$container")" = 0
docker rm "$container" >/dev/null
start
wait_ready "$container"
node scripts/smoke-test.mjs "$(base_url "$container")" verify "$task_dir/account.json"
# Restore into another volume and confirm both the persisted session and ticket.
docker create --name "$restored" --user 0 --entrypoint node \
  --mount "type=volume,src=$restore_volume,dst=/app/data" "$image" -e \
  "const fs=require('node:fs');for(const f of fs.readdirSync('/app/data'))fs.chownSync('/app/data/'+f,1000,1000);fs.chownSync('/app/data',1000,1000)" >/dev/null
docker cp "$task_dir/snapshot.sqlite" "$restored:/app/data/dashboard.sqlite"
docker start -a "$restored"
docker rm "$restored" >/dev/null
docker run -d --name "$restored" --mount "type=volume,src=$restore_volume,dst=/app/data" \
  -p 127.0.0.1::3001 "$image" >/dev/null
wait_ready "$restored"
node scripts/smoke-test.mjs "$(base_url "$restored")" verify "$task_dir/account.json"
