import { runClaudeReview, runCodexReview } from "./runners.js";
import { resolve } from "node:path";

const HELP = `desktop-agent-bridge

Usage:
  dab review --to <claude|codex> --request <text> [options]

Options:
  --cwd <path>       Project directory (default: current directory)
  --context <text>   Decisions and conversational context from the source agent
  --timeout <ms>     End-to-end timeout (default: 600000)
  --json             Print the complete result as JSON
  -h, --help         Show this help
`;

export function parseCliArgs(args, defaultCwd = process.cwd()) {
  const command = args[0];
  if (command !== "review") {
    throw new Error(command ? `Unknown command: ${command}` : "A command is required.");
  }

  const parsed = {
    command,
    to: undefined,
    cwd: resolve(defaultCwd),
    request: undefined,
    context: "",
    json: false,
    timeoutMs: 600_000,
  };

  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--json") {
      parsed.json = true;
      continue;
    }
    if (["--to", "--cwd", "--request", "--context", "--timeout"].includes(flag)) {
      const value = args[index + 1];
      if (value === undefined) throw new Error(`${flag} requires a value.`);
      if (flag === "--timeout") {
        parsed.timeoutMs = Number(value);
      } else {
        parsed[flag.slice(2)] =
          flag === "--cwd" ? resolve(defaultCwd, value) : value;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${flag}`);
  }

  if (!parsed.to || !["claude", "codex"].includes(parsed.to)) {
    throw new Error("--to must be claude or codex.");
  }
  if (!parsed.request) throw new Error("--request is required.");
  if (!Number.isFinite(parsed.timeoutMs) || parsed.timeoutMs <= 0) {
    throw new Error("--timeout must be a positive number of milliseconds.");
  }
  return parsed;
}

export async function main(
  args = process.argv.slice(2),
  io = { stdout: process.stdout, stderr: process.stderr },
) {
  if (args.includes("--help") || args.includes("-h")) {
    io.stdout.write(HELP);
    return 0;
  }

  let options;
  try {
    options = parseCliArgs(args);
    io.stderr.write(`Starting native ${options.to} review...\n`);
    const result =
      options.to === "claude"
        ? await runClaudeReview(options)
        : await runCodexReview(options);

    if (options.json) {
      io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      io.stdout.write(`${result.result}\n`);
      if (result.sessionId) {
        io.stderr.write(`${options.to} session: ${result.sessionId}\n`);
      }
    }
    if (result.handoffError) {
      io.stderr.write(
        `Review completed, but ${options.to} Desktop could not be opened: ${result.handoffError}\n`,
      );
    }
    return 0;
  } catch (error) {
    io.stderr.write(`desktop-agent-bridge: ${error.message}\n`);
    return 1;
  }
}
