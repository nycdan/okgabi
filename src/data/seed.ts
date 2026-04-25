import { defaultSettings, defaultStyleProfile } from "../config/styleProfile";
import { scoreLead } from "../scoring/rubric";
import { scenarios } from "../simulator/conversations";
import type { StoreShape } from "../types/domain";

export function createSeedStore(): StoreShape {
  const matches = scenarios.map((scenario) => scenario.match);
  const messages = scenarios.flatMap((scenario) => scenario.messages);
  const scores = matches.map((match) =>
    scoreLead(match, messages.filter((message) => message.matchId === match.id), defaultSettings)
  );

  return {
    settings: defaultSettings,
    styleProfile: defaultStyleProfile,
    matches: matches.map((match) => {
      const score = scores.find((candidate) => candidate.matchId === match.id);
      return {
        ...match,
        stage: score?.stage ?? match.stage,
        currentScore: score?.finalScore ?? 0
      };
    }),
    messages,
    scores,
    actions: [],
    auditEvents: [
      {
        id: "seed-boot",
        eventType: "manual_override",
        detail: "Seed data loaded for local dashboard and simulator.",
        timestamp: new Date().toISOString()
      }
    ]
  };
}
