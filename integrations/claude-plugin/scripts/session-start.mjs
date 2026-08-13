#!/usr/bin/env node

import { appendFileSync, readFileSync } from "node:fs";

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

const raw = readFileSync(0, "utf8").trim();
const input = raw ? JSON.parse(raw) : {};

if (process.env.CLAUDE_ENV_FILE) {
  const exports = [
    ["DAB_SOURCE_SESSION_ID", input.session_id],
    ["DAB_SOURCE_TRANSCRIPT", input.transcript_path],
  ]
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([name, value]) => `export ${name}=${shellEscape(value)}\n`)
    .join("");
  if (exports) appendFileSync(process.env.CLAUDE_ENV_FILE, exports, "utf8");
}
