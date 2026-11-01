# Herdr Project Workflow

A project workspace for [Herdr](https://github.com/herdrdev/herdr-app): group agents by project and role, track `tasks.md` on a Kanban board, review commit diffs, and reuse a Neovim editor tab.

Independent community customization. Tested with **Herdr GUI 0.1.11 and herdr-core 0.1.16 on macOS**. Linux support is experimental; the native image chooser and Claude Keychain fallback use macOS tools. Windows is not supported by the editor integration.

## What it adds

- **Project sidebar:** collapsible projects and roles, agent logos, exact pane navigation, pane counts, and current assigned tasks. Ordinary shells remain separate. Internal subagents appear only once they have their own pane.
- **Project identity:** stable initials/colors, emoji or custom image overrides, parent paths for duplicate names, and stack details on hover.
- **Agent launcher:** choose an installed agent, Planner / Implementer / Reviewer / custom role, and a name. Role suffixes are added without duplication. Starting an agent explicitly opens a new tab and gives it role instructions to await your task.
- **Kanban:** Todo / In progress / Review / Done directly from a Markdown checklist. Each top-level task is one self-contained commit; nested subtasks stay in that card, with progress and details on hover. No separate task database.
- **Diff reviews:** working-tree or commit changes, file tree, drag-to-select line ranges, saved review comments, and explicit delivery to a planner or selected agent.
- **Reusable tabs:** repeated Diff clicks focus the existing tab. Open files in one managed Neovim editor, preserving unsaved buffers.
- **Usage pills:** Claude and Codex five-hour remaining percentages; weekly usage and reset details on hover. Optional at installation.
- **Agent skill:** `/proj-workflow` in Claude Code or `$proj-workflow` in Codex creates or updates `spec.md` and board-compatible `tasks.md`.

## Requirements

Install Herdr GUI and herdr-core first. Ensure `herdr-app`, `hc`, `git`, and `python3` are on the GUI's shell PATH. Install `nvim` to use Editor; install and sign in to whichever agents you want to launch. Node.js 22+ is needed only for development tests.

The package uses Herdr's existing built-in mods and icons, and does not include the Herdr application or agent binaries.

## Install

Clone this repository, or download and extract the ZIP from [Releases](https://github.com/ratnadeep007/herdr-project-workflow/releases).

```sh
git clone https://github.com/ratnadeep007/herdr-project-workflow.git
cd herdr-project-workflow
python3 install.py --dry-run --skills both
python3 install.py --skills both --activate
```

Herdr should be running for `--activate`. Without that flag, installation does not change your selected layout. Switch later with Ctrl–Shift–L or:

```sh
herdr-app do layout.switch '{"name":"project-workflow"}'
```

Skill installation is opt-in: `--skills codex`, `claude`, or `both`; the default installs neither. Existing files at the same skill path are backed up. Restart your agent or open a fresh session to discover a newly installed skill.

To omit account usage polling:

```sh
python3 install.py --no-usage --skills both --activate
```

Use `--home /path/to/herdr-config` (or `HERDR_APP_HOME`) for another window's config. `--codex-home` and `--claude-home` override skill destinations; `CODEX_HOME` and `CLAUDE_CONFIG_DIR` are respected. `--skip-check` allows offline file installation when Herdr is unavailable; validate the mods when Herdr is installed.

### Backups, updates, and removal

The installer replaces only this package's mod files, its `project-workflow` layout, and explicitly selected skill files. It preserves existing files in a timestamped `workflow-backups` directory. It leaves sessions, project icons, shared state, settings, other layouts, and agent credentials in place.

Run the installer again to update. Keep its printed backup path. To undo that installation:

```sh
python3 install.py --restore /path/printed/by/the/installer
```

Restore refuses to overwrite files edited since that installation. Back up or reconcile those edits first. Restore updates files; it does not terminate terminals or automatically switch layouts. Switch to another layout if removing this one.

## Start a project

1. Open your project in Herdr. Click **+**, choose an agent, select its role, and give it a name.
2. Invoke `/proj-workflow` or `$proj-workflow` with your project brief to prepare planning files.
3. Open **Tasks** under that project. Tasks appears once a parsed checklist exists at the detected Git root.
4. Open **Diff** to review changes. Use **Editor** or **Open in nvim** to work in the project's reusable editor.
5. Click the project's icon to customize its identity.

Example `tasks.md`:

```markdown
- [ ] T1 — Reject invalid email addresses <!-- herdr:{"state":"todo","agent":null} -->
  - [ ] Add validation and accessible field feedback.
  - [ ] Add tests for valid, invalid, and empty input.
  - [ ] Verify and review the complete change.
  Acceptance: invalid email prevents submission; valid email can be submitted.
  Commit: `feat: validate email addresses (T1)`.
```

Use actual live terminal addresses for ownership. Keep parent tasks flush left and indent their subtasks. Implementation, tests, documentation, and review fixes for one parent are committed together; review is a stage of that same card. See [the complete example](examples/tasks.md). Card ownership does not send a prompt or start work. The board refreshes about every five seconds. See [the detailed guide](docs/usage.md) for review delivery, task ownership, pane grouping, and editor behavior.

## Account data and local state

The optional usage widget asks the local Codex app-server for account rate limits. Claude usage reads the current local OAuth login (credentials file, or macOS Keychain fallback) and calls Anthropic's OAuth usage endpoint. This integration depends on provider interfaces that can change. Missing CLI/login/network access shows unavailable usage.

Tokens are not written or displayed by the helper. Credentials are used only for their provider's request. The package has no telemetry or separate hosted service. Review drafts, role assignments, fold state, and project identities stay in Herdr's local state. Custom images are copied into Herdr's `mods/project-icon/assets` directory; local configuration, credentials, and user images are excluded from release archives.

Sending a diff review requires an explicit **Send review** action and uses `hc send`. Task edits compare the previous file contents to avoid overwriting concurrent changes. Remote task boards are read-only in the GUI. Historical diffs open the current working-tree file in Neovim; deleted files report an error.

## Develop and package

```sh
python3 scripts/check.py
python3 scripts/check.py --native  # additionally requires installed Herdr
python3 scripts/release.py
```

Checks cover mixed panes, large boards, diff comments and routing, tab reuse, real headless Neovim buffer preservation, agent naming, project identities, installer restore/rollback, and release contents. GitHub Actions runs the portable checks and builds the ZIP; see [CI details](docs/ci.md).

The release builder uses an allowlist and creates a reproducible ZIP plus `dist/SHA256SUMS`. Generated API definitions, caches, backups, local state, and custom images are omitted. `project-identity.js` and `workflow-tabs.js` are embedded into mods for Herdr's isolated runtime; their tests reject drift.

## License

Apache-2.0. Includes modified Herdr mods; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
