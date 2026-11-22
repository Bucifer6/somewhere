// Explicit, offline reconciliation of abandoned task reservations.
// Never automatically replays an AI task. Requires operator authorization.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TaskQueue } from "./task-queue.js";

export async function inspectReserved(queue) {
  const reserved = await queue.list("reserved");
  return reserved.map(t=>({id:t.id,type:t.type,attempts:t.attempts,updatedAt:t.updatedAt}));
}

export async function failAbandonedTasks({ queue, stopFile, acknowledge, audit=async()=>{} }) {
  if (acknowledge !== "I_CONFIRMED_ALL_WORKERS_STOPPED")
    throw Error("Explicit operator acknowledgement required");
  try {await readFile(stopFile);}
  catch(e) {if(e.code==="ENOENT")throw Error("Emergency STOP not engaged");throw e;}
  const reserved = await inspectReserved(queue);
  const result=[];
  for(const task of reserved) {
    // Mark as failed; never replay, retry or resume a potentially billable task.
    await queue.finish(task.id,"failed",{reason:"Manual recovery while STOP engaged; not retried"});
    await audit({event:"manually-failed-abandoned-task",taskId:task.id});
    result.push(task.id);
  }
  return result;
}

export async function inspectOperatorState(home) {
  const queue = new TaskQueue(join(home,"state","tasks"));
  return { reserved: await inspectReserved(queue) };
}
