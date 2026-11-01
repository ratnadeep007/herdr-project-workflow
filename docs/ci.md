# Enable GitHub Actions

The repository includes `.github/workflow-templates/checks.yml`. To enable it:

```sh
mkdir -p .github/workflows
cp .github/workflow-templates/checks.yml .github/workflows/ci.yml
git add .github/workflows/ci.yml
git commit -m "Enable workflow checks"
git push
```

Use a GitHub credential allowed to create workflows (OAuth tokens require the `workflow` scope), or create the file through GitHub's web editor. The initial publishing credential did not have that scope, so this repository ships the template without enabling Actions.

The workflow runs the portable tests on Ubuntu with Node.js, Python, and Neovim, then uploads a distribution ZIP and checksums. Native Herdr checks still run locally on a machine with Herdr installed.
