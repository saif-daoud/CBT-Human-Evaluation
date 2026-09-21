import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputsRoot = path.resolve(projectRoot, "..", "..", "simulations", "outputs");
const outputFile = path.join(projectRoot, "public", "data", "study-data.json");
const researchKeyFile = path.join(projectRoot, "research", "study-key.json");
const workerCatalogFile = path.join(projectRoot, "worker", "src", "catalog.generated.js");

const rubric = [
  {
    part: "Part 1 · General Therapeutic Skills",
    key: "agenda",
    number: 1,
    label: "Agenda",
    anchors: {
      0: "Therapist did not set an agenda.",
      2: "Therapist set an agenda that was vague or incomplete.",
      4: "Therapist worked with the patient to set a mutually satisfactory agenda that included specific target problems (for example, anxiety at work or dissatisfaction with marriage).",
      6: "Therapist worked with the patient to set an appropriate agenda with target problems suitable for the available time, established priorities, and then followed the agenda.",
    },
  },
  {
    part: "Part 1 · General Therapeutic Skills",
    key: "feedback",
    number: 2,
    label: "Feedback",
    anchors: {
      0: "Therapist did not ask for feedback to determine the patient's understanding of, or response to, the session.",
      2: "Therapist elicited some feedback, but did not ask enough questions to be sure the patient understood the therapist's line of reasoning or to determine whether the patient was satisfied with the session.",
      4: "Therapist asked enough questions to be sure the patient understood the therapist's line of reasoning throughout the session and to determine the patient's reactions. The therapist adjusted behavior in response when appropriate.",
      6: "Therapist was especially adept at eliciting and responding to verbal and nonverbal feedback throughout the session, such as eliciting reactions, regularly checking understanding, and helping summarize main points at the end.",
    },
  },
  {
    part: "Part 1 · General Therapeutic Skills",
    key: "understanding",
    number: 3,
    label: "Understanding",
    anchors: {
      0: "Therapist repeatedly failed to understand what the patient explicitly said and thus consistently missed the point. Poor empathic skills.",
      2: "Therapist was usually able to reflect or rephrase what the patient explicitly said, but repeatedly failed to respond to more subtle communication. Limited ability to listen and empathize.",
      4: "Therapist generally seemed to grasp the patient's internal reality as reflected by both explicit statements and more subtle communication. Good ability to listen and empathize.",
      6: "Therapist seemed to understand the patient's internal reality thoroughly and was adept at communicating this through appropriate verbal and nonverbal responses. Excellent listening and empathic skills.",
    },
  },
  {
    part: "Part 1 · General Therapeutic Skills",
    key: "interpersonal_effectiveness",
    number: 4,
    label: "Interpersonal Effectiveness",
    anchors: {
      0: "Therapist had poor interpersonal skills and seemed hostile, demeaning, or in some other way destructive to the patient.",
      2: "Therapist did not seem destructive, but had significant interpersonal problems. At times the therapist appeared unnecessarily impatient, aloof, or insincere, or had difficulty conveying confidence and competence.",
      4: "Therapist displayed a satisfactory degree of warmth, concern, confidence, genuineness, and professionalism. No significant interpersonal problems.",
      6: "Therapist displayed optimal levels of warmth, concern, confidence, genuineness, and professionalism appropriate for this particular patient in this session.",
    },
  },
  {
    part: "Part 1 · General Therapeutic Skills",
    key: "collaboration",
    number: 5,
    label: "Collaboration",
    anchors: {
      0: "Therapist did not attempt to set up a collaboration with the patient.",
      2: "Therapist attempted to collaborate, but had difficulty either defining a problem the patient considered important or establishing rapport.",
      4: "Therapist was able to collaborate with the patient, focus on a problem both considered important, and establish rapport.",
      6: "Collaboration seemed excellent; the therapist encouraged the patient as much as possible to take an active role, such as by offering choices, so they could function as a team.",
    },
  },
  {
    part: "Part 1 · General Therapeutic Skills",
    key: "pacing_time_use",
    number: 6,
    label: "Pacing and Efficient Use of Time",
    anchors: {
      0: "Therapist made no attempt to structure therapy time; the session seemed aimless.",
      2: "The session had some direction, but the therapist had significant problems with structuring or pacing, such as too little structure, inflexibility, or pacing that was too slow or too rapid.",
      4: "Therapist was reasonably successful at using time efficiently and maintained appropriate control over the flow of discussion and pacing.",
      6: "Therapist used time efficiently by tactfully limiting peripheral and unproductive discussion and by pacing the session as rapidly as was appropriate for the patient.",
    },
  },
  {
    part: "Part 2 · Conceptualization, Strategy, and Technique",
    key: "guided_discovery",
    number: 7,
    label: "Guided Discovery",
    anchors: {
      0: "Therapist relied primarily on debate, persuasion, or lecturing. The therapist seemed to cross-examine the patient, put the patient on the defensive, or force a point of view.",
      2: "Therapist relied too heavily on persuasion and debate rather than guided discovery. However, the style was supportive enough that the patient did not seem attacked or defensive.",
      4: "For the most part, the therapist helped the patient see new perspectives through guided discovery, such as examining evidence, considering alternatives, and weighing advantages and disadvantages, rather than through debate. Questioning was used appropriately.",
      6: "Therapist was especially adept at using guided discovery to explore problems and help the patient draw personal conclusions, achieving an excellent balance between skillful questioning and other modes of intervention.",
    },
  },
  {
    part: "Part 2 · Conceptualization, Strategy, and Technique",
    key: "focusing_on_key_cognitions_behaviors",
    number: 8,
    label: "Focusing on Key Cognitions or Behaviors",
    anchors: {
      0: "Therapist did not attempt to elicit specific thoughts, assumptions, images, meanings, or behaviors.",
      2: "Therapist used appropriate techniques to elicit cognitions or behaviors; however, the therapist had difficulty finding a focus or focused on cognitions or behaviors irrelevant to the patient's key problems.",
      4: "Therapist focused on specific cognitions or behaviors relevant to the target problem. However, the therapist could have focused on more central cognitions or behaviors that offered greater promise for progress.",
      6: "Therapist very skillfully focused on key thoughts, assumptions, behaviors, and related material that were most relevant to the problem area and offered considerable promise for progress.",
    },
  },
  {
    part: "Part 2 · Conceptualization, Strategy, and Technique",
    key: "strategy_for_change",
    number: 9,
    label: "Strategy for Change",
    note: "Focus on the quality of the therapist's strategy for change, not on how effectively it was implemented or whether change actually occurred.",
    anchors: {
      0: "Therapist did not select cognitive-behavioral techniques.",
      2: "Therapist selected cognitive-behavioral techniques; however, the overall strategy for bringing about change seemed vague or did not seem promising in helping the patient.",
      4: "Therapist seemed to have a generally coherent strategy for change that showed reasonable promise and incorporated cognitive-behavioral techniques.",
      6: "Therapist followed a consistent strategy for change that seemed very promising and incorporated the most appropriate cognitive-behavioral techniques.",
    },
  },
  {
    part: "Part 2 · Conceptualization, Strategy, and Technique",
    key: "application_of_cbt_techniques",
    number: 10,
    label: "Application of Cognitive-Behavioral Techniques",
    note: "Focus on how skillfully the techniques were applied, not on how appropriate they were for the target problem or whether change actually occurred.",
    anchors: {
      0: "Therapist did not apply any cognitive-behavioral techniques.",
      2: "Therapist used CBT techniques, but their application had significant flaws.",
      4: "Therapist applied CBT techniques with moderate skill.",
      6: "Therapist employed CBT techniques very skillfully and resourcefully.",
    },
  },
  {
    part: "Part 2 · Conceptualization, Strategy, and Technique",
    key: "homework",
    number: 11,
    label: "Homework",
    anchors: {
      0: "Therapist did not attempt to incorporate homework relevant to cognitive therapy.",
      2: "Therapist had significant difficulties incorporating homework, such as not reviewing previous homework, not explaining homework in sufficient detail, or assigning inappropriate homework.",
      4: "Therapist reviewed previous homework and assigned standard cognitive therapy homework generally relevant to issues addressed in the session. Homework was explained in sufficient detail.",
      6: "Therapist reviewed previous homework and carefully assigned cognitive therapy homework for the coming week. The assignment seemed custom-tailored to help the patient incorporate new perspectives, test hypotheses, or experiment with new behaviors discussed during the session.",
    },
  },
];

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function naturalSort(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function opaqueId(prefix, value) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function patientUsesGpt51(config, runName) {
  const model = String(config?.models?.patient?.model || "").toLowerCase();
  return model.includes("gpt-5.1") || runName.toLowerCase().includes("gpt-5.1");
}

function discoverRuns() {
  if (!fs.existsSync(outputsRoot)) return [];
  return fs
    .readdirSync(outputsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = path.join(outputsRoot, entry.name);
      const configPath = path.join(directory, "run_config.json");
      if (!fs.existsSync(configPath)) return null;
      const config = readJson(configPath);
      if (String(config.domain || "").toLowerCase() !== "cbt" || !patientUsesGpt51(config, entry.name)) return null;
      const method = String(config.therapist_method || "unknown_method");
      const simulator = String(config.patient_simulator || "unknown_simulator");
      return { directory, method, simulator, runName: entry.name };
    })
    .filter(Boolean)
    .sort((a, b) => `${a.method}|${a.simulator}|${a.runName}`.localeCompare(`${b.method}|${b.simulator}|${b.runName}`));
}

function buildStudy() {
  const runs = discoverRuns();
  const grouped = new Map();

  for (const run of runs) {
    const groupKey = `${run.method}\u0000${run.simulator}`;
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    const profiles = fs
      .readdirSync(run.directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(run.directory, entry.name, "transcript.txt")))
      .map((entry) => ({ profileId: entry.name, transcriptPath: path.join(run.directory, entry.name, "transcript.txt"), runName: run.runName }))
      .sort((a, b) => naturalSort(a.profileId, b.profileId));
    grouped.get(groupKey).push(...profiles);
  }

  const rawSessions = [];
  for (const [groupKey, profiles] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const unique = new Map(profiles.map((profile) => [profile.profileId, profile]));
    for (const profile of [...unique.values()].sort((a, b) => naturalSort(a.profileId, b.profileId)).slice(0, 3)) {
      const transcript = fs.readFileSync(profile.transcriptPath, "utf8").replace(/^\uFEFF/, "").trim();
      if (transcript) rawSessions.push({ groupKey, profileId: profile.profileId, transcript, transcriptPath: profile.transcriptPath, runName: profile.runName });
    }
  }

  rawSessions.sort((a, b) => opaqueId("sort", `${a.groupKey}|${a.profileId}`).localeCompare(opaqueId("sort", `${b.groupKey}|${b.profileId}`)));
  const sessionSourceKey = (session) => {
    const transcriptHash = crypto.createHash("sha256").update(session.transcript).digest("hex");
    return `${session.groupKey}|${session.profileId}|${transcriptHash}`;
  };
  const sessionIdBySource = new Map(rawSessions.map((session) => {
    const sourceKey = sessionSourceKey(session);
    return [sourceKey, opaqueId("session", sourceKey)];
  }));
  const stratumIdByGroup = new Map([...grouped.keys()].map((groupKey) => [groupKey, opaqueId("stratum", groupKey)]));

  const sessions = rawSessions.map((session) => ({
    id: sessionIdBySource.get(sessionSourceKey(session)),
    stratumId: stratumIdByGroup.get(session.groupKey),
    transcript: session.transcript,
  }));
  const strata = [...stratumIdByGroup.values()]
    .map((id) => ({ id, sessionIds: sessions.filter((session) => session.stratumId === id).map((session) => session.id) }))
    .filter((stratum) => stratum.sessionIds.length)
    .sort((a, b) => a.id.localeCompare(b.id));
  const versionInput = sessions.map((session) => `${session.id}:${session.stratumId}:${crypto.createHash("sha256").update(session.transcript).digest("hex")}`).join("|");

  const study = {
    studyVersion: crypto.createHash("sha256").update(versionInput).digest("hex").slice(0, 16),
    title: "CTRS Expert Review",
    scale: [
      { value: 0, label: "Poor" },
      { value: 1, label: "Barely adequate" },
      { value: 2, label: "Mediocre" },
      { value: 3, label: "Satisfactory" },
      { value: 4, label: "Good" },
      { value: 5, label: "Very good" },
      { value: 6, label: "Excellent" },
    ],
    rubric,
    sessions,
    strata,
    sessionCount: sessions.length,
    stratumCount: strata.length,
  };
  const researchKey = {
    studyVersion: study.studyVersion,
    warning: "PRIVATE RESEARCH KEY — do not publish with the expert-facing website.",
    strata: [...stratumIdByGroup.entries()].map(([groupKey, stratumId]) => {
      const [therapistMethod, patientSimulator] = groupKey.split("\u0000");
      return { stratum_id: stratumId, therapist_method: therapistMethod, patient_simulator: patientSimulator };
    }),
    sessions: rawSessions.map((source, index) => ({
      session_id: sessions[index].id,
      stratum_id: sessions[index].stratumId,
      profile_id: source.profileId,
      run_name: source.runName,
      source_transcript: path.relative(projectRoot, source.transcriptPath).replaceAll("\\", "/"),
    })),
  };
  return { study, researchKey };
}

const { study, researchKey } = buildStudy();
if (!study.sessions.length) {
  if (fs.existsSync(outputFile)) {
    console.warn(`No GPT-5.1 CBT transcripts found at ${outputsRoot}; keeping the committed study data.`);
    process.exit(0);
  }
  throw new Error(`No GPT-5.1 CBT transcripts found at ${outputsRoot}.`);
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(study, null, 2)}\n`, "utf8");
fs.mkdirSync(path.dirname(researchKeyFile), { recursive: true });
fs.writeFileSync(researchKeyFile, `${JSON.stringify(researchKey, null, 2)}\n`, "utf8");
const workerCatalog = study.sessions.map((session) => ({ sessionId: session.id, stratumId: session.stratumId }));
fs.writeFileSync(
  workerCatalogFile,
  `// Generated by scripts/build-study-data.mjs. Do not edit manually.\nexport const CATALOG_VERSION = ${JSON.stringify(study.studyVersion)};\nexport const CATALOG = ${JSON.stringify(workerCatalog, null, 2)};\n`,
  "utf8",
);
console.log(`Wrote ${study.sessionCount} anonymous sessions across ${study.stratumCount} method/simulator strata to ${outputFile}.`);
console.log(`Wrote the private analysis lookup to ${researchKeyFile} (git-ignored).`);
console.log(`Wrote the Worker assignment catalog to ${workerCatalogFile}.`);
