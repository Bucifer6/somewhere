#!/usr/bin/env node
// Offline operator command; never an MCP tool. No queue or approval mutations.
// Root can run on a suitably privileged host; in a capability-dropped container,
// use the actual owner of the private somewhere-agent home/state instead.
import { lstat } from "node:fs/promises";
import { operationsSnapshot } from "./operations-snapshot.js";

const HOME = "/var/lib/somewhere-agent";
const STATE = HOME + "/state";

export function authorizeSnapshotIdentity(uid, stateOwner) {
  if (!Number.isSafeInteger(uid) || uid < 0) throw Error("Invalid execution UID");
  if (uid === 0) return "root-operator";
  if (uid !== stateOwner) throw Error("Operator-only: use root or the owning somewhere-agent account");
  return "agent-owner-read-only";
}
export async function validateOperatorIdentity(uid = process.getuid?.()) {
  const state = await lstat(STATE);
  if (!state.isDirectory() || state.isSymbolicLink() ||
      (state.mode & 0o022) !== 0) {
    throw Error("Unsafe agent state directory ownership or permissions");
  }
  return authorizeSnapshotIdentity(uid, state.uid);
}

async function main() {
  if (process.argv.length !== 2) throw Error("No arguments supported");
  const identity = await validateOperatorIdentity();
  const result = await operationsSnapshot();
  console.log(JSON.stringify({ ...result, readerIdentity: identity }, null, 2));
  if (result.stop !== "engaged") process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  main().catch(error => {
    console.error("Operator snapshot unavailable: " + error.message);
    process.exitCode = 1;
  });
}
