# RoboAI

RoboAI is a cloud-ready Roblox development assistant with six specialist agents: Lead, Scripter, Builder, UI Designer, Tester, and Optimizer.

## Public deployment (Render)

1. Connect this GitHub repository to Render and create a **Web Service**.
2. Render can use the included `render.yaml` Blueprint, or set:
   - Build command: `npm install`
   - Start command: `npm start`
3. Add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in Render. Create a Cloudflare account and a Workers AI API token with help from a parent/guardian. The token needs Workers AI Read permission. Never put the token in GitHub or browser code.
4. Set `SESSION_SECRET` to a long random secret (Render can generate this automatically).
5. Deploy. Render assigns a public `https://....onrender.com` address.

The default cloud model is `@cf/zai-org/glm-4.7-flash`. You can override it with `CLOUDFLARE_MODEL`. Cloudflare Workers AI currently includes a free daily allocation of 10,000 Neurons; requests stop when the free daily allocation is exhausted. Check Cloudflare pricing and model eligibility before deployment.

## Local development

- Install Node.js 22 or newer.
- Run `npm install`.
- Optional local fallback: install and run Ollama with a model.
- Run `npm start` and open `http://127.0.0.1:4317`.

## Privacy and limits

- Chat and project data are separated by a signed, HttpOnly browser session cookie.
- On the included free hosting setup, session data is held in server memory. It is temporary and can disappear after restarts, redeploys, or free-instance sleep. It is not a durable cloud database.
- The app does not provide user accounts or cross-device chat synchronization yet.
- The Cloudflare API token stays on the server. A basic per-session chat rate limit is enabled. The owner must also set Cloudflare daily usage quota and monitor usage to prevent unexpected API consumption.
- Prompts are sent to the configured AI provider. Do not enter passwords or sensitive personal information.
- Free Render web services can sleep after 15 minutes without traffic and may take about a minute to wake. Free instances have other limits and are intended for testing/hobby projects.

## Roblox Studio

The public cloud site does not control a visitor's local Roblox Studio. Direct Studio editing requires a separate local bridge on the computer running Studio. The cloud UI labels Studio as local-only and does not claim to be connected.

## Current scope

This is a public MVP, not a finished multi-user production service. It does not yet include sign-in, durable database storage, cross-device chat sync, payment handling, or a remotely hosted Studio bridge.
