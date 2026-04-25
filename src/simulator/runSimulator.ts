import { defaultSettings, defaultStyleProfile } from "../config/styleProfile";
import { guardReply } from "../agent/policyGuard";
import { scoreLead } from "../scoring/rubric";
import { generateReply } from "../style/replyAgent";
import { scenarios } from "./conversations";
import type { AgentSettings, Match, Message, StyleProfile } from "../types/domain";

export interface CustomSimulationInput {
  matchName: string;
  profileBio?: string;
  interests?: string[];
  threadText: string;
}

export function runSimulator() {
  return scenarios.map((scenario) => {
    const score = scoreLead(scenario.match, scenario.messages, defaultSettings);
    const reply = generateReply(scenario.match, scenario.messages, score, defaultStyleProfile, defaultSettings.igReadyThreshold);
    const guard = reply.text ? guardReply(reply.text, scenario.messages, score, defaultStyleProfile) : undefined;

    return {
      scenario: scenario.name,
      match: scenario.match.displayName,
      score,
      reply,
      guard
    };
  });
}

export function simulateCustomThread(
  input: CustomSimulationInput,
  settings: AgentSettings,
  styleProfile: StyleProfile
) {
  const now = new Date();
  const matchId = "reply-lab";
  const match: Match = {
    id: matchId,
    platformId: "manual-simulation",
    displayName: input.matchName || "Simulated Match",
    profile: {
      bio: input.profileBio,
      interests: input.interests?.filter(Boolean) ?? []
    },
    stage: "new",
    currentScore: 0,
    lastActivityAt: now.toISOString(),
    paused: false,
    archived: false
  };
  const messages = parseThread(input.threadText, matchId, now);
  const score = scoreLead(match, messages, settings, now);
  const reply = generateReply(match, messages, score, styleProfile, settings.igReadyThreshold);
  const guard = reply.text ? guardReply(reply.text, messages, score, styleProfile) : undefined;

  return {
    match,
    messages,
    score,
    reply,
    guard
  };
}

function parseThread(threadText: string, matchId: string, now: Date): Message[] {
  const lines = threadText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = lines.length
    ? lines.map(parseLine)
    : [{ sender: "match" as const, text: "היי מה קורה" }];

  return parsed.map((message, index) => ({
    id: `${matchId}-${index}`,
    matchId,
    sender: message.sender,
    text: message.text,
    timestamp: new Date(now.getTime() - (parsed.length - index) * 8 * 60_000).toISOString(),
    rawSource: "reply-lab"
  }));
}

function parseLine(line: string): Pick<Message, "sender" | "text"> {
  const normalized = line.replace(/^\[[^\]]+\]\s*/, "");
  const match = normalized.match(/^(me|you|אני|gabriel|gabi|גבריאל|גבי|her|she|match|girl|היא|בחורה)\s*[:\-]\s*(.+)$/i);
  if (!match) {
    return { sender: "match", text: normalized };
  }

  const speaker = match[1].toLowerCase();
  const text = match[2];
  const sender = ["me", "you", "אני", "gabriel", "gabi", "גבריאל", "גבי"].includes(speaker) ? "me" : "match";
  return { sender, text };
}
