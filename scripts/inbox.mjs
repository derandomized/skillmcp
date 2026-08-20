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
const sh = (c, o = {}) => execSync(c, { cwd: ROOT, stdio: "pipe", encoding: "utf8", ...o }).trim();
const [cmd, id] = process.argv.slice(2);

const pending = () => existsSync(INBOX) ? readdirSync(INBOX).filter((f) => f.endsWith(".json")).sort() : [];
const load = (id) => JSON.parse(readFileSync(join(INBOX, `${id}.json`), "utf8"));

if (!cmd) {
  const items = pending();
  if (!items.length) { console.log(`inbox empty (${INBOX})`); process.exit(0); }
  for (const f of items) {
    const s = JSON.parse(readFileSync(join(INBOX, f), "utf8"));
    console.log(`${s.id}\n   ${s.displayName} — ${s.description.slice(0, 80)}\n   by ${s.submitter.name}${s.submitter.email ? ` <${s.submitter.email}>` : ""} via ${s.submitter.surface ?? "?"} at ${s.submittedAt}\n`);
  }
} else if (cmd === "show") {
  console.log(JSON.stringify(load(id), null, 2));
} else if (cmd === "reject") {
  mkdirSync(join(INBOX, "rejected"), { recursive: true });
  renameSync(join(INBOX, `${id}.json`), join(INBOX, "rejected", `${id}.json`));
  console.log("rejected", id);
} else if (cmd === "pr") {
  const s = load(id);
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
  mkdirSync(join(INBOX, "opened"), { recursive: true });
  renameSync(join(INBOX, `${id}.json`), join(INBOX, "opened", `${id}.json`));
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
