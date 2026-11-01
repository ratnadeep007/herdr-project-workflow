#!/usr/bin/env python3
"""Install or restore the workflow without replacing unrelated Herdr state."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent


def digest(path):
    if path.is_symlink():
        return "symlink:" + os.readlink(path)
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".workflow-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(data)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def install_plan(args):
    manifest = json.loads((ROOT / "manifest.json").read_text())
    plan = []
    for relative in manifest["files"]:
        source = ROOT / relative
        if args.no_usage and relative.startswith("usage-status/"):
            continue
        target = args.home / ("mods/" + relative if relative.split("/")[0] in manifest["mods"] else relative)
        data = source.read_bytes()
        if args.no_usage and relative == "layouts/project-workflow.json":
            layout = json.loads(data)
            def walk(node):
                if node.get("id") == "status":
                    node["content"]["mod"] = "workspace-status"
                for child in node.get("children", []):
                    walk(child)
            walk(layout)
            data = (json.dumps(layout, indent=2) + "\n").encode()
        plan.append((target, data))
    skill = (ROOT / "proj-workflow/SKILL.md").read_bytes()
    if args.skills in ("codex", "both"):
        plan.append((args.codex_home / "skills/proj-workflow/SKILL.md", skill))
    if args.skills in ("claude", "both"):
        plan.append((args.claude_home / "skills/proj-workflow/SKILL.md", skill))
    return manifest, plan


def restore(backup, dry_run=False):
    record = json.loads((backup / "install.json").read_text())
    # Check every destination before touching any: retain post-install user edits.
    changed = [entry["target"] for entry in record["entries"]
               if digest(Path(entry["target"])) != entry["installed"]]
    if changed:
        raise RuntimeError("Restore stopped: files changed since installation:\n" + "\n".join(changed))
    for entry in reversed(record["entries"]):
        target = Path(entry["target"])
        print("Restore" if entry["existed"] else "Remove", target)
        if dry_run:
            continue
        if entry["existed"]:
            original = backup / entry["backup"]
            if original.is_symlink():
                target.unlink(missing_ok=True)
                target.symlink_to(os.readlink(original))
            else:
                atomic_write(target, original.read_bytes())
        else:
            target.unlink(missing_ok=True)
    return record


def install(args):
    manifest, plan = install_plan(args)
    for target, _ in plan:
        if target.exists() and not (target.is_file() or target.is_symlink()):
            raise RuntimeError(f"Destination is not a file: {target}")
        print("Install", target)
    if args.dry_run:
        print("Dry run: no files changed.")
        return None
    if not args.skip_check and not shutil.which("herdr-app"):
        raise RuntimeError("herdr-app must be on PATH. Use --skip-check only for an offline install.")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    backup = args.home / "workflow-backups" / stamp
    backup.mkdir(parents=True)
    record = {"version": manifest["version"], "entries": []}
    try:
        for index, (target, data) in enumerate(plan):
            existed = os.path.lexists(target)
            relative = f"files/{index}"
            if existed:
                original = backup / relative
                original.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, original, follow_symlinks=False)
            entry = {"target": str(target), "existed": existed, "backup": relative,
                     "installed": hashlib.sha256(data).hexdigest()}
            atomic_write(target, data)
            record["entries"].append(entry)
            atomic_write(backup / "install.json", (json.dumps(record, indent=2) + "\n").encode())
        if not args.skip_check:
            for mod in manifest["mods"]:
                if args.no_usage and mod == "usage-status":
                    continue
                subprocess.run(["herdr-app", "check", str(args.home / "mods" / mod)], check=True, timeout=30)
    except Exception:
        if record["entries"]:
            restore(backup)
        raise
    print(f"Installed {manifest['name']} {manifest['version']}.")
    print(f"Backup: {backup}")
    print(f"Undo: python3 install.py --restore {str(backup)!r}")
    if args.activate:
        environment = {**os.environ, "HERDR_APP_HOME": str(args.home)}
        subprocess.run(["herdr-app", "do", "layout.switch", '{"name":"project-workflow"}'],
                       env=environment, check=True, timeout=15)
    else:
        print('Activate: herdr-app do layout.switch \'{"name":"project-workflow"}\'')
    return backup


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--home", type=Path, default=Path(os.environ.get("HERDR_APP_HOME", "~/.config/herdr-app")).expanduser())
    parser.add_argument("--skills", choices=["none", "codex", "claude", "both"], default="none")
    parser.add_argument("--codex-home", type=Path, default=Path(os.environ.get("CODEX_HOME", "~/.codex")).expanduser())
    parser.add_argument("--claude-home", type=Path, default=Path(os.environ.get("CLAUDE_CONFIG_DIR", "~/.claude")).expanduser())
    parser.add_argument("--no-usage", action="store_true", help="Use the stock status bar; do not install account usage polling")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-check", action="store_true", help="Skip native checks when Herdr is unavailable")
    parser.add_argument("--activate", action="store_true", help="Switch the running Herdr window to the installed layout")
    parser.add_argument("--restore", type=Path, help="Restore a backup, refusing to overwrite subsequent edits")
    args = parser.parse_args()
    args.home = args.home.expanduser().absolute()
    args.codex_home = args.codex_home.expanduser().absolute()
    args.claude_home = args.claude_home.expanduser().absolute()
    try:
        if args.restore:
            restore(args.restore.expanduser(), args.dry_run)
            print("Files restored. Switch to another layout, or restart Herdr, if needed.")
        else:
            install(args)
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"Installation failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
