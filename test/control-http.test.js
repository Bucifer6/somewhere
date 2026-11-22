import test from "node:test";
import assert from "node:assert/strict";
import { createControlServer, parseControlConfig } from "../control/http.js";

const TOKEN = "a-very-long-test-token-with-more-than-32-characters";

async function withServer(fn) {
  const events = [];
  const server = createControlServer({ token: TOKEN, audit: event => events.push(event) });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = "http://127.0.0.1:" + server.address().port;
    await fn(base, events);
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
}
const request = (base, token, body, extras = {}) => fetch(base + "/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}), ...extras },
  body: JSON.stringify(body)
});

test("the MCP service refuses to start without a strong token", () => {
  assert.throws(() => createControlServer({ token: "short" }), /32 characters/);
  assert.throws(() => parseControlConfig({ CONTROL_HOST: "0.0.0.0", CONTROL_BEARER_TOKEN: TOKEN }), /non-loopback/);
});

test("MCP tool list requires a bearer token", async () => withServer(async base => {
  const body = {jsonrpc:"2.0",id:1,method:"tools/list"};
  assert.equal((await request(base, null, body)).status, 401);
  assert.equal((await request(base, "bad-token", body)).status, 401);
  const response = await request(base, TOKEN, body);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.result.tools.length, 3);
}));

test("requests from unexpected origins are rejected even with a valid bearer token", async () => withServer(async base => {
  const response = await request(base, TOKEN, {jsonrpc:"2.0",id:2,method:"ping"}, {origin:"https://attacker.example"});
  assert.equal(response.status, 403);
}));

test("command execution remains unavailable, events don't contain credentials", async () => withServer(async (base, events) => {
  const response = await request(base, TOKEN, {jsonrpc:"2.0",id:3,method:"shell/execute",params:{command:"id"}});
  assert.equal((await response.json()).error.code, -32601);
  assert.equal(JSON.stringify(events).includes(TOKEN), false);
}));
