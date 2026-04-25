import type {
  AgentSettings,
  LeadScore,
  Match,
  MatchStage,
  Message,
  ScoreComponents
} from "../types/domain";

const QUESTION_WORDS = ["what", "why", "how", "where", "when", "who", "which"];
const POSITIVE_WORDS = ["haha", "lol", "love", "cute", "fun", "yes", "definitely", "totally", "actually"];
const FLIRT_WORDS = ["handsome", "cute", "hot", "date", "drink", "coffee", "meet", "come", "instagram", "ig"];
const RED_FLAGS = ["cashapp", "telegram", "crypto", "verify your account", "verification link", "gift card", "send money"];
const DISCOMFORT = ["stop", "no thanks", "not interested", "uncomfortable", "creepy", "leave me alone"];
const SENSITIVE = ["trauma", "abuse", "suicide", "self harm", "assault"];

export function scoreLead(match: Match, messages: Message[], settings: AgentSettings, now = new Date()): LeadScore {
  const sorted = messages.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const inbound = sorted.filter((message) => message.sender === "match");
  const outbound = sorted.filter((message) => message.sender === "me");
  const recentInbound = inbound.slice(-5);
  const allText = sorted.map((message) => message.text.toLowerCase()).join(" ");
  const lastInbound = inbound.at(-1);
  const lastOutbound = outbound.at(-1);
  const mutualVolleys = Math.min(inbound.length, outbound.length);
  const explicitlyAskedOffApp = recentInbound.some((message) => hasAny(message.text, ["instagram", "ig", "social", "number", "text me"]));
  const substantiveRecent = recentInbound.some((message) => isSubstantive(message.text));
  const interestSignal = inbound.some((message) => hasInterestSignal(message.text));
  const hardStops = detectHardStops(allText);
  const components = calculateComponents(sorted, match, now);
  const penalties = calculatePenalties(sorted, now, settings);

  const requiredGates = {
    mutualVolleys: mutualVolleys >= 4 || explicitlyAskedOffApp,
    substantiveRecent,
    interestSignal,
    noHardStops: hardStops.length === 0
  };

  const rawScore = Object.values(components).reduce((sum, score) => sum + score, 0);
  const penaltyTotal = penalties.reduce((sum, penalty) => sum + penalty.value, 0);
  const finalScore = clamp(rawScore - penaltyTotal, 0, 100);
  const stage = deriveStage(match, finalScore, requiredGates, hardStops, sorted, settings, now);

  return {
    matchId: match.id,
    components,
    penalties: penalties.map((penalty) => penalty.reason),
    hardStops,
    requiredGates,
    finalScore,
    stage,
    rationale: buildRationale(finalScore, components, penalties.map((penalty) => penalty.reason), requiredGates, lastInbound, lastOutbound),
    scoredAt: now.toISOString()
  };
}

export function canOfferInstagram(score: LeadScore, threshold: number): boolean {
  return (
    score.finalScore >= threshold &&
    score.hardStops.length === 0 &&
    Object.values(score.requiredGates).every(Boolean)
  );
}

function calculateComponents(messages: Message[], match: Match, now: Date): ScoreComponents {
  const inbound = messages.filter((message) => message.sender === "match");
  const recentInbound = inbound.slice(-5);
  const outbound = messages.filter((message) => message.sender === "me");
  const questionCount = inbound.filter((message) => isQuestion(message.text)).length;
  const topicAdds = inbound.filter((message) => message.text.split(/\s+/).length >= 8).length;
  const positiveCount = inbound.filter((message) => hasAny(message.text, POSITIVE_WORDS)).length;
  const flirtCount = inbound.filter((message) => hasAny(message.text, FLIRT_WORDS)).length;
  const profileConnection = match.profile.interests?.some((interest) =>
    messages.some((message) => message.text.toLowerCase().includes(interest.toLowerCase()))
  );
  const lastInboundAt = inbound.at(-1)?.timestamp ?? match.lastActivityAt;
  const hoursSinceInbound = hoursBetween(lastInboundAt, now);

  return {
    reciprocity: clamp(questionCount * 7 + topicAdds * 3, 0, 25),
    enthusiasm: clamp(positiveCount * 5 + averageInboundLength(recentInbound) / 10, 0, 20),
    momentum: clamp(15 - Math.max(0, hoursSinceInbound - 24) / 8, 0, 15),
    specificConnection: clamp((profileConnection ? 8 : 0) + sharedThreadSignals(messages) * 4, 0, 15),
    intentSignal: clamp(flirtCount * 6 + (inbound.some((message) => hasAny(message.text, ["meet", "drink", "coffee", "ig", "instagram"])) ? 9 : 0), 0, 15),
    safetyTrust: clamp(10 - detectHardStops(messages.map((message) => message.text.toLowerCase()).join(" ")).length * 4, 0, 10)
  };
}

function calculatePenalties(messages: Message[], now: Date, settings: AgentSettings): Array<{ reason: string; value: number }> {
  const inbound = messages.filter((message) => message.sender === "match");
  const outbound = messages.filter((message) => message.sender === "me");
  const penalties: Array<{ reason: string; value: number }> = [];
  const recentInbound = inbound.slice(-4);
  const lastInboundAt = inbound.at(-1)?.timestamp;

  if (recentInbound.length >= 3 && recentInbound.filter((message) => message.text.trim().split(/\s+/).length <= 2).length >= 2) {
    penalties.push({ reason: "Repeated one-word or very short replies.", value: 10 });
  }

  if (outbound.filter((message) => isQuestion(message.text)).length >= 3 && inbound.filter((message) => isQuestion(message.text)).length === 0) {
    penalties.push({ reason: "You are carrying the questions.", value: 10 });
  }

  if (lastInboundAt && hoursBetween(lastInboundAt, now) >= settings.slowAfterHours && averageInboundLength(recentInbound) < 25) {
    penalties.push({ reason: "Slow replies plus low substance.", value: 15 });
  }

  if (messages.some((message) => hasAny(message.text, RED_FLAGS))) {
    penalties.push({ reason: "Evasive or scam-like behavior detected.", value: 25 });
  }

  return penalties;
}

function deriveStage(
  match: Match,
  finalScore: number,
  gates: Record<string, boolean>,
  hardStops: string[],
  messages: Message[],
  settings: AgentSettings,
  now: Date
): MatchStage {
  if (match.paused || hardStops.length > 0) return "paused";
  if (match.igQualifiedAt) return "ig_qualified";
  if (match.igOfferedAt) return "ig_pending";
  if (finalScore >= settings.igReadyThreshold && Object.values(gates).every(Boolean)) return "ig_offered";

  const lastActivity = messages.at(-1)?.timestamp ?? match.lastActivityAt;
  const staleHours = hoursBetween(lastActivity, now);
  if (staleHours >= settings.coldAfterHours) return "cold";
  if (staleHours >= settings.slowAfterHours) return "slow";
  if (messages.length === 0) return "new";
  if (finalScore < 40 && messages.length > 6) return "stalled";
  return "active";
}

function detectHardStops(text: string): string[] {
  const hardStops: string[] = [];
  if (hasAny(text, DISCOMFORT)) hardStops.push("Rejection, discomfort, or a clear boundary appeared.");
  if (hasAny(text, RED_FLAGS)) hardStops.push("Possible scam, verification, money, or external-link request.");
  if (hasAny(text, SENSITIVE)) hardStops.push("Sensitive topic requires human judgment.");
  if (/(fuck off|go away|creep|asshole)/i.test(text)) hardStops.push("Hostile tone requires manual review.");
  return hardStops;
}

function buildRationale(
  finalScore: number,
  components: ScoreComponents,
  penalties: string[],
  gates: Record<string, boolean>,
  lastInbound?: Message,
  lastOutbound?: Message
): string[] {
  const strongest = Object.entries(components).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const missingGates = Object.entries(gates).filter(([, passed]) => !passed).map(([gate]) => gate);
  return [
    `Lead score is ${finalScore}. Strongest signals: ${strongest.map(([name, score]) => `${name} ${score}`).join(", ")}.`,
    missingGates.length ? `Missing required gates: ${missingGates.join(", ")}.` : "All required IG handoff gates are currently satisfied.",
    penalties.length ? `Penalties: ${penalties.join(" ")}` : "No scoring penalties applied.",
    lastInbound ? `Latest inbound: "${truncate(lastInbound.text, 80)}"` : "No inbound message yet.",
    lastOutbound ? `Latest outbound: "${truncate(lastOutbound.text, 80)}"` : "No outbound message yet."
  ];
}

function hasInterestSignal(text: string): boolean {
  return isQuestion(text) || hasAny(text, POSITIVE_WORDS) || hasAny(text, FLIRT_WORDS);
}

function sharedThreadSignals(messages: Message[]): number {
  const joined = messages.map((message) => message.text.toLowerCase()).join(" ");
  return ["same", "also", "me too", "inside joke", "remember", "story", "lore"].filter((signal) => joined.includes(signal)).length;
}

function isQuestion(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return normalized.includes("?") || QUESTION_WORDS.some((word) => normalized.startsWith(`${word} `));
}

function isSubstantive(text: string): boolean {
  return text.trim().split(/\s+/).length >= 5 || isQuestion(text);
}

function averageInboundLength(messages: Message[]): number {
  if (!messages.length) return 0;
  return messages.reduce((sum, message) => sum + message.text.length, 0) / messages.length;
}

function hasAny(text: string, words: string[]): boolean {
  const normalized = text.toLowerCase();
  return words.some((word) => normalized.includes(word));
}

function hoursBetween(isoDate: string, now: Date): number {
  return Math.max(0, (now.getTime() - new Date(isoDate).getTime()) / 3_600_000);
}

function truncate(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function clamp(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)));
}
