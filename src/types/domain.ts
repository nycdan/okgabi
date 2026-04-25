export type Sender = "me" | "match";

export type MatchStage =
  | "new"
  | "active"
  | "slow"
  | "stalled"
  | "cold"
  | "ig_offered"
  | "ig_pending"
  | "ig_qualified"
  | "paused";

export type AgentMode = "paused" | "auto" | "review";

export interface Message {
  id: string;
  matchId: string;
  sender: Sender;
  text: string;
  timestamp: string;
  rawSource?: string;
  annotations?: Record<string, unknown>;
}

export interface MatchProfile {
  age?: number;
  location?: string;
  bio?: string;
  interests?: string[];
}

export interface Match {
  id: string;
  platformId: string;
  displayName: string;
  profile: MatchProfile;
  stage: MatchStage;
  currentScore: number;
  lastActivityAt: string;
  paused: boolean;
  archived: boolean;
  igOfferedAt?: string;
  igQualifiedAt?: string;
}

export interface ScoreComponents {
  reciprocity: number;
  enthusiasm: number;
  momentum: number;
  specificConnection: number;
  intentSignal: number;
  safetyTrust: number;
}

export interface LeadScore {
  matchId: string;
  components: ScoreComponents;
  penalties: string[];
  hardStops: string[];
  requiredGates: Record<string, boolean>;
  finalScore: number;
  stage: MatchStage;
  rationale: string[];
  scoredAt: string;
}

export interface AgentAction {
  id: string;
  matchId: string;
  actionType: "reply" | "ig_handoff" | "pause" | "archive" | "noop";
  proposedReply?: string;
  finalReply?: string;
  status: "proposed" | "sent" | "blocked" | "skipped";
  reason: string;
  scoreSnapshot?: LeadScore;
  createdAt: string;
}

export interface StyleProfile {
  igHandle: string;
  tone: string[];
  maxMessageCharacters: number;
  gabiProfile: GabiProfile;
  boundaries: string[];
  bannedPhrases: string[];
  preferredClosers: string[];
  writingSamples: string[];
  goodReplyExamples: string[];
  badReplyExamples: string[];
}

export interface GabiProfile {
  displayName: string;
  age?: number;
  currentLocation: string;
  hometown?: string;
  languages: string[];
  work: string;
  education?: string;
  shortBio: string;
  personality: string[];
  interests: string[];
  favoriteSpots: string[];
  datingIntent: string;
  logistics: string[];
  hardNoClaims: string[];
  answerBank: {
    aboutMe: string;
    work: string;
    location: string;
    hobbies: string;
    lookingFor: string;
    weekend: string;
  };
  unknownAnswer: string;
}

export interface AuditEvent {
  id: string;
  matchId?: string;
  eventType:
    | "message_ingested"
    | "score_updated"
    | "reply_generated"
    | "message_sent"
    | "guardrail_blocked"
    | "stage_changed"
    | "manual_override"
    | "automation_error";
  detail: string;
  payload?: Record<string, unknown>;
  timestamp: string;
}

export interface AgentSettings {
  mode: AgentMode;
  slowAfterHours: number;
  coldAfterHours: number;
  igReadyThreshold: number;
  pollIntervalMs: number;
}

export interface StoreShape {
  settings: AgentSettings;
  styleProfile: StyleProfile;
  matches: Match[];
  messages: Message[];
  scores: LeadScore[];
  actions: AgentAction[];
  auditEvents: AuditEvent[];
}

export interface DashboardSnapshot {
  settings: AgentSettings;
  styleProfile: StyleProfile;
  matches: Array<Match & { score?: LeadScore; messages: Message[]; lastAction?: AgentAction }>;
  counts: Record<MatchStage | "total", number>;
  outcomes: {
    totalMatches: number;
    activeConversations: number;
    igOffered: number;
    igQualified: number;
    activeToIgOfferRate: number;
    igOfferToQualifiedRate: number;
    coldRate: number;
    recommendedThreshold: number;
    notes: string[];
  };
  auditEvents: AuditEvent[];
}
