// ---------------------------------------------------------
// CORE – DOM-Referenzen, State, Utils, Pfad-Logik
// ---------------------------------------------------------

const outputEl = document.getElementById("output");
const inputEl  = document.getElementById("cmd-input");
const watermarkEl = document.getElementById("watermark");

// virtueller Zustand
let FILE_INDEX = {};   // command -> meta
let FS_NODES   = {};   // path    -> meta
let CURRENT_DIR = [];  // Array von Segmenten, [] = root "/"

// Benutzer / Login
const USERNAME_KEY = "darknetz-username";
let USER_NAME  = null;
let LOGIN_MODE = false;

const BUILTIN_COMMANDS = [
  "help",
  "clear",
  "list",
  "ls",
  "cd",
  "pwd",
  "cat",
  "tree",
  "stat",
  "scan",
  "chat",
  "game",
  "games",
  "ttt",
  "seance"
];

// ---------------------------------------------------------
// Utils
// ---------------------------------------------------------
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// MOTD laden
async function loadMotd() {
  try {
    const res = await fetch("content/motd.json");
    const data = await res.json();
    const arr = data.entries || [];
    if (!arr.length) return null;
    const msg = arr[Math.floor(Math.random() * arr.length)];
    return msg;
  } catch {
    return null;
  }
}

// Ausgabe
function printLines(lines, cls) {
  lines.forEach(text => {
    const p = document.createElement("div");
    p.className = "line" + (cls ? " " + cls : "");
    p.textContent = text;
    outputEl.appendChild(p);
  });
  outputEl.scrollTop = outputEl.scrollHeight;
}

// Path-Utils
function segmentsToPath(segments) {
  if (!segments || segments.length === 0) return "/";
  return "/" + segments.join("/");
}

function normalizePathSegments(baseSegments, inputPath) {
  // inputPath: z.B. "core/about", "../secret", "/secret/rituals"
  let segs = [];
  if (!inputPath || inputPath.trim() === "" || inputPath === ".") {
    segs = [...baseSegments];
  } else if (inputPath.startsWith("/")) {
    segs = [];
    const parts = inputPath.split("/").filter(Boolean);
    segs.push(...parts);
  } else {
    segs = [...baseSegments];
    const parts = inputPath.split("/").filter(Boolean);
    for (const p of parts) {
      if (p === ".") continue;
      if (p === "..") {
        segs.pop();
      } else {
        segs.push(p);
      }
    }
  }
  return segs;
}

// prüft, ob es mindestens eine Datei mit diesem Pfad-Prefix gibt
function dirExists(dirSegments) {
  const dirLen = dirSegments.length;
  const keys = Object.keys(FS_NODES);
  if (dirLen === 0) {
    return keys.length > 0;
  }
  return keys.some(path => {
    const segs = path.split("/");
    if (segs.length < dirLen) return false;
    for (let i = 0; i < dirLen; i++) {
      if (segs[i] !== dirSegments[i]) return false;
    }
    return true;
  });
}

// Kinder eines Verzeichnisses: { dirs: [name], files: [{name,meta}] }
function getChildrenOfDir(dirSegments) {
  const dirLen = dirSegments.length;
  const keys = Object.keys(FS_NODES);
  const dirSet = new Set();
  const files = [];

  keys.forEach(path => {
    const segs = path.split("/");
    if (dirLen === 0) {
      if (segs.length === 1) {
        files.push({ name: segs[0], meta: FS_NODES[path] });
      } else if (segs.length > 1) {
        dirSet.add(segs[0]);
      }
      return;
    }

    if (segs.length < dirLen) return;
    for (let i = 0; i < dirLen; i++) {
      if (segs[i] !== dirSegments[i]) return;
    }

    if (segs.length === dirLen + 1) {
      files.push({ name: segs[dirLen], meta: FS_NODES[path] });
    } else if (segs.length > dirLen + 1) {
      dirSet.add(segs[dirLen]);
    }
  });

  return {
    dirs: Array.from(dirSet),
    files
  };
}

function getUserName() {
  return USER_NAME || "guest";
}

function updatePromptLabel() {
  const label = document.getElementById("prompt-label");
  if (!label) return;
  // Pfad lassen wir im Output, Label ist nur „grober Prompt“
  label.textContent = `${getUserName()}@darknet-nrw-noir:~$`;
}

function setUserName(name) {
  USER_NAME = name;
  try {
    localStorage.setItem(USERNAME_KEY, name);
  } catch (e) {
    // ignore
  }
  updatePromptLabel();
}
