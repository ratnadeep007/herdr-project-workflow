# Changelog

## Unreleased

- Add collapsible diff folders and preserve nested fold preferences. Fix file-list and code scrolling with independent scroll areas and content that retains its full height.

- Add keyboard tree navigation and a visible selection to the project popup, including automatic scrolling, group expansion/collapse, and Enter to switch.

- Support opening the project switcher through `mod.open:project-hub`, including a ⌘P binding.

- Add a Projects button when the sidebar is hidden. Its popup reuses the sidebar content, shared fold state, exact pane navigation, and project actions.

- Add a Worktrunk launcher under **+ → New worktree…**, with worktree name, branch override (defaulting to the name), agent selection, role, and optional tab name. Worktrunk confirms its switched directory before the terminal starts. Existing branches and spaces are reused, and failed agent startup can retry without re-creating the worktree.
- Add **None — shell only** to open the configured shell without an agent prompt or role.
- Display supported agents in a three-column grid with logos, installed agents first, and unavailable agents disabled. Fixed tile heights keep Codex and other options from being clipped.

## 0.1.1

Each top-level task is one self-contained commit. Nested checklist subtasks stay on their parent card, with progress and titles on hover. Updated the workflow skill and examples to keep implementation, tests, documentation, and review fixes together.

## 0.1.0

Initial distribution: project and role sidebar, custom project icons, role-based agent launcher, Markdown Kanban, commit diff comments and range selection, reusable Diff/Neovim tabs, optional usage pills, and the proj-workflow skill.

Includes a backup/restore installer, portable tests, GitHub CI, and reproducible release archives. Tested on macOS with Herdr GUI 0.1.11 / herdr-core 0.1.16.
