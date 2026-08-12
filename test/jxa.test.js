import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test(
  "the Claude Desktop JXA driver compiles",
  { skip: process.platform !== "darwin" },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "dab-jxa-"));
    try {
      execFileSync("osacompile", [
        "-l",
        "JavaScript",
        "-o",
        join(directory, "claude-desktop.scpt"),
        fileURLToPath(new URL("../scripts/claude-desktop.jxa", import.meta.url)),
      ]);
    } finally {
      rmSync(directory, { recursive: true });
    }
  },
);
