import test from "node:test";
import assert from "node:assert/strict";

import { parseCliArgs } from "../src/cli.js";

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
