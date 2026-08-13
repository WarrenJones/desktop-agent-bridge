---
name: peer-review
description: Import the current Claude session into a new Codex task for an independent read-only code review, then return Codex's result to the current Claude Desktop session.
---

# Peer review with Codex

Use this skill when the user asks Codex to review, challenge, or independently inspect work from the current Claude Desktop session.

1. Let DAB use the transcript path captured by the plugin's `SessionStart` hook. Use `--context` only for a short clarification that is not already present in the session.
2. In `auto` mode, DAB asks Codex's external-agent importer to convert the Claude JSONL into native Codex history before sending the review request.
3. Run:

```bash
dab handoff \
  --to codex \
  --cwd "$PWD" \
  --request "<the user's requested review>" \
  --workflow peer-review \
  --context-mode auto \
  --json
```

4. The command creates a persistent Codex thread, opens it in Codex Desktop, and prints JSON containing `sessionId` and `result`.
5. Return the result faithfully in the current Claude session. Preserve file and line references. Do not imply that Claude independently verified Codex's findings unless you verify them.
6. The handoff is read-only. Do not ask Codex to modify files, commit, push, or deploy.
