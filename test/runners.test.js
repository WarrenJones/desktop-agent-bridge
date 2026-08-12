import test from "node:test";
import assert from "node:assert/strict";

import {
  executeProcess,
  runClaudeReview,
  runCodexReview,
  waitForClaudeTranscript,
} from "../src/runners.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("executeProcess terminates a child after the timeout", async () => {
  const result = await executeProcess(
    process.execPath,
    ["-e", "setTimeout(() => {}, 10_000)"],
    { timeoutMs: 50 },
  );

  assert.equal(result.timedOut, true);
});

test("waitForClaudeTranscript caps polling sleep to the remaining timeout", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dab-transcripts-"));
  const times = [0, 0, 0, 20, 25];
  const sleeps = [];
  try {
    await assert.rejects(
      waitForClaudeTranscript({
        requestId: "missing",
        timeoutMs: 25,
        startedAt: 0,
        cwd: "/repo",
        transcriptRoot: directory,
        now: () => times.shift() ?? 25,
        sleep: async (milliseconds) => sleeps.push(milliseconds),
      }),
      /Timed out/,
    );
    assert.deepEqual(sleeps, [5]);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("runCodexReview executes the Desktop runtime and opens the persisted thread", async () => {
  const calls = [];
  const execute = async (command, args, options) => {
    calls.push({ command, args, options });
    return {
      exitCode: 0,
      stdout: [
        '{"type":"thread.started","thread_id":"thread-123"}',
        '{"type":"item.completed","item":{"type":"agent_message","text":"Looks good"}}',
      ].join("\n"),
      stderr: "",
    };
  };
  const opened = [];

  const result = await runCodexReview({
    cwd: "/repo",
    request: "Review it",
    context: "Decision A",
    execute,
    runtime: "/desktop/codex",
    openUrl: async (url) => opened.push(url),
  });

  assert.equal(calls[0].command, "/desktop/codex");
  assert.equal(calls[0].options.cwd, "/repo");
  assert.match(calls[0].args.at(-1), /Decision A/);
  assert.match(calls[0].args.at(-1), /BEGIN_SOURCE_REQUEST_/);
  assert.deepEqual(opened, ["codex://threads/thread-123"]);
  assert.deepEqual(result, {
    target: "codex",
    sessionId: "thread-123",
    result: "Looks good",
  });
});

test("runCodexReview reports the execution failure with stderr", async () => {
  await assert.rejects(
    runCodexReview({
      cwd: "/repo",
      request: "Review it",
      runtime: "/desktop/codex",
      execute: async () => ({ exitCode: 2, stdout: "", stderr: "auth failed" }),
      openUrl: async () => {},
    }),
    /auth failed/,
  );
});

test("runCodexReview preserves the review when Desktop handoff fails", async () => {
  const result = await runCodexReview({
    cwd: "/repo",
    request: "Review it",
    runtime: "/desktop/codex",
    execute: async () => ({
      exitCode: 0,
      stdout: [
        '{"type":"thread.started","thread_id":"thread-123"}',
        '{"type":"item.completed","item":{"type":"agent_message","text":"Finding"}}',
      ].join("\n"),
      stderr: "",
    }),
    openUrl: async () => {
      throw new Error("deep link failed");
    },
  });

  assert.deepEqual(result, {
    target: "codex",
    sessionId: "thread-123",
    result: "Finding",
    handoffError: "deep link failed",
  });
});

test("runClaudeReview invokes the native Desktop driver and returns its response", async () => {
  const calls = [];
  const execute = async (command, args, options) => {
    calls.push({ command, args, options });
    return {
      exitCode: 0,
      stdout: JSON.stringify({ submitted: true }),
      stderr: "",
    };
  };

  const result = await runClaudeReview({
    cwd: "/repo",
    request: "Review it",
    context: "Decision A",
    execute,
    driverPath: "/pkg/scripts/claude-desktop.jxa",
    requestId: "request-123",
    waitForTranscript: async ({ requestId }) => {
      assert.equal(requestId, "request-123");
      return { sessionId: "claude-session", result: "One issue" };
    },
  });

  assert.equal(calls[0].command, "osascript");
  assert.deepEqual(calls[0].args.slice(0, 3), [
    "-l",
    "JavaScript",
    "/pkg/scripts/claude-desktop.jxa",
  ]);
  assert.equal(calls[0].args[3], "/repo");
  assert.match(calls[0].args[4], /Decision A/);
  assert.match(calls[0].args[4], /DAB_REQUEST_ID:request-123/);
  assert.equal(calls[0].options.timeoutMs, 600_000);
  assert.deepEqual(result, {
    target: "claude",
    sessionId: "claude-session",
    result: "One issue",
  });
});

test("runClaudeReview spends one timeout budget across submission and polling", async () => {
  const times = [1_000, 1_250];
  let pollingTimeout;

  await runClaudeReview({
    cwd: "/repo",
    request: "Review it",
    execute: async () => ({
      exitCode: 0,
      stdout: JSON.stringify({ submitted: true }),
      stderr: "",
    }),
    requestId: "request-123",
    timeoutMs: 1_000,
    now: () => times.shift(),
    waitForTranscript: async ({ timeoutMs }) => {
      pollingTimeout = timeoutMs;
      return { sessionId: "claude-session", result: "Done" };
    },
  });

  assert.equal(pollingTimeout, 750);
});
