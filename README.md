# SkillMCP

**A provider- and surface-agnostic skills marketplace.** One repository, one set of
[Agent Skills](https://agentskills.io)-compliant `SKILL.md` files, installable in:

| Surface | Add the marketplace (once) | Install a skill |
|---|---|---|
| **Claude Code** | `/plugin marketplace add derandomized/skillmcp` | `/plugin install commit-haiku@skillmcp` |
| **Claude.ai / Desktop / Cowork** | Customize → Plugins → **+** (Personal plugins) → *Add from a repository* → `https://github.com/derandomized/skillmcp` | click **Install** on the plugin |
| **Codex CLI** | `codex plugin marketplace add derandomized/skillmcp` | `codex plugin add commit-haiku@skillmcp` (or `/plugins` in the TUI) |
| **ChatGPT** | Plugins → add marketplace `derandomized/skillmcp` | click **Install** on the plugin |

Every plugin ships **both** manifests (`.claude-plugin/plugin.json` and `.codex-plugin/plugin.json`),
and the repo publishes **both** marketplace indexes (`.claude-plugin/marketplace.json` and
`.agents/plugins/marketplace.json`). They are generated from a single [`registry.json`](registry.json)
so they can never drift.

## Browse from inside your agent

SkillMCP also runs as an **MCP server**, so any MCP-capable surface can search the catalog,
preview a skill, and get exact install steps without leaving the conversation.

- **Remote** (ChatGPT developer-mode connector, Claude custom connector): point at the hosted
  Streamable HTTP endpoint `https://<host>/mcp`.
- **Bundled**: install the `skillmcp-browser` plugin — it runs the same server locally over stdio.

Tools: `list_skills`, `search_skills`, `get_skill`, `install_instructions`.
Resources: `skillmcp://skills/{plugin}/{skill}` (raw `SKILL.md`), `skillmcp://catalog`.

## Catalog

<!-- CATALOG:START -->
| Plugin | Description | Category | Version |
|---|---|---|---|
| [`skillmcp-browser`](plugins/skillmcp-browser) | Browse, search and install SkillMCP skills from inside your agent (bundles the SkillMCP MCP server). | Utilities | 0.1.0 |
| [`hello-skillmcp`](plugins/hello-skillmcp) | Smoke-test skill: confirms a SkillMCP install is live on any surface. | Utilities | 0.1.0 |
| [`commit-haiku`](plugins/commit-haiku) | Summarize a diff or PR as a 5-7-5 haiku plus a plain one-liner. | Developer Tools | 0.1.0 |
| [`explain-like-a-pirate`](plugins/explain-like-a-pirate) | Technically accurate explanations in a friendly pirate voice. | Education | 0.1.0 |
<!-- CATALOG:END -->

## Repository layout

```
registry.json                     ← single source of truth (edit this)
plugins/<name>/
  skills/<skill>/SKILL.md         ← Agent Skills spec
  .claude-plugin/plugin.json      ← generated
  .codex-plugin/plugin.json       ← generated
  .mcp.json                       ← optional bundled MCP server(s)
.claude-plugin/marketplace.json   ← generated (Claude)
.agents/plugins/marketplace.json  ← generated (OpenAI)
catalog/index.json                ← generated, consumed by the MCP server
server/                           ← MCP server (TypeScript)
scripts/build.mjs                 ← generator
scripts/validate.mjs              ← spec + hygiene checks (runs in CI)
```

## Contributing a skill

1. Create `plugins/<your-plugin>/skills/<your-skill>/SKILL.md` following the
   [Agent Skills spec](https://agentskills.io/specification).
2. Add an entry to `registry.json`.
3. `npm run build && npm run validate`, commit the generated files, open a PR.

A submission flow that works from inside Claude/ChatGPT without a GitHub account is planned.

## Running the server

```bash
npm install
npm run server            # http://127.0.0.1:8765/mcp
node server/dist/index.js --stdio   # stdio mode
```

Env: `PORT`, `HOST`, `SKILLMCP_CATALOG_URL` / `SKILLMCP_RAW_BASE` (serve from GitHub raw instead of disk).

## License

MIT
