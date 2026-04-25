# Okgabi

Local OkCupid assistant for Gabi. It runs on your computer, keeps a local dashboard, scores conversations, drafts replies in Gabi's voice, and only offers Instagram when the conversation passes the handoff rules.

Important: start in `review` mode. In review mode the agent reads conversations and proposes replies, but it does not send anything.

## Requirements

- macOS
- Node.js 18 or newer
- npm
- GitHub SSH access to `git@github.com:nycdan/okgabi.git`

Check Node/npm:

```bash
node --version
npm --version
```

## Install

Clone and install dependencies:

```bash
git clone git@github.com:nycdan/okgabi.git
cd okgabi
npm install
npm run playwright:install
```

## Start The Dashboard

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

The API runs at `http://127.0.0.1:4177`.

## First-Time Setup

1. Open the dashboard.
2. Edit **Gabi Profile Editor**.
3. Fill in anything the agent should know:
   - age
   - current location
   - work
   - short bio
   - interests
   - dating intent
   - answer bank for common questions
4. Click **Save Profile**.
5. Use **Reply Lab** to test messages before going live.

Dashboard edits are saved locally in `data/store.json`. The file is intentionally ignored by git because it is personal runtime data.

## Reply Lab

Use Reply Lab to test tone and answers.

Example:

```text
me: היי מה קורה
her: What are you looking for?
```

The lab replies to the latest `her:` message and shows:

- score
- action type
- suggested reply
- guardrail result
- IG handoff gates
- score rationale

## Operating Modes

- `paused`: dashboard works, automation does not run.
- `review`: reads OkCupid, scores threads, proposes replies, does not send.
- `auto`: sends replies that pass score and guardrails.

Set mode from terminal:

```bash
npm run mode -- paused
npm run mode -- review
npm run mode -- auto
```

Use `review` until real imported conversations look right.

## Login To OkCupid

Open the persistent browser profile:

```bash
npm run okcupid:login
```

Log in manually. When your OkCupid messages are visible, close the browser window. The login session is kept in `.browser/okcupid`.

`.browser/okcupid` is ignored by git because it contains local browser session data.

## Safe Live Run

Prepare a clean live store and keep the agent in review mode:

```bash
npm run data:prepare-live
npm run okcupid:login
npm run mode -- review
npm run agent:once
```

Then open the dashboard and inspect the imported threads and proposed replies.

If everything looks good, run another pass:

```bash
npm run agent:once
```

Only after multiple review runs look correct should you switch to auto:

```bash
npm run mode -- auto
npm run agent:once
```

For continuous automation:

```bash
npm run agent:loop
```

Stop it with `Ctrl+C`.

## Common Commands

```bash
npm run dev                 # API + dashboard
npm run build               # typecheck and production build
npm run simulate            # seeded simulator scenarios
npm run data:prepare-live   # clear demo data and set review mode
npm run okcupid:login       # open persistent OkCupid browser
npm run mode -- review      # safe proposed-replies mode
npm run agent:once          # one automation pass
npm run agent:loop          # continuous automation loop
```

## Guardrails

The agent blocks or pauses for:

- rejection or discomfort
- scam/verification/money signals
- hostile tone
- sensitive topics
- unsafe/private information requests
- pressure language
- repeated IG pitching

Every decision is logged in `data/store.json` and shown in the dashboard audit trail.

## Troubleshooting

If no threads import:

1. Run `npm run okcupid:login`.
2. Confirm the browser shows OkCupid messages.
3. Close the browser.
4. Run `npm run agent:once`.

If replies sound wrong:

1. Edit **Gabi Profile Editor**.
2. Test in **Reply Lab**.
3. Keep mode as `review`.

If OkCupid changes its UI and message extraction breaks, update selectors in:

```text
src/automation/okcupidAdapter.ts
```

## Privacy Notes

Do not commit:

- `.browser/`
- `data/store.json`
- `.env`
- screenshots or exports with private conversations

Those are already ignored by `.gitignore`.
