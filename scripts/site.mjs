#!/usr/bin/env node
// Generates docs/index.html (GitHub Pages) from catalog/index.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cat = JSON.parse(readFileSync(join(ROOT, "catalog/index.json"), "utf8"));
const M = cat.marketplace;
const repoShort = M.repository.replace("https://github.com/", "");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const SURFACES = [
  ["claude-code", "Claude Code"], ["claude-ai", "Claude.ai / Desktop / Cowork"], ["codex-cli", "Codex CLI"], ["chatgpt", "ChatGPT"],
];

const cards = cat.plugins.map((p) => `
<article class="card" id="${esc(p.name)}" data-search="${esc([p.name, p.displayName, p.description, p.category, ...p.keywords].join(" ").toLowerCase())}">
  <header><h3>${esc(p.displayName)}</h3><span class="chip">${esc(p.category)}</span><span class="chip">v${esc(p.version)}</span></header>
  <p>${esc(p.description)}</p>
  <details>
    <summary>Install</summary>
    ${SURFACES.map(([k, l]) => `<h4>${l}</h4><ol>${p.installs[k].map((s) => `<li><code>${esc(s)}</code></li>`).join("")}</ol>`).join("")}
    <p><a href="${M.repository}/tree/main/plugins/${esc(p.name)}">Source on GitHub →</a></p>
  </details>
</article>`).join("\n");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(M.displayName)}</title>
<style>
:root{--bg:#fff;--fg:#111;--muted:#667085;--line:#e6e8ee;--card:#fafbfc;--accent:#2563eb;--chip:#eef2ff;--chipfg:#3730a3;--code:#f3f4f6}
@media(prefers-color-scheme:dark){:root{--bg:#0f1115;--fg:#e5e7eb;--muted:#9aa3b2;--line:#262a33;--card:#161a22;--accent:#60a5fa;--chip:#1e2440;--chipfg:#c7d2fe;--code:#1b1f29}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
.wrap{max-width:960px;margin:0 auto;padding:32px 20px}h1{font-size:30px;margin:0 0 6px}.lead{color:var(--muted);margin:0 0 20px;font-size:16px}
.how{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin:18px 0 26px}
.how div{border:1px solid var(--line);border-radius:10px;padding:12px;background:var(--card)}.how b{display:block;margin-bottom:4px}
input{width:100%;padding:11px 14px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg);font:inherit;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}
.card{border:1px solid var(--line);border-radius:12px;padding:16px;background:var(--card)}.card header{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.card h3{margin:0;font-size:16px;flex:1}.card p{color:var(--muted);margin:8px 0}
.chip{background:var(--chip);color:var(--chipfg);border-radius:999px;padding:1px 9px;font-size:12px}
code{background:var(--code);padding:2px 6px;border-radius:5px;font-size:13px}ol{padding-left:20px;margin:4px 0 10px}h4{margin:10px 0 2px;font-size:13px;color:var(--muted)}
summary{cursor:pointer;color:var(--accent)}a{color:var(--accent)}footer{margin-top:36px;color:var(--muted);font-size:13px}
</style></head><body><div class="wrap">
<h1>${esc(M.displayName)}</h1>
<p class="lead">${esc(M.description)}</p>
<div class="how">
<div><b>Claude Code</b><code>/plugin marketplace add ${esc(repoShort)}</code></div>
<div><b>Codex CLI</b><code>codex plugin marketplace add ${esc(repoShort)}</code></div>
<div><b>Claude.ai / Cowork</b>Customize → Plugins → + → Add from a repository</div>
<div><b>ChatGPT</b>Plugins → add marketplace <code>${esc(repoShort)}</code></div>
</div>
<input id="q" placeholder="Search ${cat.plugins.length} skills…" autofocus>
<div class="grid" id="grid">${cards}</div>
<footer>Install <code>skillmcp</code> once, then install skills from inside your assistant. · <a href="${M.repository}">GitHub</a> · <a href="catalog.json">catalog.json</a></footer>
</div>
<script>
const q=document.getElementById('q');q.addEventListener('input',()=>{const t=q.value.toLowerCase();for(const c of document.querySelectorAll('.card'))c.style.display=c.dataset.search.includes(t)?'':'none'});
</script></body></html>`;

mkdirSync(join(ROOT, "site"), { recursive: true });
writeFileSync(join(ROOT, "site/index.html"), html);
writeFileSync(join(ROOT, "site/catalog.json"), JSON.stringify(cat, null, 2));
console.log("wrote site/index.html");
