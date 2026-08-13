# Desktop Agent Bridge

[![npm version](https://img.shields.io/npm/v/desktop-agent-bridge.svg)](https://www.npmjs.com/package/desktop-agent-bridge)
[![macOS](https://img.shields.io/badge/platform-macOS-black.svg)](#install-and-use)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Let the agent in your current native Desktop conversation ask another native Desktop agent for help—with session context—and bring the answer back.**

[中文说明](README.zh-CN.md) · [Architecture](docs/architecture.md) · [Research and rationale](docs/research-and-rationale.md) · [Skill authoring](docs/skill-packages.md)

```bash
npm install -g desktop-agent-bridge
dab install
```

## 1. What it is

Desktop Agent Bridge (DAB) connects **Codex Desktop and Claude Desktop in both directions**. The source agent remains the user's working conversation; DAB transfers the task and relevant source-session history, opens a new visible session in the other native Desktop app, waits for the result, and returns that result to the source agent.

```text
current Desktop conversation
        │ task + source-session context
        ▼
Desktop Agent Bridge ──► new native Desktop review session
        ▲                            │
        └──────── final result ──────┘
```

The first bundled workflow is `peer-review`:

- In Codex Desktop: `$peer-review Ask Claude to review the current changes.`
- In Claude Desktop: `/peer-review Ask Codex to review the current changes.`
- Both reviewers inspect the same current working tree without modifying it; Codex uses a read-only sandbox, while Claude uses Manual approval mode.
- The transport engine is generic; independent Skills can build security review, architecture challenge, test-plan review, or other handoffs.

### What a real handoff looks like

The screenshots below come from two real handoffs using the public [`demo-review-project`](examples/demo-review-project). In both examples, the critical product decision exists **only in Agent A's conversation**, not in the repository and not in the request sent to Agent B. Every screenshot is cropped to the demo content area; private sidebars, unrelated tasks, account details, notifications, and local paths are excluded.

#### Codex Desktop → Claude Desktop → Codex Desktop

1. **Agent A has finished the work and holds a decision in its conversation.** Codex knows that membership credit may reduce item subtotal but must never pay shipping. That rule is intentionally absent from the repository.

   ![Codex conversation containing implementation context](docs/assets/walkthrough/codex-source-context.jpg)

2. **The user invokes `peer-review` in that same Codex conversation.** The request asks Claude to review against earlier decisions without revealing the expected defect.

   ![Codex invokes the Peer Review Skill](docs/assets/walkthrough/codex-invokes-peer-review.jpg)

3. **DAB creates a new native Claude Desktop session in the same project.** Claude reads the transferred source-session context and the live working tree, then finds that `checkoutTotal` lets excess credit pay shipping.

   ![New Claude Desktop review session](docs/assets/walkthrough/claude-review-session.jpg)

4. **Claude's result returns to the original Codex task automatically.** No copy and paste is required.

   ![Claude review result returned to Codex](docs/assets/walkthrough/claude-result-in-codex.jpg)

#### Claude Desktop → Codex Desktop → Claude Desktop

1. **Agent A holds the decision and invokes `peer-review`.** Claude knows that a token is expired at the exact `expiresAt` instant, then asks Codex to review `src/token.js` without putting that rule in the review request.

   ![Claude conversation context and Peer Review invocation](docs/assets/walkthrough/claude-source-context.jpg)

2. **DAB imports the source transcript into a new persistent Codex Desktop task.** Codex finds that `now > expiresAt` accepts the exact expiration boundary and must be `>=`.

   ![New Codex Desktop review task](docs/assets/walkthrough/codex-review-session.jpg)

3. **Codex's findings return to the original Claude conversation automatically.** The source conversation explicitly notes that Codex derived the rule from the imported transcript rather than a hint in the request.

   ![Codex review result returned to Claude](docs/assets/walkthrough/codex-result-in-claude.jpg)

## 2. Why it needs to exist

Agent-to-agent delegation already exists, but the representative tools we reviewed solve a different boundary:

| Project | Where agents run | Context / collaboration model | Native Codex Desktop ↔ Claude Desktop? |
| --- | --- | --- | --- |
| [OpenAI `codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) | Claude Code → Codex runtime / persistent Codex thread | Git-based review, explicit delegation, and Claude transcript import for transfer | No. It starts from Claude Code and is not symmetric. |
| [`agent-bridge`](https://github.com/raysonmeng/agent-bridge) | Claude Code and Codex CLI/TUI | Persistent bidirectional peers through a daemon, MCP, and app-server | No. Its peers are terminal agents. |
| [`hcom`](https://github.com/aannoo/hcom) | Multiple CLI agents launched or attached in terminals | Hooks, messages, transcripts, events, and local SQLite | No. It coordinates terminal agents. |
| [VS Code Agent Sessions](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions) | Multiple sessions owned by one VS Code host | The host can fork history, read recent context, and message sessions | No. Both sessions must live inside the shared VS Code host. |
| **Desktop Agent Bridge** | **Native Codex Desktop and native Claude Desktop** | **Source transcript + live working tree → visible target session → result returned** | **Yes, this is its narrow purpose.** |

The gap is not “agents cannot talk.” It is this exact workflow:

1. keep working in the first-party Desktop app you already use;
2. ask the other vendor's Desktop agent for an independent opinion;
3. let that agent see the decisions already made in the source conversation;
4. keep the new target session visible and resumable;
5. receive the conclusion without copying and pasting between windows.

DAB deliberately does not replace either agent UI, build a shared chat room, or become a multi-agent scheduler. It is a small interoperability layer at the native Desktop session boundary. The evidence and narrower product conclusion are documented in [research and rationale](docs/research-and-rationale.md).

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
