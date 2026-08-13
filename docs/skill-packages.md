# Building a DAB Skill package

A DAB Skill package owns workflow semantics; `desktop-agent-bridge` owns session creation, source-context preparation, target compatibility, completion detection, and result return. The Skill package remains outside the business repository.

## Package boundary

Use host-native distribution instead of inventing a DAB-specific marketplace:

- Claude: publish a Plugin with `.claude-plugin/plugin.json` and `skills/<name>/SKILL.md`; Claude marketplaces can use GitHub, Git, npm, archive, or local sources.
- Codex and other Agent Skills hosts: publish the same `skills/<name>/SKILL.md` tree and install it at user scope through the host's supported mechanism.
- Runtime: depend on the globally installed `dab` CLI, or declare `desktop-agent-bridge` as an npm peer dependency and import `handoff()` from JavaScript.

The minimum CLI contract is:

```bash
dab handoff \
  --to <claude-or-codex> \
  --cwd <absolute-project-path> \
  --request <target-task> \
  --workflow <stable-workflow-name> \
  --instructions <result-contract> \
  --context-mode auto \
  --json
```

The normalized JSON result contains `target`, `sessionId`, `result`, optional `context` metadata, and optional `handoffError` when the workflow completed but the native UI deep link failed.

## Responsibilities

The Skill should decide:

- when the workflow triggers;
- which destination agent to use;
- the target task and result contract;
- whether `auto`, `bounded`, `full`, or `raw` context is appropriate;
- how to present the returned result to the source conversation.

The Skill should not automate Desktop UI, scan vendor transcript directories, import Codex history, poll completion files, or open deep links. Those are DAB adapter responsibilities.

## Distribution layout

```text
your-skill-package/
├── package.json
├── .claude-plugin/
│   └── plugin.json
└── skills/
    └── your-workflow/
        └── SKILL.md
```

Claude installs the Plugin in its user cache. Codex installs the Skill at user scope. Neither path requires `.claude/`, `.agents/`, or generated handoff files in the repository being reviewed.

See [`examples/security-review-skill`](../examples/security-review-skill) for a minimal working package.
