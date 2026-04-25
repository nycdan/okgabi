import { useEffect, useMemo, useState } from "react";
import type { DashboardSnapshot, LeadScore, Match, MatchStage, Message } from "../types/domain";

interface ReplyLabResult {
  match: Match;
  messages: Message[];
  score: LeadScore;
  reply: {
    actionType: "reply" | "ig_handoff" | "noop";
    text?: string;
    reason: string;
  };
  guard?: {
    allowed: boolean;
    reasons: string[];
    risk: "low" | "medium" | "high";
  };
}

const stageLabels: Record<MatchStage | "total", string> = {
  total: "Total",
  new: "New",
  active: "Active",
  slow: "Slow",
  stalled: "Stalled",
  cold: "Cold",
  ig_offered: "IG Offered",
  ig_pending: "IG Pending",
  ig_qualified: "IG Qualified",
  paused: "Paused"
};

export function App() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>();
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [labLoading, setLabLoading] = useState(false);
  const [labName, setLabName] = useState("Maya");
  const [labInterests, setLabInterests] = useState("coffee, music");
  const [labThread, setLabThread] = useState(
    "me: היי מה קורה\nher: סבבה חחח בדיוק יצאתי מקפה עם חברה\nme: וואלה נשמע אש\nher: כן היה ממש כיף תאמת"
  );
  const [labResult, setLabResult] = useState<ReplyLabResult>();

  const selected = useMemo(
    () => snapshot?.matches.find((match) => match.id === selectedId) ?? snapshot?.matches[0],
    [selectedId, snapshot]
  );

  async function refresh() {
    const response = await fetch("/api/dashboard");
    const next = (await response.json()) as DashboardSnapshot;
    setSnapshot(next);
    setSelectedId((current) => current ?? next.matches[0]?.id);
  }

  async function post(url: string, body: unknown = {}) {
    setLoading(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      setSnapshot((await response.json()) as DashboardSnapshot);
    } finally {
      setLoading(false);
    }
  }

  async function runReplyLab() {
    setLabLoading(true);
    try {
      const response = await fetch("/api/simulator/reply-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchName: labName,
          interests: labInterests.split(",").map((interest) => interest.trim()).filter(Boolean),
          threadText: labThread
        })
      });
      setLabResult((await response.json()) as ReplyLabResult);
    } finally {
      setLabLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  if (!snapshot) return <main className="loading">Loading the lead room...</main>;

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">OkCupid Agent</p>
          <h1>Only escalate the matches with real momentum.</h1>
          <p className="lede">
            Fully local dashboard for lead scoring, transcript review, IG handoff status, and automation controls.
          </p>
        </div>
        <div className="controlCard">
          <span>Automation</span>
          <strong>{snapshot.settings.mode}</strong>
          <div className="buttonRow">
            <button disabled={loading} onClick={() => post("/api/settings", { mode: "paused" })}>Pause</button>
            <button disabled={loading} onClick={() => post("/api/settings", { mode: "review" })}>Review</button>
            <button disabled={loading} onClick={() => post("/api/settings", { mode: "auto" })}>Auto</button>
          </div>
          <small>Recommended IG threshold: {snapshot.outcomes.recommendedThreshold}</small>
          <button className="primary" disabled={loading} onClick={() => post("/api/agent/run-once")}>Run Agent Once</button>
        </div>
      </section>

      <section className="metrics">
        {(Object.keys(stageLabels) as Array<MatchStage | "total">).map((stage) => (
          <article key={stage} className="metric">
            <span>{stageLabels[stage]}</span>
            <strong>{snapshot.counts[stage]}</strong>
          </article>
        ))}
      </section>

      <section className="replyLab">
        <div className="labHeader">
          <div>
            <p className="eyebrow">Reply Lab</p>
            <h2>Simulate the tone before it goes live.</h2>
            <p>
              The lab replies to the latest `her:` line. Use `me:` for your previous messages and `her:` for hers.
              Unlabeled lines are treated as her messages.
            </p>
          </div>
          <button className="primary" disabled={labLoading} onClick={runReplyLab}>
            {labLoading ? "Simulating..." : "Simulate Reply"}
          </button>
        </div>

        <div className="labGrid">
          <div className="labInput">
            <label>
              Match name
              <input value={labName} onChange={(event) => setLabName(event.target.value)} />
            </label>
            <label>
              Interests
              <input value={labInterests} onChange={(event) => setLabInterests(event.target.value)} />
            </label>
            <label>
              Thread
              <textarea value={labThread} onChange={(event) => setLabThread(event.target.value)} />
            </label>
            <div className="labHint">
              Example: `her: What are you looking for?` will show how the agent would answer as you.
            </div>
          </div>

          <div className="labOutput">
            {labResult ? (
              <>
                <div className="labTopline">
                  <div>
                    <span>Score</span>
                    <strong>{labResult.score.finalScore}</strong>
                  </div>
                  <div>
                    <span>Action</span>
                    <strong>{labResult.reply.actionType}</strong>
                  </div>
                  <div>
                    <span>Guard</span>
                    <strong className={labResult.guard?.allowed ? "ok" : "blocked"}>
                      {labResult.guard?.allowed ? "allowed" : "blocked"}
                    </strong>
                  </div>
                </div>

                <div className="labReply">
                  <span>Suggested Reply</span>
                  <p>{labResult.reply.text || labResult.reply.reason}</p>
                </div>

                <div className="gateGrid">
                  {Object.entries(labResult.score.requiredGates).map(([gate, passed]) => (
                    <div key={gate} className={passed ? "gate passed" : "gate failed"}>
                      <span>{passed ? "Pass" : "Hold"}</span>
                      {gate}
                    </div>
                  ))}
                </div>

                <div className="rationale labRationale">
                  {labResult.score.rationale.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  {labResult.guard?.reasons.map((reason) => (
                    <p key={reason}>Guardrail: {reason}</p>
                  ))}
                </div>
              </>
            ) : (
              <div className="emptyLab">
                Paste a short exchange and run the simulation to see whether the reply sounds like Gabriel.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="workspace">
        <aside className="leadList">
          <div className="sectionTitle">Prioritized Leads</div>
          {snapshot.matches.map((match) => (
            <button
              key={match.id}
              className={`leadRow ${selected?.id === match.id ? "selected" : ""}`}
              onClick={() => setSelectedId(match.id)}
            >
              <span>
                <strong>{match.displayName}</strong>
                <small>{stageLabels[match.stage]} · {match.messages.length} msgs</small>
              </span>
              <b>{match.currentScore}</b>
            </button>
          ))}
        </aside>

        {selected && (
          <section className="detail">
            <div className="detailHeader">
              <div>
                <p className="eyebrow">{selected.stage.replaceAll("_", " ")}</p>
                <h2>{selected.displayName}</h2>
                <p>{selected.profile.bio || "No profile bio captured yet."}</p>
              </div>
              <div className="buttonRow">
                <button onClick={() => post(`/api/matches/${selected.id}/pause`, { paused: !selected.paused })}>
                  {selected.paused ? "Resume" : "Pause"}
                </button>
                <button onClick={() => post(`/api/matches/${selected.id}/ig-qualified`)}>Mark IG Qualified</button>
              </div>
            </div>

            <div className="scoreGrid">
              {selected.score &&
                Object.entries(selected.score.components).map(([name, value]) => (
                  <div className="scorePill" key={name}>
                    <span>{name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
            </div>

            {selected.score && (
              <div className="rationale">
                {selected.score.rationale.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            )}

            {selected.lastAction && (
              <div className="actionCard">
                <span>Last Agent Action</span>
                <strong>{selected.lastAction.status} · {selected.lastAction.actionType}</strong>
                <p>{selected.lastAction.finalReply || selected.lastAction.proposedReply || selected.lastAction.reason}</p>
              </div>
            )}

            <div className="transcript">
              {selected.messages.map((message) => (
                <p key={message.id} className={`bubble ${message.sender}`}>
                  <span>{message.sender === "me" ? "You" : selected.displayName}</span>
                  {message.text}
                </p>
              ))}
            </div>
          </section>
        )}

        <aside className="sideRail">
          <div className="sectionTitle">Outcome Tuning</div>
          <div className="profileCard">
            <span>Conversion</span>
            <p>Active to IG offer: {snapshot.outcomes.activeToIgOfferRate}%</p>
            <p>IG offer to qualified: {snapshot.outcomes.igOfferToQualifiedRate}%</p>
            <p>Cold or stalled: {snapshot.outcomes.coldRate}%</p>
          </div>
          <div className="profileCard">
            <span>Notes</span>
            {snapshot.outcomes.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
          <div className="sectionTitle">Style Profile</div>
          <div className="profileCard">
            <span>IG Handle</span>
            <strong>{snapshot.styleProfile.igHandle}</strong>
          </div>
          <div className="profileCard">
            <span>Tone</span>
            <p>{snapshot.styleProfile.tone.join(", ")}</p>
          </div>
          <div className="profileCard">
            <span>Guardrails</span>
            {snapshot.styleProfile.boundaries.slice(0, 4).map((boundary) => (
              <p key={boundary}>{boundary}</p>
            ))}
          </div>
          <div className="sectionTitle">Audit Trail</div>
          <div className="audit">
            {snapshot.auditEvents.slice(0, 8).map((event) => (
              <p key={event.id}>
                <span>{event.eventType}</span>
                {event.detail}
              </p>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
