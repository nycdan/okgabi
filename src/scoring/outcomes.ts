import type { StoreShape } from "../types/domain";

export interface OutcomeMetrics {
  totalMatches: number;
  activeConversations: number;
  igOffered: number;
  igQualified: number;
  activeToIgOfferRate: number;
  igOfferToQualifiedRate: number;
  coldRate: number;
  recommendedThreshold: number;
  notes: string[];
}

export function calculateOutcomeMetrics(store: StoreShape): OutcomeMetrics {
  const totalMatches = store.matches.length;
  const activeConversations = store.matches.filter((match) =>
    ["active", "slow", "ig_offered", "ig_pending", "ig_qualified"].includes(match.stage)
  ).length;
  const igOffered = store.matches.filter((match) => Boolean(match.igOfferedAt) || match.stage === "ig_offered" || match.stage === "ig_pending").length;
  const igQualified = store.matches.filter((match) => Boolean(match.igQualifiedAt) || match.stage === "ig_qualified").length;
  const cold = store.matches.filter((match) => match.stage === "cold" || match.stage === "stalled").length;
  const recentScores = store.scores.slice(-50);
  const qualifiedScores = recentScores.filter((score) => {
    const match = store.matches.find((candidate) => candidate.id === score.matchId);
    return Boolean(match?.igQualifiedAt);
  });
  const recommendedThreshold = qualifiedScores.length
    ? Math.max(65, Math.min(85, Math.round(average(qualifiedScores.map((score) => score.finalScore)) - 5)))
    : store.settings.igReadyThreshold;

  return {
    totalMatches,
    activeConversations,
    igOffered,
    igQualified,
    activeToIgOfferRate: rate(igOffered, activeConversations),
    igOfferToQualifiedRate: rate(igQualified, igOffered),
    coldRate: rate(cold, totalMatches),
    recommendedThreshold,
    notes: buildNotes(store.settings.igReadyThreshold, recommendedThreshold, igOffered, igQualified, cold, totalMatches)
  };
}

function buildNotes(currentThreshold: number, recommendedThreshold: number, igOffered: number, igQualified: number, cold: number, total: number): string[] {
  const notes = [];
  if (igOffered >= 5 && igQualified / igOffered < 0.25) {
    notes.push("IG handoffs are under-converting; raise the threshold or require a stronger intent signal.");
  }
  if (total >= 5 && cold / total > 0.45) {
    notes.push("Cold/stalled rate is high; archive low-reciprocity matches sooner and avoid extra revive prompts.");
  }
  if (recommendedThreshold !== currentThreshold) {
    notes.push(`Outcome data suggests trying an IG threshold near ${recommendedThreshold}.`);
  }
  if (notes.length === 0) {
    notes.push("Keep the current threshold until more IG-qualified outcomes are recorded.");
  }
  return notes;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}
