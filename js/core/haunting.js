// ---------------------------------------------------------
// HAUNTING – Persistente Spuk-Logik & Scheduler
// ---------------------------------------------------------

const HAUNT_STORAGE_PREFIX = "darknetz-haunting:";
const HAUNT_COOLDOWN_PREFIX = "darknetz-haunt-cooldown:";
const HAUNT_SPIRIT_URL = "content/seance/spirit_violet_echo.json";

const HAUNT_DEFAULTS = {
  baseChanceBoot: 0.01,
  baseChanceScan: 0.01,
  baseChanceCat: 0.02,
  baseChanceListen: 0.005,
  ttlHoursMin: 2,
  ttlHoursMax: 48,
  intervalSecondsMin: 30,
  intervalSecondsMax: 180,
  cooldownHours: 12,
  glitchChance: 0.12
};

const HAUNT_FALLBACK_CONTENT = {
  name: "Violet Echo",
  words: {
    omen: ["Asche", "Kälte", "Stille", "Violett", "Rabenfedern"],
    noun: ["eine Tür", "ein Echo", "ein Kabel", "ein Riss", "ein Zeichen"]
  },
  events: [
    "Der Cursor flackert.",
    "Ein kaltes Rauschen zieht durch die Leitung.",
    "Zwischen den Zeilen wabert ein Echo.",
    "Die Shell riecht plötzlich nach Ozon."
  ],
  haunting: {
    hauntTemplates: [
      "…{{omen}} klebt an deinem Prompt.",
      "Ein Echo hängt zwischen den Zeilen.",
      "Dein Terminal atmet {{noun}}.",
      "Etwas sieht dich durch den Bildschirm, {{user}}."
    ]
  }
};

let CURRENT_HAUNTING = null;
let HAUNT_CONTENT_CACHE = null;
let HAUNT_TIMER = null;
let HAUNT_BOOTSTRAPPED = false;
let HAUNT_LAST_USER = null;

function hauntNow() {
  return Date.now();
}

function hauntClampIntensity(v) {
  return Math.max(0.05, Math.min(1, v));
}

function hauntStorageKey(user = getUserName()) {
  return `${HAUNT_STORAGE_PREFIX}${user || "guest"}`;
}

function hauntCooldownKey(user = getUserName()) {
  return `${HAUNT_COOLDOWN_PREFIX}${user || "guest"}`;
}

function hauntReadCooldown() {
  try {
    return Number(localStorage.getItem(hauntCooldownKey())) || 0;
  } catch (e) {
    return 0;
  }
}

function hauntSetCooldown(hours = HAUNT_DEFAULTS.cooldownHours) {
  const until = hauntNow() + Math.max(1, hours) * 3600 * 1000;
  try {
    localStorage.setItem(hauntCooldownKey(), String(until));
  } catch (e) {
    // ignore
  }
}

function hauntCooldownActive() {
  const until = hauntReadCooldown();
  return until && hauntNow() < until;
}

function hauntLoadFromStorage() {
  try {
    const raw = localStorage.getItem(hauntStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const now = hauntNow();
    if (parsed.endsAt && now >= parsed.endsAt) {
      localStorage.removeItem(hauntStorageKey());
      return null;
    }
    parsed.intensity = hauntClampIntensity(parsed.intensity || 0.3);
    return parsed;
  } catch (e) {
    return null;
  }
}

function hauntSaveToStorage(haunting) {
  if (!haunting) return;
  try {
    localStorage.setItem(hauntStorageKey(), JSON.stringify(haunting));
  } catch (e) {
    // ignore
  }
}

async function hauntLoadContent() {
  if (HAUNT_CONTENT_CACHE) return HAUNT_CONTENT_CACHE;
  try {
    const res = await fetch(HAUNT_SPIRIT_URL);
    const data = await res.json();
    if (data && data.templates) {
      HAUNT_CONTENT_CACHE = data;
      return data;
    }
  } catch (e) {
    console.warn("Haunting Content Fallback genutzt:", e.message);
  }
  HAUNT_CONTENT_CACHE = HAUNT_FALLBACK_CONTENT;
  return HAUNT_CONTENT_CACHE;
}

function hauntConfig(content) {
  return {
    ...HAUNT_DEFAULTS,
    ...(content?.haunting || {})
  };
}

function hauntPick(list = [], salt = 0, seed = Math.random()) {
  if (!list.length) return "";
  const r = Math.abs(Math.sin(seed + salt)) % 1;
  const idx = Math.floor(r * list.length);
  return list[idx] || list[0];
}

function hauntRender(template = "", { words = {}, user = getUserName() } = {}) {
  const now = new Date();
  const ctx = {
    user,
    time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
  };
  return String(template).replace(/\{\{(.*?)\}\}/g, (_, keyRaw) => {
    const key = keyRaw.trim();
    if (key === "user" || key === "time") {
      return ctx[key];
    }
    if (Array.isArray(words[key])) {
      return hauntPick(words[key], key.length + now.getSeconds());
    }
    return "";
  });
}

function hauntIntervalMs(haunting, cfg) {
  const min = Math.max(5, cfg.intervalSecondsMin || HAUNT_DEFAULTS.intervalSecondsMin) * 1000;
  const max = Math.max(min + 1000, cfg.intervalSecondsMax || HAUNT_DEFAULTS.intervalSecondsMax) * 1000;
  const intensity = hauntClampIntensity(haunting.intensity || 0.35);
  const base = min + (1 - intensity) * (max - min);
  const jitter = (Math.random() - 0.5) * base * 0.3;
  return Math.max(min, Math.min(max, base + jitter));
}

function hauntMakeId() {
  const rand = Math.random().toString(36).slice(-6).toUpperCase();
  return `H-${rand}`;
}

function hauntHumanDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0s";
  const totalSec = Math.round(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, "0")}m`;
  return `${mins}m`;
}

function getActiveHaunting() {
  const now = hauntNow();
  if (CURRENT_HAUNTING && CURRENT_HAUNTING.endsAt && now >= CURRENT_HAUNTING.endsAt) {
    CURRENT_HAUNTING = null;
  }
  if (CURRENT_HAUNTING) return CURRENT_HAUNTING;
  const loaded = hauntLoadFromStorage();
  if (loaded) {
    CURRENT_HAUNTING = loaded;
  }
  return CURRENT_HAUNTING;
}

function hauntScheduleTick(forceDelayMs = null) {
  if (HAUNT_TIMER) {
    clearTimeout(HAUNT_TIMER);
    HAUNT_TIMER = null;
  }

  const haunting = getActiveHaunting();
  if (!haunting || haunting.banished) return;

  const delay = forceDelayMs ?? Math.max(2000, (haunting.nextHauntAt || hauntNow()) - hauntNow());
  HAUNT_TIMER = setTimeout(async () => {
    await hauntTick();
  }, delay);
}

async function hauntTick() {
  const haunting = getActiveHaunting();
  if (!haunting) return;

  const now = hauntNow();
  const content = await hauntLoadContent();
  const cfg = hauntConfig(content);

  if (haunting.endsAt && now >= haunting.endsAt) {
    await stopHaunting("expired", { silent: true });
    return;
  }

  if (now >= (haunting.nextHauntAt || 0)) {
    await printHauntLine(haunting, content, cfg);
    haunting.lastMessageAt = now;
    haunting.nextHauntAt = now + hauntIntervalMs(haunting, cfg);
    hauntSaveToStorage(haunting);
    CURRENT_HAUNTING = haunting;
  }

  hauntScheduleTick();
}

function hauntMaybeFlickerWatermark() {
  if (!watermarkEl) return;
  watermarkEl.classList.add("haunt-flicker");
  setTimeout(() => watermarkEl.classList.remove("haunt-flicker"), 1400);
}

async function printHauntLine(haunting, content, cfg) {
  const words = content?.words || HAUNT_FALLBACK_CONTENT.words;
  const templates = content?.haunting?.hauntTemplates || content?.hauntTemplates || content?.events || HAUNT_FALLBACK_CONTENT.haunting.hauntTemplates;
  const template = hauntPick(templates, (haunting.lastMessageAt || hauntNow()) / 1000, hauntNow());
  const rendered = hauntRender(template, { words });
  const lines = [rendered];

  const glitchChance = cfg.glitchChance ?? HAUNT_DEFAULTS.glitchChance;
  if (Math.random() < glitchChance) {
    const glitchLine = hauntRender(hauntPick(content?.events || HAUNT_FALLBACK_CONTENT.events, 7, hauntNow()), { words });
    lines.push(glitchLine);
  }

  printLines(lines, "haunt-line");
  hauntMaybeFlickerWatermark();
}

async function startHaunting(spiritId = "violet_echo", options = {}) {
  const content = await hauntLoadContent();
  const cfg = hauntConfig(content);
  const now = hauntNow();
  const ttlHours = (cfg.ttlHoursMin || 2) + Math.random() * Math.max(0, (cfg.ttlHoursMax || 48) - (cfg.ttlHoursMin || 2));
  const intensity = hauntClampIntensity(options.intensity ?? (0.25 + Math.random() * 0.45));

  const haunting = {
    id: hauntMakeId(),
    spiritId,
    name: content?.name || "Violet Echo",
    startedAt: now,
    endsAt: now + ttlHours * 3600 * 1000,
    intensity,
    nextHauntAt: now + hauntIntervalMs({ intensity }, cfg),
    lastMessageAt: now,
    tags: ["glitch", "omens"],
    banished: false
  };

  CURRENT_HAUNTING = haunting;
  hauntSaveToStorage(haunting);

  printLines([
    "Ein kühles Echo heftet sich an deine Shell.",
    `Der Geist ${haunting.name} wartet zwischen den Prompts.`,
    ""
  ], "dim");

  hauntScheduleTick(2500);
  return haunting;
}

async function maybeStartHaunting(reason = "random", context = {}) {
  if (getActiveHaunting()) return null;
  if (hauntCooldownActive()) return null;

  const content = await hauntLoadContent();
  const cfg = hauntConfig(content);
  const reasonMap = {
    boot: cfg.baseChanceBoot ?? HAUNT_DEFAULTS.baseChanceBoot,
    scan: cfg.baseChanceScan ?? HAUNT_DEFAULTS.baseChanceScan,
    cat: cfg.baseChanceCat ?? HAUNT_DEFAULTS.baseChanceCat,
    listen: cfg.baseChanceListen ?? HAUNT_DEFAULTS.baseChanceListen,
    random: 0.01
  };

  let chance = reasonMap[reason] ?? reasonMap.random;

  if (reason === "cat" && context.cursed) {
    chance += 0.02;
  }
  if (reason === "scan" && context.depth) {
    chance += 0.01;
  }
  if (reason === "listen") {
    chance += 0.0025;
  }

  chance = Math.min(0.25, Math.max(0, chance + (Math.random() * 0.01)));
  if (Math.random() < chance) {
    return await startHaunting("violet_echo", { intensity: 0.2 + Math.random() * 0.5 });
  }
  return null;
}

async function stopHaunting(reason = "ended", { banished = false, silent = false } = {}) {
  const active = getActiveHaunting();
  if (!active) return null;

  const content = await hauntLoadContent();
  const cfg = hauntConfig(content);

  CURRENT_HAUNTING = null;
  try {
    localStorage.removeItem(hauntStorageKey());
  } catch (e) {
    // ignore
  }

  if (HAUNT_TIMER) {
    clearTimeout(HAUNT_TIMER);
    HAUNT_TIMER = null;
  }

  hauntSetCooldown(cfg.cooldownHours || HAUNT_DEFAULTS.cooldownHours);

  if (!silent) {
    if (banished) {
      printLines([
        "Die Leitung wird warm. Ein letzter Riss, dann Stille.",
        `Geist ${active.name} wurde gebändigt (${reason}).`,
        ""
      ], "success");
    } else {
      printLines([
        `Spuk von ${active.name} endet (${reason}).`,
        "Die Schatten ziehen sich zurück.",
        ""
      ], "dim");
    }
  }
  return active;
}

function bumpHauntingIntensity(delta = 0.05) {
  const active = getActiveHaunting();
  if (!active) return null;
  active.intensity = hauntClampIntensity((active.intensity || 0.3) + delta);
  active.nextHauntAt = hauntNow() + hauntIntervalMs(active, hauntConfig(HAUNT_CONTENT_CACHE || {}));
  hauntSaveToStorage(active);
  CURRENT_HAUNTING = active;
  hauntScheduleTick();
  return active;
}

async function hauntCalm() {
  const active = getActiveHaunting();
  if (!active) {
    printLines(["Kein Spuk aktiv."], "dim");
    return;
  }
  active.intensity = hauntClampIntensity(active.intensity - 0.07);
  active.nextHauntAt = hauntNow() + hauntIntervalMs(active, hauntConfig(HAUNT_CONTENT_CACHE || {}));
  hauntSaveToStorage(active);
  CURRENT_HAUNTING = active;
  printLines(["Du flüsterst Mantras. Die Präsenz schwächt sich minimal.", ""], "dim");
  hauntScheduleTick();
}

function hauntStatusLines() {
  const active = getActiveHaunting();
  const cooldownUntil = hauntReadCooldown();
  const cooldownLeft = cooldownUntil && hauntNow() < cooldownUntil
    ? hauntHumanDuration(cooldownUntil - hauntNow())
    : null;

  if (!active) {
    const lines = ["Haunt-Status: ruhig."];
    if (cooldownLeft) {
      lines.push(`Cooldown aktiv (${cooldownLeft}).`);
    }
    lines.push("Nutze 'scan' oder wage eine Séance, um das Schicksal zu reizen.", "");
    return lines;
  }

  const remaining = hauntHumanDuration((active.endsAt || hauntNow()) - hauntNow());
  const nextIn = hauntHumanDuration((active.nextHauntAt || hauntNow()) - hauntNow());
  const lines = [
    "Status: HAUNTED",
    `Geist: ${active.name || active.spiritId}`,
    `Intensität: ${(active.intensity || 0).toFixed(2)}`,
    `Ende in: ${remaining}`,
    `Nächster Spuk: ~${nextIn}`,
    "Hinweis: Starte eine Séance und nutze 'seance banish'.",
    ""
  ];
  return lines;
}

async function handleHauntCommand(args = []) {
  const sub = (args[0] || "").toLowerCase();

  if (!sub || sub === "status") {
    printLines(hauntStatusLines(), "haunt-line");
    return;
  }

  if (sub === "calm") {
    await hauntCalm();
    return;
  }

  if (sub === "clear") {
    await stopHaunting("cleared", { silent: true });
    printLines(["Haunting-Daten gelöscht."], "dim");
    return;
  }

  printLines([
    "Haunt-Befehle:",
    "  haunt           - Status anzeigen",
    "  haunt calm      - Intensität minimal senken",
    "  haunt clear     - Spuk manuell löschen (lokal)",
    "",
    "Starte eine Séance und nutze 'seance banish', um den Geist zu vertreiben.",
    ""
  ], "dim");
}

async function hauntMaybeCorruptMotd(text) {
  const active = getActiveHaunting();
  if (!active) return text;
  const content = await hauntLoadContent();
  const templates = content?.haunting?.hauntTemplates || content?.templates?.default || [];
  if (!templates.length) return text;
  if (Math.random() < 0.4) {
    return hauntRender(hauntPick(templates, text?.length || 3, hauntNow()), { words: content.words || HAUNT_FALLBACK_CONTENT.words });
  }
  return text;
}

async function bootstrapHaunting(reason = "boot") {
  const user = getUserName();
  if (HAUNT_BOOTSTRAPPED && HAUNT_LAST_USER === user) return;
  const userChanged = HAUNT_LAST_USER && HAUNT_LAST_USER !== user;
  HAUNT_BOOTSTRAPPED = true;
  HAUNT_LAST_USER = user;
  if (userChanged) {
    CURRENT_HAUNTING = null;
  }
  const existing = getActiveHaunting();
  if (existing) {
    printLines([`Etwas blieb zurück: ${existing.name} spukt weiter.`, ""], "dim");
    hauntScheduleTick(800);
    return;
  }
  await maybeStartHaunting(reason);
  hauntScheduleTick();
}
