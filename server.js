const express = require("express");
const crypto = require("node:crypto");
const path = require("node:path");

const app = express();
const PORT = Number(process.env.PORT || 4317);
const HOST = "0.0.0.0";
const XAI_API_KEY = process.env.XAI_API_KEY || "";
const XAI_MODEL = process.env.XAI_MODEL || "grok-4.7";
const OLLAMA_URL = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const COOKIE_NAME = "roboai_session";
const sessions = new Map();
const requestWindows = new Map();
const ipRequestWindows = new Map();

const agents = {
  lead: { name:"Lead", description:"Plans features and coordinates the work.", system:"You are RoboAI Lead, an expert Roblox game-development project lead. Clarify goals when essential, break features into practical steps, identify dependencies, and give concise actionable plans. Roblox uses Luau. Never claim you edited Studio or ran a test unless a connected tool actually did it." },
  scripter: { name:"Scripter", description:"Writes and explains Roblox Luau scripts.", system:"You are RoboAI Scripter, an expert Roblox Luau engineer. Produce safe, maintainable server/client code. Explain exactly where each Script, LocalScript, or ModuleScript belongs in Explorer. Use server-side validation for important game state and never trust the client." },
  builder: { name:"Builder", description:"Plans maps, parts, and world layout.", system:"You are RoboAI Builder, a Roblox Studio environment-building specialist. Give precise Workspace hierarchies, part properties, dimensions, placement guidance, and Studio-ready Luau when useful. Do not claim to have placed objects in Studio." },
  ui: { name:"UI Designer", description:"Designs Roblox interfaces and UX.", system:"You are RoboAI UI Designer, a Roblox UI/UX specialist. Design polished, responsive Roblox ScreenGui interfaces. Specify hierarchy, sizing, anchors, constraints, typography, states, and Luau behavior." },
  tester: { name:"Tester", description:"Reviews code and finds edge cases.", system:"You are RoboAI Tester, a careful Roblox QA engineer. Review supplied designs and Luau for bugs, exploit risks, race conditions, nil cases, performance, and edge cases. Do not say you executed playtests unless you actually did." },
  optimizer: { name:"Optimizer", description:"Improves performance and maintainability.", system:"You are RoboAI Optimizer, a Roblox performance specialist. Recommend measurable improvements for server load, client performance, replication, memory, streaming, and maintainability. Preserve behavior unless asked to change it." }
};

app.set("trust proxy", 1);
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public")));

function sign(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value).digest("base64url");
}
function getSessionId(req) {
  const raw = (req.headers.cookie || "").split(";").map(v => v.trim()).find(v => v.startsWith(COOKIE_NAME + "="));
  if (!raw) return null;
  const token = decodeURIComponent(raw.slice(COOKIE_NAME.length + 1));
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const id = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(id);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
}
app.use((req, res, next) => {
  let id = getSessionId(req);
  if (!id || !sessions.has(id)) {
    id = crypto.randomBytes(24).toString("hex");
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.append("Set-Cookie", COOKIE_NAME + "=" + encodeURIComponent(id + "." + sign(id)) + "; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000" + secure);
    sessions.set(id, { chats: [], projects: [], lastSeen: Date.now() });
  }
  req.roboSessionId = id;
  req.roboSession = sessions.get(id);
  req.roboSession.lastSeen = Date.now();
  next();
});

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.roboSessionId;
  const ip = String(req.ip || "unknown").slice(0, 100);
  const recent = (requestWindows.get(key) || []).filter(t => now - t < 60000);
  if (recent.length >= 10) return res.status(429).json({ error: "You've reached the chat limit for this minute. Please wait a little and try again." });
  const ipRecent = (ipRequestWindows.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  if (ipRecent.length >= 40) return res.status(429).json({ error: "This network has reached its temporary chat limit. Please try again later." });
  recent.push(now);
  ipRecent.push(now);
  requestWindows.set(key, recent);
  ipRequestWindows.set(ip, ipRecent);
  next();
}
function trimOldData() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, session] of sessions) if (session.lastSeen < cutoff) sessions.delete(id);
  for (const [id, times] of requestWindows) if (!sessions.has(id)) requestWindows.delete(id);
  for (const [ip, times] of ipRequestWindows) if (!times.some(t => Date.now() - t < 10 * 60 * 1000)) ipRequestWindows.delete(ip);
  while (sessions.size > 3000) sessions.delete(sessions.keys().next().value);
}
setInterval(trimOldData, 15 * 60 * 1000).unref();

async function ollamaModels() {
  try {
    const response = await fetch(OLLAMA_URL + "/api/tags", { signal: AbortSignal.timeout(1800) });
    if (!response.ok) return [];
    const data = await response.json();
    return (data.models || []).map(m => m.name);
  } catch { return []; }
}
app.get("/api/health", async (_req, res) => {
  const models = XAI_API_KEY ? [XAI_MODEL] : await ollamaModels();
  res.json({
    ok: true,
    aiConfigured: Boolean(XAI_API_KEY || models.length),
    provider: XAI_API_KEY ? "grok" : "ollama",
    models,
    agents: Object.keys(agents).length
  });
});
app.get("/api/agents", (_req, res) => res.json(agents));
app.get("/api/chats", (req, res) => res.json(req.roboSession.chats));
app.get("/api/projects", (req, res) => res.json(req.roboSession.projects));

app.post("/api/projects", (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: "Project name is required." });
  const project = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
  req.roboSession.projects.unshift(project);
  res.status(201).json(project);
});
app.post("/api/chats", (req, res) => {
  const title = String(req.body.title || "New conversation").trim().slice(0, 100);
  const chat = { id: crypto.randomUUID(), title, agent: "lead", messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  req.roboSession.chats.unshift(chat);
  res.status(201).json(chat);
});
app.get("/api/chats/:id", (req, res) => {
  const chat = req.roboSession.chats.find(c => c.id === req.params.id);
  if (!chat) return res.status(404).json({ error: "Conversation not found." });
  res.json(chat);
});

async function askGrok(agent, history, prompt) {
  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + XAI_API_KEY },
    body: JSON.stringify({
      model: XAI_MODEL,
      input: agents[agent].system + "\n\nYou are RoboAI, a Roblox game-development assistant. Give practical, accurate answers. Never claim to have edited Roblox Studio or run a test unless a connected local tool actually did it.\n\n" + history + "\n\nUser: " + prompt
    }),
    signal: AbortSignal.timeout(120000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.error?.message || "Grok API returned HTTP " + response.status;
    throw new Error(detail.slice(0, 450));
  }
  const answer = data.output_text || (data.output || [])
    .filter(item => item.type === "message")
    .flatMap(item => item.content || [])
    .filter(part => part.type === "output_text" || part.type === "text")
    .map(part => part.text || "")
    .join("\n").trim();
  if (!answer) throw new Error("Grok returned an empty response. Please try again.");
  return answer;
}
async function askOllama(agent, model, history, prompt) {
  const response = await fetch(OLLAMA_URL + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, stream: false, messages: [
      { role: "system", content: agents[agent].system },
      { role: "user", content: history + "\n\nUser: " + prompt }
    ], options: { temperature: 0.35 } }),
    signal: AbortSignal.timeout(180000)
  });
  if (!response.ok) throw new Error("Ollama returned HTTP " + response.status);
  const data = await response.json();
  return data.message?.content || "The model returned an empty response.";
}

app.post("/api/chat", rateLimit, async (req, res) => {
  const { chatId, agent = "lead", model, message } = req.body || {};
  const prompt = String(message || "").trim();
  if (!prompt || prompt.length > 6000) return res.status(400).json({ error: "Message must be between 1 and 6,000 characters." });
  if (!agents[agent]) return res.status(400).json({ error: "Unknown agent." });
  const chat = req.roboSession.chats.find(c => c.id === chatId);
  if (!chat) return res.status(404).json({ error: "Conversation not found. Create a new chat first." });
  const history = chat.messages.slice(-12).map(m => (m.role === "user" ? "User: " : "Assistant: ") + m.content).join("\n\n");
  try {
    let answer;
    let usedModel;
    if (XAI_API_KEY) {
      answer = await askGrok(agent, history, prompt);
      usedModel = XAI_MODEL;
    } else {
      const available = await ollamaModels();
      if (!available.length) return res.status(503).json({ error: "Cloud AI is not configured yet. The site owner must add XAI_API_KEY in the hosting dashboard." });
      usedModel = available.includes(model) ? model : available[0];
      answer = await askOllama(agent, usedModel, history, prompt);
    }
    chat.messages.push(
      { role: "user", content: prompt, agent, createdAt: new Date().toISOString() },
      { role: "assistant", content: answer, agent, model: usedModel, createdAt: new Date().toISOString() }
    );
    chat.agent = agent;
    chat.updatedAt = new Date().toISOString();
    if (chat.messages.length === 2 && chat.title === "New conversation") chat.title = prompt.slice(0, 48);
    res.json({ answer, chat });
  } catch (error) {
    res.status(502).json({ error: error.message || "The AI provider could not be reached." });
  }
});

app.listen(PORT, HOST, () => {
  console.log("RoboAI listening on " + HOST + ":" + PORT);
  console.log(XAI_API_KEY ? "Cloud AI provider: Grok" : "Cloud AI provider: not configured (local Ollama fallback only)");
});
