import { useEffect, useMemo, useState } from "react";
import type { DashboardSnapshot, GabiProfile, LeadScore, Match, MatchStage, Message } from "../types/domain";

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

type GabiProfileForm = Omit<GabiProfile, "age" | "languages" | "personality" | "interests" | "favoriteSpots" | "logistics" | "hardNoClaims"> & {
  age: string;
  languages: string;
  personality: string;
  interests: string;
  favoriteSpots: string;
  logistics: string;
  hardNoClaims: string;
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
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSavedAt, setProfileSavedAt] = useState<string>();
  const [profileForm, setProfileForm] = useState<GabiProfileForm>();

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

  async function saveGabiProfile() {
    if (!profileForm) return;
    setProfileSaving(true);
    try {
      const payload = {
        gabiProfile: {
          ...profileForm,
          age: profileForm.age ? Number(profileForm.age) : undefined,
          languages: textToList(profileForm.languages),
          personality: textToList(profileForm.personality),
          interests: textToList(profileForm.interests),
          favoriteSpots: textToList(profileForm.favoriteSpots),
          logistics: textToList(profileForm.logistics),
          hardNoClaims: textToList(profileForm.hardNoClaims)
        }
      };
      const response = await fetch("/api/style-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const next = (await response.json()) as DashboardSnapshot;
      setSnapshot(next);
      setProfileForm(toProfileForm(next.styleProfile.gabiProfile));
      setProfileSavedAt(new Date().toLocaleTimeString());
    } finally {
      setProfileSaving(false);
    }
  }

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (snapshot && !profileForm) {
      setProfileForm(toProfileForm(snapshot.styleProfile.gabiProfile));
    }
  }, [profileForm, snapshot]);

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

      {profileForm && (
        <section className="profileEditor">
          <div className="labHeader">
            <div>
              <p className="eyebrow">Gabi Profile Editor</p>
              <h2>Edit what the agent knows about you.</h2>
              <p>These values feed answers like “what do you do?”, “where do you live?”, and “tell me about yourself?”.</p>
            </div>
            <div className="buttonStack">
              {profileSavedAt && <small>Saved at {profileSavedAt}</small>}
              <button className="primary" disabled={profileSaving} onClick={saveGabiProfile}>
                {profileSaving ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </div>

          <div className="profileEditorGrid">
            <div className="profileEditorColumn">
              <label>
                Display name
                <input value={profileForm.displayName} onChange={(event) => updateProfile("displayName", event.target.value)} />
              </label>
              <label>
                Age
                <input value={profileForm.age} onChange={(event) => updateProfile("age", event.target.value)} />
              </label>
              <label>
                Current location
                <input value={profileForm.currentLocation} onChange={(event) => updateProfile("currentLocation", event.target.value)} />
              </label>
              <label>
                Hometown
                <input value={profileForm.hometown ?? ""} onChange={(event) => updateProfile("hometown", event.target.value)} />
              </label>
              <label>
                Languages
                <input value={profileForm.languages} onChange={(event) => updateProfile("languages", event.target.value)} />
              </label>
              <label>
                Work
                <textarea className="shortTextarea" value={profileForm.work} onChange={(event) => updateProfile("work", event.target.value)} />
              </label>
              <label>
                Short bio
                <textarea className="shortTextarea" value={profileForm.shortBio} onChange={(event) => updateProfile("shortBio", event.target.value)} />
              </label>
            </div>

            <div className="profileEditorColumn">
              <label>
                Personality
                <textarea className="shortTextarea" value={profileForm.personality} onChange={(event) => updateProfile("personality", event.target.value)} />
              </label>
              <label>
                Interests
                <textarea className="shortTextarea" value={profileForm.interests} onChange={(event) => updateProfile("interests", event.target.value)} />
              </label>
              <label>
                Favorite spots
                <textarea className="shortTextarea" value={profileForm.favoriteSpots} onChange={(event) => updateProfile("favoriteSpots", event.target.value)} />
              </label>
              <label>
                Dating intent
                <textarea className="shortTextarea" value={profileForm.datingIntent} onChange={(event) => updateProfile("datingIntent", event.target.value)} />
              </label>
              <label>
                Logistics
                <textarea className="shortTextarea" value={profileForm.logistics} onChange={(event) => updateProfile("logistics", event.target.value)} />
              </label>
              <label>
                Never invent / hard no claims
                <textarea className="shortTextarea" value={profileForm.hardNoClaims} onChange={(event) => updateProfile("hardNoClaims", event.target.value)} />
              </label>
            </div>

            <div className="profileEditorColumn answerBankColumn">
              <label>
                Answer: about me
                <textarea value={profileForm.answerBank.aboutMe} onChange={(event) => updateAnswer("aboutMe", event.target.value)} />
              </label>
              <label>
                Answer: work
                <textarea value={profileForm.answerBank.work} onChange={(event) => updateAnswer("work", event.target.value)} />
              </label>
              <label>
                Answer: location
                <textarea value={profileForm.answerBank.location} onChange={(event) => updateAnswer("location", event.target.value)} />
              </label>
              <label>
                Answer: hobbies
                <textarea value={profileForm.answerBank.hobbies} onChange={(event) => updateAnswer("hobbies", event.target.value)} />
              </label>
              <label>
                Answer: looking for
                <textarea value={profileForm.answerBank.lookingFor} onChange={(event) => updateAnswer("lookingFor", event.target.value)} />
              </label>
              <label>
                Answer: weekend
                <textarea value={profileForm.answerBank.weekend} onChange={(event) => updateAnswer("weekend", event.target.value)} />
              </label>
              <label>
                Unknown answer fallback
                <textarea value={profileForm.unknownAnswer} onChange={(event) => updateProfile("unknownAnswer", event.target.value)} />
              </label>
            </div>
          </div>
        </section>
      )}

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
          <div className="sectionTitle">Gabi Profile</div>
          <div className="profileCard">
            <span>About</span>
            <strong>{snapshot.styleProfile.gabiProfile.displayName}</strong>
            <p>{snapshot.styleProfile.gabiProfile.shortBio}</p>
          </div>
          <div className="profileCard">
            <span>Work</span>
            <p>{snapshot.styleProfile.gabiProfile.work}</p>
          </div>
          <div className="profileCard">
            <span>Interests</span>
            <p>{snapshot.styleProfile.gabiProfile.interests.slice(0, 8).join(", ")}</p>
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

  function updateProfile<K extends keyof GabiProfileForm>(key: K, value: GabiProfileForm[K]) {
    setProfileForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateAnswer<K extends keyof GabiProfile["answerBank"]>(key: K, value: GabiProfile["answerBank"][K]) {
    setProfileForm((current) =>
      current
        ? {
            ...current,
            answerBank: {
              ...current.answerBank,
              [key]: value
            }
          }
        : current
    );
  }
}

function toProfileForm(profile: GabiProfile): GabiProfileForm {
  return {
    ...profile,
    age: profile.age?.toString() ?? "",
    languages: profile.languages.join(", "),
    personality: profile.personality.join(", "),
    interests: profile.interests.join(", "),
    favoriteSpots: profile.favoriteSpots.join(", "),
    logistics: profile.logistics.join("\n"),
    hardNoClaims: profile.hardNoClaims.join("\n")
  };
}

function textToList(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}
