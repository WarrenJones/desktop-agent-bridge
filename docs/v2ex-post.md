# 给 Codex Desktop 补上 Claude Desktop peer review，并自动带回 Context 和结论

最近我在同时使用 Codex Desktop 和 Claude Desktop 写代码时，经常遇到一个场景：

我已经在 Agent A 里完成了技术方案和代码实现，想让 Agent B 再独立 review 一遍。代码本身两边都能读取，但方案取舍、产品规则以及前面讨论过的 Context，通常还留在 Agent A 的对话里。

之前我的做法是在两个应用之间手动复制 Context、重新描述任务，再把 review 结果复制回来。于是我做了一个开源工具：[Desktop Agent Bridge](https://github.com/WarrenJones/desktop-agent-bridge)。

它目前可以完成两条双向流程：

```text
Codex Desktop → 新建 Claude Desktop session → review → 结果返回 Codex
Claude Desktop → 新建 Codex Desktop task   → review → 结果返回 Claude
```

先把和现有工具的边界说清楚：Claude Desktop 的 Code 标签运行 Claude Code，也支持安装 OpenAI 官方 `codex-plugin-cc`。所以 **Claude Desktop / Claude Code → Codex** 不是空白；如果你只需要这个方向，官方插件已经更合适。这个项目主要补的是 **Codex Desktop → Claude Desktop**，并把反方向也放进同一个 workflow，让两边都能用相同方式发起 review。

例如，在 Codex Desktop 当前对话中输入：

```text
$peer-review Ask Claude to review the current changes.
```

DAB 会把当前项目和必要的源会话 Context 交给 Claude，在同一项目下创建一条新的、可见的 Claude Desktop session。Claude 完成只读 review 后，结论会自动返回原来的 Codex 对话。

反方向在 Claude Desktop 中输入：

```text
/peer-review Ask Codex to review the current changes.
```

流程相同，只是 reviewer 换成 Codex Desktop。

![Codex 调用 Claude review](https://raw.githubusercontent.com/WarrenJones/desktop-agent-bridge/main/docs/assets/walkthrough/claude-review-session.jpg)

它不是一个新的 IDE，也不是通用多 Agent 调度平台。它只是补上原生 Codex Desktop 和原生 Claude Desktop 之间的 Context handoff：

- 保留两个官方 Desktop 应用原本的使用体验；
- 把源对话中已经形成的决策传给另一个 Agent；
- 目标 Agent 的新 session 对用户可见，可以继续追问；
- review 结果自动回到源对话，不用手动复制粘贴；
- 底层提供 CLI 和 Node API，后续可以扩展安全审查、架构 review、测试方案 review 等 Skill。

目前内置的第一个 Skill 是 `peer-review`。两个方向默认只读，不会修改代码。

安装方式：

```bash
npm install -g desktop-agent-bridge
dab install
```

然后重启 Codex Desktop 和 Claude Desktop，就可以在项目对话中调用。

当前限制也直接说明一下：

- 目前只支持 macOS；
- 需要 Node.js 20+；
- 需要同时安装 Codex Desktop 和 Claude Desktop；
- Claude 侧的目标项目需要已经出现在 Code sidebar 中；
- 因为原生 Desktop 没有提供完整、稳定的跨应用 session API，部分能力依赖应用当前暴露的本地接口和 macOS Accessibility，后续 Desktop 更新可能需要做兼容适配；
- Context 可能跨模型供应商传递，敏感项目建议先看仓库里的 Context 模式和信任边界说明。

项目地址：<https://github.com/WarrenJones/desktop-agent-bridge>

npm：<https://www.npmjs.com/package/desktop-agent-bridge>

这个项目现在还很早期。我更想确认的是：大家是否也遇到过“一个 Agent 干完活，让另一个 Agent 带着原会话 Context 独立检查”的需求？如果你愿意试用，欢迎反馈安装兼容性、Context 是否足够，以及除了 code review 之外最想扩展的 workflow。

## 已发布 V2EX 帖子的更正回复

前面关于 `codex-plugin-cc` 的描述需要更正：Claude Desktop 的 Code 标签运行 Claude Code，也支持安装 Plugin，所以官方 `codex-plugin-cc` 确实可以覆盖 Claude Desktop / Claude Code → Codex 的 review、委派和 transfer。我之前把“Claude Code Plugin”误判成“不支持 Claude Desktop”，这个结论不准确。

DAB 真正新增的方向是 Codex Desktop → Claude Desktop；Claude → Codex 的实现主要用于让两边保持同一个 workflow。如果只需要 Claude → Codex，直接用官方插件更合适。README 和调研文档已经按这个边界修正。
