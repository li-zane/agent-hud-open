---
description: Coordinate a multi-agent team across harnesses via Agent HUD (uses the agent-team skill)
argument-hint: [what to build / who does what]
---

Coordinate a multi-agent team for this task using the **agent-team** skill.

Task from the user: $ARGUMENTS

Steps:

1. Load and follow the `agent-team` skill (Agent HUD ships it alongside this command). It holds the role roster, the dispatch brief template, and the hard rules.
2. Pick the roles this task needs from the roster (lead / UI / backend·ops / architecture·drafts).
3. For each teammate, reuse or open a session **in the same project folder** (`list_sessions` first; else `start_session` with `folder` = this project's absolute path) so it inherits `AGENTS.md` / `CLAUDE.md`, the files and memory. Never open a bare new session.
4. Dispatch with the brief template, passing `require_reply: true` when you need an answer; keep every member's temporary files in `.tmp/`.
5. A teammate's reply comes back as a new turn once you are idle — there is no `get_message` to poll. Review the actual deliverables, and report progress, blockers and decisions to the user.

If no task was given, ask the user what to team up on, and offer to scaffold the shared constraints (`AGENTS.md` + a `CLAUDE.md` that imports it) if the project has none.
