#!/usr/bin/env bash
# Use the same scan and gate on PRs and on the exact image being published.
set -euo pipefail
image="${1:?Pass a locally built image}"
scanner="${TRIVY:-aquasec/trivy:0.76.1@sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c}"
scan_dir="$(mktemp -d)"
trap 'rm -rf -- "$scan_dir"' EXIT
mkdir -p reports .trivy-cache
docker save "$image" -o "$scan_dir/image.tar"
docker run --rm -v "$scan_dir/image.tar:/image.tar:ro" \
  -v "$PWD/reports:/reports" -v "$PWD/.trivy-cache:/cache" "$scanner" \
  image --input /image.tar --cache-dir /cache --scanners vuln \
  --format json --output /reports/trivy.json --exit-code 0 --timeout 5m
docker run --rm -v "$scan_dir/image.tar:/image.tar:ro" \
  -v "$PWD/.trivy-cache:/cache" "$scanner" \
  image --input /image.tar --cache-dir /cache --scanners vuln --skip-db-update \
  --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --timeout 5m
