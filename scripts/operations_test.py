import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from operations import Operator, REPOSITORY, require_image

A = REPOSITORY + "@sha256:" + "a" * 64
B = REPOSITORY + "@sha256:" + "b" * 64
C = REPOSITORY + "@sha256:" + "c" * 64


class FakeOperator(Operator):
    def __init__(self):
        super().__init__()
        self.actions = []
        self.bad_images = set()
        self.registry_down = False
        self.backup_failed = False
        self.disk_full = False

    def run(self, *args, **kwargs):
        self.actions.append(args)
        if args[:2] == ("docker", "pull") and self.registry_down:
            raise subprocess.CalledProcessError(1, args, stderr="sensitive-registry-output")
        if "{{json .RepoDigests}}" in args:
            return json.dumps([B])
        if "{{json .Config.Labels}}" in args:
            return json.dumps({"org.opencontainers.image.revision": "b" * 40})
        if args[:3] == ("docker", "volume", "ls"):
            return "ticket-poc-app-data\nticket-poc-restore-existing"
        return ""

    def compose(self, image, *args):
        self.actions.append(("compose", image, *args))
        return ""

    def verify(self, image, timeout=120):
        if image in self.bad_images:
            raise RuntimeError("Unhealthy candidate")
        return "b" * 40

    def backup(self, image, kind="daily"):
        self.actions.append(("backup", image, kind))
        if self.backup_failed:
            raise RuntimeError("Backup failed")

    def disk_check(self):
        if self.disk_full:
            raise RuntimeError("Disk full")


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.environment = patch.dict(os.environ, {
            "STATE_DIR": self.directory.name + "/state",
            "BACKUP_DIR": self.directory.name + "/backups",
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.quiet = contextlib.redirect_stdout(io.StringIO())
        self.quiet.__enter__()
        self.addCleanup(self.quiet.__exit__, None, None, None)
        self.operator = FakeOperator()
        self.operator.save({"current": A, "previous": C, "pending": None, "failed": None})

    def recreated(self):
        return [action[1] for action in self.operator.actions
                if action[0] == "compose" and action[2] == "up"]

    def test_success_updates_state_only_after_backup_and_verification(self):
        self.operator.deploy(B)
        self.assertEqual(self.recreated(), [B])
        self.assertEqual(self.operator.state(), {"current": B, "previous": A, "pending": None, "failed": None})
        backup_index = self.operator.actions.index(("backup", A, "predeploy"))
        up_index = next(i for i, a in enumerate(self.operator.actions) if a[:3] == ("compose", B, "up"))
        self.assertLess(backup_index, up_index)
        self.assertEqual(self.operator.state_path.stat().st_mode & 0o777, 0o600)

    def test_unhealthy_release_rolls_back_but_reports_failure(self):
        self.operator.bad_images.add(B)
        with self.assertRaisesRegex(RuntimeError, "rollback succeeded"):
            self.operator.deploy(B)
        self.assertEqual(self.recreated(), [B, A])
        self.assertEqual(self.operator.state(), {"current": A, "previous": C, "pending": None, "failed": B})
        self.operator.actions.clear()
        self.operator.poll()
        self.assertEqual(self.recreated(), [], "The same bad release must be suppressed.")

    def test_failed_rollback_preserves_current_and_pending_for_recovery(self):
        self.operator.bad_images.update([A, B])
        with self.assertRaisesRegex(RuntimeError, "operator action required"):
            self.operator.deploy(B)
        self.assertEqual(self.operator.state()["current"], A)
        self.assertEqual(self.operator.state()["pending"], B)
        self.operator.bad_images.clear()
        self.operator.actions.clear()
        self.operator.poll()
        self.assertEqual(self.recreated(), [A])
        self.assertIsNone(self.operator.state()["pending"])

    def test_registry_failure_never_changes_application_or_state(self):
        before = self.operator.state_path.read_bytes()
        self.operator.registry_down = True
        with self.assertRaises(subprocess.CalledProcessError):
            self.operator.poll()
        self.assertEqual(self.recreated(), [])
        self.assertEqual(self.operator.state_path.read_bytes(), before)

    def test_interrupted_rollout_recovers_before_contacting_unavailable_registry(self):
        state = self.operator.state()
        state["pending"] = B
        self.operator.save(state)
        self.operator.registry_down = True
        with self.assertRaises(subprocess.CalledProcessError):
            self.operator.poll()
        self.assertEqual(self.recreated(), [A])
        self.assertIsNone(self.operator.state()["pending"])
        self.assertEqual(self.operator.state()["failed"], B)

    def test_backup_failure_and_low_disk_abort_before_recreation(self):
        for condition in ["backup_failed", "disk_full"]:
            with self.subTest(condition=condition):
                setattr(self.operator, condition, True)
                with self.assertRaises(RuntimeError):
                    self.operator.deploy(B)
                setattr(self.operator, condition, False)
                self.assertEqual(self.recreated(), [])
                self.assertEqual(self.operator.state()["current"], A)
                self.assertIsNone(self.operator.state()["pending"])

    def test_pause_and_unchanged_digest_do_not_recreate(self):
        self.operator.pause_path.touch()
        self.operator.poll()
        self.assertEqual(self.operator.actions, [])
        self.operator.pause_path.unlink()
        self.operator.deploy(A)
        self.assertEqual(self.operator.actions, [])

    def test_interrupt_between_candidate_and_success_recovers_previous(self):
        state = self.operator.state()
        state["pending"] = B
        self.operator.save(state)
        self.operator.deploy(B)
        self.assertEqual(self.recreated(), [A])
        self.assertEqual(self.operator.state()["current"], A)
        self.assertEqual(self.operator.state()["failed"], B)

    def test_first_deployment_failure_stops_candidate_without_inventing_success(self):
        self.operator.save({"current": None, "previous": None, "pending": None, "failed": None})
        self.operator.bad_images.add(B)
        with self.assertRaises(RuntimeError):
            self.operator.deploy(B)
        self.assertIsNone(self.operator.state()["current"])
        self.assertIn(("compose", B, "stop", "app"), self.operator.actions)

    def test_rollback_requires_pause_and_recorded_previous_digest(self):
        with self.assertRaises(ValueError):
            self.operator.deploy(C, rollback=True)
        self.operator.pause_path.touch()
        with self.assertRaises(ValueError):
            self.operator.deploy(B, rollback=True)
        self.operator.deploy(C, rollback=True, retry=True)
        self.assertEqual(self.operator.state()["current"], C)

    def test_emergency_rollback_can_recover_when_current_backup_is_unavailable(self):
        self.operator.pause_path.touch()
        self.operator.backup_failed = True
        self.operator.deploy(C, rollback=True, retry=True)
        self.assertEqual(self.operator.state()["current"], C)
        self.assertIn(C, self.recreated())
        self.assertIn("rollback_backup_unavailable", (self.operator.state_dir / "history.jsonl").read_text())

    def test_unchanged_release_repairs_an_unhealthy_running_container(self):
        with patch.object(self.operator, "verify", side_effect=[RuntimeError("Not ready"), "a" * 40]):
            self.operator.deploy(A)
        self.assertEqual(self.recreated(), [A])
        self.assertEqual(self.operator.state()["current"], A)

    def test_invalid_image_reference_cannot_reach_docker(self):
        for image in [REPOSITORY + ":poc", REPOSITORY + "@sha256:abc", "evil.example/app@sha256:" + "a" * 64]:
            with self.assertRaises(ValueError):
                require_image(image)
        self.assertEqual(self.operator.actions, [])

    def test_restore_refuses_modified_snapshot_and_existing_volume(self):
        snapshot = Path(self.directory.name) / "backup.sqlite"
        snapshot.write_bytes(b"synthetic snapshot")
        metadata = {"integrity": "ok", "image": A, "sha256": self.operator.checksum(snapshot)}
        snapshot.with_suffix(".json").write_text(json.dumps(metadata))
        with self.assertRaisesRegex(ValueError, "already exists"):
            self.operator.restore(snapshot, "ticket-poc-restore-existing")
        snapshot.write_bytes(b"modified snapshot")
        with self.assertRaisesRegex(ValueError, "checksum"):
            self.operator.restore(snapshot, "ticket-poc-restore-new")
        self.assertFalse(any(a[:3] == ("docker", "volume", "create") for a in self.operator.actions))

    def test_nonblocking_lock_prevents_overlapping_operations(self):
        second = FakeOperator()
        with self.operator.lock() as acquired:
            self.assertTrue(acquired)
            with second.lock() as second_acquired:
                self.assertFalse(second_acquired)


if __name__ == "__main__":
    unittest.main()
