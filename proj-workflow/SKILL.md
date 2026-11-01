---
name: proj-workflow
description: Create or maintain a project specification and tasks.md checklist for the Herdr project Kanban board, including agent ownership and planner, implementer, and reviewer handoffs. Use for /proj-workflow, $proj-workflow, or a request to prepare a Herdr project workflow.
---

# Project workflow

Turn the user's project brief into a specification and a board-compatible task checklist. Invocation authorizes planning files; it does not by itself authorize starting agents or implementing the plan.

## Locate and understand the project

Read the project's instructions, README, existing specification, task list, and relevant code. Use the current worktree's Git root, or the current project folder outside Git. Do not choose a parent repository that contains unrelated projects when the user has identified a specific project; explain that Herdr's board currently reads tasks from its detected repository root if these differ.

Reuse `spec.md` or `SPEC.md` and `tasks.md` or `TASKS.md` when present. Never create case-only duplicates. For a new project, use `spec.md` and `tasks.md`. Preserve existing identifiers, decisions, completed work, task ownership, and unrelated sections.

With no arguments, use the current conversation's project goal. If there is no goal and no existing plan, ask for the project idea before inventing tasks. For an existing plan, reconcile it with the request and actual project state; don't reset its board.

## Write the specification and task list

The specification should state the goal, scope, constraints, design/interfaces, and testable acceptance criteria. Mark unresolved choices as questions or assumptions. Scale its detail to the project.

Each top-level task is one self-contained, independently reviewable commit, with a stable identifier such as T1, T2, or T3. Scope it around one outcome and include the implementation, relevant tests, documentation, and necessary verification for that outcome together. Split a task if it needs multiple unrelated commits. Do not make implementation, tests, and review of the same outcome separate top-level cards; they are subtasks or workflow stages of that card. A planning/documentation change can be its own task when it is a useful standalone commit.

Write top-level checklist entries flush left. Put subtasks in indented checklists beneath their parent; they do not become separate Kanban cards or commits. Keep dependencies, acceptance criteria, and the intended commit message in indented prose beneath that task. Link acceptance criteria to the specification. Use one owner for the parent at a time and hand that same card to the reviewer.

Every Kanban card must be one flush-left Markdown checklist line outside a fenced code block:

```markdown
- [ ] T1 — Reject invalid email addresses <!-- herdr:{"state":"todo","agent":null} -->
  - [ ] Implement email validation and field feedback.
  - [ ] Add focused tests for valid, invalid, and empty input.
  - [ ] Verify acceptance criteria and review the complete change.
  Acceptance: invalid email prevents submission; valid email can be submitted.
  Commit: `feat: validate email addresses (T1)`.

- [ ] T2 — Add a password visibility toggle <!-- herdr:{"state":"todo","agent":null} -->
  - [ ] Add an accessible show/hide control.
  - [ ] Test toggling without changing the entered password.
  - [ ] Verify and review the complete change.
  Commit: `feat: add password visibility toggle (T2)`.
```

Addresses in the example are illustrative. Use only verified live addresses for actual assignments, otherwise `null`. Valid states: `todo`, `doing`, `review`, `done`. A checked checkbox wins over metadata; a Done task must use `[x]`, and every other state uses `[ ]`. Metadata must remain single-line valid JSON inside exactly `<!-- herdr:... -->`. Preserve the task ID when moving or rewording a card. The board's update controls preserve only `state` and `agent`; keep dependencies, criteria, blockers, and role requirements outside this metadata.

Ordinary unchecked tasks without metadata appear in Todo. The board is generated directly from the checklist; no separate Kanban database or card-creation API is needed. It reloads the file roughly every five seconds.

## Agent roles and ownership

When running inside Herdr and agent coordination is relevant, read `hc --skill` and inspect `hc ls --json` before assigning owners. Never fabricate addresses or take control of unrelated terminals. Do not start or prompt other agents unless the user's request authorizes that work.

Herdr's project sidebar detects roles from each agent's tab name and terminal title: `review` → Reviewer, `plan` or `orchestrat` → Planner, `impl` → Implementer. An explicit role chosen with the sidebar's ↻ button overrides that detection. Use unambiguous tab names `Planner`, `Implementer`, and `Reviewer` for newly authorized role tabs. Setting `agent` in a card assigns ownership; it does not set the agent's sidebar role, send a prompt, or start work.

If an agent's work actually begins, set its task to `doing` with its verified address. On handoff, set the task to `review` and assign the actual reviewer, or leave ownership unassigned when none exists. Set `done` and check the box only when all subtasks, acceptance criteria, necessary verification, and review have passed and the task is ready for its single commit. An idle or exited agent is not proof a task is complete. Keep blocked tasks in their current column and explain the blocker in a paragraph beneath the card.

Agents working on files should claim and update their own tasks as they progress. Before saving, re-read tasks.md and preserve intervening edits from the board or other agents. Make targeted edits rather than replacing a stale full-file snapshot. After a restart, verify that a stored address still refers to the intended agent before reusing it.

## Commit one task at a time

When implementing authorized work, complete the parent task and all its subtasks together. Keep it as the same card through `doing` and `review`. Do not create separate commits for its subtasks, tests, or review fixes before the task is ready. Inspect the staged diff and stage only files or hunks belonging to that task; preserve other agents' and unrelated work. Include its checklist updates in that same commit when tasks.md is tracked. Use the intended commit message with the task ID. If committing fails, keep or return the card to an unfinished state. Report the actual commit hash after success; never invent a hash or write a placeholder as if committed. Do not push unless the user's request authorizes publishing.

If implementation is not authorized, stop after preparing the planning files; this commit convention does not authorize implementation by itself.

## Finish

Check the checklist syntax, checkbox/state agreement, task IDs, one-outcome commit boundaries, subtask nesting, and acceptance links. Report the spec/task paths and unresolved questions. Explain how to open Tasks under the project in Herdr. Remote boards can display tasks, but their UI edits are currently disabled; agents can edit the remote tasks.md directly.
