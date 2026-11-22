#!/usr/bin/env node
// Offline operator command; never exposed as an MCP tool.
// Root-only because it inspects sensitive task and approval directories.
// It cannot alter queue state, create approvals, execute tasks or deploy.
import { operationsSnapshot } from "./operations-snapshot.js";

try {
  if (process.getuid?.() !== 0) throw Error("Operator-only: run as root");
  if (process.argv.length !== 2) throw Error("No arguments supported");
  const result = await operationsSnapshot();
  console.log(JSON.stringify(result, null, 2));
  if (result.stop !== "engaged") process.exitCode = 2;
} catch (error) {
  console.error("Operator snapshot unavailable: " + error.message);
  process.exitCode = 1;
}
