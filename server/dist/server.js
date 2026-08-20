import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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
    server.registerResource("catalog", "skillmcp://catalog", { title: "SkillMCP catalog", description: "Machine-readable catalog (JSON)", mimeType: "application/json" }, async (uri) => ({
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(await getCatalog(), null, 2) }],
    }));
    return server;
}
