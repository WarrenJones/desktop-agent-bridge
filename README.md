# desktop-agent-bridge

Local-first, native Desktop handoffs between Codex and Claude.

The package provides a read-only handoff engine in both directions. The bundled `peer-review` Skill is the first workflow: it gives the other agent access to the source session context, creates a native Desktop session/thread, and returns the final result to the source conversation. Third-party Skills can build other workflows on the same CLI or Node API.

For component boundaries, bidirectional lifecycle diagrams, trust guarantees, failure semantics, and adapter maintenance guidance, see the [core architecture](docs/architecture.md). For the market evidence behind the product, the Context model, and the pluggable Skill boundary, see [why DAB exists](docs/research-and-rationale.md).

## What works today

### Codex Desktop → Claude Desktop

`dab` locates the current Codex rollout through `CODEX_THREAD_ID`, writes a normalized full transcript under DAB's user-level state directory, and points a new Claude Desktop Code session at that artifact. It switches the session to Manual permission mode, waits for a real text `end_turn`, and returns the exact final response plus the Claude session ID.

### Claude Desktop → Codex Desktop

The Claude plugin captures the exact current JSONL path in a `SessionStart` hook. In `auto` mode, DAB asks Codex's external-agent importer to convert that Claude history into a persistent Codex thread, then resumes it with the workflow request under a read-only sandbox. If the installed Codex runtime does not support import, DAB falls back to a normalized full-transcript artifact and a new persistent thread.

If the deep link cannot be opened, the completed review is still returned and the JSON result includes `handoffError`.

## Requirements

- macOS
- Node.js 20 or newer
- Claude Desktop with the target project already visible in the Code sidebar
- Codex Desktop / ChatGPT app
- macOS Accessibility permission for the terminal or host app that runs `dab`

## Install

Install the public npm package globally, then install the Codex user Skill and Claude user Plugin:

```bash
npm install -g desktop-agent-bridge
dab install
```

Restart Codex Desktop and Claude Desktop after `dab install` completes.

To upgrade:

```bash
npm install -g desktop-agent-bridge@latest
dab install
```

### Install from source

For contributors and local development:

```bash
git clone https://github.com/WarrenJones/desktop-agent-bridge.git
cd desktop-agent-bridge
node scripts/install.js
```

This installs:

- `~/.local/bin/dab`
- `~/.agents/skills/peer-review/SKILL.md` for Codex
- `desktop-agent-bridge@desktop-agent-bridge` through Claude's native user-scope Plugin marketplace

The Claude Plugin contains the `peer-review` Skill and the `SessionStart` transcript hook. During plugin development it can also be loaded directly with:

```bash
claude --plugin-dir ./integrations/claude-plugin
```

## Use from Desktop

From a Codex Desktop project task:

```text
$peer-review Ask Claude to review the current changes for correctness and regressions.
```

From a Claude Desktop Code session:

```text
/peer-review Ask Codex to review the current changes against the intended design.
```

Natural-language requests such as “ask Claude/Codex to independently review the current changes” also activate the installed skill when the Desktop agent recognizes it.

## CLI

```bash
dab handoff \
  --to claude \
  --cwd "$PWD" \
  --request "Review the current uncommitted changes" \
  --workflow peer-review \
  --context-mode auto \
  --json
```

```bash
dab handoff \
  --to codex \
  --cwd "$PWD" \
  --request "Review the current uncommitted changes" \
  --workflow peer-review \
  --context-mode auto \
  --json
```

`dab review` remains a backwards-compatible alias. Context modes are:

| Mode | Behavior |
| --- | --- |
| `bounded` | Only `--context` is sent. This is the default for direct CLI compatibility. |
| `auto` | Native import for Claude → Codex; otherwise a normalized full transcript. Bundled Skills use this mode. |
| `full` | Always produce a normalized full transcript artifact. |
| `raw` | Give the target the exact source JSONL path and SHA-256. |

The normalized transcript keeps user/assistant text, converts relevant Claude tool activity to bounded notes, and excludes source-host control messages, hidden reasoning, meta records, and sidechains. The source JSONL is never modified.

## Build a pluggable Skill

A third-party Skill owns workflow semantics and calls DAB for transport. It can live in its own GitHub repository, npm package, Claude Plugin, or user-scope Agent Skill; it does not need files in the business repository.

```bash
dab handoff \
  --to <claude-or-codex> \
  --cwd "$PWD" \
  --request "<workflow task>" \
  --workflow <workflow-name> \
  --instructions "<result contract>" \
  --context-mode auto \
  --json
```

Node-based packages can instead import `handoff`:

```js
import { handoff } from "desktop-agent-bridge";

const result = await handoff({
  to: "claude",
  cwd: process.cwd(),
  request: "Perform an independent security review.",
  workflow: "security-review",
  contextMode: "auto",
});
```

See the [Skill package authoring guide](docs/skill-packages.md) and the [security-review example](examples/security-review-skill).

## Safety boundary

- Codex uses `--sandbox read-only`.
- Claude Desktop is switched to Manual permission mode before submission, so file changes require explicit user approval. Do not approve changes during a review. Unlike the Codex adapter, this is not an OS-level read-only sandbox.
- The prompt also prohibits modifications, branch changes, commits, pushes, deployments, and destructive commands.
- Source-agent context is marked as untrusted historical data and cannot override the review constraints.
- `auto`, `full`, and `raw` can expose transcript content—including content previously returned by tools—to the destination model provider. Use `bounded` when the source transcript contains data that must not cross providers.
- Review requests use the existing local login state of each Desktop application. The bridge stores no credentials.

Claude Desktop does not currently expose a stable public session-creation automation API. The Claude adapter therefore uses semantic macOS Accessibility elements, isolated in `scripts/claude-desktop.jxa`. A Desktop UI update may require updating only this adapter.

Claude Desktop identifies projects by the directory name in its current sidebar. If two open projects have the same final directory name, keep only the intended project open while starting a review.

## Verification

```bash
npm test
npm run check
```

The repository includes transcript fixtures for split `thinking`/`text` events, tool-result marker echoes, and sidechain isolation because these are real Claude Desktop transcript shapes.

## Scope

The MVP intentionally does not include:

- a multi-agent scheduler
- real-time agent-to-agent chat
- arbitrary attachment to an already-running target session
- code modification, Git mutation, or deployment
- a separate `doctor` command

## Prior art

This implementation is informed by OpenAI's `codex-plugin-cc` and AgentBridge. It uses independent code and public process/protocol behavior; it does not copy their source.
