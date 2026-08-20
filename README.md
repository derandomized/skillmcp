# SkillMCP

**One skills marketplace for every AI assistant.** Skills written once (open
[Agent Skills](https://agentskills.io) format) install in Claude Code, Claude Cowork/Desktop,
claude.ai, ChatGPT and Codex.

## Two steps, any surface

**1. Install SkillMCP** (once). This gives your assistant the catalog: browse, search, preview,
install, and submit skills from inside the conversation.

| Surface | Add the marketplace | Install SkillMCP |
|---|---|---|
| Claude Code | `/plugin marketplace add derandomized/skillmcp` | `/plugin install skillmcp@skillmcp` |
| Claude Cowork / Desktop | Customize → Plugins → **+** → *Add from a repository* → `https://github.com/derandomized/skillmcp` | click **Install** on *SkillMCP* |
| Codex CLI | `codex plugin marketplace add derandomized/skillmcp` | `codex plugin add skillmcp@skillmcp` |
| ChatGPT | Settings → Apps → Developer mode → add connector `https://skillmcp.fly.dev/mcp` | — |
| claude.ai chat | Settings → Connectors → *Add custom connector* → `https://skillmcp.fly.dev/mcp` | — (toggle on per chat) |

**2. Install skills.** Say *"browse the SkillMCP marketplace"* and pick from the interactive
catalog, or install directly, e.g. `/plugin install commit-haiku@skillmcp`.

That's the whole model. Under the hood, vendors call the installable unit a *plugin*; every skill
here is wrapped in its own plugin so the store can install it, and *SkillMCP* itself is a plugin
that carries the catalog connector (an MCP server) plus a skill teaching the assistant to use it.

## Catalog

<!-- CATALOG:START -->
| Plugin | Description | Category | Version |
|---|---|---|---|
| [`skillmcp`](plugins/skillmcp) | Install this once: browse, search, try, submit and install SkillMCP skills from inside your assistant. | Utilities | 0.3.0 |
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

## Submitting from inside Claude / ChatGPT (no GitHub account)

The MCP server exposes `submit_skill`. Tell your assistant *"submit this as a SkillMCP skill"*; it
collects your name (and optional email), validates the skill against the spec, and drops it in the
maintainer review queue. A maintainer runs `npm run inbox` → `npm run inbox pr <id>` which opens a
pull request attributed to you. Verified identity (email magic-link / org SSO via MCP OAuth) is planned.

## Hosting

The public server runs on Fly.io (`fly.toml`, `Dockerfile`): `flyctl deploy`. Submissions persist on
the `/data` volume; maintainers read them remotely with
`SKILLMCP_INBOX_URL=https://skillmcp.fly.dev SKILLMCP_ADMIN_TOKEN=… npm run inbox`.
