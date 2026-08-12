---
name: peer-review
description: Send the current repository and bounded conversational context to a new native Claude Desktop session for an independent read-only code review, then return Claude's result to the current Codex task.
---

# Peer review with Claude Desktop

Use this skill when the user asks Claude to review, challenge, or independently inspect work from the current Codex task.

1. Summarize only context that is not recoverable from the repository: the user's goal, intentional design decisions, constraints, and unresolved questions.
2. Do not paste full transcripts, secrets, environment variables, credentials, or large diffs. Claude reads the current working tree directly.
3. Run:

```bash
dab review --to claude --cwd "$PWD" --request "<the user's requested review>" --context "<bounded context from this Codex task>" --json
```

4. The command creates a new native Claude Desktop session, waits for it to finish, and prints JSON containing `sessionId` and `result`.
5. Return the result faithfully in the current Codex task. Preserve file and line references. Do not imply that Codex independently verified Claude's findings unless you verify them.
6. Review mode is read-only. Do not ask Claude to modify files, commit, push, or deploy.
