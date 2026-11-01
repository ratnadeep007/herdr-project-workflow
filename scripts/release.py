#!/usr/bin/env python3
"""Build a reproducible ZIP using an explicit distribution allowlist."""
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def release_files(root=ROOT):
    manifest = json.loads((root / "manifest.json").read_text())
    files = set(manifest["files"])
    files.update(["README.md", "LICENSE", "NOTICE", "CHANGELOG.md", "CONTRIBUTING.md",
                  "install.py", "manifest.json", "package.json", ".gitignore",
                  "project-identity.js", "workflow-tabs.js", "proj-workflow/SKILL.md"])
    for pattern in ["check-*.cjs", "scripts/*.py", "tests/test_*.py", "docs/*.md",
                    "examples/*.md", ".github/workflows/*.yml", ".github/workflow-templates/*.yml"]:
        files.update(p.relative_to(root).as_posix() for p in root.glob(pattern) if p.is_file())
    return sorted(files)


def build(root=ROOT):
    manifest = json.loads((root / "manifest.json").read_text())
    name = f"{manifest['name']}-{manifest['version']}"
    target = root / "dist" / (name + ".zip")
    target.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for relative in release_files(root):
            info = zipfile.ZipInfo(f"{name}/{relative}", date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, (root / relative).read_bytes())
    checksum = hashlib.sha256(target.read_bytes()).hexdigest()
    (target.parent / "SHA256SUMS").write_text(f"{checksum}  {target.name}\n")
    print(target)
    print(f"SHA256: {checksum}")
    return target


if __name__ == "__main__":
    build()
