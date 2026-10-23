# Implementation decisions

The user asked to read the three supplied PDFs and build the proposed setup. All
three documents were read: the 20-page blueprint, the 22-page Ticket Dashboard plan
and the newer 25-page implementation plan. Their examples were treated as reference
material. Instructions to create public packages, alter repository settings, contact
collaborators or install a Linux host were not executed from the documents.

The 25-page `DevOps_POC_Implementation_Plan.pdf` supplies the baseline where the
documents differ. Its deployment algorithm provides more complete failure handling.

| Topic | Selected behavior |
| --- | --- |
| Layout | Root `compose.app.yml` and `compose.ops.yml`, separate Compose projects |
| Runtime | Node 22.23.3 in CI and both Docker stages; official image digest pinned |
| Release channel | `poc` announces an approved release; deployments use `@sha256` |
| Source tag | `sha-<full-commit-SHA>`; no automatic publication from PRs |
| Workflows | One workflow with `publish` depending on `verify`, avoiding cross-workflow races |
| Promotion | Serialized, non-cancelled publishing; recheck main head before promotion |
| Vulnerability gate | Report all findings; block fixable HIGH/CRITICAL findings and scan failures |
| Health | Separate live/ready routes; `/api/health` and `/health` retained as ready aliases |
| App port | 3001 on host loopback, overridable with `APP_PORT` |
| Host scripts | Small Bash entry points and a Python standard-library implementation |
| State | One atomically replaced JSON file for current, previous, pending and failed digests |
| Lock | Nonblocking `flock` through Python `fcntl`, shared by deploy, backup and restore |
| Backup | Node's SQLite online backup API, integrity check, checksum and revision metadata |
| Restore | Fresh volume only, never overwrite an existing production volume |
| Timer | Once per minute after the previous invocation ends; disabled until operator enables it |
| Credentials | File-based Grafana password, generated Dozzle bcrypt user; no default passwords |
| Networking | Loopback UI ports; only Kuma joins the application network |
| Metrics | Container CPU, working-set memory, RX/TX, scrape health and fresh app series |

Image version tags and multi-platform manifest digests were read from the official
registries on **23 October 2026**. Their presence and Linux/amd64 platform entries were
verified. Runtime compatibility and metric labels still need a Linux Docker exercise.
The exact digests are recorded in the Dockerfile, operations Compose file and workflow.

The app's schema and UI behavior were preserved. New request logs use route templates
and generated IDs, without raw paths, query strings, bodies, cookies or profile data.
Unexpected error messages are omitted because SQL errors can contain user input.

The app remains a single-host POC. Schema rollback, public HTTPS, Loki/Alloy, host
exporters and an independent external uptime monitor remain follow-on work. No timer,
GitHub ruleset, public package, alert integration or remote deployment was activated by
this implementation.

Primary references checked during implementation:

- [Node 22 SQLite backup API](https://nodejs.org/download/release/v22.23.3/docs/api/sqlite.html#sqlitebackupsourceDb-destination-options)
- [Official Node container variants](https://github.com/nodejs/docker-node)
- [cAdvisor host integration](https://github.com/google/cadvisor#quick-start-running-cadvisor-in-a-docker-container)
- [Dozzle simple authentication](https://dozzle.dev/guide/authentication/simple)
- [Dozzle password input implementation](https://github.com/amir20/dozzle/blob/v11.3.4/internal/cli/generate_command.go)
- [Trivy image and archive scanning](https://trivy.dev/docs/latest/target/container_image/)
- [GitHub Actions checkout releases](https://github.com/actions/checkout/releases/tag/v7.0.1)
- [GitHub Actions setup-node releases](https://github.com/actions/setup-node/releases/tag/v7.1.0)
- [Portainer CE releases](https://github.com/portainer/portainer/releases/tag/2.45.2)
- [Prometheus releases](https://github.com/prometheus/prometheus/releases/tag/v3.15.1)
- [Grafana releases](https://github.com/grafana/grafana/releases/tag/v13.2.4)
- [Uptime Kuma releases](https://github.com/louislam/uptime-kuma/releases/tag/2.5.6)
