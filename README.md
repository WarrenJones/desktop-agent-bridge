# Desktop Agent Bridge

[![npm version](https://img.shields.io/npm/v/desktop-agent-bridge.svg)](https://www.npmjs.com/package/desktop-agent-bridge)
[![macOS](https://img.shields.io/badge/platform-macOS-black.svg)](#install-and-use)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Start in Codex Desktop, ask Claude Desktop for an independent review with the source-conversation context, and get the findings back in Codex.**

[中文说明](README.zh-CN.md) · [Architecture](docs/architecture.md) · [Research and rationale](docs/research-and-rationale.md) · [Skill authoring](docs/skill-packages.md)

```text
Codex Desktop → new Claude Desktop review session → findings return to Codex
```

> [!IMPORTANT]
> [Claude Desktop's Code tab](https://code.claude.com/docs/en/desktop) runs Claude Code and supports plugins. OpenAI's [`codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) already covers much of **Claude Desktop / Claude Code → Codex**, including review, delegation, result retrieval, and transcript transfer. If that is the only direction you need, use the official plugin. DAB's distinct contribution is the opposite direction—**Codex Desktop → Claude Desktop**—plus one consistent workflow from either app.

## 1. What it does

Desktop Agent Bridge (DAB) connects **Codex Desktop and Claude Desktop in both directions**. The source agent remains in the conversation where the work happened; DAB passes the review task and relevant source-session history to a new visible session in the other app, waits for the reviewer, and returns the result.

```text
current Desktop conversation
        │ task + source-session context
        ▼
Desktop Agent Bridge ──► new native Desktop review session
        ▲                            │
        └──────── final result ──────┘
```

Install the first bundled workflow, `peer-review`:

```bash
npm install -g desktop-agent-bridge
dab install
```

- In Codex Desktop: `$peer-review Ask Claude to review the current changes.`
- In Claude Desktop: `/peer-review Ask Codex to review the current changes.`
- Both reviewers inspect the same current working tree without modifying it; Codex uses a read-only sandbox, while Claude uses Manual approval mode.
- The transport engine is generic; independent Skills can build security review, architecture challenge, test-plan review, or other handoffs.

### The Codex → Claude loop, in four real screenshots

These screenshots come from a real handoff using the public [`demo-review-project`](examples/demo-review-project). The critical product decision exists **only in the source Codex conversation**—not in the repository and not in the request sent to Claude.

| 1. Codex holds the decision | 2. Invoke `peer-review` in the same task |
| --- | --- |
| ![Codex conversation containing implementation context](docs/assets/walkthrough/codex-source-context.jpg) | ![Codex invokes the Peer Review Skill](docs/assets/walkthrough/codex-invokes-peer-review.jpg) |
| **3. DAB opens a new Claude Desktop review session** | **4. Claude's findings return to the original Codex task** |
| ![New Claude Desktop review session](docs/assets/walkthrough/claude-review-session.jpg) | ![Claude review result returned to Codex](docs/assets/walkthrough/claude-result-in-codex.jpg) |

Claude reads the transferred source-session context and the live working tree, finds that `checkoutTotal` incorrectly lets excess membership credit pay shipping, and returns the finding automatically. No copy and paste is required.

### The reverse direction is included for a consistent workflow

This direction overlaps with `codex-plugin-cc`; it is not presented as an uncovered market gap. DAB includes it so the same `peer-review` workflow can be invoked from either Desktop app.

1. **Agent A holds the decision and invokes `peer-review`.** Claude knows that a token is expired at the exact `expiresAt` instant, then asks Codex to review `src/token.js` without putting that rule in the review request.

   ![Claude conversation context and Peer Review invocation](docs/assets/walkthrough/claude-source-context.jpg)

2. **DAB imports the source transcript into a new persistent Codex Desktop task.** Codex finds that `now > expiresAt` accepts the exact expiration boundary and must be `>=`.

   ![New Codex Desktop review task](docs/assets/walkthrough/codex-review-session.jpg)

3. **Codex's findings return to the original Claude conversation automatically.** The source conversation explicitly notes that Codex derived the rule from the imported transcript rather than a hint in the request.

   ![Codex review result returned to Claude](docs/assets/walkthrough/codex-result-in-claude.jpg)

## 2. Where it fits—and when you do not need it

Agent-to-agent delegation already exists. The important comparison is direction-specific:

| Project | What it already solves | Why DAB may still be useful |
| --- | --- | --- |
| [OpenAI `codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) | Claude Desktop / Claude Code → Codex review and delegation; transcript transfer can create a persistent Codex thread | **Use it instead of DAB if this is your only direction.** It does not provide Codex Desktop → Claude Desktop. |
| [`agent-bridge`](https://github.com/raysonmeng/agent-bridge) | Persistent bidirectional Claude Code ↔ Codex CLI/TUI peers through a daemon, MCP, and app-server | Use DAB only if the destination must be a visible session in each first-party Desktop app. |
| [`hcom`](https://github.com/aannoo/hcom) | Hooks, messages, transcripts, events, and local SQLite for terminal agents | Use DAB only for this narrower native Desktop handoff. |
| [VS Code Agent Sessions](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions) | Session creation, history access, and messaging inside one VS Code host | Use DAB only when the two sessions must remain in separate first-party Desktop apps. |
| **Desktop Agent Bridge** | **Codex Desktop → Claude Desktop, plus a symmetric wrapper for the reverse direction** | **Source transcript + live working tree → visible target session → result returned.** |

The uncovered direction DAB targets is this exact workflow:

1. keep working in a Codex Desktop task;
2. ask Claude Desktop for an independent opinion;
3. let Claude see decisions already made in the Codex conversation;
4. keep the new Claude session visible and resumable;
5. receive the conclusion back in Codex without copying and pasting between windows.

DAB deliberately does not replace either agent UI, build a shared chat room, or become a multi-agent scheduler. It is a small interoperability layer at the native Desktop session boundary. The corrected evidence and narrower product conclusion are documented in [research and rationale](docs/research-and-rationale.md).

## 3. How context crosses agents

“Share the context” does not mean blindly paste every JSONL byte into one prompt. DAB treats the source transcript as auditable history and the repository as current truth.

![DAB handoff lifecycle](docs/assets/handoff-lifecycle.svg)

### Claude Desktop → Codex Desktop

1. The Claude Plugin's `SessionStart` hook records the exact current transcript path.
2. In `auto` mode, DAB passes that JSONL to Codex's external-agent importer.
3. Codex converts it into a persistent native thread, then resumes the thread with the bounded review request under a read-only sandbox.
4. DAB returns the final Codex response and opens the native thread through a `codex://` deep link.

This is native history import, following Codex's importer conversion rules—not a claim that Claude's hidden model state is copied.

### Codex Desktop → Claude Desktop

1. DAB locates the current Codex rollout using `CODEX_THREAD_ID`.
2. It creates a user-level normalized transcript artifact containing user/assistant messages and bounded notes for relevant tool activity.
3. It excludes source-host system/developer control, hidden reasoning, metadata, and sidechains.
4. A new Claude Desktop Code session receives the artifact plus the review task and reads the current repository directly.
5. DAB waits for a real text `end_turn` and returns Claude's final response and session ID.

Claude Desktop does not expose a public cross-vendor transcript importer, so this direction provides a transcript artifact to a new native session; it does not pretend to rewrite Claude's visible chat history.

### Context modes

| Mode | What the target receives |
| --- | --- |
| `auto` | Native import when available; otherwise a normalized full transcript. Bundled Skills use this mode. |
| `full` | Always use a normalized full transcript artifact. |
| `raw` | The exact source JSONL path plus its SHA-256 hash. |
| `bounded` | Only explicit `--context`; useful when transcript content must not cross providers. |

The source JSONL is never modified. `auto`, `full`, and `raw` may expose text previously produced by users, agents, or tools to the destination model provider; use `bounded` for sensitive cross-provider boundaries. See [architecture](docs/architecture.md) for trust boundaries and failure semantics.

## 4. How to extend it with your own Skill

DAB separates **workflow semantics** from **Desktop transport**:

```text
your Skill or Plugin
  └─ decides when to run, what B should do, and the result contract
       └─ dab handoff / Node API
            └─ context, native session creation, waiting, and result return
```

A third-party Skill can live in its own GitHub repository, npm package, Claude Plugin, or user-scope Agent Skill. It does not need to add files to the business repository, and DAB does not require a proprietary Skill registry.

The minimum CLI contract is:

```bash
dab handoff \
  --to claude \
  --cwd "$PWD" \
  --request "Review authentication boundaries" \
  --workflow security-review \
  --instructions "Return severity, file:line, impact, and evidence" \
  --context-mode auto \
  --json
```

Node packages can use the same engine directly:

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

A minimal cross-host package looks like this:

```text
my-review-skill/
├── .claude-plugin/plugin.json
├── integrations/claude-plugin/skills/my-review/SKILL.md
└── integrations/codex-skill/my-review/SKILL.md
```

Both Skills call the installed `dab` executable and own only the workflow instructions. Start with the [Skill package authoring guide](docs/skill-packages.md) and the working [security-review example](examples/security-review-skill).

## Install and use

### Requirements

- macOS
- Node.js 20 or newer
- Claude Desktop with the target project already visible in the Code sidebar
- Codex Desktop / ChatGPT app
- macOS Accessibility permission for the terminal or host app that runs `dab`

### Install from npm

```bash
npm install -g desktop-agent-bridge
dab install
```

Restart both Desktop apps after installation. `dab install` adds:

- `~/.local/bin/dab`
- the Codex user Skill at `~/.agents/skills/peer-review/SKILL.md`
- the Claude user Plugin, including the `peer-review` Skill and transcript hook

Then, from a project conversation:

```text
# Codex Desktop
$peer-review Ask Claude to review the current changes for correctness and regressions.

# Claude Desktop
/peer-review Ask Codex to review the current changes against the intended design.
```

To upgrade:

```bash
npm install -g desktop-agent-bridge@latest
dab install
```

For contributors:

```bash
git clone https://github.com/WarrenJones/desktop-agent-bridge.git
cd desktop-agent-bridge
node scripts/install.js
npm test
```

## Safety, compatibility, and scope

- Codex reviews run with `--sandbox read-only`.
- Claude Desktop is switched to Manual permission mode before submission. This creates an approval boundary, but it is not an OS-level read-only sandbox; do not approve modifications during a review.
- Prompts also prohibit file changes, Git mutation, deployment, and destructive commands.
- Existing local Desktop login state is reused; DAB stores no credentials.
- Claude Desktop currently lacks a stable public session-creation API. Its semantic Accessibility adapter is isolated in [`scripts/claude-desktop.jxa`](scripts/claude-desktop.jxa), so a UI compatibility update is normally contained there.
- The MVP does not include real-time agent chat, a multi-agent scheduler, arbitrary attachment to an existing target session, code modification, deployment, or a separate `doctor` command.

Run the verification suite with:

```bash
npm test
npm run check
```

## License and prior art

MIT. The implementation is independent code informed by public behavior and documentation from projects such as OpenAI's `codex-plugin-cc`, `agent-bridge`, and `hcom`; it does not copy their source.
