// ---------------------------------------------------------
// MINIGAME: Séance – Terminal-Sitzung mit Geist & Whispers
// ---------------------------------------------------------

const SEANCE_STORAGE_KEY = "darknet-seance-sessions";
const SEANCE_ACTIVE_KEY = "darknet-seance-active";
const SEANCE_SPIRIT_URL = "content/seance/spirit_violet_echo.json";

const SEANCE_MAX_LOG = 200;
const SEANCE_PATIENCE_MAX = 4;

const SEANCE_TRIGGER_RULES = [
  { key: "time",  regex: /\b(wann|zeit|morgen|heute|jetzt|bald)\b/i },
  { key: "name",  regex: /\b(wer|name|identität|wie heißt)\b/i },
  { key: "love",  regex: /\b(liebe|herz|warm|glühen)\b/i },
  { key: "death", regex: /\b(tod|sterben|grab|ende|geist)\b/i },
  { key: "help",  regex: /\b(hilfe|help|bitte|retten|rettung)\b/i }
];

const SEANCE_FALLBACK_SPIRIT = {
  name: "Violet Echo",
  persona: "orakelhaft",
  seed: 12345,
  patience: 3,
  tabooWords: ["polizei", "drogen", "cop"],
  triggers: {
    blood: 2,
    ash: 1,
    silence: 3
  },
  templates: {
    time: [
      "Nicht heute.",
      "Die Zeit ist ein Kreis.",
      "Bald. Nicht jetzt.",
      "Stunden zerfließen, {{user}}."
    ],
    name: [
      "Namen sind Türen.",
      "Sag ihn nicht laut.",
      "Du kennst den Namen.",
      "Der Name brennt, wenn du ihn sprichst."
    ],
    love: [
      "Das Herz lügt, aber warm.",
      "Liebe flackert wie Neon im Regen.",
      "Du trägst ein verräterisches Flimmern im Brustkorb."
    ],
    death: [
      "Du kennst die Antwort bereits.",
      "Gräber sind nur Knoten im Netz.",
      "Sterben heißt, auf Sendung zu bleiben."
    ],
    help: [
      "Du willst Hilfe? Flüstere leiser.",
      "Ich kann dich nur spiegeln, nicht retten.",
      "Patience sinkt, wenn du dringst."
    ],
    default: [
      "Das Netz flüstert: {{omen}}.",
      "Ich sehe {{noun}} im Schatten.",
      "{{user}}, du fragst zu hell.",
      "Leitungen zittern um {{time}}."
    ]
  },
  words: {
    omen: ["Asche", "Kälte", "Violett", "Stille", "Rabenfedern", "Ozon"],
    noun: ["ein Zeichen", "eine Tür", "deinen Schatten", "ein Echo", "ein Kabel"]
  },
  events: [
    "Kerzenflackern registriert.",
    "Ein leises Kratzen im Metall.",
    "Die Leitung wird kalt.",
    "Ein Pixel fällt aus der Realität."
  ]
};

let SEANCE_SESSIONS = null;
let SEANCE_SPIRIT_CACHE = null;

function seanceNow() {
  return Date.now();
}

function seanceLoadSessions() {
  if (SEANCE_SESSIONS !== null) return SEANCE_SESSIONS;
  try {
    const raw = localStorage.getItem(SEANCE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        SEANCE_SESSIONS = parsed;
        return SEANCE_SESSIONS;
      }
    }
  } catch (e) {
    console.warn("Séance Storage konnte nicht gelesen werden:", e.message);
  }
  SEANCE_SESSIONS = {};
  return SEANCE_SESSIONS;
}

function seanceSaveSessions() {
  try {
    localStorage.setItem(SEANCE_STORAGE_KEY, JSON.stringify(SEANCE_SESSIONS || {}));
  } catch (e) {
    console.warn("Séance Storage konnte nicht gespeichert werden:", e.message);
  }
}

function seanceGetActiveId() {
  try {
    const stored = localStorage.getItem(SEANCE_ACTIVE_KEY);
    if (stored) return stored;
  } catch (e) {
    // ignore
  }
  return null;
}

function seanceSetActiveId(id) {
  try {
    if (id) {
      localStorage.setItem(SEANCE_ACTIVE_KEY, id);
    } else {
      localStorage.removeItem(SEANCE_ACTIVE_KEY);
    }
  } catch (e) {
    // ignore
  }
}

function seanceGetActiveSession() {
  const id = seanceGetActiveId();
  if (!id) return null;
  const sessions = seanceLoadSessions();
  return sessions[id] || null;
}

function seanceSaveSession(session) {
  if (!session || !session.id) return;
  const sessions = seanceLoadSessions();
  sessions[session.id] = session;
  seanceSaveSessions();
}

function seanceUpdateSession(session, updater) {
  if (typeof updater === "function") {
    updater(session);
  }
  session.lastActivityAt = seanceNow();
  seanceSaveSession(session);
}

function seanceClampMood(value) {
  return Math.max(0, Math.min(1, value));
}

function seancePad(num) {
  return String(num).padStart(2, "0");
}

function seanceMakeId() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${seancePad(d.getMonth() + 1)}${seancePad(d.getDate())}`;
  const rand = Math.random().toString(36).slice(-4).toUpperCase();
  return `S-${stamp}-${rand}`;
}

async function seanceLoadSpiritContent() {
  if (SEANCE_SPIRIT_CACHE) return SEANCE_SPIRIT_CACHE;
  try {
    const res = await fetch(SEANCE_SPIRIT_URL);
    const data = await res.json();
    if (data && data.templates) {
      SEANCE_SPIRIT_CACHE = data;
      return data;
    }
  } catch (e) {
    console.warn("Séance Spirit Content Fallback genutzt:", e.message);
  }
  SEANCE_SPIRIT_CACHE = SEANCE_FALLBACK_SPIRIT;
  return SEANCE_SPIRIT_CACHE;
}

function seanceRandom(session, salt = 0) {
  if (!session.spirit.random) {
    session.spirit.random = session.spirit.seed || Math.floor(Math.random() * 1000000);
  }
  // Linear Congruential Generator
  const mod = 0x100000000;
  session.spirit.random = (1664525 * (session.spirit.random + salt) + 1013904223) % mod;
  return session.spirit.random / mod;
}

function seancePick(list = [], session, salt = 0) {
  if (!list.length) return "";
  const r = seanceRandom(session, salt);
  const idx = Math.floor(r * list.length);
  return list[idx] || list[0];
}

function seanceAlias(session, user) {
  session.aliases = session.aliases || {};
  if (session.aliases[user]) return session.aliases[user];
  const hash = Math.abs(
    [...(user + session.id)]
      .map(c => c.charCodeAt(0))
      .reduce((acc, cur) => (acc * 31 + cur) | 0, 7)
  ).toString(16).slice(-4).toUpperCase();
  const alias = `whisper#${hash}`;
  session.aliases[user] = alias;
  return alias;
}

function seanceAddLog(session, type, text, { author = "system", meta = {} } = {}) {
  const entry = {
    id: `m${session.log.length + 1}`,
    type,
    author,
    ts: seanceNow(),
    text,
    meta
  };
  session.log.push(entry);
  if (session.log.length > SEANCE_MAX_LOG) {
    session.log = session.log.slice(-SEANCE_MAX_LOG);
  }
  session.lastActivityAt = entry.ts;
  seanceSaveSession(session);
  return entry;
}

function seanceDetectTrigger(question = "") {
  for (const rule of SEANCE_TRIGGER_RULES) {
    if (rule.regex.test(question)) return rule.key;
  }
  return "default";
}

function seanceRenderTemplate(template, session, { question = "", whisperText = "" } = {}) {
  const now = new Date();
  const ctx = {
    user: getUserName(),
    time: now.toLocaleTimeString(),
    mood: session.mood,
    question,
    whisper: whisperText || "",
  };

  return template.replace(/\{\{(.*?)\}\}/g, (_, keyRaw) => {
    const key = keyRaw.trim();
    if (ctx[key]) return ctx[key];
    const spirit = session.spirit;
    const words = spirit.words || {};
    if (Array.isArray(words[key])) {
      return seancePick(words[key], session, key.length);
    }
    return "";
  });
}

function seanceDistort(text, patience) {
  if (patience >= 2) return text;
  if (patience <= 0) return "…Stille.";
  if (patience < 1) {
    return text.split(" ").slice(0, 4).join(" ") + " …";
  }
  return text.replace(/\./g, "…");
}

function seanceAdjustPatience(session, delta) {
  const spirit = session.spirit;
  spirit.patience = Math.max(0, Math.min(SEANCE_PATIENCE_MAX, (spirit.patience || 0) + delta));
  return spirit.patience;
}

function seanceBumpMood(session, delta) {
  session.mood = seanceClampMood((session.mood || 0.5) + delta);
}

async function seanceBuildSpiritReply(session, question = "", { whisperText = "" } = {}) {
  const spirit = session.spirit;
  const content = await seanceLoadSpiritContent();
  const triggerKey = seanceDetectTrigger(question);
  const templates = content.templates?.[triggerKey] || content.templates?.default || SEANCE_FALLBACK_SPIRIT.templates.default;
  const raw = seancePick(templates, session, question.length + whisperText.length);

  const tabooHit = (content.tabooWords || spirit.tabooWords || []).some(word =>
    word && question.toLowerCase().includes(String(word).toLowerCase())
  );

  let text = seanceRenderTemplate(raw, {
    ...session,
    spirit: { ...spirit, words: content.words || spirit.words }
  }, { question, whisperText });

  if (tabooHit) {
    text += " (Das hättest du nicht sagen sollen.)";
    seanceAdjustPatience(session, -1);
  }

  text = seanceDistort(text, spirit.patience || 0);
  return text;
}

function seanceFormatEntry(session, entry) {
  const date = new Date(entry.ts || Date.now());
  const time = date.toLocaleTimeString();
  const spiritName = session.spirit?.name || "Geist";

  switch (entry.type) {
    case "ask":
      return { text: `[${time}] ${entry.author}: ${entry.text}`, cls: null };
    case "spirit":
      return { text: `[${time}] ${spiritName}: ${entry.text}`, cls: "seance-spirit" };
    case "whisper":
      return { text: `[${time}] ${entry.meta?.alias || entry.author}: ${entry.text}`, cls: "seance-whisper" };
    case "event":
      return { text: `[${time}] ${entry.text}`, cls: "seance-event" };
    default:
      return { text: `[${time}] ${entry.text}`, cls: "seance-system" };
  }
}

function seancePrintWhispers(session, { includeSpirit = true, showAll = false } = {}) {
  const relevant = session.log.filter(e =>
    e.type === "whisper" ||
    (includeSpirit && e.type === "spirit")
  );

  const entries = showAll ? relevant : relevant.slice(-12);
  if (!entries.length) {
    printLines(["Keine Flüsternachrichten in dieser Sitzung.", ""], "dim");
    return;
  }

  const lines = ["Whispers:", "---------"];
  printLines(lines, "seance-system");
  entries.forEach(entry => {
    const rendered = seanceFormatEntry(session, entry);
    printLines([rendered.text], rendered.cls || "dim");
  });
  printLines([""]);
}

function seancePrintStatus(session) {
  const lines = [];
  const spirit = session.spirit || {};
  const participants = Array.isArray(session.participants) ? session.participants : [];
  const last = session.lastActivityAt ? new Date(session.lastActivityAt).toLocaleTimeString() : "unbekannt";

  lines.push(`Séance ${session.id}:`);
  lines.push(`  Modus: ${session.mode} | Phase: ${session.phase}`);
  lines.push(`  Geist: ${spirit.name || "Unbekannt"} (${spirit.persona || "??"})`);
  lines.push(`  Stimmung: ${session.mood?.toFixed(2) || "?"} | Geduld: ${spirit.patience ?? "?"}`);
  lines.push(`  Teilnehmer: ${participants.join(", ") || "niemand"}`);
  lines.push(`  Letzte Aktivität: ${last}`);
  if (session.muted?.length) {
    lines.push(`  Stummgeschaltet: ${session.muted.join(", ")}`);
  }
  lines.push("");
  printLines(lines);
}

function seancePrintHelp() {
  printLines([
    "Séance-Befehle:",
    "  seance start [solo|multi]   - Neue Sitzung beginnen",
    "  seance status               - Status der aktuellen Sitzung",
    "  seance ask \"Frage\"         - Frage stellen (Geist antwortet)",
    "  seance listen               - Warten auf Ereignisse / neue Antworten",
    "  seance read [all]           - Flüstern & Geist-Meldungen anzeigen",
    "  seance whisper \"Text\"       - Beitrag flüstern (multi-kompatibel)",
    "  seance invite <user>        - Einladung an Nutzer per Chat senden",
    "  seance join <id>            - Existierender Sitzung beitreten",
    "  seance leave                - Sitzung verlassen",
    "  seance mute|unmute <user>   - Nutzer (ent)stumm schalten (Host)",
    "  seance purge [id]           - Whispers säubern (Host)",
    "  seance end                  - Sitzung schließen",
    ""
  ]);
}

async function seanceStartCommand(args = []) {
  const modeArg = (args[0] || "solo").toLowerCase();
  const mode = modeArg === "multi" ? "multi" : "solo";
  const user = getUserName();
  const spiritContent = await seanceLoadSpiritContent();

  const session = {
    id: seanceMakeId(),
    host: user,
    createdAt: seanceNow(),
    mode,
    mood: seanceClampMood(0.45 + Math.random() * 0.25),
    phase: "opening",
    participants: [user],
    lastActivityAt: seanceNow(),
    log: [],
    aliases: {},
    muted: [],
    spirit: {
      name: spiritContent.name || "Geist",
      persona: spiritContent.persona || "schattenhaft",
      seed: spiritContent.seed || Math.floor(Math.random() * 1000000),
      patience: spiritContent.patience ?? 3,
      tabooWords: spiritContent.tabooWords || [],
      triggers: spiritContent.triggers || {},
      words: spiritContent.words || {}
    }
  };

  seanceSetActiveId(session.id);
  seanceLoadSessions(); // ensures map exists
  seanceSaveSession(session);

  seanceAddLog(session, "system", "Die Kerzen brennen. Das Netz ist still.");
  seanceAddLog(session, "system", `Geist: ${session.spirit.name} (${session.spirit.persona}) · Mood ${session.mood.toFixed(2)}`);

  printLines([
    `Séance gestartet (${mode}). Session-ID: ${session.id}`,
    "Die Leitung knistert, der Raum wird kalt.",
    ""
  ], "success");
}

function seanceEnsureActive() {
  const session = seanceGetActiveSession();
  if (!session) {
    printLines(["Keine aktive Séance. Starte eine mit 'seance start'.", ""], "error");
    return null;
  }
  return session;
}

async function seanceAskCommand(args = []) {
  const session = seanceEnsureActive();
  if (!session) return;

  const question = args.join(" ").replace(/^\"|\"$/g, "").trim();
  if (!question) {
    printLines(["Bitte eine Frage stellen: seance ask \"...\"", ""], "error");
    return;
  }

  if (session.spirit.cooldownUntil && seanceNow() < session.spirit.cooldownUntil) {
    printLines(["Die Leitung bleibt kalt. Der Geist braucht Pause.", ""], "dim");
    return;
  }

  seanceAddLog(session, "ask", question, { author: getUserName() });
  session.phase = session.phase === "opening" ? "active" : session.phase;

  const lastAsk = session.lastAskAt || 0;
  const now = seanceNow();
  if (now - lastAsk < 8000) {
    seanceAdjustPatience(session, -1);
  } else {
    seanceAdjustPatience(session, 0.15);
  }
  session.lastAskAt = now;

  const reply = await seanceBuildSpiritReply(session, question);
  seanceAddLog(session, "spirit", reply, { author: session.spirit.name });

  if (session.spirit.patience <= 0) {
    session.spirit.cooldownUntil = seanceNow() + 1000 * (10 + Math.floor(seanceRandom(session) * 20));
  }

  seanceSaveSession(session);

  const rendered = seanceFormatEntry(session, { type: "spirit", text: reply, ts: seanceNow() });
  printLines([rendered.text, ""], rendered.cls);
}

async function seanceListenCommand() {
  const session = seanceEnsureActive();
  if (!session) return;

  printLines(["…die Leitung knistert…"], "dim");
  await sleep(350 + Math.floor(seanceRandom(session) * 400));

  const content = await seanceLoadSpiritContent();
  const eventText = seancePick(content.events || SEANCE_FALLBACK_SPIRIT.events, session, 3);
  seanceAddLog(session, "event", eventText);
  printLines([eventText], "seance-event");

  if (session.spirit.cooldownUntil && seanceNow() < session.spirit.cooldownUntil) {
    printLines(["Der Geist schweigt noch.", ""], "dim");
    return;
  }

  if (session.spirit.patience < SEANCE_PATIENCE_MAX) {
    seanceAdjustPatience(session, 0.25);
  }

  const replyChance = session.mode === "multi" ? 0.65 : 0.45;
  if (seanceRandom(session) < replyChance) {
    const reply = await seanceBuildSpiritReply(session, "", { whisperText: "" });
    seanceAddLog(session, "spirit", reply, { author: session.spirit.name });
    const rendered = seanceFormatEntry(session, { type: "spirit", text: reply, ts: seanceNow() });
    printLines([rendered.text], rendered.cls);
  }

  if (seanceRandom(session) < 0.08) {
    seanceAddLog(session, "system", "⚠ GATE OPEN – etwas klirrt im Untergrund.");
    printLines(["⚠ GATE OPEN – etwas klirrt im Untergrund.", ""], "success");
  } else {
    printLines([""], "dim");
  }
}

function seanceReadCommand(args = []) {
  const session = seanceEnsureActive();
  if (!session) return;
  const showAll = (args[0] || "").toLowerCase() === "all";
  seancePrintWhispers(session, { showAll, includeSpirit: true });
}

async function seanceWhisperCommand(args = []) {
  const session = seanceEnsureActive();
  if (!session) return;
  const text = args.join(" ").replace(/^\"|\"$/g, "").trim();
  if (!text) {
    printLines(["Bitte einen Whisper-Text angeben.", ""], "error");
    return;
  }

  const user = getUserName();
  if (Array.isArray(session.muted) && session.muted.includes(user) && session.host !== user) {
    printLines(["Der Host hat dich für diese Sitzung stummgeschaltet.", ""], "error");
    return;
  }

  const alias = seanceAlias(session, user);
  seanceAddLog(session, "whisper", text, { author: user, meta: { alias } });
  seanceBumpMood(session, 0.02);

  if (session.mode === "multi") {
    printLines([`Whisper abgelegt (${alias}).`, ""], "dim");
  } else {
    printLines([`Whisper notiert (${alias}). Der Geist lauscht.`, ""], "dim");
  }

  const replyChance = 0.35 + (session.spirit.patience > 2 ? 0.15 : 0);
  if (seanceRandom(session) < replyChance) {
    const reply = await seanceBuildSpiritReply(session, "", { whisperText: text });
    seanceAddLog(session, "spirit", reply, { author: session.spirit.name });
    const rendered = seanceFormatEntry(session, { type: "spirit", text: reply, ts: seanceNow() });
    printLines([rendered.text, ""], rendered.cls);
  } else {
    printLines([""], "dim");
  }
}

async function seanceInviteCommand(args = []) {
  const session = seanceEnsureActive();
  if (!session) return;
  const target = args[0];
  if (!target) {
    printLines(["Bitte einen Nutzer für die Einladung angeben.", ""], "error");
    return;
  }

  const message = `Séance-Einladung von ${session.host}: Tritt bei mit 'seance join ${session.id}'.`;
  if (typeof chatSendMessage === "function") {
    await chatSendMessage(target, message);
  } else {
    printLines(["Chat-Modul nicht geladen, Einladung wird nur lokal angezeigt.", ""], "dim");
    printLines([`(An ${target}) ${message}`, ""], "success");
  }
}

function seanceJoinCommand(args = []) {
  const sessionId = args[0];
  if (!sessionId) {
    printLines(["Bitte eine Session-ID angeben: seance join <id>", ""], "error");
    return;
  }

  const sessions = seanceLoadSessions();
  const session = sessions[sessionId];
  if (!session) {
    printLines([
      `Keine Séance mit ID ${sessionId} gefunden.`,
      "Der Host muss sie freigeben oder du bist offline.",
      ""
    ], "error");
    return;
  }

  const user = getUserName();
  if (!session.participants.includes(user)) {
    session.participants.push(user);
  }
  session.phase = session.phase === "opening" ? "active" : session.phase;
  seanceSaveSession(session);
  seanceSetActiveId(sessionId);
  seanceAddLog(session, "system", `${user} ist der Séance beigetreten.`);

  printLines([`Séance ${sessionId} beigetreten.`, ""], "success");
}

function seanceLeaveCommand() {
  const session = seanceEnsureActive();
  if (!session) return;
  const user = getUserName();
  if (session.host === user) {
    printLines([
      "Du bist Host. Nutze 'seance end', um die Sitzung zu schließen.",
      ""
    ], "dim");
    return;
  }

  session.participants = (session.participants || []).filter(p => p !== user);
  seanceAddLog(session, "system", `${user} hat die Séance verlassen.`);
  seanceSaveSession(session);
  seanceSetActiveId(null);
  printLines(["Du hast die Sitzung verlassen.", ""], "dim");
}

function seanceEndCommand() {
  const session = seanceEnsureActive();
  if (!session) return;
  const user = getUserName();
  if (session.host !== user) {
    printLines(["Nur der Host kann die Séance beenden.", ""], "error");
    return;
  }

  session.phase = "closing";
  seanceAddLog(session, "system", "Séance geschlossen. Die Leitung wird stumm.");
  seanceSaveSession(session);
  seanceSetActiveId(null);
  printLines(["Die Séance wurde beendet. Log bleibt archiviert.", ""], "success");
}

function seanceMuteCommand(args = [], unmute = false) {
  const session = seanceEnsureActive();
  if (!session) return;
  if (session.host !== getUserName()) {
    printLines(["Nur der Host kann stummschalten.", ""], "error");
    return;
  }

  const target = args[0];
  if (!target) {
    printLines(["Bitte einen Nutzer angeben.", ""], "error");
    return;
  }

  session.muted = Array.isArray(session.muted) ? session.muted : [];
  if (unmute) {
    session.muted = session.muted.filter(u => u !== target);
    seanceAddLog(session, "system", `${target} ist nicht mehr stumm.`);
  } else if (!session.muted.includes(target)) {
    session.muted.push(target);
    seanceAddLog(session, "system", `${target} wurde stummgeschaltet.`);
  }
  seanceSaveSession(session);
  printLines(["OK.", ""], "dim");
}

function seancePurgeCommand(args = []) {
  const session = seanceEnsureActive();
  if (!session) return;
  if (session.host !== getUserName()) {
    printLines(["Nur der Host kann die Sitzung säubern.", ""], "error");
    return;
  }

  const targetId = args[0];
  const before = session.log.length;
  let removed = 0;
  if (targetId) {
    session.log = session.log.filter(e => e.id !== targetId || e.type !== "whisper");
    removed = before - session.log.length;
    seanceAddLog(session, "system", `Whisper ${targetId} verworfen.`);
  } else {
    session.log = session.log.filter(e => e.type !== "whisper");
    removed = before - session.log.length;
    seanceAddLog(session, "system", "Alle Whispers gelöscht.");
  }
  seanceSaveSession(session);

  printLines([`Bereinigt. (${removed} Einträge entfernt)`, ""], "dim");
}

async function handleSeanceCommand(args = []) {
  const sub = (args[0] || "").toLowerCase();
  const rest = args.slice(1);

  if (!sub || sub === "help") {
    seancePrintHelp();
    return;
  }

  if (sub === "start") {
    await seanceStartCommand(rest);
    return;
  }

  if (sub === "status") {
    const session = seanceEnsureActive();
    if (session) seancePrintStatus(session);
    return;
  }

  if (sub === "ask") {
    await seanceAskCommand(rest);
    return;
  }

  if (sub === "listen") {
    await seanceListenCommand();
    return;
  }

  if (sub === "read") {
    seanceReadCommand(rest);
    return;
  }

  if (sub === "whisper") {
    await seanceWhisperCommand(rest);
    return;
  }

  if (sub === "invite") {
    await seanceInviteCommand(rest);
    return;
  }

  if (sub === "join") {
    seanceJoinCommand(rest);
    return;
  }

  if (sub === "leave") {
    seanceLeaveCommand();
    return;
  }

  if (sub === "end") {
    seanceEndCommand();
    return;
  }

  if (sub === "mute") {
    seanceMuteCommand(rest, false);
    return;
  }

  if (sub === "unmute") {
    seanceMuteCommand(rest, true);
    return;
  }

  if (sub === "purge") {
    seancePurgeCommand(rest);
    return;
  }

  seancePrintHelp();
}

// Registrierung
if (typeof registerCommand === "function") {
  registerCommand("seance", handleSeanceCommand);
}

if (typeof registerGame === "function") {
  registerGame("seance", {
    name: "Séance",
    description: "Sitzung mit Geist Violet Echo & Multiplayer-Whispers.",
    start: () => handleSeanceCommand(["start"]),
    help: () => seancePrintHelp()
  });
}
