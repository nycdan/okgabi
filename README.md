# OkCupid Agent

Local dating-agent dashboard and automation prototype for scoring OkCupid conversations, generating short replies in an approved style profile, and offering Instagram only after required interest gates pass.

## Commands

```bash
npm install
npm run dev
npm run simulate
npm run agent:once
```

The API runs on `http://127.0.0.1:4177` and the dashboard runs on `http://127.0.0.1:5173`.

## Operating Modes

- `paused`: dashboard works, automation does not run.
- `review`: agent ingests/scans and proposes replies without sending.
- `auto`: agent sends replies that pass scoring and guardrails.

## OkCupid Login

Run `npm run playwright:install`, then start the agent once. A persistent browser profile is stored in `.browser/okcupid`. If OkCupid asks you to log in, complete that manually in the opened browser and run the agent again.

## Style Profile

Defaults live in `src/config/styleProfile.ts`. Replace `@yourhandle`, writing samples, banned phrases, boundaries, and examples before using live automation.

## Guardrails

The agent pauses or blocks replies for hard stops including rejection, discomfort, scam signals, sensitive topics, hostile tone, pressure language, and repeated IG pitching. Every decision is written to `data/store.json` and shown in the audit trail.
