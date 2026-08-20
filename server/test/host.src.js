// Minimal MCP Apps host harness: connects to the SkillMCP server over Streamable HTTP,
// calls browse_skills, loads its ui:// resource into a sandboxed iframe, and bridges messages.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AppBridge, PostMessageTransport, getToolUiResourceUri } from "@modelcontextprotocol/ext-apps/app-bridge";

const log = (m) => { document.getElementById("log").textContent += m + "\n"; };
window.__state = { stage: "start" };
try {
  const server = new URLSearchParams(location.search).get("server") ?? "http://127.0.0.1:8765/mcp";
  const client = new Client({ name: "harness", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(server)));
  log("connected");
  const { tools } = await client.listTools();
  const tool = tools.find((t) => t.name === "browse_skills");
  const uri = getToolUiResourceUri(tool);
  log("ui uri: " + uri);
  const res = await client.readResource({ uri });
  const html = res.contents[0].text;
  log("html bytes: " + html.length);

  const iframe = document.getElementById("app");
  iframe.sandbox = "allow-scripts";
  const bridge = new AppBridge(client, { name: "harness", version: "0" }, { serverTools: {}, openLinks: {}, logging: {} }, { hostContext: { theme: "light" } });
  bridge.onmessage = (p) => { log("ui/message: " + JSON.stringify(p).slice(0, 200)); window.__state.message = p; };
  bridge.oninitialized = async () => {
    log("view initialized");
    window.__state.stage = "initialized";
    const result = await client.callTool({ name: "browse_skills", arguments: {} });
    await bridge.sendToolResult(result);
    log("tool result sent: " + (result.structuredContent?.plugins?.length ?? "?") + " plugins");
    window.__state.stage = "result-sent";
  };
  iframe.srcdoc = html;
  await new Promise((r) => iframe.addEventListener("load", r, { once: true }));
  await bridge.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow));
  window.__bridge = bridge;
} catch (e) { log("ERROR " + (e?.stack ?? e)); window.__state.error = String(e); }
