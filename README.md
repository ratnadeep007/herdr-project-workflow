# Herdr Project Workflow

A project workspace for [Herdr](https://github.com/herdrdev/herdr-app): group agents by project and role, track `tasks.md` on a Kanban board, review commit diffs, and reuse a Neovim editor tab.

Independent community customization. Tested with **Herdr GUI 0.1.11 and herdr-core 0.1.16 on macOS**. Linux support is experimental; the native image chooser and Claude Keychain fallback use macOS tools. Windows is not supported by the editor integration.

## What it adds

- **Project sidebar:** collapsible projects and roles, agent logos, exact pane navigation, pane counts, and current assigned tasks. When the sidebar is hidden, a **Projects** button in the tab bar opens the same information in a popup. Ordinary shells remain separate. Internal subagents appear only once they have their own pane.
- **Project identity:** stable initials/colors, emoji or custom image overrides, parent paths for duplicate names, and stack details on hover.
- **Worktrunk worktrees:** **+ → New worktree…** creates or switches a checkout with `wt`. Enter a worktree name and optional branch override, then choose an agent from a grid with logos or **None — shell only**. Agents also get a role and optional tab name. The branch defaults to the worktree name.
- **Agent launcher:** choose an installed agent, Planner / Implementer / Reviewer / custom role, and a name. Role suffixes are added without duplication. Starting an agent explicitly opens a new tab and gives it role instructions to await your task.
- **Kanban:** Todo / In progress / Review / Done directly from a Markdown checklist. Each top-level task is one self-contained commit; nested subtasks stay in that card, with progress and details on hover. No separate task database.
- **Diff reviews:** working-tree or commit changes, file tree, drag-to-select line ranges, saved review comments, and explicit delivery to a planner or selected agent.
- **Reusable tabs:** repeated Diff clicks focus the existing tab. Open files in one managed Neovim editor, preserving unsaved buffers.
- **Usage pills:** Claude and Codex five-hour remaining percentages; weekly usage and reset details on hover. Optional at installation.
- **Agent skill:** `/proj-workflow` in Claude Code or `$proj-workflow` in Codex creates or updates `spec.md` and board-compatible `tasks.md`.

## Requirements

Install Herdr GUI and herdr-core first. Ensure `herdr-app`, `hc`, `git`, and `python3` are on the GUI's shell PATH. Install [Worktrunk](https://worktrunk.dev/) (`wt`, tested with v0.77.0) to use the worktree launcher. Install `nvim` to use Editor; install and sign in to whichever agents you want to launch. Node.js 22+ is needed only for development tests.

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

## Switch with the sidebar hidden

Click **Projects** on the left side of the tab bar when the sidebar is hidden. The same popup can also be opened with `herdr-app do mod.open '{"name":"project-hub"}'`. To bind it to **⌘P**, merge `"cmd-p": "mod.open:project-hub"` into the `global` object in your Herdr `keys.json` (use your preferred key on other platforms). This replaces that key’s existing picker binding; preserve the other entries in the file. The shortcut works with the sidebar either visible or hidden. The **Projects & agents** popup reuses the sidebar view: project icons, roles, agent status, task labels, pane counts, nested shells/programs, and Tasks / Diff / Editor actions.

Expand or collapse groups as usual; their fold state is shared with the sidebar. Selecting a project, tab, or individual pane switches directly there and closes the popup. Escape, the close button, or clicking outside dismisses it. Opening the popup does not reopen or resize the sidebar.

Keyboard controls in the popup:

| Key | Action |
| --- | --- |
| ↑ / ↓ | Move the highlight through visible projects, groups, tabs, and panes |
| → | Expand a group, or move into its first child |
| ← | Collapse a group, or move to its parent |
| Enter | Switch to the highlighted project, tab, or pane; toggle a role group |
| Space | Toggle the highlighted group |
| Home / End | Jump to the first or last item |
| Escape | Close the popup |

The selected row stays visible as you navigate. Moving the highlight does not switch your active project until you press Enter.

## Create a worktree with an agent or shell

From a Git project, choose **+ → New worktree…** in the tab bar:

1. Enter a **Worktree name**. The branch defaults to this name; enter a **Branch** override if needed.
2. Choose an agent from the three-column grid with logos. Installed agents appear first; unavailable agents are disabled and marked **Not installed**. Scroll the grid to see more supported agents.
3. Choose **Planner**, **Implementer**, **Reviewer**, or a custom **Other** role. Optionally enter a tab name; the role suffix is added without duplication.
4. Click **Create / switch & start**.

For a plain terminal, choose **None — shell only**, optionally name its tab, and click **Create / switch & open shell**. Mode controls are hidden, and no agent prompt or role is assigned. Herdr opens the shell configured for that machine.

For example, worktree name `auth-ui` with a blank branch creates branch `auth-ui`; a branch override of `feature/auth-ui` uses that Git branch while keeping `auth-ui` as the Herdr space name. The checkout directory follows Worktrunk's configured branch-based path template. An existing local branch is switched to using `wt switch`; a missing one uses `wt switch --create` and Worktrunk's default base.

Worktrunk's `--execute` callback confirms the switched working directory before Herdr starts the chosen agent there. No shell `cd`, manual `git worktree add`, or persistent Worktrunk configuration changes are used. An existing matching Herdr space receives a new agent tab; otherwise a space is created. If agent startup fails after worktree creation, retrying the same form reuses that worktree.

Run the action from a Git project, and ensure `wt` and Python 3 are on that machine's PATH. Worktrunk hooks keep their normal approval rules; the launcher does not use `--yes`, `--no-hooks`, or `--clobber`. If a hook needs approval, approve it with Worktrunk in a terminal, then retry. The GUI command bridge has a 30-second execution limit; for lengthy setup hooks, prepare the worktree in a terminal first, then use the same branch in the launcher.

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

Checks cover mixed panes, large boards, diff comments and routing, tab reuse, real headless Neovim buffer preservation, agent naming, project identities, installer restore/rollback, worktree launch and shell-only behavior, and release contents. When `wt` is installed, the suite also creates temporary worktrees to verify branch names and the switched directory; it never starts real agents. Without `wt`, those real-CLI checks are skipped while mocked launcher checks still run. GitHub Actions runs the portable checks and builds the ZIP; see [CI details](docs/ci.md).

The release builder uses an allowlist and creates a reproducible ZIP plus `dist/SHA256SUMS`. Generated API definitions, caches, backups, local state, and custom images are omitted. `project-identity.js` and `workflow-tabs.js` are embedded into mods for Herdr's isolated runtime; their tests reject drift.

## License

Apache-2.0. Includes modified Herdr mods; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
