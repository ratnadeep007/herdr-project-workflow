# Example project tasks

Each top-level card is one self-contained commit. Its nested subtasks, tests, documentation, and review fixes belong in that same commit. These states are illustrative; no project work or commits are claimed by this example. Assign actual agents from the board.

- [ ] T1 — Reject invalid email addresses <!-- herdr:{"state":"todo","agent":null} -->
  - [ ] Implement email validation and accessible field feedback.
  - [ ] Cover valid, invalid, and empty email input with focused tests.
  - [ ] Verify acceptance criteria and review the complete change.
  Acceptance: invalid email blocks submission; valid email can be submitted.
  Commit: `feat: validate email addresses (T1)`.

- [ ] T2 — Add a password visibility toggle <!-- herdr:{"state":"todo","agent":null} -->
  - [ ] Add an accessible show/hide control beside the password field.
  - [ ] Preserve the password value and cursor position when toggled.
  - [ ] Add tests and review the complete change.
  Acceptance: the control changes visibility without changing the password.
  Commit: `feat: add password visibility toggle (T2)`.

- [ ] T3 — Save a profile display name <!-- herdr:{"state":"doing","agent":null} -->
  - [x] Define the display-name validation rules.
  - [ ] Implement persistence and the profile form together.
  - [ ] Test saving, reloading, and invalid input.
  - [ ] Review the complete change before committing.
  Acceptance: an updated display name survives a reload; invalid input is rejected.
  Commit: `feat: persist profile display names (T3)`.

- [ ] T4 — Show an empty state for task lists <!-- herdr:{"state":"review","agent":null} -->
  - [x] Implement the empty state and create-task action.
  - [x] Add focused tests for empty and populated lists.
  - [ ] Resolve review findings and verify acceptance criteria.
  Acceptance: empty lists guide users to create a task; populated lists retain their normal view.
  Commit: `feat: add task list empty state (T4)`.

- [x] T5 — Document project setup <!-- herdr:{"state":"done","agent":null} -->
  - [x] Document prerequisites and local startup commands.
  - [x] Verify the instructions in a clean checkout.
  - [x] Review the complete documentation change.
  Acceptance: a new contributor can start the project from the documented steps.
  Commit: `docs: add project setup guide (T5)`.

## Commit rules

Complete and verify one parent task, move that same card through review, then commit all its work together. Include the task ID in the commit message. Stage only that task's files or hunks, including checklist updates when tasks.md is tracked. Report the actual commit hash after success. A checked subtask does not automatically complete its parent; the parent needs acceptance, verification, and review too.
