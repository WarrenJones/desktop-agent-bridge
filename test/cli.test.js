import test from "node:test";
import assert from "node:assert/strict";

import { main, parseCliArgs } from "../src/cli.js";

test("parseCliArgs reads a cross-agent review request", () => {
  assert.deepEqual(
    parseCliArgs([
      "review",
      "--to",
      "claude",
      "--cwd",
      "/repo",
      "--request",
      "Review auth",
      "--context",
      "Decision A",
      "--json",
      "--timeout",
      "120000",
    ]),
    {
      command: "review",
      to: "claude",
      cwd: "/repo",
      request: "Review auth",
      context: "Decision A",
      json: true,
      timeoutMs: 120000,
    },
  );
});

test("parseCliArgs accepts the npm post-install setup command", () => {
  assert.deepEqual(parseCliArgs(["install"]), { command: "install" });
});

test("parseCliArgs accepts full transcript handoff options", () => {
  const parsed = parseCliArgs([
    "handoff",
    "--to",
    "codex",
    "--request",
    "Challenge the architecture",
    "--context-mode",
    "auto",
    "--source-transcript",
    "/tmp/source.jsonl",
    "--workflow",
    "architecture-challenge",
    "--instructions",
    "Return assumptions before findings.",
  ]);

  assert.equal(parsed.command, "handoff");
  assert.equal(parsed.contextMode, "auto");
  assert.equal(parsed.sourceTranscript, "/tmp/source.jsonl");
  assert.equal(parsed.workflow, "architecture-challenge");
  assert.equal(parsed.instructions, "Return assumptions before findings.");
});

test("parseCliArgs gives generic handoffs a non-review workflow", () => {
  const parsed = parseCliArgs([
    "handoff",
    "--to",
    "claude",
    "--request",
    "Create a test plan",
  ]);

  assert.equal(parsed.workflow, "custom-handoff");
});

test("parseCliArgs rejects unsupported context modes", () => {
  assert.throws(
    () =>
      parseCliArgs([
        "review",
        "--to",
        "claude",
        "--request",
        "Review it",
        "--context-mode",
        "everything",
      ]),
    /--context-mode must be/,
  );
});

test("main installs both Desktop skills for the current user", async () => {
  const calls = [];
  let stdout = "";
  const exitCode = await main(
    ["install"],
    {
      stdout: { write: (text) => (stdout += text) },
      stderr: { write: () => {} },
    },
    {
      projectRoot: "/package",
      homeDirectory: "/home/user",
      installSkills: async (options) => {
        calls.push(options);
        return [
          { target: "/home/user/.agents/skills/peer-review" },
          { target: "/home/user/.claude/skills/peer-review" },
        ];
      },
    },
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    { projectRoot: "/package", homeDirectory: "/home/user" },
  ]);
  assert.match(stdout, /\.agents\/skills\/peer-review/);
  assert.match(stdout, /\.claude\/skills\/peer-review/);
});

test("parseCliArgs rejects invalid timeouts", () => {
  assert.throws(
    () =>
      parseCliArgs([
        "review",
        "--to",
        "codex",
        "--request",
        "Review it",
        "--timeout",
        "soon",
      ]),
    /--timeout must be/,
  );
});

test("parseCliArgs resolves a relative cwd against the invocation directory", () => {
  const parsed = parseCliArgs(
    ["review", "--to", "codex", "--cwd", "child", "--request", "Review it"],
    "/repo",
  );

  assert.equal(parsed.cwd, "/repo/child");
});

test("parseCliArgs rejects unsupported targets", () => {
  assert.throws(
    () =>
      parseCliArgs([
        "review",
        "--to",
        "gemini",
        "--request",
        "Review it",
      ]),
    /--to must be claude or codex/,
  );
});

test("parseCliArgs requires a review request", () => {
  assert.throws(
    () => parseCliArgs(["review", "--to", "codex"]),
    /--request is required/,
  );
});
