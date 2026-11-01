# GitHub Actions

`.github/workflows/ci.yml` runs checks on pushes and pull requests. It tests on Ubuntu with Node.js 22, Python 3.11, and Neovim, then uploads a distribution ZIP and checksums as workflow artifacts.

Native Herdr checks still run locally on a machine with Herdr installed:

```sh
python3 scripts/check.py --native
```

Changes to Actions workflows require an appropriate GitHub credential: use an authorized SSH key, or an OAuth token with the `workflow` scope.
