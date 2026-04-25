/**
 * claudeReplyAgent.ts
 *
 * Generates replies in Gabi's voice using Claude (claude-sonnet-4-6).
 * Falls back to the template-based replyAgent if the API key is missing
 * or if the API call fails.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { LeadScore, Match, Message, StyleProfile } from "../types/domain";
import { canOfferInstagram } from "../scoring/rubric";
import { generateReply as templateFallback, type ReplyPlan } from "./replyAgent";

export type { ReplyPlan };

let _client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  _client = new Anthropic({ apiKey: key });
  return _client;
}

// ─── System prompt builder ──────────────────────────────────────────────────

function buildSystemPrompt(styleProfile: StyleProfile, igThreshold: number): string {
  const p = styleProfile.gabiProfile;

  return `You are writing messages on OkCupid AS Gabi. You are not an assistant helping Gabi — you ARE Gabi sending the message yourself. Every reply you produce will be sent directly, so write exactly as Gabi would type it.

## WHO GABI IS
- Name: ${p.displayName}
- Location: ${p.currentLocation}${p.hometown ? ` (originally from ${p.hometown})` : ""}
- Languages: ${p.languages.join(", ")}
- Work: ${p.work}
${p.age ? `- Age: ${p.age}` : ""}
- Personality: ${p.personality.join(", ")}
- Interests: ${p.interests.join(", ")}
- Favorite spots: ${p.favoriteSpots.join(", ")}
- Dating intent: ${p.datingIntent}
- Logistics: ${p.logistics.join(" ")}

## VOICE & TONE
${styleProfile.tone.map((t) => `- ${t}`).join("\n")}

## HARD RULES — NEVER BREAK THESE
${p.hardNoClaims.map((r: string) => `- ${r}`).join("\n")}
- Never exceed ${styleProfile.maxMessageCharacters} characters total.
- Never sound like an AI or use polished language. Sound like a real person texting.
- Never use these banned phrases: ${styleProfile.bannedPhrases.map((p) => `"${p}"`).join(", ")}
- If she writes in Hebrew → reply in Hebrew. If she writes in English → reply in English. Code-switch naturally.
- Keep messages SHORT. 1–3 lines max. Two short punchy lines beat one long polished one.
- No paragraph essays. No bullet points. No formal phrasing.
- Prefer lowercase and casual punctuation, like real texting.

## BOUNDARIES
${styleProfile.boundaries.map((b) => `- ${b}`).join("\n")}

## GABI'S STANDARD ANSWERS (use these when the topic comes up)
- About me: ${p.answerBank.aboutMe}
- Work: ${p.answerBank.work}
- Location: ${p.answerBank.location}
- Hobbies: ${p.answerBank.hobbies}
- Looking for: ${p.answerBank.lookingFor}
- Weekend: ${p.answerBank.weekend}
- Unknown topic: ${p.unknownAnswer}

## INSTAGRAM HANDLE
${styleProfile.igHandle}
Only offer Instagram if the conversation has clear momentum and real interest from her side (lead score ≥ ${igThreshold}). Don't push it early.

## EXAMPLES OF GABI'S REAL MESSAGES (study these for voice and cadence)
${styleProfile.writingSamples.map((s) => `"${s}"`).join("\n")}

## GOOD REPLY EXAMPLES (what to aim for)
${styleProfile.goodReplyExamples.map((s) => `"${s}"`).join("\n")}

## BAD REPLY EXAMPLES (never sound like these)
${styleProfile.badReplyExamples.map((s) => `"${s}"`).join("\n")}

## OUTPUT FORMAT
Respond with a single JSON object — nothing else, no markdown, no explanation:
{
  "actionType": "reply" | "ig_handoff" | "noop",
  "text": "the message text, or omit if noop",
  "reason": "one sentence explaining your choice"
}

If actionType is "noop", omit "text".
For "ig_handoff", the text should naturally weave in the Instagram handle: ${styleProfile.igHandle}
`;
}

// ─── Conversation formatter ──────────────────────────────────────────────────

function formatConversation(messages: Message[]): string {
  const sorted = messages
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-20); // last 20 messages for context window efficiency

  return sorted
    .map((m) => `${m.sender === "me" ? "GABI" : "HER"}: ${m.text}`)
    .join("\n");
}

// ─── Main async generator ────────────────────────────────────────────────────

export async function generateReplyWithClaude(
  match: Match,
  messages: Message[],
  score: LeadScore,
  styleProfile: StyleProfile,
  igThreshold: number
): Promise<ReplyPlan> {
  const client = getClient();

  // No API key → use template fallback
  if (!client) {
    return templateFallback(match, messages, score, styleProfile, igThreshold);
  }

  // Already offered IG → noop
  if (match.igOfferedAt) {
    return {
      actionType: "noop",
      reason: "Instagram was already offered; avoid repeating the pitch."
    };
  }

  const sorted = messages.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const lastMessage = sorted.at(-1);

  // Nothing to reply to
  if (!lastMessage || lastMessage.sender !== "match") {
    return {
      actionType: "noop",
      reason: "Last message is from Gabi or there are no messages; nothing to reply to."
    };
  }

  const conversationText = formatConversation(messages);
  const igReady = canOfferInstagram(score, igThreshold);

  const userPrompt = `## CONVERSATION SO FAR
${conversationText}

## CONTEXT
- Lead score: ${score.finalScore}/100
- Stage: ${score.stage}
- Score rationale: ${score.rationale.join(" ")}
- IG threshold: ${igThreshold} — IG ready: ${igReady ? "YES" : "NOT YET"}
- Match display name: ${match.displayName}

## TASK
Generate Gabi's next reply to HER's last message: "${lastMessage.text}"

${igReady ? "The lead has crossed the IG threshold — you MAY offer Instagram if it flows naturally, but don't force it." : "Do NOT offer Instagram yet — the conversation hasn't built enough momentum."}

Remember: output ONLY the JSON object described in your instructions.`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: buildSystemPrompt(styleProfile, igThreshold),
      messages: [{ role: "user", content: userPrompt }]
    });

    const raw = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("")
      .trim();

    // Strip markdown code fences if Claude wraps the JSON
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned) as { actionType: string; text?: string; reason: string };

    const actionType = parsed.actionType as ReplyPlan["actionType"];
    if (!["reply", "ig_handoff", "noop"].includes(actionType)) {
      throw new Error(`Unexpected actionType: ${actionType}`);
    }

    // Enforce character limit
    const text = parsed.text
      ? parsed.text.slice(0, styleProfile.maxMessageCharacters)
      : undefined;

    return { actionType, text, reason: parsed.reason ?? "Claude-generated reply." };
  } catch (error) {
    console.error("[claudeReplyAgent] Claude API error, falling back to templates:", error);
    return templateFallback(match, messages, score, styleProfile, igThreshold);
  }
}
