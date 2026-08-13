import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  normalizeTranscript,
  prepareHandoffContext,
  resolveSourceTranscript,
} from "../src/context.js";

async function withTemporaryDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), "dab-context-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("resolveSourceTranscript locates the current Codex rollout by thread id", async () => {
  await withTemporaryDirectory(async (directory) => {
    const sessions = join(directory, ".codex", "sessions", "2026", "08", "13");
    const transcript = join(sessions, "rollout-current-thread.jsonl");
    await mkdir(sessions, { recursive: true });
    await writeFile(transcript, "{}\n");

    assert.equal(
      await resolveSourceTranscript({
        sourceAgent: "codex",
        env: { CODEX_THREAD_ID: "current-thread" },
        homeDirectory: directory,
      }),
      await realpath(transcript),
    );
  });
});

test("resolveSourceTranscript uses the Claude SessionStart transcript path", async () => {
  await withTemporaryDirectory(async (directory) => {
    const transcript = join(directory, "claude-session.jsonl");
    await writeFile(transcript, "{}\n");

    assert.equal(
      await resolveSourceTranscript({
        sourceAgent: "claude",
        env: { DAB_SOURCE_TRANSCRIPT: transcript },
        homeDirectory: directory,
      }),
      await realpath(transcript),
    );
  });
});

test("resolveSourceTranscript does not let a stale Claude hook path override Codex", async () => {
  await withTemporaryDirectory(async (directory) => {
    const sessions = join(directory, ".codex", "sessions");
    const codexTranscript = join(sessions, "rollout-codex-thread.jsonl");
    const claudeTranscript = join(directory, "stale-claude.jsonl");
    await mkdir(sessions, { recursive: true });
    await writeFile(codexTranscript, "{}\n");
    await writeFile(claudeTranscript, "{}\n");

    assert.equal(
      await resolveSourceTranscript({
        sourceAgent: "codex",
        env: {
          CODEX_THREAD_ID: "codex-thread",
          DAB_SOURCE_TRANSCRIPT: claudeTranscript,
        },
        homeDirectory: directory,
      }),
      await realpath(codexTranscript),
    );
  });
});

test("normalizeTranscript keeps Codex user and assistant text but drops host control records", () => {
  const transcript = [
    { type: "session_meta", payload: { id: "thread-1" } },
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "developer",
        content: [{ type: "input_text", text: "Host-only rule" }],
      },
    },
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Design the auth flow" }],
      },
    },
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Use rotating refresh tokens" }],
      },
    },
    { type: "response_item", payload: { type: "reasoning", summary: [] } },
  ]
    .map(JSON.stringify)
    .join("\n");

  const normalized = normalizeTranscript({ sourceAgent: "codex", transcript });

  assert.match(normalized, /Design the auth flow/);
  assert.match(normalized, /Use rotating refresh tokens/);
  assert.doesNotMatch(normalized, /Host-only rule/);
  assert.doesNotMatch(normalized, /reasoning/);
});

test("normalizeTranscript strips Codex-injected user wrappers but keeps the real request", () => {
  const injected = [
    "<recommended_plugins>",
    "- Example plugin",
    "</recommended_plugins>",
    "# AGENTS.md instructions",
    "<INSTRUCTIONS>",
    "Host-only repository policy",
    "</INSTRUCTIONS>",
    "<environment_context>",
    "<cwd>/repo</cwd>",
    "</environment_context>",
    "Please review the authentication implementation.",
  ].join("\n");
  const transcript = JSON.stringify({
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: injected }],
    },
  });

  const normalized = normalizeTranscript({ sourceAgent: "codex", transcript });

  assert.match(normalized, /Please review the authentication implementation/);
  assert.doesNotMatch(normalized, /Example plugin/);
  assert.doesNotMatch(normalized, /Host-only repository policy/);
  assert.doesNotMatch(normalized, /<cwd>/);
});

test("normalizeTranscript converts Claude tools to bounded notes and ignores sidechains", () => {
  const transcript = [
    {
      type: "user",
      sessionId: "main",
      message: { content: "Review authentication" },
    },
    {
      type: "assistant",
      sessionId: "main",
      message: {
        content: [
          { type: "text", text: "I inspected the implementation." },
          { type: "tool_use", name: "Read", input: { file_path: "/repo/auth.js" } },
        ],
      },
    },
    {
      type: "assistant",
      sessionId: "side",
      isSidechain: true,
      message: { content: [{ type: "text", text: "Hidden subagent result" }] },
    },
  ]
    .map(JSON.stringify)
    .join("\n");

  const normalized = normalizeTranscript({ sourceAgent: "claude", transcript });

  assert.match(normalized, /Review authentication/);
  assert.match(normalized, /I inspected the implementation/);
  assert.match(normalized, /Tool call: Read/);
  assert.match(normalized, /\/repo\/auth\.js/);
  assert.doesNotMatch(normalized, /Hidden subagent result/);
});

test("prepareHandoffContext writes a normalized full transcript outside project source", async () => {
  await withTemporaryDirectory(async (directory) => {
    const transcriptPath = join(directory, "source.jsonl");
    const stateRoot = join(directory, "state");
    await writeFile(
      transcriptPath,
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Keep API compatibility" }],
        },
      }),
    );

    const prepared = await prepareHandoffContext({
      sourceAgent: "codex",
      targetAgent: "claude",
      contextMode: "full",
      context: "Manual decision",
      sourceTranscript: transcriptPath,
      requestId: "request-1",
      stateRoot,
    });

    assert.equal(prepared.strategy, "normalized-transcript");
    assert.equal(prepared.sourceTranscriptPath, await realpath(transcriptPath));
    assert.equal(prepared.artifactPath.startsWith(stateRoot), true);
    assert.match(prepared.promptContext, /Manual decision/);
    assert.match(prepared.promptContext, new RegExp(prepared.artifactPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(await readFile(prepared.artifactPath, "utf8"), /Keep API compatibility/);
  });
});

test("prepareHandoffContext selects native import only for Claude to Codex auto mode", async () => {
  await withTemporaryDirectory(async (directory) => {
    const transcriptPath = join(directory, "source.jsonl");
    await writeFile(transcriptPath, "{}\n");

    const prepared = await prepareHandoffContext({
      sourceAgent: "claude",
      targetAgent: "codex",
      contextMode: "auto",
      sourceTranscript: transcriptPath,
      requestId: "request-2",
      stateRoot: join(directory, "state"),
    });

    assert.equal(prepared.strategy, "native-import");
    assert.equal(prepared.artifactPath, undefined);
  });
});

test("prepareHandoffContext keeps bounded mode independent of source transcripts", async () => {
  const prepared = await prepareHandoffContext({
    sourceAgent: "codex",
    targetAgent: "claude",
    contextMode: "bounded",
    context: "Only this decision",
    requestId: "request-3",
  });

  assert.deepEqual(prepared, {
    requestedMode: "bounded",
    strategy: "bounded",
    promptContext: "Only this decision",
  });
});

test("prepareHandoffContext exposes the exact JSONL path in raw mode", async () => {
  await withTemporaryDirectory(async (directory) => {
    const transcriptPath = join(directory, "source.jsonl");
    await writeFile(transcriptPath, "{}\n");

    const prepared = await prepareHandoffContext({
      sourceAgent: "codex",
      targetAgent: "claude",
      contextMode: "raw",
      sourceTranscript: transcriptPath,
      requestId: "request-4",
    });

    assert.equal(prepared.strategy, "raw-transcript");
    assert.equal(prepared.sourceTranscriptPath, await realpath(transcriptPath));
    assert.match(prepared.promptContext, /exact source JSONL/i);
    assert.match(
      prepared.promptContext,
      new RegExp((await realpath(transcriptPath)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  });
});
