import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodexArgs,
  buildCodexResumeArgs,
  buildReviewPrompt,
  parseClaudeTranscript,
  parseCodexJsonl,
  resolveCodexRuntime,
} from "../src/core.js";

test("buildReviewPrompt preserves the source context and enforces read-only review", () => {
  const prompt = buildReviewPrompt({
    sourceAgent: "claude",
    request: "Review the authentication changes.",
    context: "The refresh token fallback was intentionally removed.",
    boundary: "test-boundary",
  });

  assert.match(prompt, /Source agent: claude/);
  assert.match(prompt, /Review the authentication changes/);
  assert.match(prompt, /refresh token fallback was intentionally removed/);
  assert.match(prompt, /Do not modify files/);
  assert.match(prompt, /git diff/);
  assert.match(prompt, /BEGIN_SOURCE_REQUEST_test-boundary/);
  assert.match(prompt, /END_SOURCE_CONTEXT_test-boundary/);
});

test("parseClaudeTranscript finds the marked turn and its final response", () => {
  const transcript = [
    {
      type: "user",
      sessionId: "claude-session",
      message: { role: "user", content: "Review this\nDAB_REQUEST_ID:abc" },
    },
    {
      type: "assistant",
      sessionId: "claude-session",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Finding one" }],
        stop_reason: "end_turn",
      },
    },
  ]
    .map(JSON.stringify)
    .join("\n");

  assert.deepEqual(parseClaudeTranscript(transcript, "abc"), {
    complete: true,
    sessionId: "claude-session",
    result: "Finding one",
  });
});

test("parseClaudeTranscript ignores responses from before the marked turn", () => {
  const transcript = [
    {
      type: "assistant",
      sessionId: "claude-session",
      message: {
        content: [{ type: "text", text: "Old response" }],
        stop_reason: "end_turn",
      },
    },
    {
      type: "user",
      sessionId: "claude-session",
      message: { content: "DAB_REQUEST_ID:abc" },
    },
  ]
    .map(JSON.stringify)
    .join("\n");

  assert.deepEqual(parseClaudeTranscript(transcript, "abc"), {
    complete: false,
    sessionId: "claude-session",
    result: undefined,
  });
});

test("parseClaudeTranscript does not combine an old preamble with end-turn thinking", () => {
  const transcript = [
    {
      type: "user",
      sessionId: "claude-session",
      cwd: "/repo",
      message: { content: "DAB_REQUEST_ID:abc" },
    },
    {
      type: "assistant",
      sessionId: "claude-session",
      cwd: "/repo",
      requestId: "message-1",
      message: {
        content: [{ type: "text", text: "I will inspect the repository." }],
        stop_reason: "tool_use",
      },
    },
    {
      type: "assistant",
      sessionId: "claude-session",
      cwd: "/repo",
      requestId: "message-2",
      message: {
        content: [{ type: "thinking", thinking: "Finalizing" }],
        stop_reason: "end_turn",
      },
    },
  ]
    .map(JSON.stringify)
    .join("\n");

  assert.deepEqual(parseClaudeTranscript(transcript, "abc", "/repo"), {
    complete: false,
    sessionId: "claude-session",
    result: undefined,
  });
});

test("parseClaudeTranscript accepts text from the same end-turn event", () => {
  const transcript = [
    {
      type: "user",
      sessionId: "claude-session",
      cwd: "/repo",
      message: { content: "DAB_REQUEST_ID:abc" },
    },
    {
      type: "assistant",
      sessionId: "claude-session",
      cwd: "/repo",
      requestId: "message-2",
      message: {
        content: [{ type: "thinking", thinking: "Finalizing" }],
        stop_reason: "end_turn",
      },
    },
    {
      type: "assistant",
      sessionId: "claude-session",
      cwd: "/repo",
      requestId: "message-2",
      message: {
        content: [{ type: "text", text: "Final review" }],
        stop_reason: "end_turn",
      },
    },
  ]
    .map(JSON.stringify)
    .join("\n");

  assert.deepEqual(parseClaudeTranscript(transcript, "abc", "/repo"), {
    complete: true,
    sessionId: "claude-session",
    result: "Final review",
  });
});

test("parseClaudeTranscript ignores marker echoes in tool results and sidechains", () => {
  const transcript = [
    {
      type: "user",
      sessionId: "claude-session",
      cwd: "/repo",
      message: { content: "DAB_REQUEST_ID:abc" },
    },
    {
      type: "user",
      sessionId: "claude-session",
      cwd: "/repo",
      message: {
        content: [{ type: "tool_result", content: "DAB_REQUEST_ID:abc" }],
      },
    },
    {
      type: "assistant",
      sessionId: "subagent-session",
      cwd: "/repo",
      isSidechain: true,
      message: {
        content: [{ type: "text", text: "Subagent result" }],
        stop_reason: "end_turn",
      },
    },
    {
      type: "assistant",
      sessionId: "claude-session",
      cwd: "/repo",
      message: {
        content: [{ type: "text", text: "Main result" }],
        stop_reason: "end_turn",
      },
    },
  ]
    .map(JSON.stringify)
    .join("\n");

  assert.deepEqual(parseClaudeTranscript(transcript, "abc", "/repo"), {
    complete: true,
    sessionId: "claude-session",
    result: "Main result",
  });
});

test("parseClaudeTranscript accepts assistant events only from the captured session", () => {
  const transcript = [
    {
      type: "user",
      sessionId: "main-session",
      cwd: "/repo",
      message: { content: "DAB_REQUEST_ID:abc" },
    },
    {
      type: "assistant",
      sessionId: "other-session",
      cwd: "/repo",
      message: {
        content: [{ type: "text", text: "Wrong session" }],
        stop_reason: "end_turn",
      },
    },
    {
      type: "assistant",
      sessionId: "main-session",
      cwd: "/repo",
      message: {
        content: [{ type: "text", text: "Correct session" }],
        stop_reason: "end_turn",
      },
    },
  ]
    .map(JSON.stringify)
    .join("\n");

  assert.deepEqual(parseClaudeTranscript(transcript, "abc", "/repo"), {
    complete: true,
    sessionId: "main-session",
    result: "Correct session",
  });
});

test("parseClaudeTranscript does not cross into a later user turn", () => {
  const transcript = [
    {
      type: "user",
      sessionId: "main-session",
      cwd: "/repo",
      message: { content: "DAB_REQUEST_ID:abc" },
    },
    {
      type: "user",
      sessionId: "main-session",
      cwd: "/repo",
      message: { content: "A later user message" },
    },
    {
      type: "assistant",
      sessionId: "main-session",
      cwd: "/repo",
      message: {
        content: [{ type: "text", text: "Response to later turn" }],
        stop_reason: "end_turn",
      },
    },
  ]
    .map(JSON.stringify)
    .join("\n");

  assert.deepEqual(parseClaudeTranscript(transcript, "abc", "/repo"), {
    complete: false,
    sessionId: "main-session",
    result: undefined,
  });
});

test("buildCodexArgs isolates connectors and keeps the task persistent", () => {
  const args = buildCodexArgs({ cwd: "/repo", prompt: "review this" });

  assert.deepEqual(args.slice(0, 7), [
    "exec",
    "--json",
    "--sandbox",
    "read-only",
    "--ignore-user-config",
    "--config",
    "mcp_servers={}",
  ]);
  assert.equal(args.includes("--ephemeral"), false);
  assert.deepEqual(args.slice(-4), ["-C", "/repo", "--", "review this"]);
});

test("buildCodexResumeArgs continues an imported session under the review sandbox", () => {
  const args = buildCodexResumeArgs({
    cwd: "/repo",
    threadId: "imported-thread",
    prompt: "review this",
  });

  assert.deepEqual(args.slice(0, 7), [
    "exec",
    "--json",
    "--sandbox",
    "read-only",
    "--ignore-user-config",
    "--config",
    "mcp_servers={}",
  ]);
  assert.deepEqual(args.slice(-3), ["resume", "imported-thread", "review this"]);
  assert.equal(args.includes("/repo"), true);
});

test("parseCodexJsonl returns the thread and last agent message", () => {
  const output = [
    '{"type":"thread.started","thread_id":"thread-123"}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"First"}}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"Final review"}}',
    '{"type":"turn.completed"}',
  ].join("\n");

  assert.deepEqual(parseCodexJsonl(output), {
    threadId: "thread-123",
    result: "Final review",
  });
});

test("parseCodexJsonl fails when Codex did not produce an answer", () => {
  assert.throws(
    () => parseCodexJsonl('{"type":"thread.started","thread_id":"thread-123"}'),
    /without an agent message/,
  );
});

test("resolveCodexRuntime prefers the explicit override, then the Desktop runtime", () => {
  const exists = (path) => path === "/Applications/ChatGPT.app/Contents/Resources/codex";

  assert.equal(
    resolveCodexRuntime({ env: { DAB_CODEX_BIN: "/custom/codex" }, exists }),
    "/custom/codex",
  );
  assert.equal(
    resolveCodexRuntime({ env: {}, exists }),
    "/Applications/ChatGPT.app/Contents/Resources/codex",
  );
});
