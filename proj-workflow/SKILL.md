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

Break the work into independently verifiable tasks, with stable identifiers such as T1, T2, T3. Include planning, implementation, verification, and review where they serve the goal. Put dependencies and acceptance details in ordinary paragraphs beneath checklist entries, rather than additional checklist entries that would become unintended cards. Link tasks to the relevant specification criteria.

Every Kanban card must be one Markdown checklist line outside a fenced code block:

```markdown
- [ ] T1 — Define acceptance criteria <!-- herdr:{"state":"todo","agent":null} -->
- [ ] T2 — Implement the approved behavior <!-- herdr:{"state":"doing","agent":"t3"} -->
- [ ] T3 — Review implementation and tests <!-- herdr:{"state":"review","agent":"t7"} -->
- [x] T4 — Verify the release behavior <!-- herdr:{"state":"done","agent":"t3"} -->
```

Addresses in the example are illustrative. Use only verified live addresses for actual assignments, otherwise `null`. Valid states: `todo`, `doing`, `review`, `done`. A checked checkbox wins over metadata; a Done task must use `[x]`, and every other state uses `[ ]`. Metadata must remain single-line valid JSON inside exactly `<!-- herdr:... -->`. Preserve the task ID when moving or rewording a card. The board's update controls preserve only `state` and `agent`; keep dependencies, criteria, blockers, and role requirements outside this metadata.

Ordinary unchecked tasks without metadata appear in Todo. The board is generated directly from the checklist; no separate Kanban database or card-creation API is needed. It reloads the file roughly every five seconds.

## Agent roles and ownership

When running inside Herdr and agent coordination is relevant, read `hc --skill` and inspect `hc ls --json` before assigning owners. Never fabricate addresses or take control of unrelated terminals. Do not start or prompt other agents unless the user's request authorizes that work.

Herdr's project sidebar detects roles from each agent's tab name and terminal title: `review` → Reviewer, `plan` or `orchestrat` → Planner, `impl` → Implementer. An explicit role chosen with the sidebar's ↻ button overrides that detection. Use unambiguous tab names `Planner`, `Implementer`, and `Reviewer` for newly authorized role tabs. Setting `agent` in a card assigns ownership; it does not set the agent's sidebar role, send a prompt, or start work.

If an agent's work actually begins, set its task to `doing` with its verified address. On handoff, set the task to `review` and assign the actual reviewer, or leave ownership unassigned when none exists. Set `done` and check the box only after its acceptance criteria and necessary verification pass. An idle or exited agent is not proof a task is complete. Keep blocked tasks in their current column and explain the blocker in a paragraph beneath the card.

Agents working on files should claim and update their own tasks as they progress. Before saving, re-read tasks.md and preserve intervening edits from the board or other agents. Make targeted edits rather than replacing a stale full-file snapshot. After a restart, verify that a stored address still refers to the intended agent before reusing it.

## Finish

Check the checklist syntax, checkbox/state agreement, task IDs, and acceptance links. Report the spec/task paths and unresolved questions. Explain how to open Tasks under the project in Herdr. Remote boards can display tasks, but their UI edits are currently disabled; agents can edit the remote tasks.md directly.
