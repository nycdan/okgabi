import { chromium, type BrowserContext, type Page } from "playwright";
import { v5 as uuidv5 } from "uuid";
import type { Match, Message } from "../types/domain";

const OKCUPID_URL = "https://www.okcupid.com/messages";
const UUID_NAMESPACE = "3e9a9eac-4c6c-4db2-8f39-9d264f58e0b6";

export interface OkCupidThread {
  match: Match;
  messages: Message[];
}

export class OkCupidAdapter {
  private context?: BrowserContext;

  async open(): Promise<Page> {
    this.context = await chromium.launchPersistentContext(process.env.OKCUPID_USER_DATA_DIR ?? ".browser/okcupid", {
      headless: process.env.OKCUPID_HEADLESS === "true",
      viewport: { width: 1440, height: 1000 }
    });
    const page = this.context.pages()[0] ?? (await this.context.newPage());
    await page.goto(OKCUPID_URL, { waitUntil: "domcontentloaded" });
    return page;
  }

  async close(): Promise<void> {
    await this.context?.close();
    this.context = undefined;
  }

  async readThreads(limit = 12): Promise<OkCupidThread[]> {
    const page = await this.open();
    if (page.url().includes("login")) {
      throw new Error("OkCupid login required. Open the browser profile, log in manually, then rerun the agent.");
    }

    const threadLinks = await page
      .locator("a[href*='/messages/'], a[href*='conversation']")
      .evaluateAll((links) =>
        Array.from(new Set(links.map((link) => (link as HTMLAnchorElement).href).filter(Boolean))).slice(0, 12)
      )
      .catch(() => []);

    const threads: OkCupidThread[] = [];
    for (const href of threadLinks.slice(0, limit)) {
      await page.goto(href, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      const thread = await this.extractCurrentThread(page);
      if (thread.messages.length > 0) threads.push(thread);
    }

    await this.close();
    return threads;
  }

  async sendMessage(platformId: string, text: string): Promise<void> {
    const page = await this.open();
    const threadUrl = platformId.startsWith("http") ? platformId : `${OKCUPID_URL}/${platformId}`;
    await page.goto(threadUrl, { waitUntil: "domcontentloaded" });
    const textbox = page.locator("textarea, [contenteditable='true'], input[type='text']").last();
    await textbox.fill(text);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await this.close();
  }

  private async extractCurrentThread(page: Page): Promise<OkCupidThread> {
    const url = page.url();
    const platformId = url.split("/").filter(Boolean).at(-1) ?? url;
    const displayName = await page
      .locator("h1, h2, [data-testid*='name'], [class*='name']")
      .first()
      .innerText({ timeout: 1500 })
      .catch(() => "Unknown match");

    const rawMessages: Array<{ text: string; sender: "me" | "match" }> = await page
      .locator("[data-testid*='message'], [class*='message'], [class*='Message']")
      .evaluateAll((nodes) =>
        nodes
          .map((node) => {
            const element = node as HTMLElement;
            const text = element.innerText?.trim();
            if (!text) return undefined;
            const className = element.className.toString().toLowerCase();
            const sender = className.includes("sent") || className.includes("outgoing") || className.includes("mine") ? "me" : "match";
            return { text, sender };
          })
          .filter((message): message is { text: string; sender: "me" | "match" } => Boolean(message))
      )
      .catch(() => [] as Array<{ text: string; sender: "me" | "match" }>);

    const matchId = uuidv5(platformId, UUID_NAMESPACE);
    const now = new Date().toISOString();
    const messages: Message[] = rawMessages.map((message, index) => ({
      id: uuidv5(`${platformId}:${index}:${message.sender}:${message.text}`, UUID_NAMESPACE),
      matchId,
      sender: message.sender,
      text: message.text,
      timestamp: now,
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
