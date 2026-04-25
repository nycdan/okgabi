import "dotenv/config";
import { OkCupidAdapter } from "../automation/okcupidAdapter";
import { guardReply } from "./policyGuard";
import { generateReplyWithClaude } from "../style/claudeReplyAgent";
import { JsonStore } from "../storage/jsonStore";

const store = new JsonStore();

export async function runAgentOnce() {
  const current = await store.read();
  if (current.settings.mode === "paused") {
    return { status: "paused", actions: [] };
  }

  const adapter = new OkCupidAdapter();
  const threads = await adapter.readThreads();
  for (const thread of threads) {
    await store.upsertMessages(thread.match, thread.messages);
  }

  const refreshed = await store.read();
  const actions = [];

  for (const match of refreshed.matches.filter((candidate) => !candidate.paused && !candidate.archived)) {
    const messages = refreshed.messages.filter((message) => message.matchId === match.id);
    const score = refreshed.scores.filter((candidate) => candidate.matchId === match.id).at(-1);
    if (!score) continue;

    const lastMessage = messages.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp)).at(-1);
    if (!lastMessage || lastMessage.sender !== "match") continue;

    const reply = await generateReplyWithClaude(match, messages, score, refreshed.styleProfile, refreshed.settings.igReadyThreshold);
    if (!reply.text || reply.actionType === "noop") {
      actions.push(await store.recordAction({
        matchId: match.id,
        actionType: "noop",
        status: "skipped",
        reason: reply.reason,
        scoreSnapshot: score
      }));
      continue;
    }

    const guard = guardReply(reply.text, messages, score, refreshed.styleProfile);
    if (!guard.allowed) {
      actions.push(await store.recordAction({
        matchId: match.id,
        actionType: reply.actionType,
        proposedReply: reply.text,
        status: "blocked",
        reason: guard.reasons.join(" "),
        scoreSnapshot: score
      }));
      continue;
    }

    if (refreshed.settings.mode === "review") {
      actions.push(await store.recordAction({
        matchId: match.id,
        actionType: reply.actionType,
        proposedReply: reply.text,
        status: "proposed",
        reason: reply.reason,
        scoreSnapshot: score
      }));
      continue;
    }

    await adapter.sendMessage(match.platformId, reply.text);
    actions.push(await store.recordAction({
      matchId: match.id,
      actionType: reply.actionType,
      proposedReply: reply.text,
      finalReply: reply.text,
      status: "sent",
      reason: reply.reason,
      scoreSnapshot: score
    }));
  }

  return { status: "ok", ingestedThreads: threads.length, actions };
}

export async function runAgentLoop() {
  while (true) {
    const state = await store.read();
    try {
      await runAgentOnce();
    } catch (error) {
      await store.recordAction({
        matchId: "system",
        actionType: "pause",
        status: "blocked",
        reason: error instanceof Error ? error.message : "Unknown automation error."
      });
    }
    await new Promise((resolve) => setTimeout(resolve, state.settings.pollIntervalMs));
  }
}

if (process.argv[1]?.endsWith("agentLoop.ts")) {
  const once = process.argv.includes("--once");
  if (once) {
    runAgentOnce()
      .then((result) => {
        console.log(JSON.stringify(result, null, 2));
      })
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  } else {
    runAgentLoop().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }
}
