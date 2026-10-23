#!/usr/bin/env python3
"""Linux host operations. Only the Python standard library and Docker are needed."""
import argparse
import contextlib
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
REPOSITORY = "ghcr.io/vagharshak777/team-ticket-hub"
IMAGE_PATTERN = re.compile(re.escape(REPOSITORY) + r"@sha256:[a-f0-9]{64}\Z")


def require_image(image):
    if not IMAGE_PATTERN.fullmatch(image):
        raise ValueError("Use a sha256 digest from " + REPOSITORY)
    return image


def atomic_json(path, value):
    descriptor, temporary = tempfile.mkstemp(prefix=".write-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w") as output:
            json.dump(value, output, sort_keys=True)
            output.write("\n")
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


class Operator:
    def __init__(self):
        self.state_dir = Path(os.environ.get("STATE_DIR", ROOT / ".state")).resolve()
        self.backup_dir = Path(os.environ.get("BACKUP_DIR", ROOT / "backups")).resolve()
        self.env_file = Path(os.environ.get("ENV_FILE", ROOT / ".env")).resolve()
        self.state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.backup_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.state_path = self.state_dir / "release.json"
        self.pause_path = self.state_dir / "paused"

    def run(self, *args, image=None, timeout=120):
        env = dict(os.environ)
        if image:
            env["APP_IMAGE"] = image
        return subprocess.run(args, check=True, capture_output=True, text=True,
                              timeout=timeout, env=env).stdout.strip()

    def compose(self, image, *args):
        return self.run("docker", "compose", "--project-directory", str(ROOT),
                        "--env-file", str(self.env_file if self.env_file.exists() else Path("/dev/null")),
                        "-f", str(ROOT / "compose.app.yml"), *args, image=image, timeout=150)

    def state(self):
        if not self.state_path.exists():
            return {"current": None, "previous": None, "pending": None, "failed": None}
        value = json.loads(self.state_path.read_text())
        for key in ["current", "previous", "pending", "failed"]:
            if value.get(key):
                require_image(value[key])
        return value

    def save(self, state):
        atomic_json(self.state_path, state)

    def record(self, event, **fields):
        record = {"timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  "event": event, **fields}
        with (self.state_dir / "history.jsonl").open("a") as output:
            output.write(json.dumps(record, sort_keys=True) + "\n")
        print(json.dumps(record), flush=True)

    @contextlib.contextmanager
    def lock(self):
        with (self.state_dir / "operations.lock").open("a") as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                print("Another operation is running; skipped.")
                yield False
                return
            yield True

    def config(self, image):
        return json.loads(self.compose(image, "config", "--format", "json"))

    def base_url(self, image):
        ports = self.config(image)["services"]["app"]["ports"]
        port = next(p for p in ports if p["target"] == 3001)
        if port.get("host_ip") != "127.0.0.1":
            raise ValueError("The managed app must publish only on 127.0.0.1.")
        return "http://127.0.0.1:" + str(port["published"])

    def revision(self, image):
        labels = json.loads(self.run("docker", "image", "inspect", image,
                                    "--format", "{{json .Config.Labels}}"))
        revision = labels.get("org.opencontainers.image.revision", "")
        if not re.fullmatch(r"[a-f0-9]{40}", revision):
            raise ValueError("The image must contain a full source revision label.")
        return revision

    def verify(self, image, timeout=120):
        revision = self.revision(image)
        base = self.base_url(image)
        deadline = time.monotonic() + timeout
        while True:
            try:
                with urllib.request.urlopen(base + "/api/health/ready", timeout=4) as response:
                    health = json.load(response)
                if health.get("status") != "ok" or health.get("revision") != revision:
                    raise ValueError("Readiness does not match the candidate revision.")
                with urllib.request.urlopen(base + "/", timeout=4) as response:
                    if response.status != 200 or 'id="root"' not in response.read().decode():
                        raise ValueError("The built frontend is missing.")
                return revision
            except Exception:
                if time.monotonic() >= deadline:
                    raise RuntimeError("Readiness, frontend or revision verification failed.") from None
                time.sleep(2)

    def disk_check(self):
        docker_root = self.run("docker", "info", "--format", "{{.DockerRootDir}}")
        minimum = int(os.environ.get("MIN_FREE_KB", "1048576")) * 1024
        for directory in [self.state_dir, self.backup_dir, Path(docker_root)]:
            if shutil.disk_usage(directory).free < minimum:
                raise RuntimeError("Insufficient disk space; deployment aborted before recreation.")

    def backup(self, image, kind="daily"):
        self.verify(image, timeout=0)
        self.disk_check()
        container = self.compose(image, "ps", "-q", "app")
        if not re.fullmatch(r"[a-f0-9]{12,64}", container):
            raise RuntimeError("Cannot identify the running application container.")
        name = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex
        source = "/app/data/.snapshot-" + name + ".sqlite"
        target = self.backup_dir / (kind + "-" + name + ".sqlite")
        partial = target.with_suffix(".partial")
        try:
            metadata = json.loads(self.run("docker", "exec", "--user", "node", container,
                "node", "/app/scripts/db-backup.mjs", "/app/data/dashboard.sqlite", source, timeout=75))
            self.run("docker", "cp", container + ":" + source, str(partial))
            partial.chmod(0o600)
            if metadata.get("integrity") != "ok" or self.checksum(partial) != metadata["sha256"]:
                raise RuntimeError("Backup checksum or integrity verification failed.")
            metadata.update({"image": image, "kind": kind})
            os.replace(partial, target)
            atomic_json(target.with_suffix(".json"), metadata)
            self.record("backup_succeeded", snapshot=str(target), image=image, kind=kind)
            self.prune_backups(kind, 7 if kind == "daily" else 1)
            return target
        finally:
            partial.unlink(missing_ok=True)
            # Remove only this operation's temporary snapshot from the data volume.
            try:
                self.run("docker", "exec", "--user", "node", container, "node", "-e",
                         "require('node:fs').rmSync(process.argv[1],{force:true})", source)
            except Exception:
                self.record("backup_temporary_cleanup_failed")

    @staticmethod
    def checksum(path):
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def prune_backups(self, kind, keep):
        # Never remove files outside the helper's verified naming and metadata scheme.
        pattern = re.compile(re.escape(kind) + r"-\d{8}T\d{6}Z-[a-f0-9]{32}\.sqlite\Z")
        candidates = []
        for path in self.backup_dir.glob(kind + "-*.sqlite"):
            meta = path.with_suffix(".json")
            if pattern.fullmatch(path.name) and meta.is_file():
                candidates.append(path)
        for old in sorted(candidates, reverse=True)[keep:]:
            old.unlink()
            old.with_suffix(".json").unlink()

    def apply(self, image):
        self.compose(image, "config", "--quiet")
        self.compose(image, "up", "-d", "--no-deps", "--pull", "never",
                     "--wait", "--wait-timeout", "120", "app")
        return self.verify(image)

    def recover_pending(self, state):
        if not state.get("pending"):
            return
        candidate = state["pending"]
        if state.get("current"):
            self.apply(state["current"])
        else:
            self.compose(candidate, "stop", "app")
        state.update({"pending": None, "failed": candidate})
        self.save(state)
        self.record("interrupted_deployment_recovered", candidate=candidate, current=state["current"])

    def deploy(self, image, retry=False, rollback=False):
        require_image(image)
        if self.pause_path.exists() and not rollback:
            self.record("deployment_paused")
            return
        state = self.state()
        self.recover_pending(state)
        current = state.get("current")
        if image == current:
            try:
                self.verify(image, timeout=0)
            except RuntimeError:
                self.record("release_repair_started", image=image)
                self.apply(image)
                self.record("release_repaired", image=image)
                return
            self.record("release_unchanged", image=image)
            return
        if state.get("failed") == image and not retry:
            self.record("failed_release_suppressed", image=image)
            return
        if rollback and (not self.pause_path.exists() or image != state.get("previous")):
            raise ValueError("Pause deployment, then roll back to the recorded previous digest.")
        self.disk_check()
        self.run("docker", "pull", image, timeout=90)
        revision = self.revision(image)
        self.compose(image, "config", "--quiet")
        if current:
            try:
                self.backup(current, "predeploy")
            except Exception:
                if not rollback:
                    raise
                # Explicit, paused emergency rollback preserves the volume even
                # when a broken app cannot serve probes or create a snapshot.
                self.record("rollback_backup_unavailable", image=current)
        self.disk_check()
        state["pending"] = image
        self.save(state)
        try:
            self.apply(image)
        except Exception:
            # Successful state is preserved even if rollback itself fails.
            state["failed"] = image
            self.save(state)
            try:
                if current:
                    self.apply(current)
                else:
                    self.compose(image, "stop", "app")
                state["pending"] = None
                self.save(state)
                recovered = True
            except Exception:
                recovered = False
            self.record("deployment_failed", candidate=image, current=current, rollback_ok=recovered)
            raise RuntimeError("Deployment failed; rollback " + ("succeeded." if recovered else "FAILED; operator action required.")) from None
        state.update({"previous": current, "current": image, "pending": None, "failed": None})
        self.save(state)
        self.record("deployment_succeeded", image=image, previous=current, revision=revision)

    def poll(self):
        if self.pause_path.exists():
            self.record("deployment_paused")
            return
        # Recover a local interrupted rollout even if the registry is unavailable.
        self.recover_pending(self.state())
        # Pull failure cannot alter containers or successful release state.
        self.run("docker", "pull", REPOSITORY + ":poc", timeout=90)
        digests = json.loads(self.run("docker", "image", "inspect", REPOSITORY + ":poc",
                                     "--format", "{{json .RepoDigests}}"))
        matches = [digest for digest in digests if IMAGE_PATTERN.fullmatch(digest)]
        if len(matches) != 1:
            raise ValueError("Expected exactly one digest for the approved repository.")
        self.deploy(matches[0])

    def restore(self, snapshot, volume, image=None):
        snapshot = Path(snapshot).resolve(strict=True)
        metadata = json.loads(snapshot.with_suffix(".json").read_text())
        if metadata.get("integrity") != "ok" or self.checksum(snapshot) != metadata.get("sha256"):
            raise ValueError("Snapshot checksum or metadata is invalid.")
        image = require_image(image or metadata["image"])
        if not re.fullmatch(r"ticket-poc-restore-[a-zA-Z0-9_-]+", volume):
            raise ValueError("Use a new volume named ticket-poc-restore-<name>.")
        volumes = self.run("docker", "volume", "ls", "--format", "{{.Name}}").splitlines()
        if volume in volumes:
            raise ValueError("The restore volume already exists; it will not be overwritten.")
        self.run("docker", "pull", image, timeout=90)
        self.run("docker", "volume", "create", volume)
        helper = "ticket-poc-restore-" + uuid.uuid4().hex
        script = """const fs=require('node:fs'); const {DatabaseSync}=require('node:sqlite');
const p='/app/data/dashboard.sqlite'; const db=new DatabaseSync(p,{readOnly:true});
const rows=db.prepare('PRAGMA integrity_check').all();
if(rows.length!==1 || rows[0].integrity_check!=='ok') throw Error('Invalid snapshot');
for(const t of ['users','tickets','sessions']) db.prepare('SELECT 1 FROM '+t+' LIMIT 1').get();
db.close(); for(const f of fs.readdirSync('/app/data')) { fs.chownSync('/app/data/'+f,1000,1000); }
fs.chownSync('/app/data',1000,1000); fs.chmodSync(p,0o600);"""
        try:
            self.run("docker", "create", "--name", helper, "--network", "none", "--user", "0",
                     "--mount", "type=volume,src=" + volume + ",dst=/app/data", "--entrypoint", "node", image, "-e", script)
            self.run("docker", "cp", str(snapshot), helper + ":/app/data/dashboard.sqlite")
            self.run("docker", "start", "-a", helper)
        finally:
            self.run("docker", "rm", "-f", helper)
        self.record("restore_created", volume=volume, image=image, snapshot=str(snapshot))
        print("Start a separate Compose project with APP_VOLUME=" + volume + " and APP_PORT=3101; verify login and a known ticket.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    deploy = commands.add_parser("deploy")
    deploy.add_argument("image")
    deploy.add_argument("--retry", action="store_true")
    commands.add_parser("poll")
    commands.add_parser("backup")
    commands.add_parser("pause")
    commands.add_parser("resume")
    commands.add_parser("rollback")
    restore = commands.add_parser("restore")
    restore.add_argument("snapshot")
    restore.add_argument("volume")
    restore.add_argument("--image")
    args = parser.parse_args()
    os.umask(0o077)
    operator = Operator()
    if args.command == "pause":
        # Set the flag even when a deployment currently owns the operations lock.
        operator.pause_path.touch(mode=0o600)
        operator.record("deployment_paused")
        return
    with operator.lock() as acquired:
        if not acquired:
            raise RuntimeError("Another operation is running; retry this operation.")
        if args.command == "deploy":
            operator.deploy(args.image, retry=args.retry)
        elif args.command == "poll":
            operator.poll()
        elif args.command == "backup":
            current = operator.state().get("current")
            if not current:
                raise ValueError("Deploy a recorded release before creating a scheduled backup.")
            operator.backup(current)
        elif args.command == "resume":
            operator.pause_path.unlink(missing_ok=True)
            operator.record("deployment_resumed")
        elif args.command == "rollback":
            previous = operator.state().get("previous")
            if not previous:
                raise ValueError("No previous successful digest is recorded.")
            operator.deploy(previous, retry=True, rollback=True)
        elif args.command == "restore":
            operator.restore(args.snapshot, args.volume, args.image)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # subprocess stdout/stderr can contain credentials; do not dump it.
        message = str(error) if isinstance(error, (ValueError, RuntimeError)) else type(error).__name__
        print(json.dumps({"event": "operation_failed", "error": message}), file=sys.stderr)
        sys.exit(1)
