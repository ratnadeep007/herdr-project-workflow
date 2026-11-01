# Herdr project workflow

Installed layout: `project-workflow`. Switch layouts with Ctrl–Shift–L.

- Sidebar groups spaces by machine and Git repository root (folder outside Git).
- Each project has initials and a stable pastel color derived from its root path and machine. Click its icon to choose an emoji or local image, or Reset to initials. Overrides are saved per project in Herdr shared state; images are copied to `mods/project-icon/assets` (PNG/JPEG/WebP/GIF/SVG, up to 5 MB).
- Projects sharing a name show their parent folder and machine beneath the name, even while collapsed. Hover the project name or icon for the full path and detected stack (React/Vue/Svelte/Node.js/Python/Rust/Go/Docker). Stack detection reads root manifests at most once a minute per project and does not run package tools.
- The same identity appears in Tasks and Diff headers and the managed Diff/Editor tabs.
- The tab-bar + menu lists installed agents. Selecting one opens a launcher with Planner, Implementer, Reviewer, or a custom Other role and an optional tab name. The role is appended only when the name does not already contain it (including common role aliases). The chosen role is saved for sidebar grouping, and the agent receives role instructions to wait for the user’s task.
- Files and Changes buttons are hidden from the top-right tab bar; project Diff and Editor actions remain in the sidebar.
- Planner / Implementer / Reviewer roles are inferred from tab names. Click ↻ beside an agent to set its role explicitly. Roles persist in Herdr shared state for that terminal address.
- Tasks opens a board for the selected project's root `tasks.md`, falling back to `TASKS.md`.
- Diff opens a full tab with the changed-file folder hierarchy and a unified diff. The Changes panel uses this viewer too. Files remains the full repository browser.
- Diff focuses an existing diff tab for the project instead of opening another. Existing duplicate tabs are preserved so their review drafts are not discarded.
- Editor opens one managed Neovim tab per project/machine. Open in nvim in the diff header, or nvim beside a changed file, opens that working-tree file in the same editor. Selecting another file switches Neovim buffers without discarding unsaved edits. The Editor action focuses the existing editor without changing its file.
- Board refreshes every five seconds. Agent status is live Herdr data.
- Task rendering uses one snapshot of live agent/pane data per frame. Each column shows 20 cards per page with previous/next controls, keeping large checklists responsive without dropping tasks.
- Empty role groups are hidden. Shells, other programs, and mod panels have separate collapsible sections, including non-agent panes in mixed tabs.
- A known agent running as a shell's foreground program appears under Agents only, with unknown status if it does not report status. The shell returns to Shells after that agent exits. Foreground editors and other commands appear under Programs. Ordinary shells remain visible.
- Shell/program rows show their address, executable, and current folder. Their parent tab name is shown only on hover, so a shell in a Planner tab is not labeled as a Planner agent.
- Panes are classified individually: agent panes stay under their role; shells, programs, and panels stay in their own sections even when sharing a tab with an agent. Multiple panes of the same kind in one tab nest under a collapsible “Tab:” header. Clicking a pane row focuses that exact pane. Agents are listed only when they have an actual pane.
- Tasks is hidden until a project has at least one parsed checklist item; missing or empty task files do not offer an empty-board button.
- Project badges count open panes.
- Background/internal subagents without panes are not listed. Once a helper has its own pane, it appears as a regular agent with direct pane navigation.
- Agent rows show tasks assigned to their address in `doing` or `review`, independently of whether their reported status is working, idle, or blocked. Multiple assignments are shown as a first title plus a count, with all titles on hover. No task is guessed from terminal output.

Task format:

```markdown
- [ ] A task to plan
- [ ] Implement feature <!-- herdr:{"state":"doing","agent":"t2"} -->
- [ ] Review feature <!-- herdr:{"state":"review","agent":"t7"} -->
- [x] Completed feature
```

Standard checklists work without annotations. The board adds annotations only when a card is changed. Column buttons write the state and update the checkbox. Assign agent cycles through agents in the same project, including an unassigned option. Go to agent focuses its terminal. These actions do not send prompts or launch agents.

Keep agent ownership explicit: agents can edit the same metadata in tasks.md. A checked checkbox takes precedence over metadata. In-progress and Review are workflow states; an agent being idle does not move the card automatically.

Writes compare the current file with the version loaded by the board and reject concurrent edits. Remote boards can be read; edit remote tasks.md through the agent to update them. Fenced checklist examples are ignored. Binary/large diffs retain Herdr's preview limits.

Mod sources are in the repository root; installed mods are under `~/.config/herdr-app/mods/`.

## Reviewing diffs

The diff viewer lists the latest 40 commits on the current branch plus Working tree. Select a commit to view its changes against its first parent (root commits compare against an empty tree). This does not check out or change the repository. Select a file, then click or drag across numbered lines to select a range, type a comment, and click Add. Shift-click also extends a selection. Selected rows are highlighted. Backward drags work, and ranges crossing removed and added lines retain both old/new side references. Release the mouse to finish selecting; leaving the diff viewport ends the drag. Without a line selection, Add records a file-level comment.

Comments retain their revision, filename, old/new line sides, start/end numbers, and code snippet. They are saved as drafts in the mod's local storage. You can collect comments from multiple files or commits, remove individual comments, and send the batch using Send review. Unsaved text in the input is not included until Add is pressed. A changed diff clears an unsaved line selection so its highlight cannot attach to different code.

A single Planner in the same repository/machine is selected automatically, using the same role overrides and tab-name rules as the sidebar. With no planner or several planners, choose a recipient from the project's agents. Sending uses `hc send` without force; blocked or unconfirmed deliveries keep the comments. Inspect the recipient before retrying an uncertain delivery. No reviews are sent automatically.

Diff previews display at most 1,000 files, 1,500 lines, and 4,000 characters per line. Binary files have no line comments. Drafts do not change repository files or create commits.

## Editor reuse

The managed Editor starts `nvim --listen` on a private temporary Unix socket. File switches use Neovim RPC with `hide buffer` / `hide edit`, preserving modified buffers. This does not send simulated editor keystrokes or create new Neovim tab pages. A selected new-side diff line is used as the target line when opening that file. Historical commit files open their current working-tree version; missing or deleted working-tree files report an error instead of creating an empty file.

Tab identities and the socket are saved in Herdr shared state, and creation locks prevent duplicate tabs during rapid clicks. New file requests received while the editor is starting are queued to that same instance. Closing the managed editor tab allows a new one to be created on the next request. If Neovim exits back to its shell, the Editor action can restart it in the same tab. The integration targets POSIX machines with Neovim and Python 3 installed.

`workflow-tabs.js` is the common helper source, embedded between WORKFLOW_TABS markers in both mods so neither mod needs to read another mod's code at runtime. Its regression test checks those embedded copies stay synchronized.

Verification: `node check-sidebar.cjs`, `node check-board-performance.cjs`, `node check-diff.cjs`, `node check-workflow-tabs.cjs`, `node check-agent-launch.cjs`, `node check-project-identity.cjs`, and `herdr-app check` on the installed mods. The diff tests use temporary Git repositories and mocked message delivery, never send to actual agents. The tab helper test checks rapid-click deduplication and uses a temporary clean Neovim server to verify file switching and preservation of unsaved edits.
