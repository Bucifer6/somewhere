import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { validateProposal, publishProposal } from "../control/github-proposals.js";

const taskId="12345678-1234-4234-8234-123456789abc";
const proposal={taskId,title:"A story for Hearth inhabitants",content:"A proposed story about villagers building a small botanical garden."};
test("restricts proposal fields and paths",()=>{
  assert.equal(validateProposal(proposal).taskId,taskId);
  assert.throws(()=>validateProposal({...proposal,branch:"main"}),/Unexpected/);
  assert.throws(()=>validateProposal({...proposal,taskId:"../../main"}),/Invalid task ID/);
  assert.throws(()=>validateProposal({...proposal,content:"bad"}),/30-6000/);
});
test("publisher rejects unapproved PEM path before any network request",async()=>{
  await assert.rejects(
    publishProposal({appId:"5874394",installationId:"184660202",keyPath:"/tmp/fake.pem",proposal,fetcher:()=>{throw Error("network should not happen");}}),
    /Invalid key path/
  );
});
