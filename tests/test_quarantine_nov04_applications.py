from contextlib import redirect_stderr
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import runpy
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/quarantine-nov04-applications.py"
PII = "PRIVATE_TEST_CONTACT_012345"


def encode(data):
    return json.dumps(data, indent=2, ensure_ascii=False).encode()


def row(identifier, date, attachment=None):
    return {
        "id": identifier,
        "createdAt": date,
        "updatedAt": date,
        "name": PII,
        "contact": PII,
        "status": "new",
        "assignedSalesId": None,
        "membershipExpiresAt": None,
        "membershipEvents": [],
        "internalBookings": [],
        "adminNote": "",
        "salesNote": "",
        "attachments": [attachment] if attachment else [],
    }


class QuarantineTest(unittest.TestCase):
    def setUp(self):
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        self.root = Path(scratch.name)
        self.data = self.root / "advisor-data"
        self.data.mkdir()
        self.ledger = self.data / "applications.json"
        self.uploads = self.root / "advisor-uploads"
        self.uploads.mkdir()
        self.archive = self.root / "predeploy.json"
        self.quarantine = self.root / "isolated"
        self.attack = []
        for index in range(89):
            name = f"{index:024x}.png"
            identifier = f"ARK-20261103-{index:06X}"
            upload = self.uploads / identifier / name
            attachment = {"id": f"{index:016x}", "displayName": PII, "storageName": name, "type": "image/png", "size": 6}
            if index < 88:
                upload.parent.mkdir()
                upload.write_bytes(b"sample")
            date = "2026-11-03T17:15:25.337Z" if index == 88 else "2026-11-03T16:03:38.000Z"
            self.attack.append(row(identifier, date, attachment if index < 88 else None))
        old = [
            row("ARK-20261001-000001", "2026-10-01T10:00:00.000Z"),
            row("ARK-20261002-000001", "2026-10-02T10:00:00.000Z"),
        ]
        self.archive.write_bytes(encode(old + self.attack))
        later = row("ARK-20261120-000001", "2026-11-20T10:00:00.000Z")
        retained_old = {**old[0], "status": "qualified", "note": "新版汉字"}
        self.retained = [retained_old, later, old[1]]
        self.original = encode([retained_old, *self.attack, later, old[1]])
        self.ledger.write_bytes(self.original)
        self.orphan = self.data / "applications.json.private-untouched.tmp"
        self.orphan.write_bytes(b"stale")
        self.sha = hashlib.sha256(self.archive.read_bytes()).hexdigest()

    def run_command(self, *flags, archive=None):
        command = [
            sys.executable, str(SCRIPT), "--ledger", str(self.ledger), "--uploads", str(self.uploads),
            "--quarantine-dir", str(self.quarantine), "--archive", str(archive or self.archive), *flags,
        ]
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        self.assertNotIn(PII, result.stdout + result.stderr)
        return result

    def assert_unmodified(self):
        self.assertEqual(self.ledger.read_bytes(), self.original)
        self.assertFalse(self.quarantine.exists())
        self.assertEqual(len(list(self.uploads.iterdir())), 88)
        self.assertEqual(self.orphan.read_bytes(), b"stale")

    def test_dry_run_digests_apply_and_rollback_preserve_all_unselected_records(self):
        preview = self.run_command()
        self.assertEqual(preview.returncode, 0, preview.stderr)
        result = json.loads(preview.stdout)
        self.assertEqual(result["archive_sha256"], self.sha)
        self.assertEqual(result["candidate_count"], 89)
        self.assertEqual(result["attachment_count"], 88)
        self.assertEqual(result["retained_count"], 3)
        self.assert_unmodified()
        self.assertNotEqual(self.run_command("--apply", "--expected-sha256", "0" * 64).returncode, 0)
        self.assert_unmodified()
        applied = self.run_command("--apply", "--expected-sha256", self.sha)
        self.assertEqual(applied.returncode, 0, applied.stderr)
        self.assertEqual(json.loads(self.ledger.read_bytes()), self.retained)
        self.assertEqual(json.loads((self.quarantine / "advisor-data/applications.json").read_bytes()), self.attack)
        backup = self.quarantine / "backup/advisor-data/applications.json"
        self.assertEqual(backup.read_bytes(), self.original)
        self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o600)
        self.assertEqual(stat.S_IMODE(self.quarantine.stat().st_mode), 0o700)
        self.assertFalse(any(self.uploads.iterdir()))
        self.assertEqual(len(list((self.quarantine / "advisor-uploads").glob("*/*.png"))), 88)
        self.assertEqual(self.orphan.read_bytes(), b"stale")

        rolled_back = self.run_command("--rollback", "--expected-sha256", self.sha)
        self.assertEqual(rolled_back.returncode, 0, rolled_back.stderr)
        self.assertEqual(self.ledger.read_bytes(), self.original)
        self.assertEqual(len(list(self.uploads.iterdir())), 88)
        self.assertEqual(backup.read_bytes(), self.original)

    def test_tar_input_resolves_only_the_application_member_and_rejects_link(self):
        archive = self.root / "predeploy.tar.gz"
        with tarfile.open(archive, "w:gz") as bundle:
            content = self.archive.read_bytes()
            entry = tarfile.TarInfo("./archive/advisor-data/applications.json")
            entry.size = len(content)
            bundle.addfile(entry, io.BytesIO(content))
        preview = self.run_command("--expected-sha256", self.sha, archive=archive)
        self.assertEqual(preview.returncode, 0, preview.stderr)
        self.assertEqual(json.loads(preview.stdout)["archive_sha256"], self.sha)
        archive = self.root / "link.tar"
        with tarfile.open(archive, "w") as bundle:
            entry = tarfile.TarInfo("advisor-data/applications.json")
            entry.type = tarfile.SYMTYPE
            entry.linkname = PII
            bundle.addfile(entry)
        self.assertNotEqual(self.run_command(archive=archive).returncode, 0)
        self.assert_unmodified()

    def test_business_reference_blocks_apply(self):
        cases = self.root / "service-case-data"
        cases.mkdir()
        (cases / "service-cases.json").write_bytes(encode([{"customerId": self.attack[0]["id"], "note": PII}]))
        self.assertNotEqual(self.run_command("--apply", "--expected-sha256", self.sha).returncode, 0)
        self.assert_unmodified()

    def test_changed_candidate_and_symlink_attachment_are_refused(self):
        rows = json.loads(self.original)
        rows[1]["assignedSalesId"] = PII
        self.ledger.write_bytes(encode(rows))
        self.assertNotEqual(self.run_command("--apply", "--expected-sha256", self.sha).returncode, 0)
        self.assertFalse(self.quarantine.exists())
        self.ledger.write_bytes(self.original)
        first = next((self.uploads / self.attack[0]["id"]).iterdir())
        first.unlink()
        first.symlink_to(self.ledger)
        self.assertNotEqual(self.run_command("--apply", "--expected-sha256", self.sha).returncode, 0)
        self.assert_unmodified()

    def test_apply_refuses_to_race_another_quarantine_process(self):
        directory_fd = os.open(self.data, os.O_RDONLY | os.O_DIRECTORY)
        try:
            fcntl.flock(directory_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.run_command("--apply", "--expected-sha256", self.sha)
            self.assertNotEqual(result.returncode, 0)
            self.assert_unmodified()
        finally:
            os.close(directory_fd)

    def test_rename_failure_restores_already_moved_directories(self):
        module = runpy.run_path(str(SCRIPT))
        args = [
            "--ledger", str(self.ledger), "--uploads", str(self.uploads), "--quarantine-dir",
            str(self.quarantine), "--archive", str(self.archive), "--apply", "--expected-sha256", self.sha,
        ]
        real_rename = os.rename
        moved = []

        def intermittently_failing_rename(source, destination):
            if Path(source).parent.resolve() == self.uploads.resolve():
                if len(moved) == 4:
                    raise OSError(PII)
                moved.append(source)
            return real_rename(source, destination)

        messages = io.StringIO()
        with patch("os.rename", side_effect=intermittently_failing_rename), redirect_stderr(messages):
            result = module["main"](args)
        self.assertNotEqual(result, 0)
        self.assertEqual(len(moved), 4)
        self.assertNotIn(PII, messages.getvalue())
        self.assertEqual(self.ledger.read_bytes(), self.original)
        self.assertEqual((self.quarantine / "backup/advisor-data/applications.json").read_bytes(), self.original)
        self.assertEqual(len(list(self.uploads.iterdir())), 88)
        self.assertFalse(any((self.quarantine / "advisor-uploads").iterdir()))

    def test_rollback_refuses_to_overwrite_new_live_writes(self):
        applied = self.run_command("--apply", "--expected-sha256", self.sha)
        self.assertEqual(applied.returncode, 0, applied.stderr)
        next_live = encode(self.retained + [row("ARK-20261122-000001", "2026-11-22T12:00:00.000Z")])
        self.ledger.write_bytes(next_live)
        rolled_back = self.run_command("--rollback", "--expected-sha256", self.sha)
        self.assertNotEqual(rolled_back.returncode, 0)
        self.assertEqual(self.ledger.read_bytes(), next_live)
        self.assertFalse(any(self.uploads.iterdir()))


if __name__ == "__main__":
    unittest.main()
