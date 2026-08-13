import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const driverPath = fileURLToPath(
  new URL("../scripts/claude-desktop.jxa", import.meta.url),
);

function loadDriver() {
  const context = createContext({});
  runInContext(readFileSync(driverPath, "utf8"), context);
  return context;
}

function accessibilityElement(properties) {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, () => value]),
  );
}

test("finds a project new-session button by its accessible name", () => {
  const driver = loadDriver();
  const button = accessibilityElement({
    role: "AXButton",
    name: "New session in desktop-agent-bridge",
    description: "",
  });
  button.actions = () => [];
  const window = { entireContents: () => [button] };

  const result = driver.findButtonByLabel(
    window,
    "New session in desktop-agent-bridge",
  );

  assert.equal(result, button);
});

test("distinguishes a new-session form from an existing session", () => {
  const driver = loadDriver();
  const projectSelector = accessibilityElement({
    role: "AXPopUpButton",
    name: "desktop-agent-bridge",
  });
  const existingSessionPrompt = accessibilityElement({
    role: "AXTextArea",
    description: "Prompt",
    value: "Type / for commands",
  });
  const newSessionPrompt = accessibilityElement({
    role: "AXTextArea",
    description: "Prompt",
    value: "Describe a task or ask a question",
  });

  assert.equal(
    driver.isProjectFormOpen(
      { entireContents: () => [projectSelector, existingSessionPrompt] },
      "desktop-agent-bridge",
    ),
    false,
  );
  assert.equal(
    driver.isProjectFormOpen(
      { entireContents: () => [projectSelector, newSessionPrompt] },
      "desktop-agent-bridge",
    ),
    true,
  );
});

test("inspects new-session controls from one accessibility snapshot", () => {
  const driver = loadDriver();
  const newSessionButton = accessibilityElement({
    role: "AXButton",
    name: "New session in desktop-agent-bridge",
    description: "",
  });
  const projectSelector = accessibilityElement({
    role: "AXPopUpButton",
    name: "desktop-agent-bridge",
  });
  const existingSessionPrompt = accessibilityElement({
    role: "AXTextArea",
    description: "Prompt",
    value: "Type / for commands",
  });
  let snapshots = 0;
  const window = {
    entireContents: () => {
      snapshots += 1;
      if (snapshots > 1) throw new Error("stale accessibility reference");
      return [newSessionButton, projectSelector, existingSessionPrompt];
    },
  };

  const result = driver.inspectProjectWindow(
    window,
    "desktop-agent-bridge",
  );

  assert.equal(snapshots, 1);
  assert.equal(result.newSession, newSessionButton);
  assert.equal(result.projectFormOpen, false);
});

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
