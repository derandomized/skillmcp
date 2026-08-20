import { App } from "@modelcontextprotocol/ext-apps";
const app = new App({ name: "SkillMCP Browser", version: "0.1.0" });
const $ = (s) => document.querySelector(s);
const state = { plugins: [], all: [], query: "", category: "", selected: null, md: "", installs: null, surface: guessSurface() };
const SURFACES = [["claude-ai","Claude (web/Desktop/Cowork)"],["chatgpt","ChatGPT"],["claude-code","Claude Code"],["codex-cli","Codex CLI"]];

function guessSurface() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("chatgpt") || location.href.includes("openai")) return "chatgpt";
  return "claude-ai";
}
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function applyTheme(ctx) {
  if (ctx?.theme) document.documentElement.dataset.theme = ctx.theme;
}

function renderList() {
  const cats = [...new Set(state.all.map((p) => p.category))].sort();
  const v = $("#view");
  v.innerHTML = `
    <div class="search">
      <input id="q" placeholder="Search skills…" value="${esc(state.query)}" />
      <select id="cat"><option value="">All categories</option>${cats.map((c) => `<option ${c === state.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
    </div>
    ${state.plugins.length ? `<div class="grid">${state.plugins.map((p) => `
      <div class="card" data-name="${esc(p.name)}">
        <h3>${esc(p.displayName)}</h3>
        <p>${esc(p.description)}</p>
        <span class="chip">${esc(p.category)}</span><span class="chip">v${esc(p.version)}</span>
      </div>`).join("")}</div>` : `<div class="empty">No skills match.</div>`}`;
  $("#count").textContent = `${state.plugins.length} of ${state.all.length} skills`;
  let t;
  $("#q").addEventListener("input", (e) => { state.query = e.target.value; clearTimeout(t); t = setTimeout(search, 200); });
  $("#cat").addEventListener("change", (e) => { state.category = e.target.value; search(); });
  v.querySelectorAll(".card").forEach((c) => c.addEventListener("click", () => openDetail(c.dataset.name)));
}

async function search() {
  const r = await app.callServerTool({ name: "search_skills", arguments: { query: state.query, ...(state.category ? { category: state.category } : {}) } });
  state.plugins = r.structuredContent?.plugins ?? [];
  renderList();
}

async function openDetail(name) {
  state.selected = state.all.find((p) => p.name === name);
  state.md = ""; state.installs = null;
  renderDetail();
  const [skill, inst] = await Promise.all([
    app.callServerTool({ name: "get_skill", arguments: { name } }),
    app.callServerTool({ name: "install_instructions", arguments: { name } }),
  ]);
  state.md = skill.content?.find((c) => c.type === "text")?.text ?? "";
  state.installs = inst.structuredContent?.installs ?? null;
  renderDetail();
}

function renderDetail() {
  const p = state.selected; if (!p) return renderList();
  const steps = state.installs?.[state.surface] ?? [];
  $("#view").innerHTML = `
    <button class="link" id="back">← All skills</button>
    <div class="detail" style="margin-top:8px">
      <h2>${esc(p.displayName)}</h2>
      <div class="meta">${esc(p.name)} · v${esc(p.version)} · ${esc(p.category)} · ${p.keywords.map((k) => `<span class="chip">${esc(k)}</span>`).join("")}</div>
      <p>${esc(p.description)}</p>
      <div class="row">
        <select id="surface">${SURFACES.map(([k, l]) => `<option value="${k}" ${k === state.surface ? "selected" : ""}>${l}</option>`).join("")}</select>
        <button class="primary" id="ask">Ask assistant to install</button>
        <button id="try">Try it now</button>
      </div>
      ${steps.length ? `<ol class="steps">${steps.map((s) => `<li><code>${esc(s)}</code></li>`).join("")}</ol>` : `<div class="empty">Loading install steps…</div>`}
      <details><summary>SKILL.md</summary><pre class="md">${state.md ? esc(state.md) : "Loading…"}</pre></details>
    </div>`;
  $("#back").onclick = () => { state.selected = null; renderList(); };
  $("#surface").onchange = (e) => { state.surface = e.target.value; renderDetail(); };
  $("#ask").onclick = () => app.sendMessage({ role: "user", content: [{ type: "text",
    text: `Please install the SkillMCP skill "${p.name}" for ${SURFACES.find(([k]) => k === state.surface)[1]}. Steps:\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\nIf you can run commands on this surface, run them; otherwise walk me through it.` }] });
  $("#try").onclick = () => app.sendMessage({ role: "user", content: [{ type: "text",
    text: `Use the SkillMCP skill "${p.name}" right now for my next request. Fetch it with get_skill and follow its SKILL.md instructions.` }] });
}

app.ontoolresult = (r) => {
  const plugins = r.structuredContent?.plugins ?? [];
  state.all = plugins; state.plugins = plugins;
  renderList();
};
app.onhostcontextchanged = applyTheme;
await app.connect();
applyTheme(app.getHostContext());
