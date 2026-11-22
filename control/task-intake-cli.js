#!/usr/bin/env node
// Unprivileged, offline-only task review/intake. Never exported over MCP.
// The complete request JSON is supplied over stdin, not shell arguments.
import { lstat } from "node:fs/promises";
import { previewIntake, submitReviewedTask } from "./task-intake.js";

const MAX_STDIN = 4096;
async function readRequest() {
  let text = "";
  for await (const part of process.stdin) {
    text += part.toString("utf8");
    if (Buffer.byteLength(text) > MAX_STDIN) throw Error("Request exceeds safe input limit");
  }
  const input = JSON.parse(text);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Request must be JSON object");
  return input;
}
async function main() {
  const [command, digest, ...rest] = process.argv.slice(2);
  if (rest.length || !["preview","submit"].includes(command) ||
      (command==="preview" && digest !== undefined) ||
      (command==="submit" && !digest)) throw Error("Usage: task-intake-cli.js preview | submit <reviewed-sha256> (JSON on stdin)");
  const state = await lstat("/var/lib/somewhere-agent/state");
  const uid = process.getuid?.();
  if (!Number.isSafeInteger(uid) || uid <= 0 || uid !== state.uid) throw Error("Only the dedicated agent-state owner can use this CLI");
  const input = await readRequest();
  const result = command === "preview" ? await previewIntake(input) : await submitReviewedTask(input,digest);
  console.log(JSON.stringify(result,null,2));
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  main().catch(error => {console.error("Intake refused: " + error.message);process.exitCode=1;});
}
