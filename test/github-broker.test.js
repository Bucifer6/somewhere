import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createPublicKey, verify } from "node:crypto";
import { githubAppJWT } from "../control/github-auth.js";
import { createBroker, parseBrokerConfig } from "../control/github-broker.js";

test("JWT uses RS256 and has short expiration", () => {
  const {privateKey, publicKey} = generateKeyPairSync("rsa", {modulusLength:2048});
  const jwt = githubAppJWT({appId:"5874394",pem:privateKey.export({type:"pkcs8",format:"pem"}),now:1000000});
  const [head, payload, sig] = jwt.split(".");
  assert.equal(JSON.parse(Buffer.from(head,"base64url")).alg,"RS256");
  const claims=JSON.parse(Buffer.from(payload,"base64url"));
  assert.equal(claims.iss,"5874394");
  assert.ok(claims.exp-claims.iat<=600);
  assert.ok(verify("RSA-SHA256",Buffer.from(head+"."+payload),createPublicKey(publicKey),Buffer.from(sig,"base64url")));
});

test("broker refuses unapproved key or socket locations",()=>{
  const good = {SOMEWHERE_GITHUB_APP_ID:"5874394",SOMEWHERE_GITHUB_INSTALLATION_ID:"184660202",SOMEWHERE_GITHUB_KEY_PATH:"/etc/somewhere-control/github-app.pem"};
  assert.equal(parseBrokerConfig(good).repository,"Bucifer6/somewhere");
  assert.throws(()=>parseBrokerConfig({...good,SOMEWHERE_GITHUB_KEY_PATH:"/tmp/key"}),/approved protected path/);
  assert.throws(()=>parseBrokerConfig({...good,SOMEWHERE_GITHUB_BROKER_SOCKET:"/tmp/exposed.sock"}),/unapproved/);
});

async function testServer(callback, checker) {
  const server=createBroker({config:{},check:checker,audit:()=>{}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  try{await callback("http://127.0.0.1:"+server.address().port);}
  finally{await new Promise(resolve=>server.close(resolve));}
}

test("broker never returns credentials",async()=>{
  const secret="ghs_fake_secret_token_not_for_public_use";
  await testServer(async base=>{
    const response=await fetch(base+"/check-installation",{method:"POST"});
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.status,"ok");
    assert.equal(JSON.stringify(data).includes(secret),false);
    assert.equal((await fetch(base+"/token")).status,404);
  },async()=>({status:"ok",repository:"Bucifer6/somewhere",installationAuthenticated:true}));
});

test("broker hides internal errors",async()=>{
  await testServer(async base=>{
    const response=await fetch(base+"/check-installation",{method:"POST"});
    assert.equal(response.status,502);
    assert.deepEqual(await response.json(),{error:"GitHub installation verification failed"});
  },async()=>{throw Error("sensitive diagnostic");});
});
