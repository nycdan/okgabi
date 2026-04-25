import cors from "cors";
import express from "express";
import { z } from "zod";
import { runAgentOnce } from "../agent/agentLoop";
import { runSimulator, simulateCustomThread } from "../simulator/runSimulator";
import { JsonStore } from "../storage/jsonStore";

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
