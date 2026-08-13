---
name: security-review
description: Send the current implementation and source-session context to the other native Desktop agent for an independent read-only security review.
---

# Cross-agent security review

Use this workflow when the user asks for an independent security review by the other Desktop coding agent.

1. Choose `claude` when running in Codex, or `codex` when running in Claude.
2. Keep optional `--context` to a short statement of security assumptions that are not present in the repository. DAB transfers the full source transcript separately in `auto` mode.
3. Run:

```bash
dab handoff \
  --to <claude-or-codex> \
  --cwd "$PWD" \
  --request "Perform an independent security review of the current implementation." \
  --workflow security-review \
  --instructions "Return exploitable findings first, with severity, evidence, and file/line references. Separate confirmed issues from hardening suggestions." \
  --context-mode auto \
  --json
```

4. Return the destination result faithfully. Do not modify project files, install a project-local skill, commit, push, or deploy.
