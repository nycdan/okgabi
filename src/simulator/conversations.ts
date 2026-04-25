import type { Match, Message } from "../types/domain";

const now = Date.now();

export interface Scenario {
  name: string;
  match: Match;
  messages: Message[];
}

export const scenarios: Scenario[] = [
  {
    name: "High-intent shared humor",
    match: createMatch("ava", "Ava", ["music", "coffee"]),
    messages: createMessages("ava", [
      ["match", "your profile has suspiciously good coffee opinions"],
      ["me", "I take this allegation seriously. what's your order?"],
      ["match", "cortado if the place is good, iced latte if I don't trust them haha"],
      ["me", "ok that's actually a very calibrated answer"],
      ["match", "what can I say, I contain multitudes"],
      ["me", "this is going in the official lore"],
      ["match", "do you have instagram? I need to verify this lore"]
    ])
  },
  {
    name: "Warm but not ready",
    match: createMatch("maya", "Maya", ["travel", "food"]),
    messages: createMessages("maya", [
      ["match", "hey :)"],
      ["me", "hey, strongest travel opinion?"],
      ["match", "people overplan way too much"],
      ["me", "dangerous answer. are you chaos itinerary then?"],
      ["match", "a little chaos is healthy lol"]
    ])
  },
  {
    name: "Low-effort slow replies",
    match: createMatch("lena", "Lena", ["fitness"], 96),
    messages: createMessages("lena", [
      ["match", "hi"],
      ["me", "hey, what's been the highlight of your week?"],
      ["match", "work"],
      ["me", "fair. good work or survival work?"],
      ["match", "survival"],
      ["me", "respect. what's the recovery plan?"],
      ["match", "idk"]
    ])
  },
  {
    name: "Hard stop scam signal",
    match: createMatch("nora", "Nora", ["art"]),
    messages: createMessages("nora", [
      ["match", "hey handsome"],
      ["me", "hey, what are you making these days?"],
      ["match", "add my telegram and verify your account with this link"]
    ])
  }
];

function createMatch(id: string, displayName: string, interests: string[], hoursAgo = 1): Match {
  return {
    id,
    platformId: `okc_${id}`,
    displayName,
    profile: {
      age: 29,
      location: "New York",
      bio: "Seeded simulator match",
      interests
    },
    stage: "new",
    currentScore: 0,
    lastActivityAt: new Date(now - hoursAgo * 3_600_000).toISOString(),
    paused: false,
    archived: false
  };
}

function createMessages(matchId: string, rows: Array<["match" | "me", string]>): Message[] {
  return rows.map(([sender, text], index) => ({
    id: `${matchId}-${index}`,
    matchId,
    sender,
    text,
    timestamp: new Date(now - (rows.length - index) * 18 * 60_000).toISOString()
  }));
}
