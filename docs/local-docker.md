# Local Docker stack

Run these commands from the repository root. On this Mac, Docker Engine runs in
Colima with 4 CPUs, 6 GB RAM and a 60 GB data disk.

## Browser URLs

| Service | URL |
| --- | --- |
| Ticket Dashboard | <http://127.0.0.1:3001> |
| Grafana | <http://127.0.0.1:3000> |
| Provisioned container dashboard | <http://127.0.0.1:3000/d/ticket-poc> |
| Portainer | <https://127.0.0.1:9443> |
| Uptime Kuma | <http://127.0.0.1:3002> |
| Dozzle container logs | <http://127.0.0.1:8081> |
| Prometheus targets | <http://127.0.0.1:9090/targets> |
| cAdvisor | <http://127.0.0.1:8082> |

Monitoring login details are stored in `secrets/local-access.txt`, outside Git.
The app retains the accounts and tickets copied from the existing development
database. Its Docker database is stored separately in `ticket-poc-local-data`;
subsequent changes are not synchronized with `data/dashboard.sqlite`.
Portainer uses a self-signed certificate for its local HTTPS interface.

## Start or resume

```sh
colima start
docker network inspect ticket-poc-net >/dev/null 2>&1 || docker network create ticket-poc-net
docker compose --env-file .env -f compose.app.yml up -d --wait
docker compose --env-file .env -f compose.ops.yml -f compose.ops.local.yml up -d --wait
```

The private `.env` selects `ticket-dashboard:local`, port 3001 and the local data
volume. Keep port 3001 free when using this stack; `npm run dev` also uses it.
The operations override publishes Prometheus and cAdvisor only on loopback.
The native Linux operations deployment can continue using `compose.ops.yml` alone.

## Rebuild after application changes

```sh
docker build --build-arg APP_REVISION=local-workspace -t ticket-dashboard:local .
docker compose --env-file .env -f compose.app.yml up -d --wait
```

## Check or stop

```sh
docker compose --env-file .env -f compose.app.yml ps
docker compose --env-file .env -f compose.ops.yml -f compose.ops.local.yml ps
curl -fsS http://127.0.0.1:3001/api/health/ready
curl -fsS http://127.0.0.1:3000/api/health

docker compose --env-file .env -f compose.ops.yml -f compose.ops.local.yml down
docker compose --env-file .env -f compose.app.yml down
colima stop
```

These stop commands retain database and monitoring volumes.
