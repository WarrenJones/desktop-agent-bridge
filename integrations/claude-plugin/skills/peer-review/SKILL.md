---
name: peer-review
description: Send the current repository and bounded conversational context to a new Codex task for an independent read-only code review, then return Codex's result to the current Claude Desktop session.
---

# Peer review with Codex

Use this skill when the user asks Codex to review, challenge, or independently inspect work from the current Claude Desktop session.

1. Summarize only context that is not recoverable from the repository: the user's goal, intentional design decisions, constraints, and unresolved questions.
2. Do not paste full transcripts, secrets, environment variables, credentials, or large diffs. Codex reads the current working tree directly.
3. Run:

```bash
dab review --to codex --cwd "$PWD" --request "<the user's requested review>" --context "<bounded context from this Claude session>" --json
```

4. The command creates a persistent Codex thread, opens it in Codex Desktop, and prints JSON containing `sessionId` and `result`.
5. Return the result faithfully in the current Claude session. Preserve file and line references. Do not imply that Claude independently verified Codex's findings unless you verify them.
6. Review mode is read-only. Do not ask Codex to modify files, commit, push, or deploy.
