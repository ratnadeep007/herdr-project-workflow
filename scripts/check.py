#!/usr/bin/env python3
"""Run portable regressions; --native also checks mods with Herdr installed."""
import argparse
import ast
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native", action="store_true")
    args = parser.parse_args()
    for path in ROOT.rglob("*.py"):
        if ".git" not in path.parts and "dist" not in path.parts:
            ast.parse(path.read_text(), filename=str(path))
    manifest = json.loads((ROOT / "manifest.json").read_text())
    for mod in manifest["mods"]:
        subprocess.run(["node", "--input-type=module", "--check"],
                       input=(ROOT / mod / "main.js").read_text(), text=True, check=True)
    for path in sorted(ROOT.glob("check-*.cjs")):
        subprocess.run(["node", str(path)], cwd=ROOT, check=True, timeout=60)
    subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"],
                   cwd=ROOT, check=True, timeout=60)
    if args.native:
        for mod in manifest["mods"]:
            subprocess.run(["herdr-app", "check", str(ROOT / mod)], check=True, timeout=30)
    print("All checks passed.")


if __name__ == "__main__":
    main()
