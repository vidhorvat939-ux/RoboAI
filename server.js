const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const studioMcp = require("./studio-mcp");

const app = express();
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 4317);
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const DATA_DIR = path.join(__dirname, "data");
const STORE = path.join(DATA_DIR, "roboai.json");

const agents = {
  lead: {
    name: "Lead",
    description: "Plans features and coordinates the work.",
    system: "You are RoboAI Lead, an expert Roblox game-development project lead. Clarify goals when essential, break features into practical steps, identify dependencies, and give concise actionable plans. Roblox uses Luau. Never claim you edited Studio or ran a test unless a connected tool actually did it."
  },
  scripter: {
    name: "Scripter",
    description: "Writes and explains Roblox Luau scripts.",
    system: "You are RoboAI Scripter, an expert Roblox Luau engineer. Produce safe, maintainable server/client code. Explain exactly where each Script, LocalScript, or ModuleScript belongs in Explorer. Use server-side validation for important game state and never trust the client."
  },
  builder: {
    name: "Builder",
    description: "Plans maps, parts, and world layout.",
    system: "You are RoboAI Builder, a Roblox Studio environment-building specialist. Give precise Workspace hierarchies, part properties, dimensions, placement guidance, and Studio-ready Luau when useful. Do not claim to have placed objects in Studio."
  },
  ui: {
    name: "UI Designer",
    description: "Designs Roblox interfaces and UX.",
    system: "You are RoboAI UI Designer, a Roblox UI/UX specialist. Design polished, responsive Roblox ScreenGui interfaces. Specify hierarchy, sizing, anchors, constraints, typography, states, and Luau behavior."
  },
  tester: {
    name: "Tester",
    description: "Reviews code and finds edge cases.",
    system: "You are RoboAI Tester, a careful Roblox QA engineer. Review supplied designs and Luau for bugs, exploit risks, race conditions, nil cases, performance, and edge cases. Do not say you executed playtests unless you actually did."
  },
  optimizer: {
    name: "Optimizer",
    description: "Improves performance and maintainability.",
    system: "You are RoboAI Optimizer, a Roblox performance specialist. Recommend measurable improvements for server load, client performance, replication, memory, streaming, and maintainability. Preserve behavior unless asked to change it."
  }
};

function readStore() {
  try {
    if (!fs.existsSync(STORE)) return { chats: [], projects: [] };
    const parsed = JSON.parse(fs.readFileSync(STORE, "utf8"));
    return { chats: Array.isArray(parsed.chats) ? parsed.chats : [], projects: Array.isArray(parsed.projects) ? parsed.projects : [] };
  } catch {
    return { chats: [], projects: [] };
  }
}
function writeStore(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temp = STORE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(temp, STORE);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.get("/api/health", async (_req, res) => {
  let ollama = false;
  let models = [];
  let error = "";
  try {
    const response = await fetch(OLLAMA_URL + "/api/tags", { signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error("Ollama returned " + response.status);
    const data = await response.json();
    ollama = true;
    models = (data.models || []).map(m => m.name);
  } catch (e) { error = e.message; }
  res.json({ ok: true, ollama, models, error, agents: Object.keys(agents).length });
});
app.get("/api/studio", (_req, res) => res.json(studioMcp.getStudioStatus()));
app.post("/api/studio/connect", async (_req, res) => {
  try {
    const result = await studioMcp.connectStudio();
    res.json(result);
  } catch (error) {
    res.status(502).json({ connected: false, error: error.message || "Could not connect to Roblox Studio." });
  }
});
app.post("/api/studio/disconnect", async (_req, res) => {
  res.json(await studioMcp.disconnectStudio());
});
app.post("/api/studio/list", async (_req, res) => {
  try {
    if (!studioMcp.getStudioStatus().connected) return res.status(409).json({ error: "Connect Roblox Studio first." });
    const result = await studioMcp.callStudioTool("list_roblox_studios", {});
    res.json({ result: result.content });
  } catch (error) {
    res.status(502).json({ error: error.message || "Could not list Studio sessions." });
  }
});
app.get("/api/agents", (_req, res) => res.json(agents));
app.get("/api/chats", (_req, res) => res.json(readStore().chats));
app.get("/api/projects", (_req, res) => res.json(readStore().projects));

app.post("/api/projects", (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: "Project name is required." });
  const store = readStore();
  const project = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
  store.projects.unshift(project);
  writeStore(store);
  res.status(201).json(project);
});

app.post("/api/chats", (req, res) => {
  const title = String(req.body.title || "New conversation").trim().slice(0, 100);
  const store = readStore();
  const chat = { id: crypto.randomUUID(), title, agent: "lead", messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  store.chats.unshift(chat);
  writeStore(store);
  res.status(201).json(chat);
});

app.get("/api/chats/:id", (req, res) => {
  const chat = readStore().chats.find(c => c.id === req.params.id);
  if (!chat) return res.status(404).json({ error: "Conversation not found." });
  res.json(chat);
});

app.post("/api/chat", async (req, res) => {
  const { chatId, agent = "lead", model, message, studioTarget = "" } = req.body || {};
  const prompt = String(message || "").trim();
  if (!prompt || prompt.length > 12000) return res.status(400).json({ error: "Message must be between 1 and 12,000 characters." });
  if (!agents[agent]) return res.status(400).json({ error: "Unknown agent." });
  if (!model || typeof model !== "string" || model.length > 120) return res.status(400).json({ error: "Choose an installed Ollama model first." });

  const store = readStore();
  let chat = store.chats.find(c => c.id === chatId);
  if (!chat) return res.status(404).json({ error: "Conversation not found. Create a new chat first." });

  const userMessage = { role: "user", content: prompt, agent, createdAt: new Date().toISOString() };
  const context = chat.messages.slice(-16).map(m => ({ role: m.role, content: m.content }));
  try {
    const response = await fetch(OLLAMA_URL + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: agents[agent].system + "\n\nYou are running locally inside RoboAI. Roblox Studio MCP connection status is available in the dashboard, but do not claim to inspect or edit Studio unless a connected Studio tool was actually called." },
          ...context,
          { role: "user", content: prompt }
        ],
        options: { temperature: 0.35 }
      }),
      signal: AbortSignal.timeout(180000)
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error("Ollama error " + response.status + ": " + detail.slice(0, 500));
    }
    const data = await response.json();
    const answer = data.message?.content || "The model returned an empty response.";
    chat.messages.push(userMessage, { role: "assistant", content: answer, agent, model, createdAt: new Date().toISOString() });
    chat.agent = agent;
    chat.updatedAt = new Date().toISOString();
    if (chat.messages.length === 2 && chat.title === "New conversation") chat.title = prompt.slice(0, 48);
    writeStore(store);
    res.json({ answer, chat });
  } catch (e) {
    res.status(502).json({ error: e.message || "Could not connect to Ollama." });
  }
});

app.listen(PORT, HOST, () => {
  console.log("RoboAI running at http://" + HOST + ":" + PORT);
  console.log("Ollama endpoint: " + OLLAMA_URL);
});