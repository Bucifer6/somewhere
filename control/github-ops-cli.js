#!/usr/bin/env node
// Explicit ROOT-OPERATOR-ONLY proposal publishing command.
// No background polling, no remote network listener, no arbitrary file changes.
import { readFile, lstat } from "node:fs/promises";
import { publishProposal } from "./github-proposals.js";

async function main() {
  if (typeof process.getuid === "function" && process.getuid() !== 0) throw Error("Operator-only: requires root");
  if (process.argv.length !== 3) throw Error("Usage: node control/github-ops-cli.js /root/approved-proposal.json");
  const file = process.argv[2];
  if (!file.startsWith("/root/")) throw Error("Approved proposal must be under /root/");
  const s = await lstat(file);
  if (!s.isFile() || (s.mode & 0o077) !== 0 || s.uid !== 0) throw Error("Proposal file requires root ownership and 0600 permissions");
  const p = JSON.parse(await readFile(file,"utf8"));
  const result = await publishProposal({
    appId: process.env.SOMEWHERE_GITHUB_APP_ID,
    installationId: process.env.SOMEWHERE_GITHUB_INSTALLATION_ID,
    keyPath: "/etc/somewhere-control/github-app.pem",
    proposal:p
  });
  console.log(JSON.stringify(result));
}
main().catch(error=>{
  // Hide detailed provider data or credentials from console output.
  console.error("Proposal submission failed: "+(error.message.startsWith("GitHub API HTTP ") ? error.message : "validation or operation error"));
  process.exitCode=1;
});
