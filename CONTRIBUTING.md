# Contributing

Run `python3 scripts/check.py` before submitting changes. Install Git, Node.js 22+, Python 3, and Neovim for the full test suite. With Herdr installed, also run `python3 scripts/check.py --native` and inspect the changed UI in the app.

Keep common helper files synchronized with their marked embedded copies. Preserve explicit agent ownership, concurrent-edit checks, unsaved editor buffers, and exact pane navigation. Never add local credentials, sessions, user images, configuration state, or screenshots with private project data.

For releases, update both `manifest.json` and `package.json`, add a changelog entry, run checks, and build using `python3 scripts/release.py`. The distribution allowlist is in `scripts/release.py`; installation payloads are listed in `manifest.json`.

Please include reproduction steps and the Herdr GUI/core versions when reporting an issue.
