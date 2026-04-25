import type { LeadScore, Message, StyleProfile } from "../types/domain";

const BLOCKED_PATTERNS = [
  /if you'?re serious/i,
  /prove (it|you)/i,
  /you owe me/i,
  /send (money|cash|gift)/i,
  /come over now/i
];

const SENSITIVE_PATTERNS = [
  /trauma|abuse|assault|self[- ]?harm|suicide/i,
  /address|where do you live|exact location/i,
  /nudes?|explicit|sex/i
];

export interface GuardResult {
  allowed: boolean;
  reasons: string[];
  risk: "low" | "medium" | "high";
}

export function guardReply(reply: string, context: Message[], score: LeadScore, styleProfile: StyleProfile): GuardResult {
  const reasons: string[] = [];
  const lowerReply = reply.toLowerCase();
  const recentText = context.slice(-6).map((message) => message.text).join("\n");

  for (const phrase of styleProfile.bannedPhrases) {
    if (lowerReply.includes(phrase.toLowerCase())) {
      reasons.push(`Banned phrase detected: "${phrase}".`);
    }
  }

  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(reply))) {
    reasons.push("Reply uses pressure, coercion, or unsafe language.");
  }

  if (score.hardStops.length > 0) {
    reasons.push(`Lead score has hard stops: ${score.hardStops.join(" ")}`);
  }

  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(`${reply}\n${recentText}`))) {
    reasons.push("Sensitive context requires manual takeover.");
  }

  if (reply.length > styleProfile.maxMessageCharacters) {
    reasons.push(`Reply exceeds ${styleProfile.maxMessageCharacters} characters.`);
  }

  const risk = reasons.length === 0 ? "low" : reasons.length === 1 ? "medium" : "high";
  return {
    allowed: reasons.length === 0,
    reasons,
    risk
  };
}
