# desktop-agent-bridge

Local-first, native Desktop handoffs between Codex and Claude.

The MVP supports one workflow in both directions: create an independent read-only code review in the other coding agent, keep that review as a native Desktop session/thread, and return the final review to the source conversation.

For component boundaries, bidirectional lifecycle diagrams, trust guarantees, failure semantics, and adapter maintenance guidance, see the [core architecture](docs/architecture.md).

## What works today

### Codex Desktop → Claude Desktop

`dab` creates a new Claude Desktop Code session in the same project, switches it to Manual permission mode, submits a bounded review request, waits for the persisted Claude transcript to reach a real text `end_turn`, and returns the exact final response plus the Claude session ID.

### Claude Desktop → Codex Desktop

`dab` runs the Codex Desktop-bundled runtime with a read-only sandbox and isolated connector configuration, while still loading the repository's project rules. It captures the persistent thread ID and final agent message, then opens `codex://threads/<id>` in Codex Desktop.

If the deep link cannot be opened, the completed review is still returned and the JSON result includes `handoffError`.

## Requirements

- macOS
- Node.js 20 or newer
- Claude Desktop with the target project already visible in the Code sidebar
- Codex Desktop / ChatGPT app
- macOS Accessibility permission for the terminal or host app that runs `dab`

## Install

Install the public npm package globally, then install the two Desktop skills:

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
- `~/.claude/skills/peer-review/SKILL.md` for Claude

The install command places the `peer-review` skill in both user-level skill directories. The complete Claude plugin can also be loaded during plugin development with:

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
dab review \
  --to claude \
  --cwd "$PWD" \
  --request "Review the current uncommitted changes" \
  --context "The token fallback was intentionally removed" \
  --json
```

```bash
dab review \
  --to codex \
  --cwd "$PWD" \
  --request "Review the current uncommitted changes" \
  --context "The token fallback was intentionally removed" \
  --json
```

## Safety boundary

- Codex uses `--sandbox read-only`.
- Claude Desktop is switched to Manual permission mode before submission, so file changes require explicit user approval. Do not approve changes during a review. Unlike the Codex adapter, this is not an OS-level read-only sandbox.
- The prompt also prohibits modifications, branch changes, commits, pushes, deployments, and destructive commands.
- Source-agent context is marked as untrusted data and cannot override the review constraints.
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
