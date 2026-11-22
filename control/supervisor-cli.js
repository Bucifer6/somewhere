#!/usr/bin/env node
// Read-only inspection or offline rehearsal. No provider credentials are loaded,
// no HTTP clients are used, and the live queue is NEVER advanced by this CLI.
import { join, resolve } from "node:path";
import { TaskQueue } from "./task-queue.js";
import { UsageLedger } from "./usage-ledger.js";
import { inspectSupervised, rehearseTask } from "./supervisor.js";

const home=resolve(process.env.SOMEWHERE_AGENT_HOME??"/var/lib/somewhere-agent");
const queue=new TaskQueue(join(home,"state","tasks"));
const stopPath=join(home,"state","STOP");
const ledger=new UsageLedger(join(home,"state","budget"));
const mode=process.argv[2]??"preview";
try {
  if (mode==="preview") {
    console.log(JSON.stringify(await inspectSupervised({queue,stopPath,ledger}),null,2));
  } else if (mode==="rehearse") {
    const result=await rehearseTask({queue,stopPath});
    console.log(JSON.stringify(result,null,2));
  } else {
    throw Error("Usage: node control/supervisor-cli.js [preview|rehearse]");
  }
} catch (error) {
  console.error("Supervised operation aborted:",error.message);
  process.exitCode=1;
}
