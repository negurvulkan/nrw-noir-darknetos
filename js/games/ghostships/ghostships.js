// ---------------------------------------------------------
// MINIGAME: Ghostships – Multiplayer Battleship mit Haunted-Events
// ---------------------------------------------------------

const GS_CLIENT = typeof GhostshipsEngine !== "undefined"
  ? GhostshipsEngine.createClient()
  : null;

let GS_STATE = {
  active: false,
  lastLog: 0
};

let GS_FLAVOR = null;

function gsEnsureClient() {
  if (!GS_CLIENT) {
    throw new Error("Ghostships Engine nicht geladen.");
  }
  return GS_CLIENT;
}

function gsResetState() {
  const client = GS_CLIENT;
  if (client) {
    client.reset();
  }
  GS_STATE = {
    active: false,
    lastLog: 0
  };
}

async function gsLoadFlavor() {
  if (GS_FLAVOR) return GS_FLAVOR;
  try {
    const res = await fetch("content/games/ghostships_flavor.json");
    const data = await res.json();
    GS_FLAVOR = data || {};
  } catch (e) {
    GS_FLAVOR = {};
  }
  return GS_FLAVOR;
}

function gsBoardLetters(size) {
  return size === 10
    ? ["A","B","C","D","E","F","G","H","I","J"]
    : ["A","B","C","D","E","F","G","H"];
}

function gsRenderGrid(size, mapper) {
  const letters = gsBoardLetters(size);
  const header = ["   " + letters.join(" ")];
  const lines = [];
  for (let r = 1; r <= size; r++) {
    const row = [String(r).padStart(2, " ")];
    for (let c = 0; c < size; c++) {
      const pos = `${letters[c]}${r}`;
      row.push(mapper(pos));
    }
    lines.push(row.join(" "));
  }
  return header.concat(lines).concat([""]);
}

function gsRenderRadar(match) {
  const size = match.boardSize;
  const radar = match.boards?.radar || { hits: [], misses: [], pending: [], fogged: [] };
  const hits = new Set(radar.hits || []);
  const misses = new Set(radar.misses || []);
  const pending = new Set(radar.pending || []);
  const fogged = new Set(radar.fogged || []);

  return gsRenderGrid(size, pos => {
    if (pending.has(pos)) return "?";
    if (hits.has(pos)) return "X";
    if (misses.has(pos)) return "~";
    if (fogged.has(pos)) return "?";
    return "·";
  });
}

function gsRenderOwnBoard(match) {
  const size = match.boardSize;
  const own = match.boards?.own || { ships: [], fogged: [] };
  const shipCells = new Set();
  const hitCells = new Set();
  (own.ships || []).forEach(ship => {
    (ship.cells || []).forEach(cell => shipCells.add(cell));
    (ship.hits || []).forEach(h => hitCells.add(h));
  });
  const fogged = new Set(own.fogged || []);

  return gsRenderGrid(size, pos => {
    if (hitCells.has(pos)) return "X";
    if (shipCells.has(pos)) return "#";
    if (fogged.has(pos)) return "?";
    return "·";
  });
}

function gsPrintMatchStatus(match) {
  const lines = [];
  lines.push(`Match ${match.id} (${match.boardSize}x${match.boardSize})`);
  lines.push(`Phase: ${match.phase}`);
  if (match.phase === "active") {
    lines.push(`Am Zug: ${match.turn === match.you ? "Du" : "Gegner"}`);
  }
  if (match.winner) {
    lines.push(`Gewinner: ${match.winner === match.you ? "Du" : "Gegner"}`);
  }
  lines.push(
    `Du spielst als ${match.you} (${match.players?.you?.user || "?"}), Gegner: ${match.players?.opponent?.user || "?"}`
  );
  lines.push(
    `Bereit: Du=${match.ready?.you ? "✔" : "…"} | Gegner=${match.ready?.opponent ? "✔" : "…"}`
  );
  lines.push("");
  printLines(lines, "dim");
}

function gsPrintBoards(match) {
  printLines(["Radar (Schüsse):"], "dim");
  printLines(gsRenderRadar(match));
  printLines(["Eigene Flotte:"], "dim");
  printLines(gsRenderOwnBoard(match));
}

function gsFormatLogEntry(entry) {
  switch (entry.type) {
    case "system":
      return entry.text || "System.";
    case "fire":
      if (entry.fogged) return `Schuss ${entry.pos}: Der Nebel verschluckt das Echo…`;
      if (entry.sunk) return `Schuss ${entry.pos}: versenkt!`;
      return `Schuss ${entry.pos}: ${entry.result || "treffer?"}`;
    case "decay":
      return "Ein Rumpf knarzt im Nebel – ein Segment zerfällt.";
    case "manifest":
      return `Im Dunkel manifestiert sich ein ${entry.length === 2 ? "Echo-Schiff" : "Wisp"}.`;
    case "fog":
      return `Nebel legt sich über ${entry.count || 1} Feld(er).`;
    case "fog_reveal":
      if (entry.sunk) return `Der Nebel weicht: ${entry.pos} war ein Versenker.`;
      return `Der Nebel weicht: ${entry.pos} war ${entry.result}.`;
    default:
      return JSON.stringify(entry);
  }
}

function gsPrintLog(match, limit = 10) {
  const log = Array.isArray(match.log) ? match.log : [];
  const recent = log.slice(-limit);
  const lines = ["Letzte Log-Einträge:", "---------------------"];
  recent.forEach(entry => {
    const ts = entry.ts ? new Date(entry.ts * 1000) : null;
    const t = ts ? ts.toLocaleTimeString() : "";
    lines.push(`${t} ${gsFormatLogEntry(entry)}`);
  });
  lines.push("");
  printLines(lines);
}

function gsIsMyTurn(match) {
  return match.phase === "active" && match.turn === match.you;
}

async function gsFetchState({ announce = true } = {}) {
  const client = gsEnsureClient();
  if (!client.hasSession()) return null;
  const prevState = client.getState();
  const lastSeenLog = prevState.lastLogTs || 0;
  const match = await client.fetchState();
  if (!match) return null;

  GS_STATE.active = ["setup", "active"].includes(match.phase);
  GS_STATE.lastLog = match.log?.length || 0;

  if (announce) {
    gsPrintMatchStatus(match);
  }
  if (announce || gsIsMyTurn(match)) {
    gsPrintBoards(match);
  }
  const newLogs = (match.log || []).filter(entry => (entry.ts || 0) > lastSeenLog);
  if (match.log?.length && (announce || newLogs.length)) {
    gsPrintLog(match, 6);
  }
  if (match.phase === "finished") {
    gsResetState();
  }
  return match;
}

async function gsCreate(size) {
  const client = gsEnsureClient();
  const user = getUserName();
  const match = await client.createMatch(size || 8, user);
  GS_STATE.active = true;
  printLines([
    `Ghostships-Match erstellt: ${match?.id || "(?)"}`,
    "Lade Freund:innen ein mit: gs invite <user>",
    ""
  ], "success");
  await gsFetchState();
}

async function gsJoin(matchId) {
  const client = gsEnsureClient();
  const user = getUserName();
  const match = await client.joinMatch(matchId, user);
  GS_STATE.active = true;
  printLines([`Match ${match?.id || matchId} beigetreten.`, ""], "success");
  await gsFetchState();
}

async function gsInvite(user) {
  const state = GS_CLIENT?.getState();
  if (!state?.matchId) {
    printLines(["Kein aktives Match. Erstelle eines mit 'gs create'.", ""], "error");
    return;
  }
  if (typeof chatSendMessage === "function") {
    await chatSendMessage(user, `Join meine Ghostships-Lobby: ${state.matchId}`);
  } else {
    printLines(["Chat-Modul nicht geladen, Einladung nur manuell möglich.", ""], "dim");
  }
}

async function gsPlace(ship, pos, dir) {
  const client = gsEnsureClient();
  if (!client.hasSession()) {
    printLines(["Kein Match aktiv. 'gs create' oder 'gs join <ID>'.", ""], "error");
    return;
  }
  await client.placeShip(ship, pos, dir || "h");
  printLines([`Schiff ${ship} gesetzt bei ${pos} (${dir || "h"}).`, ""], "success");
  await gsFetchState({ announce: false });
}

async function gsAuto() {
  await gsEnsureClient().autoPlace();
  printLines(["Automatische Platzierung abgeschlossen.", ""], "success");
  await gsFetchState({ announce: false });
}

async function gsReady() {
  await gsEnsureClient().setReady();
  printLines(["Du bist bereit. Warte auf den Gegner…", ""], "success");
  await gsFetchState({ announce: false });
}

async function gsFire(pos) {
  await gsEnsureClient().fire(pos);
  printLines([`Feuer auf ${pos} abgegeben.`, ""], "success");
  await gsFetchState({ announce: false });
}

async function gsLeave() {
  const client = gsEnsureClient();
  if (!client.hasSession()) {
    printLines(["Kein Match aktiv.", ""], "dim");
    return;
  }
  await client.leaveMatch();
  gsResetState();
  printLines(["Match verlassen.", ""], "dim");
}

async function gsRematch() {
  const client = gsEnsureClient();
  if (!client.hasSession()) {
    printLines(["Kein beendetes Match vorhanden.", ""], "error");
    return;
  }
  await client.rematch();
  printLines(["Rematch gestartet. Platziere deine Flotte.", ""], "success");
  await gsFetchState();
}

async function gsHandleCommand(args = []) {
  const sub = (args[0] || "").toLowerCase();
  if (!sub || sub === "help") {
    printLines([
      "Ghostships Befehle:",
      "  gs help                  - diese Hilfe",
      "  gs create [8|10]         - Lobby erstellen",
      "  gs join <MATCHID>        - Lobby beitreten",
      "  gs invite <user>         - per Chat einladen",
      "  gs status                - Matchstatus + Boards",
      "  gs place <ship> <pos> <h|v> - Schiff setzen (wraith3, barge2, skiff2, relic1)",
      "  gs auto                  - automatische Platzierung",
      "  gs ready                 - Bereitschaft melden",
      "  gs fire <pos>            - Schuss abgeben (z.B. D5)",
      "  gs board                 - eigenes Board anzeigen",
      "  gs radar                 - Radar anzeigen",
      "  gs log [n]               - Logeinträge",
      "  gs leave                 - Match verlassen/aufgeben",
      "  gs rematch               - neues Match mit gleicher Lobby",
      "",
      "Quickshot: Im aktiven Match reicht 'D5' als Eingabe.",
      ""
    ]);
    return;
  }

  try {
    if (sub === "create") {
      await gsCreate(parseInt(args[1] || "8", 10));
      return;
    }
    if (sub === "join") {
      if (!args[1]) {
        printLines(["Verwendung: gs join <MATCHID>", ""], "error");
        return;
      }
      await gsJoin(args[1]);
      return;
    }
    if (sub === "invite") {
      await gsInvite(args[1]);
      return;
    }
    if (sub === "status") {
      await gsFetchState();
      return;
    }
    if (sub === "place") {
      if (args.length < 3) {
        printLines(["Verwendung: gs place <ship> <pos> <h|v>", ""], "error");
        return;
      }
      await gsPlace(args[1], args[2], args[3] || "h");
      return;
    }
    if (sub === "auto") {
      await gsAuto();
      return;
    }
    if (sub === "ready") {
      await gsReady();
      return;
    }
    if (sub === "fire") {
      if (!args[1]) {
        printLines(["Verwendung: gs fire <pos>", ""], "error");
        return;
      }
      await gsFire(args[1]);
      return;
    }
    if (sub === "board" || sub === "radar") {
      const match = await gsFetchState({ announce: false });
      if (match) {
        if (sub === "board") {
          printLines(gsRenderOwnBoard(match));
        } else {
          printLines(gsRenderRadar(match));
        }
      }
      return;
    }
    if (sub === "log") {
      const limit = parseInt(args[1] || "10", 10);
      const match = await gsFetchState({ announce: false });
      if (match) {
        gsPrintLog(match, limit);
      }
      return;
    }
    if (sub === "leave") {
      await gsLeave();
      return;
    }
    if (sub === "rematch") {
      await gsRematch();
      return;
    }

    printLines([`Unbekannter gs-Befehl: '${sub}'. Tippe 'gs help'.`, ""], "error");
  } catch (e) {
    printLines([String(e.message || e), ""], "error");
  }
}

async function gsHandleQuickshot(coord) {
  if (!GS_STATE.active) return false;
  try {
    await gsFire(coord);
    return true;
  } catch (e) {
    printLines([String(e.message || e), ""], "error");
    return false;
  }
}

// ---------------------------------------------------------
// Registrierung im Game Hub
// ---------------------------------------------------------
if (GS_CLIENT) {
  GS_CLIENT.onState(({ match, prev }) => {
    if (!match) return;
    const justFinished = prev?.phase !== "finished" && match.phase === "finished";
    const wasTurn = prev?.turn && prev.turn === prev.you;
    const nowTurn = gsIsMyTurn(match);
    if (justFinished || (!wasTurn && nowTurn)) {
      gsPrintMatchStatus(match);
      gsPrintBoards(match);
      if (match.log?.length) {
        gsPrintLog(match, 6);
      }
    }
  });
}

if (typeof registerGame === "function") {
  registerGame("gs", {
    name: "Ghostships",
    description: "Versenke geisterhafte Wracks im Darknetz-Meer.",
    start: () => gsHandleCommand(["help"]),
    help: () => gsHandleCommand(["help"])
  });
}

if (typeof registerCommand === "function") {
  registerCommand("gs", gsHandleCommand);
}
