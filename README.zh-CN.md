# Desktop Agent Bridge

[![npm version](https://img.shields.io/npm/v/desktop-agent-bridge.svg)](https://www.npmjs.com/package/desktop-agent-bridge)
[![macOS](https://img.shields.io/badge/platform-macOS-black.svg)](#安装与使用)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**让当前原生 Desktop 会话里的 Agent 带着会话 Context 去调用另一个原生 Desktop Agent，并把结果自动带回来。**

[English](README.md) · [核心架构](docs/architecture.md) · [调研与产品结论](docs/research-and-rationale.md) · [Skill 开发指南](docs/skill-packages.md)

```bash
npm install -g desktop-agent-bridge
dab install
```

## 1. 它是什么

Desktop Agent Bridge（DAB）双向连接 **Codex Desktop 与 Claude Desktop**。源 Agent 继续留在用户正在工作的对话中；DAB 传递任务和必要的源会话历史，在另一个原生 Desktop 应用里创建一条新的、用户可见的 session，等待它完成，再把结果返回源 Agent。

```text
当前 Desktop 对话
       │ 任务 + 源会话 Context
       ▼
Desktop Agent Bridge ──► 新的原生 Desktop review session
       ▲                             │
       └──────── 最终结论 ───────────┘
```

比如相互 review：

- 在 Codex Desktop 中让 Claude Desktop 帮忙 review：`$peer-review Ask Claude to review the current changes.`
- 在 Claude Desktop 中让 Codex Desktop 帮忙 review：`/peer-review Ask Codex to review the current changes.`
- 两个方向的 reviewer 都检查同一份当前工作树且不修改代码；Codex 使用只读 sandbox，Claude 使用 Manual 审批模式。
- 底层 handoff 引擎与 review 方法解耦，第三方 Skill 可以基于它实现安全审查、架构挑战、测试方案 review 等 workflow。

### 一次真实 handoff 到底是什么样

下面的截图来自公开 [`demo-review-project`](examples/demo-review-project) 中真实跑通的两条 handoff。两个例子里，关键产品决策都**只存在于 Agent A 的对话中**，仓库里没有，发给 Agent B 的请求里也没有。所有图片都只保留 demo 内容区，排除了私人侧栏、其他任务、账号信息、通知和本地路径。

#### Codex Desktop → Claude Desktop → Codex Desktop

1. **Agent A 已经完成工作，并在当前对话里掌握产品决策。** Codex 知道“会员积分可以抵扣商品小计，但不能抵扣运费”；这条规则故意没有写进仓库。

   ![Codex 对话中保存着实现 Context](docs/assets/walkthrough/codex-source-context.jpg)

2. **用户直接在同一条 Codex 对话里调用 `peer-review`。** 请求只让 Claude 按前面的决策 review，没有把预期缺陷透露给 Claude。

   ![Codex 调用 Peer Review Skill](docs/assets/walkthrough/codex-invokes-peer-review.jpg)

3. **DAB 在同一个项目下新建原生 Claude Desktop session。** Claude 读取转交的源会话 Context 和当前工作树，发现 `checkoutTotal` 会让超额积分抵扣运费。

   ![新建的 Claude Desktop review session](docs/assets/walkthrough/claude-review-session.jpg)

4. **Claude 的结论自动回到原来的 Codex task。** 用户不需要在两个窗口之间复制粘贴。

   ![Claude review 结论返回 Codex](docs/assets/walkthrough/claude-result-in-codex.jpg)

#### Claude Desktop → Codex Desktop → Claude Desktop

1. **Agent A 掌握决策并调用 `peer-review`。** Claude 知道“到达 `expiresAt` 的精确时刻就算过期”，随后让 Codex review `src/token.js`，但 review 请求本身没有写这条规则。

   ![Claude 对话 Context 与 Peer Review 调用](docs/assets/walkthrough/claude-source-context.jpg)

2. **DAB 把源 transcript 导入新的持久 Codex Desktop task。** Codex 发现 `now > expiresAt` 会放过精确过期边界，必须改为 `>=`。

   ![新建的 Codex Desktop review task](docs/assets/walkthrough/codex-review-session.jpg)

3. **Codex 的结论自动回到原来的 Claude 对话。** 源对话明确说明：Codex 是从导入的 transcript 中得到这条规则，不是从 review 请求里的提示猜到的。

   ![Codex review 结论返回 Claude](docs/assets/walkthrough/codex-result-in-claude.jpg)

## 2. 为什么需要它

Agent 之间的调用早已存在，但我们调研的代表性产品解决的是不同边界：

| 项目 | Agent 运行在哪里 | Context / 协作方式 | 原生 Codex Desktop ↔ Claude Desktop？ |
| --- | --- | --- | --- |
| [OpenAI `codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) | Claude Code → Codex runtime / 持久 Codex thread | Git review、显式委派，以及 transfer 时的 Claude transcript 导入 | 不能。源头是 Claude Code，而且不是对称双向。 |
| [`agent-bridge`](https://github.com/raysonmeng/agent-bridge) | Claude Code 与 Codex CLI/TUI | 通过 daemon、MCP 和 app-server 建立持久的双向 peer | 不能。它的 peer 是终端 Agent。 |
| [`hcom`](https://github.com/aannoo/hcom) | 在终端中启动或接管多个 CLI Agent | hooks、消息、transcript、事件和本地 SQLite | 不能。它协调的是终端 Agent。 |
| [VS Code Agent Sessions](https://code.visualstudio.com/docs/agents/run/sessions/manage-sessions) | 由同一个 VS Code host 管理多个 session | host 可以 fork 历史、读取近期 Context、向其他 session 发消息 | 不能。双方必须都在 VS Code 这个共同宿主内。 |
| **Desktop Agent Bridge** | **原生 Codex Desktop 与原生 Claude Desktop** | **源 transcript + 实时工作树 → 可见目标 session → 结果返回** | **能。这就是它刻意保持狭窄的目标。** |

真正的缺口不是“Agent 不能说话”，而是下面这个完整场景：

1. 用户继续使用习惯的第一方 Desktop 应用；
2. 随时让另一个厂商的 Desktop Agent 提供独立意见；
3. 对方能知道源对话里已经形成、但未必写进代码的决策；
4. 新目标 session 对用户可见、可继续；
5. 结论自动返回，不需要在两个窗口之间复制粘贴。

DAB 不替代两个 Agent 的原生 UI，不造共享聊天室，也不做通用多 Agent 调度器。它只补上原生 Desktop session 之间的互操作层。完整证据与更严格的产品结论见[调研与产品结论](docs/research-and-rationale.md)。

## 3. Context 如何在 Agent 之间传递

“传 Context”不等于把 JSONL 的每个字节一次性粘进 prompt。DAB 把源 transcript 当作可审计的会话历史，把当前仓库当作代码事实来源。

![DAB handoff 生命周期](docs/assets/handoff-lifecycle.svg)

### Claude Desktop → Codex Desktop

1. Claude Plugin 的 `SessionStart` hook 记录当前会话的精确 transcript 路径。
2. `auto` 模式下，DAB 把这份 JSONL 交给 Codex external-agent importer。
3. Codex 按自己的转换规则把它导入为持久原生 thread，再在只读 sandbox 中用本次 review 请求继续该 thread。
4. DAB 返回 Codex 最终结果，并通过 `codex://` deep link 打开这条原生 task。

这是按 Codex importer 规则进行的原生历史导入，不代表复制了 Claude 模型不可见的内部状态。

### Codex Desktop → Claude Desktop

1. DAB 通过 `CODEX_THREAD_ID` 找到当前 Codex rollout。
2. 它在用户级状态目录生成规范化 transcript，保留用户/助手消息，并把相关工具活动转成有限长度的历史说明。
3. 源宿主的 system/developer 控制信息、隐藏 reasoning、metadata 和 sidechain 会被排除。
4. 新 Claude Desktop Code session 获得这份 transcript 和 review 任务，同时直接读取当前仓库。
5. DAB 等待真实文本 `end_turn`，再把 Claude 最终响应和 session ID 返回源 Agent。

Claude Desktop 目前没有公开的跨厂商 transcript importer，所以这个方向是“新原生 session 读取 transcript artifact”，不是伪装成 Claude 可见聊天历史迁移。

### Context 模式

| 模式 | 目标 Agent 能得到什么 |
| --- | --- |
| `auto` | 能原生导入就导入，否则生成完整规范化 transcript；内置 Skill 默认使用。 |
| `full` | 始终生成完整规范化 transcript artifact。 |
| `raw` | 精确源 JSONL 路径及其 SHA-256。 |
| `bounded` | 只传显式 `--context`；适合 transcript 内容不能跨模型供应商的场景。 |

源 JSONL 永远不会被修改。`auto`、`full`、`raw` 可能把用户、Agent 或工具此前产生的文本暴露给目标模型供应商；跨供应商的敏感场景请使用 `bounded`。信任边界和失败语义见[核心架构](docs/architecture.md)。

## 4. 如何扩展自己的 Skill

目前只有一个 `peer-review` Skill，但你可以自行扩展，让两个 Agent 做更多事情，也可以提 Issue。

DAB 把 **workflow 语义** 与 **Desktop transport** 分开：

```text
你的 Skill 或 Plugin
  └─ 决定何时触发、让 B 做什么、结果格式是什么
       └─ dab handoff / Node API
            └─ Context、原生 session 创建、等待与结果返回
```

第三方 Skill 可以放在自己的 GitHub 仓库、npm 包、Claude Plugin 或 user-scope Agent Skill 中，不需要把文件放进业务仓库；DAB 也不要求使用自己的 Skill 商店。

最小 CLI 契约：

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

Node 包也可以直接调用相同引擎：

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

最小跨宿主包结构：

```text
my-review-skill/
├── .claude-plugin/plugin.json
├── integrations/claude-plugin/skills/my-review/SKILL.md
└── integrations/codex-skill/my-review/SKILL.md
```

两份 Skill 都调用用户已经安装的 `dab`，只拥有 workflow 指令。可以从 [Skill 开发指南](docs/skill-packages.md)和可运行的 [security-review 示例](examples/security-review-skill)开始。

## 安装与使用

### 环境要求

- macOS
- Node.js 20+
- Claude Desktop，并且目标项目已经出现在 Code sidebar 中
- Codex Desktop / ChatGPT app
- 运行 `dab` 的终端或宿主应用拥有 macOS Accessibility 权限

### 从 npm 安装

```bash
npm install -g desktop-agent-bridge
dab install
```

安装完成后重启两个 Desktop 应用。`dab install` 会安装：

- `~/.local/bin/dab`
- Codex user Skill：`~/.agents/skills/peer-review/SKILL.md`
- Claude user Plugin，其中包含 `peer-review` Skill 与 transcript hook

然后在项目对话中使用：

```text
# Codex Desktop
$peer-review Ask Claude to review the current changes for correctness and regressions.

# Claude Desktop
/peer-review Ask Codex to review the current changes against the intended design.
```

升级：

```bash
npm install -g desktop-agent-bridge@latest
dab install
```

参与开发：

```bash
git clone https://github.com/WarrenJones/desktop-agent-bridge.git
cd desktop-agent-bridge
node scripts/install.js
npm test
```

## 安全、兼容性与边界

- Codex review 使用 `--sandbox read-only`。
- Claude Desktop 会在提交前切换到 Manual permission mode。它提供审批边界，但不是操作系统级只读 sandbox；review 过程中不要批准修改。
- prompt 同时禁止文件修改、Git 操作、部署和破坏性命令。
- DAB 复用两个 Desktop 应用已有的本地登录状态，不保存凭据。
- Claude Desktop 目前没有稳定的公开 session 创建 API；语义化 Accessibility adapter 被隔离在 [`scripts/claude-desktop.jxa`](scripts/claude-desktop.jxa)，UI 兼容更新通常只需要收敛在这里。
- MVP 不包含实时 Agent 聊天、多 Agent 调度、附着到任意已运行目标 session、代码修改、部署或单独的 `doctor` 命令。

验证：

```bash
npm test
npm run check
```

## License 与 prior art

MIT。实现为独立代码，参考了 OpenAI `codex-plugin-cc`、`agent-bridge`、`hcom` 等项目公开的行为和文档，不复制其源码。
