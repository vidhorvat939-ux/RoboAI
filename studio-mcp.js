const path = require("node:path");
const fs = require("node:fs");

let client = null;
let transport = null;
let connecting = null;
let availableTools = [];

const ALLOWED_TOOLS = new Set([
  "list_roblox_studios",
  "get_studio_state",
  "search_game_tree",
  "inspect_instance",
  "script_read",
  "script_search",
  "script_grep",
  "multi_edit",
  "execute_luau",
  "get_console_output",
  "start_stop_play",
  "screen_capture"
]);

function getMcpBatchPath() {
  if (process.platform !== "win32") {
    throw new Error("The current RoboAI setup uses Roblox's Windows MCP launcher. This machine is not running Windows.");
  }
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) throw new Error("Windows LOCALAPPDATA was not found.");
  return path.join(localAppData, "Roblox", "mcp.bat");
}

async function connectStudio() {
  if (client && availableTools.length) {
    return { connected: true, tools: availableTools.map(t => t.name) };
  }
  if (connecting) return connecting;

  connecting = (async () => {
    const batchPath = getMcpBatchPath();
    if (!fs.existsSync(batchPath)) {
      throw new Error("Roblox's MCP launcher was not found at " + batchPath + ". In Roblox Studio, enable Assistant > … > Manage MCP Servers, then restart Studio.");
    }

    const [{ Client }, { StdioClientTransport }] = await Promise.all([
      import("@modelcontextprotocol/sdk/client/index.js"),
      import("@modelcontextprotocol/sdk/client/stdio.js")
    ]);

    const nextClient = new Client(
      { name: "roboai", version: "0.2.0" },
      { capabilities: {} }
    );
    const nextTransport = new StdioClientTransport({
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", '"' + batchPath + '"'],
      stderr: "pipe"
    });

    nextTransport.onerror = error => {
      console.error("[Roblox Studio MCP]", error);
    };
    nextTransport.onclose = () => {
      client = null;
      transport = null;
      availableTools = [];
      console.log("[Roblox Studio MCP] connection closed");
    };

    try {
      await nextClient.connect(nextTransport);
      const result = await nextClient.listTools();
      client = nextClient;
      transport = nextTransport;
      availableTools = (result.tools || []).filter(tool => ALLOWED_TOOLS.has(tool.name));
      if (!availableTools.length) {
        await disconnectStudio();
        throw new Error("Connected to Roblox Studio, but no supported editing tools were returned. Update Roblox Studio and try again.");
      }
      console.log("[Roblox Studio MCP] connected with " + availableTools.length + " supported tools");
      return { connected: true, tools: availableTools.map(t => t.name) };
    } catch (error) {
      try { await nextTransport.close(); } catch {}
      throw new Error("Could not connect to Roblox Studio MCP: " + (error.message || error));
    }
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

async function disconnectStudio() {
  const oldClient = client;
  const oldTransport = transport;
  client = null;
  transport = null;
  availableTools = [];
  try {
    if (oldClient) await oldClient.close();
    else if (oldTransport) await oldTransport.close();
  } catch {}
  return { connected: false, tools: [] };
}

function getStudioStatus() {
  return {
    connected: Boolean(client && availableTools.length),
    tools: availableTools.map(t => t.name)
  };
}

function getOllamaTools() {
  return availableTools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: (tool.description || "Roblox Studio tool") + " Only use this tool for the user's current Roblox Studio project.",
      parameters: tool.inputSchema || { type: "object", properties: {} }
    }
  }));
}

async function callStudioTool(name, args) {
  if (!client || !availableTools.length) throw new Error("Roblox Studio is not connected.");
  if (!ALLOWED_TOOLS.has(name) || !availableTools.some(tool => tool.name === name)) {
    throw new Error("This Roblox Studio tool is not enabled in RoboAI: " + name);
  }
  const result = await client.callTool({ name, arguments: args || {} });
  const content = (result.content || []).map(item => {
    if (item.type === "text") return item.text;
    if (item.type === "image") return "[Studio returned an image]";
    return JSON.stringify(item);
  }).join("\n");
  return {
    content: content || JSON.stringify(result),
    isError: Boolean(result.isError)
  };
}

module.exports = {
  connectStudio,
  disconnectStudio,
  getStudioStatus,
  getOllamaTools,
  callStudioTool
};
