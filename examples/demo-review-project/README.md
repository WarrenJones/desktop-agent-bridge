# DAB review demo

This deliberately tiny project powers the two public Desktop Agent Bridge demos.
Its existing tests pass, but each source file contains one boundary defect whose
expected behavior is stated only in the originating Agent conversation.

- `src/checkout.js`: used for Codex Desktop to Claude Desktop.
- `src/token.js`: used for Claude Desktop to Codex Desktop.

The point is to demonstrate session-context handoff, not to benchmark either
model. The exact recording prompts and expected findings live in
[`docs/demo-recording.md`](../../docs/demo-recording.md).
