# POC acceptance evidence

## Public deployment follow-up (23 October 2026)

The `improve-public-deployment` changes were checked locally on the pinned Node
22.23.3: 12 Node tests and 15 Python tests passed, and the frontend build passed.
ShellCheck, actionlint 1.7.12 and all three Compose configurations passed. The public
gateway image digest was resolved from Docker Hub. Gitleaks reported no leaks in the
working tree. These checks do not establish that a VPS has been deployed.

The previous main run [39949193943](https://github.com/Vagharshak777/test-task/actions/runs/39949193943)
passed container build, persistence, graceful shutdown and restore tests, but publication
was blocked by fixable HIGH findings in the base image's bundled npm dependencies.
The follow-up removes runtime package managers; its Docker build and Trivy gate still
need a new CI run. Public HTTPS, automatic delivery to a VPS and emergency rollback
must be verified on the target server before marking the public pipeline complete.

See [public deployment](public-deployment.md) for setup and the live acceptance drill.

## Original implementation evidence

Implementation date: **23 October 2026**. Local validation used an isolated temporary
checkout and temporary SQLite databases. The existing developer database was not used.
The repository has not been pushed, and no remote service or timer has been activated.

| Check | Result | Evidence / remaining action |
| --- | --- | --- |
| Read three PDF plans | Passed | All 67 pages read; decisions in `implementation.md` |
| Clean locked installation | Passed | `npm ci` on checksum-verified Node 22.23.3 |
| Backend and SQLite tests | Passed | 11 Node tests, including a real process SIGTERM check |
| Deployment failure/state tests | Passed | 13 Python tests; Docker boundary simulated |
| Frontend production build | Passed | `npm run build` with Node 22.23.3 |
| Built frontend and asset responses | Passed | Real HTTP smoke check of homepage and referenced assets |
| Account, ticket and session persistence | Passed locally | Synthetic account/ticket verified after real process restart |
| Graceful shutdown | Passed locally | Three SIGTERM stops returned exit code 0 |
| Online WAL snapshot and restore | Passed locally | Snapshot from running app restored; original account/session/ticket verified |
| Image tag/digest metadata | Passed | Official registry manifest digests and Linux/amd64 entries checked |
| Compose configuration | Passed | Both projects validated with Compose 5.6.1 |
| Workflow syntax and expressions | Passed | actionlint 1.7.12 |
| Bash and YAML syntax | Passed | `bash -n` and YAML parser checks |
| Docker build and non-root runtime | Pending host | Docker Engine unavailable in this workspace; CI includes the exercise |
| Container recreation and fresh-volume restore | Pending host | `scripts/container-smoke.sh` implemented; Docker execution required |
| Failing PR blocks merge | Pending GitHub | Configure required `verify` check and demonstrate red/green PR |
| GHCR publication and Trivy gate | Pending GitHub | Run trusted main workflow; review report and digest |
| Unattended digest delivery and bad-image rollback | Pending Linux host | Unit coverage passes; perform real image failure exercise before enabling timer |
| Portainer initialization and stop/start | Pending Linux host | Create administrator and record screenshots |
| cAdvisor series and Grafana graphs | Pending Linux host | Verify actual host labels and changing CPU/memory/network values |
| Kuma outage/recovery notification | Pending owner/host | Select destination, configure credentials and measure real delivery |
| Dozzle authentication and log visibility | Pending Linux host | Generate users, verify login, view logs and check disabled actions |
| Reboot and timer recovery | Pending Linux host | Validate stable volumes, service restart and known release state |
| Off-host restore and handover | Pending operator | Copy verified snapshot/metadata off-host and rehearse recovery |

Actual Linux measurements: pipeline duration **unmeasured**; deployment duration
**unmeasured**; outage notification delay **unmeasured**; restore duration **unmeasured**.
Add dated workflow URLs and redacted screenshots/terminal results to the relevant rows
after execution. The full POC should not be signed off until the pending host and GitHub
checks pass.
