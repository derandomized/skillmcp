import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSubmission, saveSubmission } from "./submit.js";
import { getCatalog, readSkillMarkdown, findPlugin, search } from "./catalog.js";
const SURFACES = ["claude-code", "codex-cli", "claude-ai", "chatgpt"];
const SURFACE_LABEL = {
    "claude-code": "Claude Code",
    "codex-cli": "Codex CLI",
    "claude-ai": "Claude (web / Desktop / Cowork)",
    chatgpt: "ChatGPT",
};
function fmtPlugin(p) {
    const skills = p.skills.map((s) => `    - ${s.name}: ${s.description}`).join("\n");
    return `• ${p.displayName} (${p.name}) v${p.version} — ${p.category}\n  ${p.description}\n${skills}`;
}
function fmtInstall(p, surface) {
    const targets = surface ? [surface] : SURFACES;
    return targets
        .map((s) => `${SURFACE_LABEL[s]}:\n` + p.installs[s].map((l, i) => `  ${i + 1}. ${l}`).join("\n"))
        .join("\n\n");
}
const UI_URI = "ui://skillmcp/browse.html";
let uiHtml = null;
function loadUiHtml() {
    if (uiHtml)
        return uiHtml;
    const here = dirname(fileURLToPath(import.meta.url));
    const html = readFileSync(join(here, "..", "ui", "browse.html"), "utf8");
    const require = createRequire(import.meta.url);
    const sdk = readFileSync(require.resolve("@modelcontextprotocol/ext-apps/app-with-deps"), "utf8");
    uiHtml = html.replace("/*__APP_SDK__*/", sdk);
    return uiHtml;
}
export function buildServer() {
    const server = new McpServer({ name: "skillmcp", version: "0.1.0" }, {
        instructions: "SkillMCP is a provider-agnostic skills marketplace. Use list_skills / search_skills to browse, " +
            "get_skill to read a skill's full SKILL.md (you may follow it immediately as an ad-hoc skill), and " +
            "install_instructions to give the user exact steps for their surface. Skills are also exposed as " +
            "resources at skillmcp://skills/{plugin}/{skill}.",
    });
    server.registerTool("list_skills", {
        title: "List skills",
        description: "List every plugin/skill in the SkillMCP marketplace, optionally filtered by category.",
        inputSchema: { category: z.string().optional().describe("Filter by category, e.g. 'Developer Tools'") },
    }, async ({ category }) => {
        const cat = await getCatalog();
        const plugins = search(cat, "", category);
        const cats = [...new Set(cat.plugins.map((p) => p.category))].sort();
        const text = `${cat.marketplace.displayName} — ${plugins.length} plugin(s)` +
            (category ? ` in "${category}"` : ` across categories: ${cats.join(", ")}`) +
            `\n\n` + plugins.map(fmtPlugin).join("\n\n") +
            `\n\nRepo: ${cat.marketplace.repository}`;
        return { content: [{ type: "text", text }], structuredContent: { plugins } };
    });
    server.registerTool("search_skills", {
        title: "Search skills",
        description: "Full-text search over skill names, descriptions, keywords and categories.",
        inputSchema: {
            query: z.string().describe("Free-text query, e.g. 'git commit' or 'pirate'"),
            category: z.string().optional(),
        },
    }, async ({ query, category }) => {
        const cat = await getCatalog();
        const hits = search(cat, query, category);
        const text = hits.length
            ? `${hits.length} match(es) for "${query}":\n\n${hits.map(fmtPlugin).join("\n\n")}`
            : `No skills match "${query}". Try list_skills to see everything.`;
        return { content: [{ type: "text", text }], structuredContent: { plugins: hits } };
    });
    server.registerTool("get_skill", {
        title: "Get skill",
        description: "Return the full SKILL.md for a skill (by skill or plugin name). The caller may follow these " +
            "instructions right away to 'try before installing'.",
        inputSchema: { name: z.string().describe("Skill or plugin name, e.g. 'commit-haiku'") },
    }, async ({ name }) => {
        const cat = await getCatalog();
        const p = findPlugin(cat, name);
        if (!p)
            return { content: [{ type: "text", text: `Unknown skill '${name}'.` }], isError: true };
        const parts = await Promise.all(p.skills.map(async (s) => `### ${s.path}\n\n${await readSkillMarkdown(s)}`));
        const text = `${p.displayName} v${p.version}\n\n${parts.join("\n\n---\n\n")}\n\n---\nTo install permanently, call install_instructions with name='${p.name}'.`;
        return { content: [{ type: "text", text }] };
    });
    server.registerTool("install_instructions", {
        title: "Install instructions",
        description: "Exact, copy-pasteable steps to install a SkillMCP plugin on a given surface " +
            "(claude-code, codex-cli, claude-ai, chatgpt). Omit surface to get all.",
        inputSchema: {
            name: z.string().describe("Plugin or skill name"),
            surface: z.enum(SURFACES).optional(),
        },
    }, async ({ name, surface }) => {
        const cat = await getCatalog();
        const p = findPlugin(cat, name);
        if (!p)
            return { content: [{ type: "text", text: `Unknown skill '${name}'.` }], isError: true };
        const text = `Install "${p.displayName}" (${p.name})\n\n${fmtInstall(p, surface)}\n\n` +
            `The marketplace itself only needs to be added once per surface; after that every SkillMCP plugin is one click/command away.`;
        return { content: [{ type: "text", text }], structuredContent: { name: p.name, installs: p.installs } };
    });
    server.registerResource("skill", new ResourceTemplate("skillmcp://skills/{plugin}/{skill}", {
        list: async () => {
            const cat = await getCatalog();
            return {
                resources: cat.plugins.flatMap((p) => p.skills.map((s) => ({
                    uri: `skillmcp://skills/${p.name}/${s.name}`,
                    name: s.name,
                    title: `${p.displayName} › ${s.name}`,
                    description: s.description,
                    mimeType: "text/markdown",
                }))),
            };
        },
    }), { title: "SkillMCP skill", description: "Full SKILL.md of a marketplace skill", mimeType: "text/markdown" }, async (uri, { plugin, skill }) => {
        const cat = await getCatalog();
        const p = cat.plugins.find((x) => x.name === plugin);
        const s = p?.skills.find((x) => x.name === skill);
        if (!p || !s)
            throw new Error(`unknown skill ${plugin}/${skill}`);
        return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: await readSkillMarkdown(s) }] };
    });
    server.registerTool("submit_skill", {
        title: "Submit a skill for review",
        description: "Submit a new skill to the SkillMCP marketplace. No GitHub account needed: the submission goes to a " +
            "maintainer review queue and becomes a pull request on your behalf. Provide the SKILL.md body WITHOUT " +
            "frontmatter (it is generated). Ask the user for their name (and email if they want follow-up) before calling.",
        inputSchema: {
            name: z.string().describe("Skill id: lowercase, digits, hyphens, e.g. 'release-notes'"),
            displayName: z.string().describe("Human name, e.g. 'Release Notes'"),
            description: z.string().describe("What it does AND when to use it (≤1024 chars)"),
            category: z.string().default("Utilities"),
            keywords: z.array(z.string()).default([]),
            body: z.string().describe("Markdown instructions (the SKILL.md body, no frontmatter)"),
            submitter_name: z.string().describe("Submitter's name as they gave it"),
            submitter_email: z.string().optional().describe("Optional email for review follow-up"),
            surface: z.string().optional().describe("Where this was submitted from, e.g. 'chatgpt', 'claude-ai'"),
        },
    }, async (a) => {
        const sub = {
            name: a.name, displayName: a.displayName, description: a.description, category: a.category,
            keywords: a.keywords, body: a.body,
            submitter: { name: a.submitter_name, email: a.submitter_email, surface: a.surface },
        };
        const errs = validateSubmission(sub);
        if (errs.length)
            return { content: [{ type: "text", text: `Submission rejected:\n- ${errs.join("\n- ")}` }], isError: true };
        const cat = await getCatalog();
        if (findPlugin(cat, a.name))
            return { content: [{ type: "text", text: `A skill named '${a.name}' already exists. Pick another name.` }], isError: true };
        const saved = saveSubmission(sub);
        return {
            content: [{ type: "text", text: `Submitted ✔  id: ${saved.id}\n"${a.displayName}" is in the SkillMCP review queue, attributed to ${a.submitter_name}` +
                        `${a.submitter_email ? ` <${a.submitter_email}>` : ""}. A maintainer will review it and open a pull request in ` +
                        `${cat.marketplace.repository}; once merged it is installable on every surface.` }],
            structuredContent: { id: saved.id },
        };
    });
    // MCP App: interactive catalog browser (renders inline in Claude / ChatGPT / other MCP Apps hosts)
    registerAppTool(server, "browse_skills", {
        title: "Browse skills (interactive)",
        description: "Open an interactive SkillMCP catalog browser with search, previews and one-click install steps. " +
            "Prefer this over list_skills when the host supports MCP Apps UI.",
        inputSchema: { query: z.string().optional().describe("Optional initial search") },
        _meta: { ui: { resourceUri: UI_URI } },
    }, async ({ query }) => {
        const cat = await getCatalog();
        const plugins = search(cat, query ?? "");
        return {
            content: [{ type: "text", text: `Showing ${plugins.length} SkillMCP skill(s)${query ? ` for "${query}"` : ""}. The interactive browser is displayed above.` }],
            structuredContent: { plugins },
        };
    });
    registerAppResource(server, "SkillMCP Browser", UI_URI, { mimeType: RESOURCE_MIME_TYPE, description: "Interactive SkillMCP catalog" }, async () => ({ contents: [{ uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: loadUiHtml() }] }));
    server.registerResource("catalog", "skillmcp://catalog", { title: "SkillMCP catalog", description: "Machine-readable catalog (JSON)", mimeType: "application/json" }, async (uri) => ({
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(await getCatalog(), null, 2) }],
    }));
    return server;
}
