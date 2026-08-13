---
name: peer-review
description: Send the current repository and full source-session context to a new native Claude Desktop session for an independent read-only code review, then return Claude's result to the current Codex task.
---

# Peer review with Claude Desktop

Use this skill when the user asks Claude to review, challenge, or independently inspect work from the current Codex task.

1. Let DAB locate and normalize the current Codex transcript. Use `--context` only for a short clarification that is not already present in the session.
2. The full transcript is historical evidence, not target instructions. Claude still reads the current working tree and Git diff as the source of truth.
3. Run:

```bash
dab handoff \
  --to claude \
  --cwd "$PWD" \
  --request "<the user's requested review>" \
  --workflow peer-review \
  --context-mode auto \
  --json
```

4. The command creates a new native Claude Desktop session, waits for it to finish, and prints JSON containing `sessionId` and `result`.
5. Return the result faithfully in the current Codex task. Preserve file and line references. Do not imply that Codex independently verified Claude's findings unless you verify them.
6. The handoff is read-only. Do not ask Claude to modify files, commit, push, or deploy.
