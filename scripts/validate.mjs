#!/usr/bin/env node
// Validates every plugin against the Agent Skills spec + both manifest conventions,
// and checks generated files are in sync with registry.json.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const err = (m) => errors.push(m);

const reg = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const registered = new Set(reg.plugins.map((p) => p.name));
for (const d of readdirSync(join(ROOT, "plugins"))) {
  if (!registered.has(d)) err(`plugins/${d} exists but is not in registry.json`);
}

for (const p of reg.plugins) {
  const pdir = join(ROOT, "plugins", p.name);
  if (!NAME_RE.test(p.name) || p.name.length > 64) err(`${p.name}: invalid plugin name`);
  if (!existsSync(pdir)) { err(`${p.name}: directory missing`); continue; }
  for (const f of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    if (!existsSync(join(pdir, f))) err(`${p.name}: missing ${f} (run npm run build)`);
    else {
      const j = JSON.parse(readFileSync(join(pdir, f), "utf8"));
      if (j.name !== p.name) err(`${p.name}: ${f} name mismatch`);
      if (j.version !== p.version) err(`${p.name}: ${f} version mismatch`);
    }
  }
  const sdir = join(pdir, "skills");
  if (!existsSync(sdir)) { err(`${p.name}: no skills/ dir`); continue; }
  const skills = readdirSync(sdir).filter((d) => statSync(join(sdir, d)).isDirectory());
  if (!skills.length) err(`${p.name}: skills/ is empty`);
  for (const s of skills) {
    const f = join(sdir, s, "SKILL.md");
    if (!existsSync(f)) { err(`${p.name}/${s}: missing SKILL.md`); continue; }
    const md = readFileSync(f, "utf8");
    const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) { err(`${p.name}/${s}: no YAML frontmatter`); continue; }
    const name = (m[1].match(/^name:\s*(.+)$/m) || [])[1]?.trim();
    const desc = (m[1].match(/^description:\s*(.+)$/m) || [])[1]?.trim();
    if (!name) err(`${p.name}/${s}: frontmatter missing name`);
    else if (name !== s) err(`${p.name}/${s}: name '${name}' must match directory`);
    else if (!NAME_RE.test(name) || name.length > 64) err(`${p.name}/${s}: invalid skill name`);
    if (!desc) err(`${p.name}/${s}: frontmatter missing description`);
    else if (desc.length > 1024) err(`${p.name}/${s}: description > 1024 chars`);
    if (md.split("\n").length > 500) err(`${p.name}/${s}: SKILL.md > 500 lines; move detail to references/`);
    // basic hygiene: no secrets / no instructions to exfiltrate
    if (/(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16})/.test(md)) err(`${p.name}/${s}: looks like a credential in SKILL.md`);
    if (/ignore (all )?(previous|prior) instructions/i.test(md)) err(`${p.name}/${s}: prompt-injection phrase detected`);
  }
}

// generated files must be in sync (CI only; locally you iterate freely)
if (process.env.CI)
try {
  execSync("node scripts/build.mjs", { cwd: ROOT, stdio: "ignore" });
  const diff = execSync("git status --porcelain --untracked-files=no -- .claude-plugin .agents plugins/*/.claude-plugin plugins/*/.codex-plugin catalog", { cwd: ROOT }).toString().trim();
  if (diff) err(`generated files out of date; run 'npm run build' and commit:\n${diff}`);
} catch (e) { /* not a git repo in some CI contexts */ }

if (errors.length) { console.error("❌ validation failed:\n - " + errors.join("\n - ")); process.exit(1); }
console.log(`✅ ${reg.plugins.length} plugins valid`);
