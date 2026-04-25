import { chromium } from "playwright";
import { OKCUPID_USER_DATA_DIR } from "../src/automation/okcupidAdapter";

const context = await chromium.launchPersistentContext(OKCUPID_USER_DATA_DIR, {
  headless: false,
  viewport: { width: 1440, height: 1000 }
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto("https://www.okcupid.com/messages", { waitUntil: "domcontentloaded" });

console.log(`Opened OkCupid with persistent profile: ${OKCUPID_USER_DATA_DIR}`);
console.log("Log in manually if needed. Close the browser window when messages are visible and you are done.");

await page.waitForEvent("close").catch(() => undefined);
await context.close().catch(() => undefined);

