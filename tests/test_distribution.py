import argparse
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import install

spec = importlib.util.spec_from_file_location("release", ROOT / "scripts/release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class DistributionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.args = argparse.Namespace(home=root / "herdr", skills="both",
            codex_home=root / "codex", claude_home=root / "claude", no_usage=False,
            dry_run=False, skip_check=True, activate=False)

    def tearDown(self):
        self.temp.cleanup()

    def quietly(self, function, *args):
        with contextlib.redirect_stdout(io.StringIO()):
            return function(*args)

    def test_install_restore_preserves_state_and_previous_files(self):
        original = self.args.home / "mods/project-hub/main.js"
        original.parent.mkdir(parents=True)
        original.write_text("existing customization")
        state = self.args.home / "shared.json"
        state.write_text('{"private":"local state"}')
        unrelated = self.args.home / "mods/other/main.js"
        unrelated.parent.mkdir(parents=True)
        unrelated.write_text("unrelated")
        backup = self.quietly(install.install, self.args)
        self.assertNotEqual(original.read_text(), "existing customization")
        self.assertTrue((self.args.codex_home / "skills/proj-workflow/SKILL.md").is_file())
        self.assertEqual(state.read_text(), '{"private":"local state"}')
        self.quietly(install.restore, backup)
        self.assertEqual(original.read_text(), "existing customization")
        self.assertEqual(unrelated.read_text(), "unrelated")
        self.assertFalse((self.args.home / "layouts/project-workflow.json").exists())

    def test_dry_run_has_no_writes(self):
        self.args.dry_run = True
        self.quietly(install.install, self.args)
        self.assertFalse(self.args.home.exists())
        self.assertFalse(self.args.codex_home.exists())

    def test_restore_refuses_subsequent_edits_before_removing_anything(self):
        backup = self.quietly(install.install, self.args)
        changed = self.args.home / "mods/project-hub/main.js"
        changed.write_text("user edit")
        with self.assertRaisesRegex(RuntimeError, "files changed"):
            install.restore(backup)
        self.assertEqual(changed.read_text(), "user edit")
        self.assertTrue((self.args.home / "layouts/project-workflow.json").exists())

    def test_native_check_failure_rolls_back(self):
        self.args.skip_check = False
        with patch.object(install.shutil, "which", return_value="herdr-app"), \
             patch.object(install.subprocess, "run", side_effect=RuntimeError("check failed")):
            with self.assertRaisesRegex(RuntimeError, "check failed"):
                self.quietly(install.install, self.args)
        self.assertFalse((self.args.home / "mods/project-hub/main.js").exists())

    def test_no_usage_and_no_skills(self):
        self.args.no_usage = True
        self.args.skills = "none"
        self.quietly(install.install, self.args)
        layout = json.loads((self.args.home / "layouts/project-workflow.json").read_text())
        self.assertIn('"mod": "workspace-status"', json.dumps(layout))
        self.assertFalse((self.args.home / "mods/usage-status").exists())
        self.assertFalse(self.args.codex_home.exists())

    def test_symlink_file_is_restored_without_overwriting_original(self):
        destination = self.args.home / "mods/project-hub/main.js"
        destination.parent.mkdir(parents=True)
        original = Path(self.temp.name) / "original.js"
        original.write_text("keep original")
        destination.symlink_to(original)
        backup = self.quietly(install.install, self.args)
        self.assertFalse(destination.is_symlink())
        self.assertEqual(original.read_text(), "keep original")
        self.quietly(install.restore, backup)
        self.assertTrue(destination.is_symlink())

    def test_release_contains_only_portable_sources(self):
        files = release.release_files()
        self.assertIn("project-tabs/win-close.svg", files)
        self.assertIn("usage-status/usage.py", files)
        self.assertIn("proj-workflow/SKILL.md", files)
        for relative in files:
            self.assertNotIn("__pycache__", relative)
            self.assertNotIn("assets/", relative)
            self.assertNotIn("gpui-kit.d.ts", relative)
            self.assertNotIn(b"/" + b"Users/", (ROOT / relative).read_bytes(), relative)
        self.assertEqual(len(files), len(set(files)))


if __name__ == "__main__":
    unittest.main()
