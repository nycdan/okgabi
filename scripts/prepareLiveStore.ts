import { randomUUID } from "node:crypto";
import { JsonStore } from "../src/storage/jsonStore";

const store = new JsonStore();
const current = await store.read();

await store.write({
  settings: {
    ...current.settings,
    mode: "review"
  },
  styleProfile: current.styleProfile,
  matches: [],
  messages: [],
  scores: [],
  actions: [],
  auditEvents: [
    {
      id: randomUUID(),
      eventType: "manual_override",
      detail: "Prepared live store: cleared demo matches and set mode to review.",
      timestamp: new Date().toISOString()
    }
  ]
});

console.log("Prepared live store. Demo matches cleared and mode set to review.");

