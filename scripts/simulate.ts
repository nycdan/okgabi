import { runSimulator } from "../src/simulator/runSimulator";

for (const result of runSimulator()) {
  console.log(`\n${result.scenario} (${result.match})`);
  console.log(`Score: ${result.score.finalScore} | Stage: ${result.score.stage}`);
  console.log(`Gates: ${JSON.stringify(result.score.requiredGates)}`);
  console.log(`Hard stops: ${result.score.hardStops.join("; ") || "none"}`);
  console.log(`Action: ${result.reply.actionType} | ${result.reply.reason}`);
  if (result.reply.text) console.log(`Reply: ${result.reply.text}`);
  if (result.guard) console.log(`Guard: ${result.guard.allowed ? "allowed" : "blocked"} | ${result.guard.reasons.join("; ") || "clear"}`);
}
