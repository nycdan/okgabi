import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { v4 as uuid } from "uuid";
import { defaultSettings, defaultStyleProfile } from "../config/styleProfile";
import { createSeedStore } from "../data/seed";
import { calculateOutcomeMetrics } from "../scoring/outcomes";
import { scoreLead } from "../scoring/rubric";
import type {
  AgentAction,
  AgentSettings,
  AuditEvent,
  DashboardSnapshot,
  Match,
  Message,
  StoreShape,
  StyleProfile
} from "../types/domain";

const STORE_PATH = resolve(process.cwd(), "data/store.json");

type StyleProfilePatch = Partial<Omit<StyleProfile, "gabiProfile">> & {
  gabiProfile?: Partial<Omit<StyleProfile["gabiProfile"], "answerBank">> & {
    answerBank?: Partial<StyleProfile["gabiProfile"]["answerBank"]>;
  };
};

export class JsonStore {
  constructor(private readonly storePath = STORE_PATH) {}

  async read(): Promise<StoreShape> {
    try {
      return migrateStore(JSON.parse(await readFile(this.storePath, "utf8")) as StoreShape);
    } catch {
      const seed = createSeedStore();
      await this.write(seed);
      return seed;
    }
  }

  async write(store: StoreShape): Promise<void> {
    await mkdir(dirname(this.storePath), { recursive: true });
    await writeFile(this.storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  }

  async snapshot(): Promise<DashboardSnapshot> {
    const store = await this.read();
    const counts = buildCounts(store.matches);
    return {
      settings: store.settings,
      styleProfile: store.styleProfile,
      matches: store.matches
        .filter((match) => !match.archived)
        .map((match) => ({
          ...match,
          score: latestByMatch(store.scores, match.id),
          messages: store.messages.filter((message) => message.matchId === match.id),
          lastAction: store.actions.filter((action) => action.matchId === match.id).at(-1)
        }))
        .sort((a, b) => b.currentScore - a.currentScore),
      counts,
      outcomes: calculateOutcomeMetrics(store),
      auditEvents: store.auditEvents.slice(-80).reverse()
    };
  }

  async updateSettings(settings: Partial<AgentSettings>): Promise<StoreShape> {
    const store = await this.read();
    store.settings = { ...store.settings, ...settings };
    store.auditEvents.push(audit("manual_override", `Settings updated: ${Object.keys(settings).join(", ")}`));
    await this.write(store);
    return store;
  }

  async updateStyleProfile(styleProfile: StyleProfilePatch): Promise<StoreShape> {
    const store = await this.read();
    store.styleProfile = {
      ...store.styleProfile,
      ...styleProfile,
      gabiProfile: {
        ...store.styleProfile.gabiProfile,
        ...styleProfile.gabiProfile,
        answerBank: {
          ...store.styleProfile.gabiProfile.answerBank,
          ...styleProfile.gabiProfile?.answerBank
        }
      }
    };
    store.auditEvents.push(audit("manual_override", "Style profile updated."));
    await this.write(store);
    return store;
  }

  async upsertMessages(match: Match, incomingMessages: Message[]): Promise<StoreShape> {
    const store = await this.read();
    const existingMatch = store.matches.find((candidate) => candidate.id === match.id);
    if (existingMatch) Object.assign(existingMatch, match);
    else store.matches.push(match);

    for (const message of incomingMessages) {
      if (!store.messages.some((candidate) => candidate.id === message.id)) {
        store.messages.push(message);
        store.auditEvents.push(audit("message_ingested", `Ingested ${message.sender} message for ${match.displayName}.`, { matchId: match.id }));
      }
    }

    await this.recalculate(store, match.id);
    await this.write(store);
    return store;
  }

  async recordAction(action: Omit<AgentAction, "id" | "createdAt">): Promise<AgentAction> {
    const store = await this.read();
    const complete: AgentAction = {
      ...action,
      id: uuid(),
      createdAt: new Date().toISOString()
    };
    store.actions.push(complete);
    store.auditEvents.push(audit(action.status === "sent" ? "message_sent" : "reply_generated", action.reason, { matchId: action.matchId }));

    if (complete.status === "sent" && complete.finalReply) {
      store.messages.push({
        id: uuid(),
        matchId: complete.matchId,
        sender: "me",
        text: complete.finalReply,
        timestamp: complete.createdAt,
        rawSource: "agent"
      });
      const match = store.matches.find((candidate) => candidate.id === complete.matchId);
      if (match && complete.actionType === "ig_handoff") {
        match.igOfferedAt = complete.createdAt;
        match.stage = "ig_pending";
      }
    }

    await this.recalculate(store, complete.matchId);
    await this.write(store);
    return complete;
  }

  async setMatchPaused(matchId: string, paused: boolean): Promise<StoreShape> {
    const store = await this.read();
    const match = store.matches.find((candidate) => candidate.id === matchId);
    if (match) {
      match.paused = paused;
      match.stage = paused ? "paused" : "active";
      store.auditEvents.push(audit("manual_override", `${match.displayName} ${paused ? "paused" : "resumed"}.`, { matchId }));
    }
    await this.write(store);
    return store;
  }

  async markInstagramQualified(matchId: string): Promise<StoreShape> {
    const store = await this.read();
    const match = store.matches.find((candidate) => candidate.id === matchId);
    if (match) {
      match.igQualifiedAt = new Date().toISOString();
      match.stage = "ig_qualified";
      store.auditEvents.push(audit("stage_changed", `${match.displayName} marked IG qualified.`, { matchId }));
    }
    await this.write(store);
    return store;
  }

  private async recalculate(store: StoreShape, matchId: string): Promise<void> {
    const match = store.matches.find((candidate) => candidate.id === matchId);
    if (!match) return;
    const score = scoreLead(match, store.messages.filter((message) => message.matchId === matchId), store.settings);
    store.scores.push(score);
    match.currentScore = score.finalScore;
    match.stage = score.stage;
    match.lastActivityAt =
      store.messages
        .filter((message) => message.matchId === matchId)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .at(-1)?.timestamp ?? match.lastActivityAt;
    store.auditEvents.push(audit("score_updated", `${match.displayName} scored ${score.finalScore}.`, { matchId, stage: score.stage }));
  }
}

function latestByMatch<T extends { matchId: string; scoredAt?: string; createdAt?: string }>(items: T[], matchId: string): T | undefined {
  return items.filter((item) => item.matchId === matchId).at(-1);
}

function buildCounts(matches: Match[]): DashboardSnapshot["counts"] {
  const counts = {
    total: matches.length,
    new: 0,
    active: 0,
    slow: 0,
    stalled: 0,
    cold: 0,
    ig_offered: 0,
    ig_pending: 0,
    ig_qualified: 0,
    paused: 0
  };
  for (const match of matches) counts[match.stage] += 1;
  return counts;
}

function audit(eventType: AuditEvent["eventType"], detail: string, payload?: Record<string, unknown>): AuditEvent {
  return {
    id: uuid(),
    eventType,
    detail,
    payload,
    timestamp: new Date().toISOString()
  };
}

function migrateStore(store: StoreShape): StoreShape {
  return {
    ...store,
    settings: { ...defaultSettings, ...store.settings },
    styleProfile: {
      ...defaultStyleProfile,
      ...store.styleProfile,
      gabiProfile: {
        ...defaultStyleProfile.gabiProfile,
        ...store.styleProfile?.gabiProfile,
        answerBank: {
          ...defaultStyleProfile.gabiProfile.answerBank,
          ...store.styleProfile?.gabiProfile?.answerBank
        }
      }
    },
    matches: store.matches ?? [],
    messages: store.messages ?? [],
    scores: store.scores ?? [],
    actions: store.actions ?? [],
    auditEvents: store.auditEvents ?? []
  };
}
