#!/usr/bin/env node
// Generates, from registry.json + plugins/*/skills/*/SKILL.md:
//   .claude-plugin/marketplace.json          (Claude Code / Cowork / claude.ai)
//   .agents/plugins/marketplace.json         (Codex CLI / ChatGPT)
//   plugins/<p>/.claude-plugin/plugin.json
//   plugins/<p>/.codex-plugin/plugin.json
//   catalog/index.json                       (consumed by the SkillMCP MCP server + web)
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const reg = JSON.parse(readFileSync(join(ROOT, "registry.json"), "utf8"));
const M = reg.marketplace;

const write = (rel, obj) => {
  const p = join(ROOT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
  console.log("wrote", rel);
};

function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error("missing frontmatter");
  const fm = {};
  let curKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const nested = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
    const top = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (top) {
      curKey = top[1];
      fm[curKey] = top[2] === "" ? {} : top[2].replace(/^["']|["']$/g, "");
    } else if (nested && curKey && typeof fm[curKey] === "object") {
      fm[curKey][nested[1]] = nested[2].replace(/^["']|["']$/g, "");
    }
  }
  return { frontmatter: fm, body: m[2] };
}

function skillsOf(pluginName) {
  const dir = join(ROOT, "plugins", pluginName, "skills");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => statSync(join(dir, d)).isDirectory() && existsSync(join(dir, d, "SKILL.md")))
    .map((d) => {
      const md = readFileSync(join(dir, d, "SKILL.md"), "utf8");
      const { frontmatter, body } = parseFrontmatter(md);
      return {
        name: frontmatter.name,
        description: frontmatter.description,
        license: frontmatter.license,
        metadata: frontmatter.metadata,
        path: `plugins/${pluginName}/skills/${d}/SKILL.md`,
        bodyChars: body.length,
      };
    });
}

const catalog = { marketplace: M, generatedBy: "scripts/build.mjs", plugins: [] };

for (const p of reg.plugins) {
  const pdir = join(ROOT, "plugins", p.name);
  const hasMcp = existsSync(join(pdir, ".mcp.json"));
  const skills = skillsOf(p.name);
  const author = { name: M.owner.name, email: M.owner.email };

  // Claude plugin manifest
  write(`plugins/${p.name}/.claude-plugin/plugin.json`, {
    name: p.name,
    displayName: p.displayName,
    version: p.version,
    description: p.description,
    author,
    homepage: `${M.repository}/tree/main/plugins/${p.name}`,
    repository: M.repository,
    license: M.license,
    keywords: p.keywords,
    skills: "./skills/",
    ...(hasMcp ? { mcpServers: "./.mcp.json" } : {}),
  });

  // Codex / ChatGPT plugin manifest
  write(`plugins/${p.name}/.codex-plugin/plugin.json`, {
    name: p.name,
    version: p.version,
    description: p.description,
    author,
    homepage: `${M.repository}/tree/main/plugins/${p.name}`,
    repository: M.repository,
    license: M.license,
    keywords: p.keywords,
    skills: "./skills/",
    ...(hasMcp ? { mcpServers: "./.mcp.json" } : {}),
    interface: {
      displayName: p.displayName,
      shortDescription: p.description,
      longDescription: p.description,
      developerName: M.owner.name,
      category: p.category,
      websiteURL: M.homepage,
    },
  });

  catalog.plugins.push({ ...p, skills, hasMcp, installs: installCommands(p.name) });
}

function installCommands(name) {
  const repo = M.repository.replace("https://github.com/", "");
  return {
    "claude-code": [`/plugin marketplace add ${repo}`, `/plugin install ${name}@${M.name}`],
    "codex-cli": [`codex plugin marketplace add ${repo}`, `/plugins → ${M.displayName} → ${name} → Install`],
    "claude-ai": [`Customize → Plugins → + (Personal plugins) → Add from a repository → ${M.repository}`, `Install "${name}"`],
    "chatgpt": [`Plugins → add marketplace ${repo}`, `Install "${name}"`],
  };
}

// Claude marketplace
write(".claude-plugin/marketplace.json", {
  name: M.name,
  displayName: M.displayName,
  description: M.description,
  owner: M.owner,
  plugins: reg.plugins.map((p) => ({
    name: p.name,
    displayName: p.displayName,
    description: p.description,
    version: p.version,
    source: `./plugins/${p.name}`,
    keywords: p.keywords,
    category: p.category,
  })),
});

// Codex / ChatGPT marketplace
write(".agents/plugins/marketplace.json", {
  name: M.name,
  interface: { displayName: M.displayName },
  plugins: reg.plugins.map((p) => ({
    name: p.name,
    source: { source: "local", path: `./plugins/${p.name}` },
    policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    category: p.category,
  })),
});

write("catalog/index.json", catalog);

// README catalog table
{
  const readmePath = join(ROOT, "README.md");
  if (existsSync(readmePath)) {
    const rows = catalog.plugins.map((p) =>
      `| [\`${p.name}\`](plugins/${p.name}) | ${p.description} | ${p.category} | ${p.version} |`);
    const table = ["| Plugin | Description | Category | Version |", "|---|---|---|---|", ...rows].join("\n");
    const src = readFileSync(readmePath, "utf8");
    const out = src.replace(/<!-- CATALOG:START -->[\s\S]*?<!-- CATALOG:END -->/,
      `<!-- CATALOG:START -->\n${table}\n<!-- CATALOG:END -->`);
    if (out !== src) { writeFileSync(readmePath, out); console.log("wrote README.md catalog"); }
  }
}
