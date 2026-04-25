# Okgabi

Local OkCupid assistant for Gabi. Runs entirely on your computer. Connects to your real Chrome window, reads conversations, scores them, and drafts replies in Gabi's voice using Claude AI. Offers Instagram only when a conversation passes the required interest gates.

**Three modes:**
- `review` — reads conversations and proposes replies. Nothing is sent. Start here.
- `auto` — sends replies that pass scoring and guardrails automatically.
- `paused` — agent is stopped. Dashboard still works.

---

## Requirements

- macOS
- Node.js 18 or newer
- Google Chrome installed
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))

---

## Install

```bash
git clone git@github.com:nycdan/okgabi.git
cd okgabi
npm install
```

---

## Environment Setup

Copy the example env file and fill in your API key:

```bash
cp .env.example .env
```

Edit `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
OKCUPID_HEADLESS=false
```

`.env` is gitignored and never committed.

---

## First Run

### 1. Open Chrome with debugging enabled

```bash
npm run chrome:debug
```

This launches Google Chrome on port 9222 and opens OkCupid. Log into OkCupid if you aren't already. **Leave Chrome open** — the agent attaches to this window every run.

You only need to do this once per machine session. If Chrome is already open with debugging enabled, this command will tell you so and exit.

### 2. Start the dashboard

```bash
npm run dev
```

Open: [http://127.0.0.1:5173](http://127.0.0.1:5173)

The API runs at `http://127.0.0.1:4177`.

### 3. Configure Gabi's profile

1. Open the dashboard → **Gabi Profile Editor**
2. Fill in anything the agent should know: age, location, work, short bio, interests, dating intent, answer bank for common questions
3. Click **Save Profile**

Profile edits are saved to `data/store.json` (gitignored).

### 4. Test in Reply Lab

Use the Reply Lab tab to test Claude's replies before going live:

```
me: היי מה קורה
her: What are you looking for?
```

The lab calls Claude and shows: the proposed reply, score, action type, guardrail result, and IG handoff gates.

### 5. Run one agent pass (review mode)

```bash
npm run agent:once
```

The agent reads your OkCupid threads, scores them, asks Claude to generate replies in Gabi's voice, and shows them in the dashboard. Nothing is sent in `review` mode.

### 6. Go live

When the proposals look right across multiple passes:

```bash
npm run mode -- auto
npm run agent:loop
```

The loop runs every 90 seconds. Stop it with `Ctrl+C`.

---

## How It Works

```
Chrome (CDP) → okcupidAdapter.ts
                     ↓
              reads threads + messages
                     ↓
              jsonStore.ts (upsert)
                     ↓
              rubric.ts (lead score)
                     ↓
              claudeReplyAgent.ts (Claude API)
                     ↓
              policyGuard.ts (guardrails)
                     ↓
         review → propose to dashboard
         auto   → sendMessage via CDP
```

### Reply generation

`src/style/claudeReplyAgent.ts` sends Claude (`claude-sonnet-4-6`) the full style profile: tone guidelines, writing samples, good/bad reply examples, conversation history, lead score, and IG threshold. Claude outputs JSON with `actionType`, `text`, and `reason`. If the API call fails for any reason, it falls back to the template system in `src/style/replyAgent.ts`.

### Chrome connection

`src/automation/okcupidAdapter.ts` connects to Chrome via `chromium.connectOverCDP()` on port 9222. It finds the existing OkCupid tab (or navigates to it), reads message threads, and sends messages through the real browser — no detectable automation browser.

### Scoring

`src/scoring/rubric.ts` scores each conversation 0–100 across: reciprocity, enthusiasm, momentum, specific connection, intent signal, and safety/trust. Hard stops (rejection, scams, sensitive topics, hostile tone) block the agent entirely and require manual review. Instagram is offered only when score ≥ threshold AND all required gates pass.

### Guardrails

`src/agent/policyGuard.ts` blocks replies that contain banned phrases, pressure language, hard-stop context, sensitive topics, or exceed the character limit — regardless of what Claude generated.

---

## Common Commands

```bash
npm run chrome:debug        # launch Chrome with debugging (do this first, every session)
npm run dev                 # API + dashboard (http://127.0.0.1:5173)
npm run agent:once          # one automation pass
npm run agent:loop          # continuous loop (every 90s)
npm run mode -- review      # safe proposed-replies mode
npm run mode -- auto        # live sending mode
npm run mode -- paused      # stop automation
npm run data:prepare-live   # clear demo data, reset to review mode
npm run simulate            # run seeded simulator scenarios
npm run build               # typecheck + production build
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/config/styleProfile.ts` | Default seed profile — voice, tone, Gabi facts, writing samples, guardrails |
| `data/store.json` | Live runtime state — profile, threads, scores, actions (gitignored) |
| `src/style/claudeReplyAgent.ts` | **Claude-powered reply generation** — main reply engine |
| `src/style/replyAgent.ts` | Template-based fallback reply engine |
| `src/scoring/rubric.ts` | Lead scoring, IG gates, stage derivation |
| `src/agent/policyGuard.ts` | Guardrails — blocks unsafe or off-voice replies |
| `src/automation/okcupidAdapter.ts` | Chrome CDP connection, thread reading, message sending |
| `src/agent/agentLoop.ts` | Main loop: ingest → score → generate → guard → propose/send |
| `src/api/server.ts` | Express API for dashboard + Reply Lab |
| `src/ui/App.tsx` | React dashboard: thread list, audit trail, Reply Lab, Profile Editor |
| `src/storage/jsonStore.ts` | JSON persistence and schema migrations |
| `scripts/openChrome.ts` | Launches Chrome with remote debugging on port 9222 |
| `scripts/prepareLiveStore.ts` | Clears demo data, sets review mode |
| `scripts/setMode.ts` | Sets paused / review / auto |

---

## Troubleshooting

**Agent can't connect to Chrome:**
Run `npm run chrome:debug`. If Chrome is already open without debugging, quit it first and re-run.

**OkCupid shows a login screen:**
Log into OkCupid in the Chrome window opened by `chrome:debug`. The session persists in `.browser/chrome-debug/`.

**No threads imported:**
Make sure OkCupid messages are open in the Chrome window. Navigate to `okcupid.com/messages` manually if needed, then re-run `npm run agent:once`.

**Replies sound wrong:**
Edit the Gabi Profile in the dashboard. Test in Reply Lab. Stay in `review` mode until the voice sounds right.

**OkCupid changes its UI and message extraction breaks:**
Update selectors in `src/automation/okcupidAdapter.ts` → `extractCurrentThread()`.

**Claude API errors / fallback to templates:**
Check that `ANTHROPIC_API_KEY` is set correctly in `.env`. The agent falls back to templates automatically if Claude is unavailable.

---

## Privacy

Never commit:
- `.browser/` — Chrome session data
- `data/store.json` — conversations and personal data
- `.env` — API keys
- Screenshots or exports with private conversations

All of the above are already in `.gitignore`.
