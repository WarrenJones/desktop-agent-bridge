import { resolve } from "node:path";

import { runClaudeReview, runCodexReview } from "./runners.js";

export async function handoff(options) {
  if (!options || !["claude", "codex"].includes(options.to)) {
    throw new Error("to must be claude or codex.");
  }
  if (!options.request) throw new Error("request is required.");
  const normalized = {
    ...options,
    cwd: resolve(options.cwd ?? process.cwd()),
    workflow: options.workflow ?? "custom-handoff",
  };
  return options.to === "claude"
    ? runClaudeReview(normalized)
    : runCodexReview(normalized);
}

export { runClaudeReview, runCodexReview } from "./runners.js";
export {
  CONTEXT_MODES,
  normalizeTranscript,
  prepareHandoffContext,
  resolveSourceTranscript,
} from "./context.js";
