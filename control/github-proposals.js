// Constrained GitHub proposal publisher. Never returns installation tokens.
// This module accepts trusted operator-supplied text, not AI-executable code.
import { readFile } from "node:fs/promises";
import { githubAppJWT } from "./github-auth.js";

const REPOSITORY = "Bucifer6/somewhere";
const API = "https://api.github.com";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const headers = bearer => ({
  authorization: "Bearer " + bearer,
  accept: "application/vnd.github+json",
  "x-github-api-version": "2022-11-28",
  "user-agent": "Somewhere-Control/0.5"
});

export function validateProposal(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Expected proposal object");
  if (!UUID.test(input.taskId ?? "")) throw Error("Invalid task ID");
  if (typeof input.title !== "string" || input.title.length < 10 || input.title.length > 120) throw Error("Invalid proposal title");
  if (typeof input.content !== "string" || input.content.length < 30 || input.content.length > 6000) throw Error("Proposal must be 30-6000 characters");
  // Do not let user text inject URLs, arbitrary refs, GitHub actions or repository paths.
  if (Object.keys(input).some(key => !["taskId","title","content"].includes(key))) throw Error("Unexpected proposal field");
  return { taskId: input.taskId.toLowerCase(), title: input.title.trim(), content: input.content };
}

async function request(fetcher, path, bearer, { method="GET", body } = {}) {
  const response = await fetcher(API + path, {
    method,
    headers: { ...headers(bearer), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw Error("GitHub API HTTP " + response.status);
  return response.json();
}

export async function publishProposal({ appId, installationId, keyPath, proposal, fetcher=fetch }) {
  const p = validateProposal(proposal);
  if (!/^\d+$/.test(String(appId)) || !/^\d+$/.test(String(installationId))) throw Error("Invalid GitHub identifiers");
  if (keyPath !== "/etc/somewhere-control/github-app.pem") throw Error("Invalid key path");
  const pem = await readFile(keyPath, "utf8");
  const jwt = githubAppJWT({appId,pem});
  const auth = await request(fetcher, "/app/installations/"+installationId+"/access_tokens", jwt, {
    method:"POST",
    body:{repositories:["somewhere"],permissions:{contents:"write",pull_requests:"write"}}
  });
  if (!auth.token || !Array.isArray(auth.repositories) || auth.repositories.length !== 1 ||
      auth.repositories[0].full_name !== REPOSITORY) throw Error("Unverified repository-scoped installation");
  const token = auth.token;
  // Never accept a branch, path, base or raw GitHub API operation from the caller.
  const branch = "agent/proposal-"+p.taskId;
  const file = "docs/agent-proposals/"+p.taskId+".md";
  const main = await request(fetcher, "/repos/"+REPOSITORY+"/git/ref/heads/main", token);
  const sha = main.object?.sha;
  if (!/^[a-f0-9]{40}$/i.test(sha ?? "")) throw Error("Invalid main commit");
  await request(fetcher, "/repos/"+REPOSITORY+"/git/refs", token, {
    method:"POST",
    body:{ref:"refs/heads/"+branch,sha}
  });
  const markdown = "# "+p.title.replace(/[\r\n#]/g," ")+"\n\n"+p.content+"\n";
  await request(fetcher, "/repos/"+REPOSITORY+"/contents/"+file, token, {
    method:"PUT",
    body:{message:"docs: propose "+p.taskId,content:Buffer.from(markdown).toString("base64"),branch}
  });
  const pr = await request(fetcher, "/repos/"+REPOSITORY+"/pulls", token, {
    method:"POST",
    body:{
      title:"Proposal: "+p.title,
      head:branch,
      base:"main",
      body:"Automated documentation proposal for task "+p.taskId+".\n\nReview required. No executable code or deployment changes.",
      draft:true,
      maintainer_can_modify:true
    }
  });
  // Return metadata only; no token, secret or key.
  if (typeof pr.html_url !== "string" || !pr.html_url.startsWith("https://github.com/Bucifer6/somewhere/pull/")) {
    throw Error("Unexpected pull request response");
  }
  return { repository:REPOSITORY, taskId:p.taskId, branch, file, pullRequestUrl:pr.html_url };
}
