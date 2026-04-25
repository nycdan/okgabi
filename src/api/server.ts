import "dotenv/config";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { runAgentOnce } from "../agent/agentLoop";
import { generateReplyWithClaude } from "../style/claudeReplyAgent";
import { runSimulator, simulateCustomThread } from "../simulator/runSimulator";
import { JsonStore } from "../storage/jsonStore";
import { scoreLead } from "../scoring/rubric";
import type { Match, Message } from "../types/domain";
import { v5 as uuidv5 } from "uuid";

const app = express();
const store = new JsonStore();
const port = Number(process.env.PORT ?? 4177);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/dashboard", async (_request, response) => {
  response.json(await store.snapshot());
});

app.get("/api/simulator", (_request, response) => {
  response.json(runSimulator());
});

app.post("/api/simulator/reply-lab", async (request, response) => {
  const schema = z.object({
    matchName: z.string().min(1).default("Simulated Match"),
    profileBio: z.string().optional(),
    interests: z.array(z.string()).optional(),
    threadText: z.string().min(1)
  });
  const storeState = await store.read();
  response.json(simulateCustomThread(schema.parse(request.body), storeState.settings, storeState.styleProfile));
});

// Claude-powered Reply Lab — generates a live Claude reply from a typed thread
app.post("/api/reply-lab/claude", async (request, response) => {
  const schema = z.object({
    matchName: z.string().min(1).default("Test Match"),
    threadText: z.string().min(1) // "me: ...\nher: ...\nme: ..."
  });
  try {
    const { matchName, threadText } = schema.parse(request.body);
    const storeState = await store.read();
    const NS = "3e9a9eac-4c6c-4db2-8f39-9d264f58e0b6";
    const matchId = uuidv5(matchName, NS);
    const now = new Date().toISOString();

    const match: Match = {
      id: matchId,
      platformId: matchName,
      displayName: matchName,
      profile: {},
      stage: "active",
      currentScore: 0,
      lastActivityAt: now,
      paused: false,
      archived: false
    };

    const lines = threadText.trim().split(/\r?\n/).filter(Boolean);
    const messages: Message[] = lines.map((line, index) => {
      const isMe = /^me\s*:/i.test(line);
      const text = line.replace(/^(me|her)\s*:\s*/i, "").trim();
      return {
        id: uuidv5(`${matchId}:${index}:${text}`, NS),
        matchId,
        sender: isMe ? "me" : "match",
        text,
        timestamp: new Date(Date.now() - (lines.length - index) * 60_000).toISOString()
      };
    });

    const score = scoreLead(match, messages, storeState.settings);
    const reply = await generateReplyWithClaude(match, messages, score, storeState.styleProfile, storeState.settings.igReadyThreshold);
    response.json({ reply, score, messages });
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.post("/api/settings", async (request, response) => {
  const schema = z.object({
    mode: z.enum(["paused", "auto", "review"]).optional(),
    slowAfterHours: z.number().positive().optional(),
    coldAfterHours: z.number().positive().optional(),
    igReadyThreshold: z.number().min(0).max(100).optional(),
    pollIntervalMs: z.number().min(10_000).optional()
  });
  await store.updateSettings(schema.parse(request.body));
  response.json(await store.snapshot());
});

app.post("/api/style-profile", async (request, response) => {
  const gabiProfileSchema = z.object({
    displayName: z.string().optional(),
    age: z.number().positive().optional(),
    currentLocation: z.string().optional(),
    hometown: z.string().optional(),
    languages: z.array(z.string()).optional(),
    work: z.string().optional(),
    education: z.string().optional(),
    shortBio: z.string().optional(),
    personality: z.array(z.string()).optional(),
    interests: z.array(z.string()).optional(),
    favoriteSpots: z.array(z.string()).optional(),
    datingIntent: z.string().optional(),
    logistics: z.array(z.string()).optional(),
    hardNoClaims: z.array(z.string()).optional(),
    answerBank: z
      .object({
        aboutMe: z.string().optional(),
        work: z.string().optional(),
        location: z.string().optional(),
        hobbies: z.string().optional(),
        lookingFor: z.string().optional(),
        weekend: z.string().optional()
      })
      .optional(),
    unknownAnswer: z.string().optional()
  });
  const schema = z.object({
    igHandle: z.string().min(1).optional(),
    tone: z.array(z.string()).optional(),
    maxMessageCharacters: z.number().min(40).max(600).optional(),
    gabiProfile: gabiProfileSchema.optional(),
    boundaries: z.array(z.string()).optional(),
    bannedPhrases: z.array(z.string()).optional(),
    preferredClosers: z.array(z.string()).optional(),
    writingSamples: z.array(z.string()).optional(),
    goodReplyExamples: z.array(z.string()).optional(),
    badReplyExamples: z.array(z.string()).optional()
  });
  await store.updateStyleProfile(schema.parse(request.body));
  response.json(await store.snapshot());
});

app.post("/api/matches/:matchId/pause", async (request, response) => {
  await store.setMatchPaused(request.params.matchId, Boolean(request.body.paused));
  response.json(await store.snapshot());
});

app.post("/api/matches/:matchId/ig-qualified", async (request, response) => {
  await store.markInstagramQualified(request.params.matchId);
  response.json(await store.snapshot());
});

app.post("/api/agent/run-once", async (_request, response) => {
  const result = await runAgentOnce();
  response.json(result);
});

app.listen(port, () => {
  console.log(`OkCupid agent API listening on http://127.0.0.1:${port}`);
});
