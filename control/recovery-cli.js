#!/usr/bin/env node
// Read-only by default. Requires an explicit confirmation to mark orphaned
// tasks failed; does not retry or execute anything.
import { join, resolve } from "node:path";
import { appendFile, mkdir } from "node:fs/promises";
import { TaskQueue } from "./task-queue.js";
import { inspectReserved, failAbandonedTasks } from "./recovery.js";
const home=resolve(process.env.SOMEWHERE_AGENT_HOME??"/var/lib/somewhere-agent");
const queue=new TaskQueue(join(home,"state","tasks"));
const cmd=process.argv[2]??"inspect";
try {
  if(cmd==="inspect"){
    console.log(JSON.stringify(await inspectReserved(queue),null,2));
  }else if(cmd==="fail-abandoned"){
    const result=await failAbandonedTasks({
      queue,stopFile:join(home,"state","STOP"),
      acknowledge:process.argv[3],
      audit:async event=>{
        await mkdir(join(home,"logs"),{recursive:true,mode:0o700});
        await appendFile(join(home,"logs","recovery.jsonl"),JSON.stringify({time:new Date().toISOString(),...event})+"\n",{mode:0o600});
      }
    });
    console.log(JSON.stringify({failedTaskIds:result}));
  }else throw Error("Usage: recovery-cli.js [inspect|fail-abandoned I_CONFIRMED_ALL_WORKERS_STOPPED]");
}catch(e){console.error(e.message);process.exitCode=1;}
