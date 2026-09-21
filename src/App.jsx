import {
  ArrowRight,
  BookOpenCheck,
  BriefcaseBusiness,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  GraduationCap,
  KeyRound,
  LoaderCircle,
  LogOut,
  Mail,
  Save,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiEnabled, postJSON, setApiBase } from "./api.js";
import { STORAGE_KEYS, clearSessionStorage, loadJson, saveJson } from "./storage.js";
import { chooseLocalAssignment, makeParticipantId, nowUtc, sessionById, sha256Hex } from "./utils.js";

const DEFAULT_ACCESS_CODE_HASH = "aa6d00688d8e7027c80454dade33a9570b44ea07987d961d6b1af3ac4780c1b0";
const ACCESS_CODE_HASH = String(import.meta.env.VITE_ACCESS_CODE_HASH || DEFAULT_ACCESS_CODE_HASH).trim().toLowerCase();
const ROUTES = { access: "access", welcome: "welcome", review: "review", complete: "complete" };

function routeFromHash() {
  const route = window.location.hash.replace(/^#\/?/, "");
  return Object.values(ROUTES).includes(route) ? route : ROUTES.access;
}

function go(route) {
  window.location.hash = `/${route}`;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeRating(row) {
  if (!row) return row;
  let scores = row.scores;
  if (!scores && row.scores_json) {
    try {
      scores = JSON.parse(row.scores_json);
    } catch {
      scores = {};
    }
  }
  return { ...row, scores: scores || {} };
}

async function verifyLocalAccessCode(code) {
  if (!String(code || "").trim()) throw new Error("Please enter the access code.");
  if ((await sha256Hex(String(code).trim())) !== ACCESS_CODE_HASH) throw new Error("Invalid access code.");
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash);
  const [study, setStudy] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [runtimeLoaded, setRuntimeLoaded] = useState(false);
  const [accounts, setAccounts] = useState(() => loadJson(STORAGE_KEYS.accounts, {}));
  const [profile, setProfile] = useState(() => loadJson(STORAGE_KEYS.profile, null));
  const [ratings, setRatings] = useState(() => loadJson(STORAGE_KEYS.ratings, []).map(normalizeRating));
  const [assignment, setAssignment] = useState(() => loadJson(STORAGE_KEYS.assignment, null));
  const [nextStatus, setNextStatus] = useState("idle");
  const nextRequestRef = useRef(false);
  const deployedMode = typeof window !== "undefined" && window.location.hostname.endsWith("github.io");

  useEffect(() => {
    document.title = "CTRS Expert Review";
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/runtime-config.json`, { cache: "no-store" }).then((response) => (response.ok ? response.json() : null)).catch(() => null),
      fetch(`${import.meta.env.BASE_URL}data/study-data.json`).then((response) => {
        if (!response.ok) throw new Error("Could not load the session set.");
        return response.json();
      }),
    ])
      .then(([config, payload]) => {
        if (cancelled) return;
        setApiBase(config?.apiBase || config?.api_base || "");
        setStudy(payload);
        setRuntimeLoaded(true);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error?.message || "Could not load study data.");
      });
    return () => {
      cancelled = true;
    };
  }, [deployedMode]);

  useEffect(() => saveJson(STORAGE_KEYS.accounts, accounts), [accounts]);
  useEffect(() => (profile ? saveJson(STORAGE_KEYS.profile, profile) : undefined), [profile]);
  useEffect(() => saveJson(STORAGE_KEYS.ratings, ratings), [ratings]);
  useEffect(() => (assignment ? saveJson(STORAGE_KEYS.assignment, assignment) : localStorage.removeItem(STORAGE_KEYS.assignment)), [assignment]);

  useEffect(() => {
    if (!profile || apiEnabled() || deployedMode) return;
    setAccounts((current) => ({
      ...current,
      [normalizeEmail(profile.email)]: { profile, ratings, assignment, updated_at_utc: nowUtc() },
    }));
  }, [assignment, deployedMode, profile, ratings]);

  useEffect(() => {
    if (!profile && route !== ROUTES.access) go(ROUTES.access);
    if (profile && route === ROUTES.access) go(ROUTES.welcome);
  }, [profile, route]);

  useEffect(() => {
    if (route === ROUTES.review && profile && study && !assignment && nextStatus === "idle") void requestNext();
    // requestNext is deliberately driven by these state transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment, nextStatus, profile, route, study]);

  const completedStrata = useMemo(() => new Set(ratings.map((rating) => rating.stratum_id)).size, [ratings]);
  const session = useMemo(() => sessionById(study, assignment?.session_id), [assignment, study]);

  async function loadRemoteHistory(token) {
    const history = await postJSON("/api/history", { token });
    setRatings((history?.ratings || []).map(normalizeRating));
    setAssignment(history?.open_assignment || null);
    return history;
  }

  async function handleAccess({ email, accessCode }) {
    const normalizedEmail = normalizeEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("Please enter a valid email address.");

    if (apiEnabled()) {
      const result = await postJSON("/api/access", { email: normalizedEmail, access_code: accessCode });
      if (!result?.profile_complete) return { existing: false, email: normalizedEmail };
      localStorage.setItem(STORAGE_KEYS.token, result.token);
      await loadRemoteHistory(result.token);
      const nextProfile = { ...result.profile, participant_id: result.participant_id, email: normalizedEmail };
      setProfile(nextProfile);
      go(ROUTES.welcome);
      return { existing: true };
    }

    if (deployedMode) throw new Error("Cloudflare storage is not configured for this deployment. Please contact the study team.");
    await verifyLocalAccessCode(accessCode);
    const account = accounts[normalizedEmail];
    if (account?.profile) {
      setProfile(account.profile);
      setRatings((account.ratings || []).map(normalizeRating));
      setAssignment(account.assignment || null);
      go(ROUTES.welcome);
      return { existing: true };
    }
    return { existing: false, email: normalizedEmail };
  }

  async function handleProfile(nextProfile) {
    const accessCode = String(nextProfile.access_code || "").trim();
    const normalized = {
      email: normalizeEmail(nextProfile.email),
      name: nextProfile.name.trim(),
      role: nextProfile.role.trim(),
      institution: nextProfile.institution.trim(),
      latest_degree: nextProfile.latest_degree.trim(),
      years_experience: Number(nextProfile.years_experience),
      participant_id: makeParticipantId(nextProfile.email),
      started_at_utc: nowUtc(),
    };

    if (apiEnabled()) {
      const result = await postJSON("/api/session", { profile: normalized, access_code: accessCode });
      normalized.participant_id = result.participant_id;
      localStorage.setItem(STORAGE_KEYS.token, result.token);
      await loadRemoteHistory(result.token);
    } else {
      if (deployedMode) throw new Error("Cloudflare storage is not configured for this deployment. Please contact the study team.");
      await verifyLocalAccessCode(accessCode);
    }
    setProfile(normalized);
    go(ROUTES.welcome);
  }

  async function requestNext() {
    if (!profile || !study || assignment || nextStatus === "loading" || nextRequestRef.current) return;
    nextRequestRef.current = true;
    setNextStatus("loading");
    try {
      let next = null;
      if (apiEnabled()) {
        const result = await postJSON("/api/next", {
          token: localStorage.getItem(STORAGE_KEYS.token),
          study_version: study.studyVersion,
        });
        next = result?.assignment || null;
      } else {
        next = chooseLocalAssignment(study, ratings, profile.participant_id);
      }
      setAssignment(next);
      setNextStatus(next ? "ready" : "complete");
      if (!next) go(ROUTES.complete);
    } catch (error) {
      setNextStatus("error");
    } finally {
      nextRequestRef.current = false;
    }
  }

  async function saveRating({ scores, comments, startedAt }) {
    if (!assignment || !session) return;
    const rating = {
      id: `rating_${profile.participant_id}_${session.id}`.replace(/[^a-zA-Z0-9_:-]/g, "_"),
      assignment_id: assignment.id,
      participant_uid: profile.participant_id,
      session_id: session.id,
      stratum_id: assignment.stratum_id,
      scores,
      total_score: Object.values(scores).reduce((sum, score) => sum + Number(score), 0),
      comments: comments.trim() || null,
      started_at_utc: startedAt,
      timestamp_utc: nowUtc(),
      duration_seconds: Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000)),
      user_agent: navigator.userAgent,
      page_url: window.location.href,
    };

    if (apiEnabled()) {
      await postJSON("/api/rating", { token: localStorage.getItem(STORAGE_KEYS.token), rating });
    }
    setRatings((current) => [...current.filter((item) => item.session_id !== rating.session_id), rating]);
    localStorage.removeItem(`${STORAGE_KEYS.draftPrefix}${assignment.id}`);
    setAssignment(null);
    setNextStatus("idle");
  }

  function logout() {
    clearSessionStorage();
    setProfile(null);
    setRatings([]);
    setAssignment(null);
    setNextStatus("idle");
    go(ROUTES.access);
  }

  if (loadError) return <StatusPage eyebrow="Data error" title="The study could not be loaded." detail={loadError} danger />;
  if (!study || !runtimeLoaded) return <StatusPage eyebrow="Loading" title="Preparing the CTRS review…" detail="Loading the session set." loading />;
  if (!profile || route === ROUTES.access) return <AccessPage onAccess={handleAccess} onProfile={handleProfile} />;

  return (
    <AppShell profile={profile} route={route} completed={completedStrata} total={study.stratumCount} onLogout={logout}>
      {route === ROUTES.welcome && <WelcomePage study={study} completed={completedStrata} onStart={() => go(ROUTES.review)} />}
      {route === ROUTES.review && (
        <ReviewPage
          study={study}
          assignment={assignment}
          session={session}
          completed={completedStrata}
          status={nextStatus}
          onRetry={() => setNextStatus("idle")}
          onSave={saveRating}
        />
      )}
      {route === ROUTES.complete && <CompletionPage completed={completedStrata} />}
    </AppShell>
  );
}

function AppShell({ profile, route, completed, total, onLogout, children }) {
  const progress = total ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="appShell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => go(ROUTES.welcome)}>
          <span className="brandMark"><ClipboardCheck size={23} /></span>
          <span><strong>CTRS Expert Review</strong><small>{profile.name} · {profile.participant_id}</small></span>
        </button>
        <div className="progressBlock" aria-label={`${completed} of ${total} sessions completed`}>
          <div><span>{completed}/{total} sessions</span><strong>{progress}%</strong></div>
          <div className="progressTrack"><span style={{ width: `${progress}%` }} /></div>
        </div>
        <nav className="topActions" aria-label="Primary navigation">
          <button className={route === ROUTES.welcome ? "navButton active" : "navButton"} type="button" onClick={() => go(ROUTES.welcome)}><BookOpenCheck size={17} /> Guide</button>
          <button className={route === ROUTES.review ? "navButton active" : "navButton"} type="button" onClick={() => go(ROUTES.review)}><FileText size={17} /> Rate</button>
          <button className="navButton" type="button" onClick={onLogout}><LogOut size={17} /> Exit</button>
        </nav>
      </header>
      {children}
    </div>
  );
}

function StatusPage({ eyebrow, title, detail, loading, danger }) {
  return (
    <main className="centerShell">
      <section className="accessPanel compactPanel">
        <div className={danger ? "eyebrow danger" : "eyebrow"}>{eyebrow}</div>
        <h1>{loading && <LoaderCircle className="spin inlineIcon" size={28} />}{title}</h1>
        <p>{detail}</p>
      </section>
    </main>
  );
}

function AccessPage({ onAccess, onProfile }) {
  const [step, setStep] = useState("gate");
  const [gate, setGate] = useState({ email: "", access_code: "" });
  const [profile, setProfile] = useState({ email: "", access_code: "", name: "", role: "", institution: "", latest_degree: "", years_experience: "" });
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitGate(event) {
    event.preventDefault();
    setStatus("");
    setSubmitting(true);
    try {
      const result = await onAccess({ email: gate.email, accessCode: gate.access_code });
      if (!result.existing) {
        setProfile((current) => ({ ...current, email: result.email, access_code: gate.access_code }));
        setStep("profile");
      }
    } catch (error) {
      setStatus(error?.message || "Access could not be verified.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitProfile(event) {
    event.preventDefault();
    setStatus("");
    if (!profile.name.trim() || !profile.role.trim() || !profile.institution.trim() || !profile.latest_degree.trim()) return setStatus("Please complete every profile field.");
    if (profile.years_experience === "" || Number(profile.years_experience) < 0 || Number(profile.years_experience) > 80) return setStatus("Please enter valid years of experience.");
    setSubmitting(true);
    try {
      await onProfile(profile);
    } catch (error) {
      setStatus(error?.message || "Your profile could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="centerShell accessBackdrop">
      <section className="accessPanel">
        <div className="accessBrand"><span className="brandMark large"><ClipboardCheck size={30} /></span><span>Clinical expert study</span></div>
        <div className="eyebrow">Cognitive Therapy Rating Scale</div>
        <h1>{step === "gate" ? "Expert session review" : "Tell us about your expertise"}</h1>
        <p className="lead">{step === "gate" ? "Sign in with the email address and access code provided by the study team." : "This information supports the interpretation of inter-rater judgments. It is stored separately from public study materials."}</p>

        {step === "gate" ? (
          <form className="accessForm oneColumn" onSubmit={submitGate}>
            <Input icon={<Mail size={18} />} label="Email address" type="email" value={gate.email} onChange={(value) => setGate((current) => ({ ...current, email: value }))} autoComplete="email" />
            <Input icon={<KeyRound size={18} />} label="Access code" type="password" value={gate.access_code} onChange={(value) => setGate((current) => ({ ...current, access_code: value }))} autoComplete="one-time-code" />
            <button className="primaryAction wide" type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}{submitting ? "Checking…" : "Continue"}</button>
          </form>
        ) : (
          <form className="accessForm" onSubmit={submitProfile}>
            <Input icon={<Mail size={18} />} label="Email address" type="email" value={profile.email} disabled onChange={() => {}} />
            <Input icon={<UserRound size={18} />} label="Full name" value={profile.name} onChange={(value) => setProfile((current) => ({ ...current, name: value }))} autoComplete="name" />
            <Input icon={<BriefcaseBusiness size={18} />} label="Role or specialty" value={profile.role} onChange={(value) => setProfile((current) => ({ ...current, role: value }))} />
            <Input icon={<Building2 size={18} />} label="Institution" value={profile.institution} onChange={(value) => setProfile((current) => ({ ...current, institution: value }))} />
            <Input icon={<GraduationCap size={18} />} label="Latest degree" value={profile.latest_degree} onChange={(value) => setProfile((current) => ({ ...current, latest_degree: value }))} />
            <Input icon={<ClipboardCheck size={18} />} label="Years of clinical experience" type="number" min="0" max="80" value={profile.years_experience} onChange={(value) => setProfile((current) => ({ ...current, years_experience: value }))} />
            <div className="formActions fullSpan">
              <button className="secondaryButton" type="button" onClick={() => setStep("gate")} disabled={submitting}>Back</button>
              <button className="primaryAction" type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />}{submitting ? "Saving…" : "Create profile"}</button>
            </div>
          </form>
        )}
        {status && <div className="statusBanner error" role="alert">{status}</div>}
      </section>
    </main>
  );
}

function Input({ icon, label, value, onChange, type = "text", ...props }) {
  return <label className="field"><span>{label}</span><div className="inputWrap">{icon}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} {...props} /></div></label>;
}

function WelcomePage({ study, completed, onStart }) {
  const remaining = Math.max(study.stratumCount - completed, 0);
  return (
    <main className="page">
      <section className="heroGrid">
        <div className="heroPanel">
          <div className="eyebrow">Your task</div>
          <h1>Rate simulated CBT sessions with the CTRS.</h1>
          <p className="heroCopy">Read each full transcript and score the therapist on all 11 Cognitive Therapy Rating Scale items.</p>
          <div className="heroActions">
            <button className="primaryAction" type="button" onClick={onStart}>{remaining ? <ArrowRight size={18} /> : <CheckCircle2 size={18} />}{remaining ? `${completed ? "Continue" : "Begin"} review` : "View completion"}</button>
          </div>
        </div>
        <aside className="scalePanel">
          <div className="eyebrow">0–6 rating scale</div>
          <div className="scaleList">{study.scale.map((point) => <div key={point.value}><strong>{point.value}</strong><span>{point.label}</span></div>)}</div>
        </aside>
      </section>
      <section className="instructionGrid">
        <article><span className="instructionNumber">01</span><h2>Use the entire session and score every item</h2><p>Judge the therapist's demonstrated skill while taking the apparent difficulty of the patient into account. Even-numbered anchors are shown with each criterion; use 1, 3, or 5 when performance falls between adjacent anchors.</p></article>
      </section>
    </main>
  );
}

function ReviewPage({ study, assignment, session, completed, status, onRetry, onSave }) {
  const [scores, setScores] = useState({});
  const [comments, setComments] = useState("");
  const [startedAt, setStartedAt] = useState(nowUtc());
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());
  const skipDraftSaveRef = useRef(false);
  const draftKey = assignment ? `${STORAGE_KEYS.draftPrefix}${assignment.id}` : "";

  useEffect(() => {
    if (!assignment) return;
    skipDraftSaveRef.current = true;
    const draft = loadJson(`${STORAGE_KEYS.draftPrefix}${assignment.id}`, null);
    setScores(draft?.scores || {});
    setComments(draft?.comments || "");
    setStartedAt(draft?.startedAt || nowUtc());
    setSubmitError("");
    setExpanded(new Set());
  }, [assignment]);

  useEffect(() => {
    if (skipDraftSaveRef.current) {
      skipDraftSaveRef.current = false;
      return;
    }
    if (draftKey) saveJson(draftKey, { scores, comments, startedAt });
  }, [comments, draftKey, scores, startedAt]);

  const answered = study.rubric.filter((item) => Number.isInteger(scores[item.key])).length;
  const totalScore = Object.values(scores).reduce((sum, value) => sum + (Number.isInteger(value) ? value : 0), 0);

  async function submit() {
    if (answered !== study.rubric.length) return setSubmitError(`Please score all 11 items. ${11 - answered} remain.`);
    setSaving(true);
    setSubmitError("");
    try {
      await onSave({ scores, comments, startedAt });
    } catch (error) {
      setSubmitError(error?.message || "The rating could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading" || (!assignment && status === "idle")) return <StatusPage eyebrow="Next session" title="Selecting your next session…" detail="Preparing the session transcript." loading />;
  if (status === "error") return <main className="page"><section className="emptyPanel"><div className="eyebrow danger">Connection issue</div><h1>The next session could not be loaded.</h1><p>Your completed work is safe. Check the connection and try again.</p><button className="primaryAction" type="button" onClick={onRetry}>Try again</button></section></main>;
  if (!assignment || !session) return <main className="page"><section className="emptyPanel"><div className="eyebrow">Complete</div><h1>No eligible sessions remain.</h1></section></main>;

  return (
    <main className="reviewPage">
      <section className="reviewHeading">
        <div><div className="eyebrow">Session {completed + 1} of {study.stratumCount}</div><h1>{session.label}</h1></div>
        <div className="scoreSummary"><span>{answered}/11 scored</span><strong>{answered ? `${totalScore}/66` : "—/66"}</strong></div>
      </section>
      <div className="reviewGrid">
        <section className="transcriptPanel">
          <div className="panelHeader"><h2>Transcript</h2></div>
          <Transcript text={session.transcript} />
        </section>
        <section className="ratingPanel">
          <div className="ratingIntro"><div><span className="panelKicker">CTRS score sheet</span><h2>Therapist ratings</h2></div></div>
          <div className="criteriaList">
            {study.rubric.map((item, index) => {
              const previousPart = index ? study.rubric[index - 1].part : null;
              const isExpanded = expanded.has(item.key);
              return (
                <div key={item.key}>
                  {item.part !== previousPart && <div className="partDivider">{item.part}</div>}
                  <article className={Number.isInteger(scores[item.key]) ? "criterionCard answered" : "criterionCard"}>
                    <div className="criterionTop"><span className="criterionNumber">{String(item.number).padStart(2, "0")}</span><div><h3>{item.label}</h3>{item.note && <p className="criterionNote">{item.note}</p>}</div>{Number.isInteger(scores[item.key]) && <span className="selectedScore">{scores[item.key]}</span>}</div>
                    <div className="scoreButtons" role="radiogroup" aria-label={`${item.label} score`}>
                      {study.scale.map((point) => <button key={point.value} className={scores[item.key] === point.value ? "scoreButton selected" : "scoreButton"} type="button" role="radio" aria-checked={scores[item.key] === point.value} title={`${point.value} — ${point.label}`} onClick={() => setScores((current) => ({ ...current, [item.key]: point.value }))}><strong>{point.value}</strong><small>{point.label}</small></button>)}
                    </div>
                    <button className="anchorToggle" type="button" aria-expanded={isExpanded} onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(item.key)) next.delete(item.key); else next.add(item.key); return next; })}>{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Anchors</button>
                    {isExpanded && <div className="anchors">{[0, 2, 4, 6].map((value) => <div key={value}><strong>{value}</strong><p>{item.anchors[value]}</p></div>)}</div>}
                  </article>
                </div>
              );
            })}
          </div>
          <label className="commentField"><span>Overall comments <small>Optional</small></span><textarea rows={5} value={comments} onChange={(event) => setComments(event.target.value)} placeholder="Observations, special circumstances, or suggestions for improvement…" /></label>
          {submitError && <div className="statusBanner error" role="alert">{submitError}</div>}
          <div className="submitBar"><div><span>CTRS total</span><strong>{answered === 11 ? totalScore : "—"}<small> / 66</small></strong></div><button className="primaryAction" type="button" disabled={saving || answered !== 11} onClick={() => void submit()}>{saving ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />}{saving ? "Saving…" : completed + 1 === study.stratumCount ? "Submit final rating" : "Save and continue"}</button></div>
        </section>
      </div>
    </main>
  );
}

function Transcript({ text }) {
  const entries = [];
  let startsNewParagraph = false;

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      startsNewParagraph = true;
      continue;
    }

    const match = /^([^:]{1,30}):\s*(.*)$/.exec(line);
    if (match) {
      entries.push({ speaker: match[1].trim(), paragraphs: match[2] ? [match[2].trim()] : [] });
      startsNewParagraph = false;
      continue;
    }

    const previous = entries.at(-1);
    if (previous?.speaker) {
      if (startsNewParagraph || !previous.paragraphs.length) previous.paragraphs.push(line);
      else previous.paragraphs[previous.paragraphs.length - 1] += ` ${line}`;
    } else {
      entries.push({ speaker: "", paragraphs: [line] });
    }
    startsNewParagraph = false;
  }

  return <div className="transcript" aria-label="Therapy transcript">{entries.map((entry, index) => {
    if (!entry.speaker) return <p className="narration" key={index}>{entry.paragraphs.join("\n\n")}</p>;
    const therapist = /^therapist$/i.test(entry.speaker);
    return <div className={therapist ? "utterance therapist" : "utterance patient"} key={index}><span>{entry.speaker}</span><p>{entry.paragraphs.join("\n\n")}</p></div>;
  })}</div>;
}

function CompletionPage({ completed }) {
  return (
    <main className="page completionPage">
      <section className="completionCard"><span className="completionIcon"><Check size={38} /></span><div className="eyebrow">Review complete</div><h1>Thank you for your expert assessment.</h1><p>Your ratings for {completed} anonymous {completed === 1 ? "session have" : "sessions have"} been saved. There are no remaining method–simulator pairs assigned to you.</p><button className="secondaryButton" type="button" onClick={() => go(ROUTES.welcome)}>Return to study guide</button></section>
    </main>
  );
}
