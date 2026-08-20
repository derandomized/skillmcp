#!/usr/bin/env node
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express from "express";
import { buildServer } from "./server.js";
import { getCatalog } from "./catalog.js";
import { INBOX } from "./submit.js";
import { readdirSync, readFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join, basename } from "node:path";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT ?? 8765);
const HOST = process.env.HOST ?? "127.0.0.1";

if (process.argv.includes("--stdio")) {
  // Local mode: bundle-able inside a plugin's .mcp.json
  const server = buildServer();
  await server.connect(new StdioServerTransport());
} else {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  // Permissive CORS: the catalog is public and read-mostly; lets browser-based MCP clients connect.
  app.use((req, res, next) => {
    res.set({
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type, accept, authorization, mcp-session-id, mcp-protocol-version, last-event-id",
      "access-control-expose-headers": "mcp-session-id, mcp-protocol-version",
    });
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use((req, res, next) => {
    const t0 = Date.now();
    res.on("finish", () => {
      const m = req.body?.method ?? "";
      const detail = req.body?.params?.name ?? req.body?.params?.uri ?? "";
      console.log(`${req.method} ${req.originalUrl} ${m}${detail ? ` ${detail}` : ""} → ${res.statusCode} ${Date.now() - t0}ms ua=${JSON.stringify(req.get("user-agent") ?? "")} xff=${req.get("x-forwarded-for") ?? ""} accept=${JSON.stringify(req.get("accept") ?? "")}`);
    });
    next();
  });

  app.get("/", async (_req, res) => {
    const cat = await getCatalog();
    res.type("text/plain").send(
      `SkillMCP remote MCP server\n\nMCP endpoint: POST /mcp (Streamable HTTP)\n` +
      `Plugins: ${cat.plugins.map((p) => p.name).join(", ")}\nRepo: ${cat.marketplace.repository}\n`
    );
  });
  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.get("/catalog.json", async (_req, res) => res.json(await getCatalog()));

  // Maintainer inbox API (only when SKILLMCP_ADMIN_TOKEN is set). Used by scripts/inbox.mjs against a hosted server.
  const ADMIN = process.env.SKILLMCP_ADMIN_TOKEN;
  const authed = (req: express.Request) => {
    const h = req.get("authorization") ?? "";
    const t = Buffer.from(h.replace(/^Bearer\s+/i, ""));
    const a = Buffer.from(ADMIN ?? "");
    return !!ADMIN && t.length === a.length && timingSafeEqual(t, a);
  };
  const safeId = (id: string) => /^[A-Za-z0-9._-]+$/.test(id) && basename(id) === id;
  app.use("/admin", (req, res, next) => (authed(req) ? next() : res.status(401).json({ error: "unauthorized" })));
  app.get("/admin/inbox", (_req, res) => {
    const items = existsSync(INBOX) ? readdirSync(INBOX).filter((f) => f.endsWith(".json")).sort() : [];
    res.json(items.map((f) => JSON.parse(readFileSync(join(INBOX, f), "utf8"))));
  });
  app.get("/admin/inbox/:id", (req, res) => {
    const id = req.params.id;
    const p = join(INBOX, `${id}.json`);
    if (!safeId(id) || !existsSync(p)) return res.status(404).json({ error: "not_found" });
    res.type("json").send(readFileSync(p, "utf8"));
  });
  app.post("/admin/inbox/:id/:state", (req, res) => {
    const { id, state } = req.params;
    if (!safeId(id) || !["opened", "rejected"].includes(state)) return res.status(400).json({ error: "bad_request" });
    const p = join(INBOX, `${id}.json`);
    if (!existsSync(p)) return res.status(404).json({ error: "not_found" });
    mkdirSync(join(INBOX, state), { recursive: true });
    renameSync(p, join(INBOX, state, `${id}.json`));
    res.json({ ok: true, id, state });
  });

  // OAuth discovery probes: answer clearly (JSON 404) so clients treat this as an authless server.
  app.get(/^\/\.well-known\/.*/, (_req, res) => res.status(404).json({ error: "not_found", message: "SkillMCP requires no authentication" }));

  // Stateless: a fresh server+transport per request, no session ids. Simple and horizontally scalable.
  const mcpHandler: express.RequestHandler = async (req, res) => {
    if (req.method !== "POST") {
      // No sessions → no server-initiated streams; say so instead of holding an empty SSE stream open.
      res.set("Allow", "POST").status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST (stateless Streamable HTTP)." }, id: null });
      return;
    }
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null });
    }
  };
  app.all("/mcp", mcpHandler);
  app.all("/mcp/", mcpHandler);
  app.post("/", mcpHandler); // tolerate users entering the bare origin as the connector URL

  app.listen(PORT, HOST, () => console.log(`SkillMCP MCP server on http://${HOST}:${PORT}/mcp`));
}
