# RoboAI

RoboAI is a local-first Roblox development assistant. The first MVP provides a browser UI, six focused AI agents, Ollama model selection, and locally stored chat/project data.

## Requirements

- Windows, macOS, or Linux
- Node.js 20+
- [Ollama](https://ollama.com/) installed and running
- At least one Ollama model downloaded (for example: \`ollama pull qwen2.5-coder:7b\`)

## Run on Windows

1. Install Node.js 20+ and Ollama.
2. Open Command Prompt in this project folder.
3. Run \`npm install\`.
4. Run \`ollama pull qwen2.5-coder:7b\` (or use a model you already have).
5. Make sure Ollama is running.
6. Run \`npm start\`.
7. Open http://127.0.0.1:4317

The server binds only to 127.0.0.1. Chat data is stored in \`data/roboai.json\` on this computer.

## Current features

- Lead, Scripter, Builder, UI Designer, Tester, and Optimizer agents
- Uses models from the local Ollama instance
- Saves conversations locally
- Keeps the original promotional page in \`roboai.html\`

## Not implemented yet

- User accounts and private multi-user cloud sync
- Direct Roblox Studio integration / MCP bridge
- Agent-to-agent task execution and approval workflow
- Persistent project files and version history

The UI does not claim Roblox Studio is connected. Studio integration needs a separate local bridge and an MCP server, followed by explicit permission and testing.
