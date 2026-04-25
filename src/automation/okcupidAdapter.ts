/**
 * okcupidAdapter.ts
 *
 * Connects to the user's EXISTING Chrome window via CDP (Chrome DevTools Protocol)
 * so the agent uses a real, already-logged-in browser instead of a detectable
 * Playwright/Chromium instance that OkCupid would block.
 *
 * Prerequisites:
 *   1. Run `npm run chrome:debug` to launch Chrome with --remote-debugging-port=9222
 *   2. Log into OkCupid in that Chrome window
 *   3. Leave Chrome open — the agent will attach to it automatically each run
 *
 * The CDP port is configurable via CHROME_DEBUG_PORT (default: 9222).
 */

import { chromium, type Browser, type Page } from "playwright";
import { v5 as uuidv5 } from "uuid";
import type { Match, Message } from "../types/domain";

const OKCUPID_URL = "https://www.okcupid.com/messages";
const UUID_NAMESPACE = "3e9a9eac-4c6c-4db2-8f39-9d264f58e0b6";
const CDP_PORT = Number(process.env.CHROME_DEBUG_PORT ?? 9222);
const CDP_ENDPOINT = `http://localhost:${CDP_PORT}`;

export interface OkCupidThread {
  match: Match;
  messages: Message[];
}

export class OkCupidAdapter {
  private browser?: Browser;

  // ─── Connect to existing Chrome via CDP ──────────────────────────────────

  private async connect(): Promise<Browser> {
    try {
      this.browser = await chromium.connectOverCDP(CDP_ENDPOINT);
      return this.browser;
    } catch {
      throw new Error(
        `Cannot connect to Chrome on port ${CDP_PORT}.\n` +
        `Run this first:  npm run chrome:debug\n` +
        `Then log into OkCupid and leave Chrome open.`
      );
    }
  }

  private async disconnect(): Promise<void> {
    // Only disconnect the CDP session — do NOT close the user's Chrome window
    try {
      await this.browser?.close();
    } catch {
      // ignore
    }
    this.browser = undefined;
  }

  // ─── Get the OkCupid messages page (navigate if needed) ──────────────────

  private async getOkCupidPage(): Promise<Page> {
    const browser = await this.connect();
    const contexts = browser.contexts();

    // Find an existing OkCupid tab, or fall back to the first available page
    for (const ctx of contexts) {
      for (const page of ctx.pages()) {
        if (page.url().includes("okcupid.com")) {
          return page;
        }
      }
    }

    // No OkCupid tab open yet — navigate the first tab
    const firstPage = contexts[0]?.pages()[0];
    if (!firstPage) {
      throw new Error("No open tabs found in Chrome. Open OkCupid in Chrome first, then re-run.");
    }
    await firstPage.goto(OKCUPID_URL, { waitUntil: "domcontentloaded" });
    return firstPage;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  async readThreads(limit = 12): Promise<OkCupidThread[]> {
    try {
      const page = await this.getOkCupidPage();

      // Make sure we're on the messages page
      if (!page.url().includes("okcupid.com/messages")) {
        await page.goto(OKCUPID_URL, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1500);
      }

      if (page.url().includes("login") || page.url().includes("sign-in")) {
        throw new Error(
          "OkCupid is showing a login screen. Log into OkCupid in Chrome, then run again."
        );
      }

      // Collect thread links from the sidebar
      const threadLinks: string[] = await page
        .locator("a[href*='/messages/'], a[href*='conversation']")
        .evaluateAll((links) =>
          Array.from(
            new Set(
              links
                .map((link) => (link as HTMLAnchorElement).href)
                .filter((href) => Boolean(href) && href.includes("okcupid.com"))
            )
          ).slice(0, 12)
        )
        .catch(() => []);

      const threads: OkCupidThread[] = [];

      for (const href of threadLinks.slice(0, limit)) {
        await page.goto(href, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1200);
        const thread = await this.extractCurrentThread(page);
        if (thread.messages.length > 0) threads.push(thread);
      }

      // Navigate back to messages list when done so the user sees a clean state
      await page.goto(OKCUPID_URL, { waitUntil: "domcontentloaded" }).catch(() => {});

      return threads;
    } finally {
      await this.disconnect();
    }
  }

  async sendMessage(platformId: string, text: string): Promise<void> {
    try {
      const page = await this.getOkCupidPage();
      const threadUrl = platformId.startsWith("http")
        ? platformId
        : `${OKCUPID_URL}/${platformId}`;

      await page.goto(threadUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);

      // Try to find the message input — OkCupid uses various selectors
      const inputSelectors = [
        "textarea[placeholder]",
        "[contenteditable='true'][data-testid*='input']",
        "[contenteditable='true'][class*='message']",
        "[contenteditable='true'][class*='composer']",
        "textarea",
        "[contenteditable='true']"
      ];

      let typed = false;
      for (const selector of inputSelectors) {
        const el = page.locator(selector).last();
        const count = await el.count();
        if (count > 0) {
          await el.click();
          await el.fill(text);
          await page.waitForTimeout(300);
          await page.keyboard.press("Enter");
          await page.waitForTimeout(600);
          typed = true;
          break;
        }
      }

      if (!typed) {
        throw new Error(`Could not find message input on ${threadUrl}. OkCupid may have changed its UI.`);
      }
    } finally {
      await this.disconnect();
    }
  }

  // ─── Thread extraction ────────────────────────────────────────────────────

  private async extractCurrentThread(page: Page): Promise<OkCupidThread> {
    const url = page.url();
    const platformId = url.split("/").filter(Boolean).at(-1) ?? url;

    const displayName = await page
      .locator("h1, h2, [data-testid*='name'], [class*='name']")
      .first()
      .innerText({ timeout: 2000 })
      .catch(() => "Unknown match");

    // Try multiple message container selectors — OkCupid changes these periodically
    const messageSelectors = [
      "[data-testid*='message']",
      "[class*='Message__']",
      "[class*='message-bubble']",
      "[class*='message']"
    ];

    let rawMessages: Array<{ text: string; sender: "me" | "match" }> = [];

    for (const selector of messageSelectors) {
      rawMessages = await page
        .locator(selector)
        .evaluateAll((nodes) =>
          nodes
            .map((node) => {
              const el = node as HTMLElement;
              const text = el.innerText?.trim();
              if (!text || text.length < 1) return undefined;
              const cls = (el.className ?? "").toString().toLowerCase();
              const dataAttr = (el.getAttribute?.("data-testid") ?? "").toLowerCase();
              const combined = `${cls} ${dataAttr}`;
              const sender =
                combined.includes("sent") ||
                combined.includes("outgoing") ||
                combined.includes("mine") ||
                combined.includes("self")
                  ? "me"
                  : "match";
              return { text, sender } as { text: string; sender: "me" | "match" };
            })
            .filter((m): m is { text: string; sender: "me" | "match" } => Boolean(m))
        )
        .catch(() => [] as Array<{ text: string; sender: "me" | "match" }>);

      if (rawMessages.length > 0) break;
    }

    const matchId = uuidv5(platformId, UUID_NAMESPACE);
    const now = new Date().toISOString();

    const messages: Message[] = rawMessages.map((msg, index) => ({
      id: uuidv5(`${platformId}:${index}:${msg.sender}:${msg.text}`, UUID_NAMESPACE),
      matchId,
      sender: msg.sender,
      text: msg.text,
      timestamp: new Date(Date.now() - (rawMessages.length - index) * 60_000).toISOString(),
      rawSource: url
    }));

    return {
      match: {
        id: matchId,
        platformId: url,
        displayName: displayName.trim() || "Unknown match",
        profile: {},
        stage: "new",
        currentScore: 0,
        lastActivityAt: now,
        paused: false,
        archived: false
      },
      messages
    };
  }
}
