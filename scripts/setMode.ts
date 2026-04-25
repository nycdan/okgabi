import { JsonStore } from "../src/storage/jsonStore";
import type { AgentMode } from "../src/types/domain";

const mode = process.argv[2] as AgentMode | undefined;
if (!mode || !["paused", "review", "auto"].includes(mode)) {
  console.error("Usage: npm run mode -- paused|review|auto");
  process.exit(1);
}

const store = new JsonStore();
await store.updateSettings({ mode });
console.log(`Agent mode set to ${mode}`);

