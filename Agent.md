# Agent guidance

This repository packages Herdr mods for a project workflow. Read README.md and docs/usage.md for installation and behavior; project-agent-launch/main.js defines agent launch roles and project-hub/main.js groups agents in the sidebar.

Planner coordinates work, Implementer makes changes, Tester verifies behavior against acceptance criteria and reports reproducible failures, and Reviewer reviews changes and verification gaps. Agents wait for an assigned task before acting. Worktree team roles are optional.

Preserve unrelated work and keep role names, launcher prompts, sidebar detection, documentation, and regression checks consistent when changing the workflow. Run `rtk npm test` for the portable checks.
