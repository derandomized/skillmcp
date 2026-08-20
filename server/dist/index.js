import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { buildServer } from "./server.js";
import { getCatalog } from "./catalog.js";
const PORT = Number(process.env.PORT ?? 8765);
const HOST = process.env.HOST ?? "127.0.0.1";
if (process.argv.includes("--stdio")) {
    // Local mode: bundle-able inside a plugin's .mcp.json
    const server = buildServer();
    await server.connect(new StdioServerTransport());
}
else {
    const app = express();
    app.use(express.json({ limit: "1mb" }));
    app.get("/", async (_req, res) => {
        const cat = await getCatalog();
        res.type("text/plain").send(`SkillMCP remote MCP server\n\nMCP endpoint: POST /mcp (Streamable HTTP)\n` +
            `Plugins: ${cat.plugins.map((p) => p.name).join(", ")}\nRepo: ${cat.marketplace.repository}\n`);
    });
    app.get("/healthz", (_req, res) => res.json({ ok: true }));
    app.get("/catalog.json", async (_req, res) => res.json(await getCatalog()));
    // Stateless: a fresh server+transport per request, no session ids. Simple and horizontally scalable.
    app.all("/mcp", async (req, res) => {
        const server = buildServer();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on("close", () => { transport.close(); server.close(); });
        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        }
        catch (e) {
            console.error(e);
            if (!res.headersSent)
                res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null });
        }
    });
    app.listen(PORT, HOST, () => console.log(`SkillMCP MCP server on http://${HOST}:${PORT}/mcp`));
}
