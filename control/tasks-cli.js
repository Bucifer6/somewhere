#!/usr/bin/env node
// Administrative queue CLI. Run only as the unprivileged somewhere-agent user.
import { TaskQueue } from "./task-queue.js";

const dir = process.env.SOMEWHERE_TASKS_DIR ?? "/var/lib/somewhere-agent/state/tasks";
const [command, ...rest] = process.argv.slice(2);
const queue = new TaskQueue(dir);

try {
  if (command === "add") {
    const [type, ...words] = rest;
    const task = await queue.enqueue({ type, prompt: words.join(" ") });
    console.log(JSON.stringify({ id: task.id, type:task.type, state:task.state }));
  } else if (command === "list") {
    const state = rest[0] ?? "queued";
    const tasks = await queue.list(state);
    console.log(JSON.stringify(tasks.map(t => ({id:t.id,type:t.type,state:t.state,createdAt:t.createdAt})),null,2));
  } else {
    console.error('Usage: node control/tasks-cli.js add "development-plan" "task description..." OR list [queued|reserved|completed|failed]');
    process.exitCode=2;
  }
} catch(error) {
  console.error(error.message);
  process.exitCode=1;
}
