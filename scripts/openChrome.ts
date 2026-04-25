/**
 * openChrome.ts
 *
 * Launches Google Chrome with remote debugging enabled on port 9222.
 * This lets the OkCupid agent attach to your real, logged-in Chrome window
 * instead of spawning a new detectable Playwright browser.
 *
 * Usage:  npm run chrome:debug
 *
 * After running this:
 *  1. A Chrome window opens — log into OkCupid if not already logged in
 *  2. Leave Chrome open
 *  3. Run `npm run agent:once` or `npm run agent:loop` — the agent will attach automatically
 */

import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const PORT = Number(process.env.CHROME_DEBUG_PORT ?? 9222);

// Common Chrome paths on macOS
const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
];

function findChrome(): string {
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    "Google Chrome not found. Install it from https://www.google.com/chrome/ or set CHROME_PATH env variable."
  );
}

function isChromeDebugging(): boolean {
  try {
    const result = execSync(`lsof -i :${PORT} -t 2>/dev/null || true`).toString().trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

async function main() {
  if (isChromeDebugging()) {
    console.log(`✓ Chrome is already running with debugging on port ${PORT}.`);
    console.log(`  The agent will connect to it automatically.`);
    console.log(`  Make sure you're logged into OkCupid in that Chrome window.`);
    return;
  }

  const chromePath = process.env.CHROME_PATH ?? findChrome();
  const userDataDir = resolve(".browser/chrome-debug");

  console.log(`Launching Chrome with remote debugging on port ${PORT}...`);
  console.log(`  Chrome: ${chromePath}`);
  console.log(`  Profile: ${userDataDir}`);
  console.log(``);
  console.log(`→ Log into OkCupid in the Chrome window that opens.`);
  console.log(`→ Leave Chrome open. The agent will attach to it automatically.`);

  const proc = spawn(
    chromePath,
    [
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "https://www.okcupid.com/messages"
    ],
    { detached: true, stdio: "ignore" }
  );

  proc.unref();
  console.log(`\n✓ Chrome launched (PID ${proc.pid}). Go log in and come back.`);
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
