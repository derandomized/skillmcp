#!/usr/bin/env node
// Maintainer tool for the submission inbox written by the MCP server's submit_skill tool.
//   node scripts/inbox.mjs                 list pending submissions
//   node scripts/inbox.mjs show <id>       print a submission
//   node scripts/inbox.mjs pr <id>         create branch + plugin + registry entry, push, open PR (uses your local gh)
//   node scripts/inbox.mjs reject <id>     move to inbox/rejected/
import { readFileSync, readdirSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const INBOX = process.env.SKILLMCP_INBOX ?? join(homedir(), ".skillmcp", "inbox");
// Remote mode: point at a hosted server's admin API instead of a local directory.
//   SKILLMCP_INBOX_URL=https://skillmcp.fly.dev SKILLMCP_ADMIN_TOKEN=... node scripts/inbox.mjs
const REMOTE = process.env.SKILLMCP_INBOX_URL?.replace(/\/$/, "");
const TOKEN = process.env.SKILLMCP_ADMIN_TOKEN;
async function api(path, method = "GET") {
  const r = await fetch(`${REMOTE}/admin${path}`, { method, headers: { authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}`);
  return r.json();
}
const sh = (c, o = {}) => execSync(c, { cwd: ROOT, stdio: "pipe", encoding: "utf8", ...o }).trim();
const [cmd, id] = process.argv.slice(2);

const pendingLocal = () => existsSync(INBOX) ? readdirSync(INBOX).filter((f) => f.endsWith(".json")).sort() : [];
const listAll = async () => REMOTE ? api("/inbox") : pendingLocal().map((f) => JSON.parse(readFileSync(join(INBOX, f), "utf8")));
const load = async (id) => REMOTE ? api(`/inbox/${id}`) : JSON.parse(readFileSync(join(INBOX, `${id}.json`), "utf8"));
const archive = async (id, state) => {
  if (REMOTE) return api(`/inbox/${id}/${state}`, "POST");
  mkdirSync(join(INBOX, state), { recursive: true });
  renameSync(join(INBOX, `${id}.json`), join(INBOX, state, `${id}.json`));
};

if (!cmd) {
  const items = await listAll();
  if (!items.length) { console.log(`inbox empty (${REMOTE ?? INBOX})`); process.exit(0); }
  for (const s of items) {
    console.log(`${s.id}\n   ${s.displayName} — ${s.description.slice(0, 80)}\n   by ${s.submitter.name}${s.submitter.email ? ` <${s.submitter.email}>` : ""} via ${s.submitter.surface ?? "?"} at ${s.submittedAt}\n`);
  }
} else if (cmd === "show") {
  console.log(JSON.stringify(await load(id), null, 2));
} else if (cmd === "reject") {
  await archive(id, "rejected");
  console.log("rejected", id);
} else if (cmd === "pr") {
  const s = await load(id);
  if (sh("git status --porcelain")) throw new Error("working tree not clean");
  try { sh("git config user.name && git config user.email"); } catch { throw new Error("set git user.name/user.email first"); }
  sh("gh auth status");
  const branch = `submission/${s.name}`;
  sh("git checkout -q main && git pull -q --ff-only");
  sh(`git checkout -q -b ${branch}`);
  try {
  const dir = join(ROOT, "plugins", s.name, "skills", s.name);
  mkdirSync(dir, { recursive: true });
  const fm = [
    "---", `name: ${s.name}`, `description: ${JSON.stringify(s.description)}`, "license: MIT",
    "metadata:", `  author: ${JSON.stringify(s.submitter.name)}`, `  version: "0.1.0"`, "---", "",
  ].join("\n");
  writeFileSync(join(dir, "SKILL.md"), fm + s.body.trim() + "\n");
  const reg = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));
  reg.plugins.push({ name: s.name, displayName: s.displayName, description: s.description.split(/(?<=\.)\s/)[0].slice(0, 160),
    version: "0.1.0", category: s.category, keywords: s.keywords });
  writeFileSync(join(ROOT, "registry.json"), JSON.stringify(reg, null, 2) + "\n");
  sh("node scripts/build.mjs");
  sh("node scripts/validate.mjs", { stdio: "inherit" });
  const who = `${s.submitter.name}${s.submitter.email ? ` <${s.submitter.email}>` : ""}`;
  sh(`git add -A && git commit -q -m ${JSON.stringify(`Add skill: ${s.name}\n\nSubmitted by ${who} via ${s.submitter.surface ?? "unknown surface"} (${s.submittedAt})\nSubmission id: ${s.id}`)}`);
  sh(`git push -q -u origin ${branch}`);
  const body = `## New skill submission\n\n**${s.displayName}** (\`${s.name}\`)\n\n${s.description}\n\n- Submitted by: ${who}\n- Surface: ${s.submitter.surface ?? "unknown"}\n- Submitted at: ${s.submittedAt}\n- Inbox id: \`${s.id}\`\n\n### Review checklist\n- [ ] Description says what AND when\n- [ ] Instructions are accurate and safe (no exfiltration, no credential handling)\n- [ ] Works when tried via \`get_skill\`\n- [ ] Category/keywords sensible\n`;
  const url = sh(`gh pr create --title ${JSON.stringify(`Add skill: ${s.displayName}`)} --body ${JSON.stringify(body)} --label submission 2>/dev/null || gh pr create --title ${JSON.stringify(`Add skill: ${s.displayName}`)} --body ${JSON.stringify(body)}`);
  await archive(id, "opened");
  sh("git checkout -q main");
  console.log("opened", url);
  } catch (e) {
    // roll back so the inbox item can be retried cleanly
    sh(`git checkout -q -- . && git clean -qfd && git checkout -q main && git branch -qD ${branch}`);
    throw e;
  }
} else {
  console.error("unknown command"); process.exit(1);
}
