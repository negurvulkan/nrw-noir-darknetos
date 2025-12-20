// ---------------------------------------------------------
// MINIGAME: TicTacToe (TTT) – AI mit Schwierigkeitsgraden
// ---------------------------------------------------------

let TTT_ACTIVE = false;
let TTT_BOARD  = Array(9).fill(null); // 0–8

const TTT_USER = "X";
const TTT_AI   = "O";

let TTT_BOARD_CONTAINER = null; // fester Bereich im Output
let TTT_MODE = "normal";        // "easy" | "normal" | "hard"

// Session-Tracking
let TTT_SESSION = "idle"; // "idle" | "offline" | "online"

const TTT_ONLINE_API = "content-builder/api/ttt-multiplayer.php";
const TTT_ONLINE = {
  active: false,
  gameId: null,
  token: null,
  player: null,
  opponent: null,
  opponentName: null,
  yourName: null,
  status: "idle", // waiting | active | finished | abandoned
  turn: null,
  pollTimer: null,
  lastUpdate: 0,
  winner: null
};
let TTT_ONLINE_POLL_ERROR = null;

// ---------------------------------------------------------
// Helper
// ---------------------------------------------------------

function tttReset({ keepSession = false } = {}) {
  TTT_BOARD = Array(9).fill(null);
  TTT_ACTIVE = false;
  if (!keepSession) {
    TTT_SESSION = "idle";
  }
}

function tttUserLabel() {
  if (typeof getUserName === "function") {
    return getUserName();
  }
  return "Player";
}

// gibt nur die Textzeilen zurück
function tttGetBoardLines() {
  const cells = TTT_BOARD.map((v, i) => (v ? v : String(i + 1)));

  const lines = [];
  lines.push(` ${cells[0]} | ${cells[1]} | ${cells[2]}`);
  lines.push("---+---+---");
  lines.push(` ${cells[3]} | ${cells[4]} | ${cells[5]}`);
  lines.push("---+---+---");
  lines.push(` ${cells[6]} | ${cells[7]} | ${cells[8]}`);
  lines.push("");
  return lines;
}

// schreibt das Board in einen festen Container (wird überschrieben statt gestapelt)
function tttPrintBoard() {
  if (!TTT_BOARD_CONTAINER || !TTT_BOARD_CONTAINER.isConnected) {
    TTT_BOARD_CONTAINER = document.createElement("div");
    TTT_BOARD_CONTAINER.className = "ttt-board";
    outputEl.appendChild(TTT_BOARD_CONTAINER);
  }

  TTT_BOARD_CONTAINER.innerHTML = "";

  const lines = tttGetBoardLines();
  lines.forEach(text => {
    const div = document.createElement("div");
    div.className = "line ttt-line";
    div.textContent = text;
    TTT_BOARD_CONTAINER.appendChild(div);
  });

  outputEl.scrollTop = outputEl.scrollHeight;
}

function tttCheckWinner(board) {
  const wins = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

  for (const [a,b,c] of wins) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]; // "X" oder "O"
    }
  }

  if (board.every(v => v !== null)) {
    return "draw";
  }
  return null;
}

// ---------------------------------------------------------
// Online Multiplayer
// ---------------------------------------------------------

function tttStopOnlinePolling() {
  if (TTT_ONLINE.pollTimer) {
    clearTimeout(TTT_ONLINE.pollTimer);
    TTT_ONLINE.pollTimer = null;
  }
}

function tttOnlineCleanup({ resetBoard = false } = {}) {
  tttStopOnlinePolling();
  TTT_ONLINE.active = false;
  TTT_ONLINE.gameId = null;
  TTT_ONLINE.token = null;
  TTT_ONLINE.player = null;
  TTT_ONLINE.opponent = null;
  TTT_ONLINE.opponentName = null;
  TTT_ONLINE.yourName = null;
  TTT_ONLINE.status = "idle";
  TTT_ONLINE.turn = null;
  TTT_ONLINE.lastUpdate = 0;
  TTT_ONLINE.winner = null;
  TTT_ONLINE_POLL_ERROR = null;
  if (resetBoard) {
    tttReset();
  } else {
    TTT_ACTIVE = false;
    TTT_SESSION = "idle";
  }
}

async function tttOnlineRequest(action, payload = {}) {
  const res = await fetch(TTT_ONLINE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload })
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error("Ungültige Antwort vom Online-Server.");
  }

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Serverfehler (${res.status})`);
  }
  return data;
}

function tttOnlineStatusLines() {
  if (!TTT_ONLINE.active && !TTT_ONLINE.gameId) {
    return [
      "Kein Online-Spiel aktiv.",
      "Starte eines mit 'ttt online host' oder tritt bei mit 'ttt online join <CODE>'.",
      ""
    ];
  }

  const lines = [
    `Online-Spiel ${TTT_ONLINE.gameId || "(unbekannt)"}:`,
    `  Du spielst '${TTT_ONLINE.player || "?"}'${TTT_ONLINE.yourName ? ` (${TTT_ONLINE.yourName})` : ""}.`
  ];

  if (TTT_ONLINE.opponent) {
    lines.push(`  Gegner: '${TTT_ONLINE.opponent}'${TTT_ONLINE.opponentName ? ` (${TTT_ONLINE.opponentName})` : ""}`);
  } else {
    lines.push("  Gegner: noch niemand beigetreten.");
  }

  lines.push(`  Status: ${TTT_ONLINE.status}`);

  if (TTT_ONLINE.status === "active") {
    if (TTT_ONLINE.turn === TTT_ONLINE.player) {
      lines.push("  Du bist dran.");
    } else if (TTT_ONLINE.turn) {
      lines.push("  Dein Gegner ist dran.");
    }
  } else if (TTT_ONLINE.status === "waiting") {
    lines.push("  Warte auf einen zweiten Spieler (teile den Code).");
  }

  lines.push("");
  return lines;
}

function tttApplyOnlineState(game, { announce = true, reason = "" } = {}) {
  if (!game) return;

  const prevStatus = TTT_ONLINE.status;
  const prevTurn = TTT_ONLINE.turn;
  const prevBoardSig = JSON.stringify(TTT_BOARD);

  TTT_SESSION = "online";

  TTT_ONLINE.active = ["waiting", "active"].includes(game.status);
  TTT_ONLINE.gameId = game.id || TTT_ONLINE.gameId;
  TTT_ONLINE.player = game.you || TTT_ONLINE.player || "X";
  TTT_ONLINE.opponent = game.opponent || (TTT_ONLINE.player === "X" ? "O" : "X");
  TTT_ONLINE.opponentName = game.opponent_name || TTT_ONLINE.opponentName || null;
  TTT_ONLINE.yourName = game.your_name || TTT_ONLINE.yourName || null;
  TTT_ONLINE.status = game.status || "waiting";
  TTT_ONLINE.turn = game.turn || null;
  TTT_ONLINE.lastUpdate = game.updated_at || Date.now();
  TTT_ONLINE.winner = game.winner || null;

  TTT_BOARD = Array(9).fill(null);
  (game.board || []).slice(0, 9).forEach((v, i) => {
    TTT_BOARD[i] = v;
  });

  const boardChanged = prevBoardSig !== JSON.stringify(TTT_BOARD);
  const statusChanged = prevStatus !== TTT_ONLINE.status;
  const turnChanged = prevTurn !== TTT_ONLINE.turn;

  tttPrintBoard();

  if (!announce) {
    if (!TTT_ONLINE.active) {
      TTT_ACTIVE = false;
      TTT_SESSION = "idle";
      tttStopOnlinePolling();
    } else {
      TTT_ACTIVE = true;
    }
    return;
  }

  if (statusChanged) {
    if (TTT_ONLINE.status === "waiting") {
      printLines([
        "Online-Lobby wartet auf Mitspieler.",
        `Code: ${TTT_ONLINE.gameId}`,
        "Gegenspieler tritt bei mit: ttt online join <CODE>",
        ""
      ], "dim");
    }

    if (TTT_ONLINE.status === "active" && prevStatus === "waiting") {
      printLines([
        "Mitspieler ist beigetreten. Das Online-Spiel startet.",
        "",
      ], "success");
    }

    if (TTT_ONLINE.status === "abandoned") {
      printLines([
        "Das Online-Spiel wurde beendet oder verlassen.",
        "",
      ], "dim");
    }
  }

  if (TTT_ONLINE.status === "active" && (statusChanged || boardChanged || turnChanged)) {
    const turnLine = TTT_ONLINE.turn === TTT_ONLINE.player
      ? "Du bist dran."
      : `${TTT_ONLINE.opponentName || "Dein Gegner"} ist dran.`;
    printLines([turnLine, ""]);
  }

  if (TTT_ONLINE.status === "finished") {
    let msg = "Das Spiel ist beendet.";
    let cls = "dim";

    if (TTT_ONLINE.winner === "draw") {
      msg = "Unentschieden – niemand gewinnt.";
    } else if (TTT_ONLINE.winner === TTT_ONLINE.player) {
      msg = "GG, du hast die Online-Runde gewonnen!";
      cls = "success";
    } else if (TTT_ONLINE.winner) {
      msg = "Du verlierst diese Online-Runde.";
      cls = "error";
    }

    printLines([msg, ""], cls);
  }

  if (!TTT_ONLINE.active) {
    TTT_ACTIVE = false;
    TTT_SESSION = "idle";
    tttStopOnlinePolling();
  } else {
    TTT_ACTIVE = true;
  }
}

function tttOnlineStartPolling() {
  tttStopOnlinePolling();

  const poll = async () => {
    if (!TTT_ONLINE.active) return;

    try {
      const res = await tttOnlineRequest("state", {
        gameId: TTT_ONLINE.gameId,
        token: TTT_ONLINE.token
      });
      tttApplyOnlineState(res.game, { announce: true, reason: "poll" });
      TTT_ONLINE_POLL_ERROR = null;
    } catch (e) {
      if (TTT_ONLINE_POLL_ERROR !== e.message) {
        printLines([
          `Online-Status konnte nicht geladen werden: ${e.message}`,
          ""
        ], "error");
      }
      TTT_ONLINE_POLL_ERROR = e.message;

      if (/nicht gefunden/i.test(e.message) || /Token/i.test(e.message)) {
        TTT_ONLINE.active = false;
        TTT_SESSION = "idle";
      }
    }

    if (TTT_ONLINE.active) {
      TTT_ONLINE.pollTimer = setTimeout(poll, 1500);
    }
  };

  TTT_ONLINE.pollTimer = setTimeout(poll, 1000);
}

async function tttOnlineHost(name) {
  if (TTT_SESSION === "offline" && TTT_ACTIVE) {
    printLines([
      "Du spielst bereits gegen die AI.",
      "Beende das Spiel mit 'ttt quit', bevor du online gehst.",
      ""
    ], "error");
    return;
  }

  if (TTT_ONLINE.active) {
    printLines([
      "Es läuft bereits ein Online-Spiel.",
      "Verlasse es zuerst mit 'ttt online leave'.",
      ""
    ], "error");
    return;
  }

  const hostName = name || tttUserLabel();

  try {
    tttOnlineCleanup({ resetBoard: true });
    const res = await tttOnlineRequest("create", { name: hostName });

    TTT_ONLINE.token = res.token;
    tttApplyOnlineState(res.game, { announce: true, reason: "create" });
    TTT_ACTIVE = true;

    printLines([
      `Online-Lobby erstellt. Code: ${res.game.id}`,
      "Teile den Code mit deinem Gegner, damit er beitreten kann:",
      `  ttt online join ${res.game.id}`,
      ""
    ], "success");

    tttOnlineStartPolling();
  } catch (e) {
    printLines([
      `Online-Lobby konnte nicht erstellt werden: ${e.message}`,
      ""
    ], "error");
  }
}

async function tttOnlineJoin(code, name) {
  if (!code) {
    printLines(["Verwendung: ttt online join <CODE>", ""], "error");
    return;
  }

  if (TTT_SESSION === "offline" && TTT_ACTIVE) {
    printLines([
      "Du spielst bereits gegen die AI.",
      "Beende das Spiel mit 'ttt quit', bevor du online beitrittst.",
      ""
    ], "error");
    return;
  }

  if (TTT_ONLINE.active) {
    printLines([
      "Es läuft bereits ein Online-Spiel.",
      "Verlasse es zuerst mit 'ttt online leave'.",
      ""
    ], "error");
    return;
  }

  const joinName = name || tttUserLabel();
  const gameId = code.trim().toUpperCase();

  try {
    tttOnlineCleanup({ resetBoard: true });
    const res = await tttOnlineRequest("join", {
      gameId,
      name: joinName
    });

    TTT_ONLINE.token = res.token;
    tttApplyOnlineState(res.game, { announce: true, reason: "join" });
    TTT_ACTIVE = true;

    printLines([
      `Du hast die Online-Lobby ${gameId} betreten.`,
      "Viel Spaß beim Multiplayer-TicTacToe!",
      ""
    ], "success");

    tttOnlineStartPolling();
  } catch (e) {
    printLines([
      `Beitritt fehlgeschlagen: ${e.message}`,
      ""
    ], "error");
  }
}

async function tttOnlineMove(arg) {
  if (!TTT_ONLINE.active) {
    printLines([
      "Kein aktives Online-Spiel. Starte mit 'ttt online host' oder 'ttt online join <CODE>'.",
      ""
    ], "dim");
    return;
  }

  if (TTT_ONLINE.status === "waiting") {
    printLines(["Warte, bis ein Gegner beigetreten ist.", ""], "dim");
    return;
  }

  const idx = tttParseMove(arg);
  if (idx === null) {
    printLines(["Bitte ein Feld von 1 bis 9 wählen.", ""], "error");
    return;
  }

  if (TTT_ONLINE.turn !== TTT_ONLINE.player) {
    printLines(["Der Gegner ist am Zug. Warte kurz.", ""], "dim");
    return;
  }

  try {
    const res = await tttOnlineRequest("move", {
      gameId: TTT_ONLINE.gameId,
      token: TTT_ONLINE.token,
      index: idx
    });
    tttApplyOnlineState(res.game, { announce: true, reason: "move" });
  } catch (e) {
    printLines([
      `Zug fehlgeschlagen: ${e.message}`,
      ""
    ], "error");
  }
}

async function tttOnlineLeave(showMessage = true) {
  if (!TTT_ONLINE.active && !TTT_ONLINE.gameId) {
    if (showMessage) {
      printLines(["Kein Online-Spiel aktiv.", ""], "dim");
    }
    return;
  }

  try {
    if (TTT_ONLINE.token && TTT_ONLINE.gameId) {
      await tttOnlineRequest("leave", {
        gameId: TTT_ONLINE.gameId,
        token: TTT_ONLINE.token
      });
    }
  } catch (e) {
    if (showMessage) {
      printLines([
        `Abbruch konnte nicht gemeldet werden: ${e.message}`,
        ""
      ], "error");
    }
  }

  tttOnlineCleanup({ resetBoard: true });

  if (showMessage) {
    printLines(["Online-Spiel beendet.", ""], "dim");
  }
}

async function tttOnlineStatus() {
  if (TTT_ONLINE.active && TTT_ONLINE.gameId && TTT_ONLINE.token) {
    try {
      const res = await tttOnlineRequest("state", {
        gameId: TTT_ONLINE.gameId,
        token: TTT_ONLINE.token
      });
      tttApplyOnlineState(res.game, { announce: false, reason: "status" });
    } catch (e) {
      printLines([
        `Status-Check fehlgeschlagen: ${e.message}`,
        ""
      ], "error");
    }
  }

  printLines(tttOnlineStatusLines());
  if (TTT_ONLINE.active || TTT_ONLINE.gameId) {
    tttPrintBoard();
  }
}

// ---------------------------------------------------------
// AI-Strategien
// ---------------------------------------------------------

// EASY: komplett zufällig
function tttAiMoveEasy() {
  const emptyIndices = TTT_BOARD
    .map((v, i) => (v === null ? i : null))
    .filter(i => i !== null);

  if (emptyIndices.length === 0) return null;

  const idx = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
  TTT_BOARD[idx] = TTT_AI;
  return idx;
}

// NORMAL: gewinnen → blocken → Mitte → Ecke → random
function tttAiMoveNormal() {
  const emptyIndices = TTT_BOARD
    .map((v, i) => (v === null ? i : null))
    .filter(i => i !== null);

  if (emptyIndices.length === 0) return null;

  // 1) Gewinnzug suchen (AI = O)
  for (const idx of emptyIndices) {
    const clone = [...TTT_BOARD];
    clone[idx] = TTT_AI;
    if (tttCheckWinner(clone) === TTT_AI) {
      TTT_BOARD[idx] = TTT_AI;
      return idx;
    }
  }

  // 2) Blockzug: verhindert, dass der Spieler im nächsten Zug gewinnt
  for (const idx of emptyIndices) {
    const clone = [...TTT_BOARD];
    clone[idx] = TTT_USER;
    if (tttCheckWinner(clone) === TTT_USER) {
      TTT_BOARD[idx] = TTT_AI;
      return idx;
    }
  }

  // 3) Mitte bevorzugen
  if (TTT_BOARD[4] === null) {
    TTT_BOARD[4] = TTT_AI;
    return 4;
  }

  // 4) Ecken bevorzugen
  const corners = [0, 2, 6, 8].filter(i => TTT_BOARD[i] === null);
  if (corners.length > 0) {
    const cornerIdx = corners[Math.floor(Math.random() * corners.length)];
    TTT_BOARD[cornerIdx] = TTT_AI;
    return cornerIdx;
  }

  // 5) Fallback: irgendein freies Feld
  return tttAiMoveEasy();
}

// HARD: Minimax – optimal spielende AI
function tttMinimax(board, isAiTurn) {
  const winner = tttCheckWinner(board);
  if (winner === TTT_AI) return 1;
  if (winner === TTT_USER) return -1;
  if (winner === "draw") return 0;

  const emptyIndices = board
    .map((v, i) => (v === null ? i : null))
    .filter(i => i !== null);

  if (emptyIndices.length === 0) return 0;

  if (isAiTurn) {
    // AI maximiert
    let bestScore = -Infinity;
    for (const idx of emptyIndices) {
      const clone = [...board];
      clone[idx] = TTT_AI;
      const score = tttMinimax(clone, false);
      if (score > bestScore) {
        bestScore = score;
      }
    }
    return bestScore;
  } else {
    // Spieler minimiert
    let bestScore = Infinity;
    for (const idx of emptyIndices) {
      const clone = [...board];
      clone[idx] = TTT_USER;
      const score = tttMinimax(clone, true);
      if (score < bestScore) {
        bestScore = score;
      }
    }
    return bestScore;
  }
}

function tttAiMoveHard() {
  const emptyIndices = TTT_BOARD
    .map((v, i) => (v === null ? i : null))
    .filter(i => i !== null);

  if (emptyIndices.length === 0) return null;

  let bestScore = -Infinity;
  let bestMove  = emptyIndices[0];

  for (const idx of emptyIndices) {
    const clone = [...TTT_BOARD];
    clone[idx] = TTT_AI;
    const score = tttMinimax(clone, false); // danach ist Spieler dran

    if (score > bestScore) {
      bestScore = score;
      bestMove  = idx;
    }
  }

  TTT_BOARD[bestMove] = TTT_AI;
  return bestMove;
}

// AI-Wrapper: wählt je nach Modus die passende Strategie
function tttAiMove() {
  switch (TTT_MODE) {
    case "easy":
      return tttAiMoveEasy();
    case "hard":
      return tttAiMoveHard();
    case "normal":
    default:
      return tttAiMoveNormal();
  }
}

// ---------------------------------------------------------
// UI / Commands
// ---------------------------------------------------------

function tttModeLabel() {
  switch (TTT_MODE) {
    case "easy":   return "easy (zufällig, chillig)";
    case "hard":   return "hard (optimal, sehr fies)";
    case "normal":
    default:       return "normal (blockt & denkt etwas nach)";
  }
}

function tttSetMode(mode) {
  const m = (mode || "").toLowerCase();
  if (!["easy", "normal", "hard"].includes(m)) {
    printLines([
      "Unbekannter Modus. Verfügbare Modi:",
      "  easy   - reine Zufalls-AI",
      "  normal - etwas vorausschauend (Blocken/Mitte/Ecken)",
      "  hard   - optimale AI (nahezu unschlagbar)",
      ""
    ], "error");
    return;
  }
  TTT_MODE = m;
  printLines([`TicTacToe-Modus gesetzt auf: ${m}`, ""], "success");
}

function tttPrintHelp() {
  printLines([
    "TicTacToe (Darknetz-Edition):",
    "",
    "Lokales Spiel gegen die AI:",
    "  ttt start                    - neues Spiel starten",
    "  ttt move <1-9>               - dein Zug (klassisch)",
    "  <1-9>                        - im laufenden Spiel: Schnellzug (nur Zahl eintippen)",
    "  ttt board                    - aktuelles Spielfeld anzeigen",
    "  ttt mode                     - aktuellen Schwierigkeitsgrad anzeigen",
    "  ttt mode <easy|normal|hard>  - Schwierigkeitsgrad setzen",
    "  ttt quit                     - Spiel abbrechen",
    "",
    "Online Multiplayer:",
    "  ttt online host [name]        - Online-Lobby erstellen (Code teilen)",
    "  ttt online join <CODE> [name] - Lobby eines Freundes betreten",
    "  ttt online move <1-9>         - Zug im Online-Spiel",
    "  ttt online status             - Status und Board zeigen",
    "  ttt online leave              - Online-Spiel verlassen",
    "",
    `Aktueller AI-Modus: ${TTT_MODE} (${tttModeLabel()})`,
    "Offline spielst du 'X', die AI spielt 'O'. Im Online-Modus bekommt jede Seite automatisch ihr Symbol.",
    ""
  ]);
}

function tttStartGame() {
  if (TTT_SESSION === "online" && (TTT_ONLINE.active || TTT_ONLINE.gameId)) {
    printLines([
      "Du bist aktuell in einem Online-Spiel.",
      "Beende es zuerst mit 'ttt online leave' oder schließe die Runde ab.",
      ""
    ], "error");
    return;
  }

  tttReset();
  TTT_SESSION = "offline";
  TTT_ACTIVE = true;

  printLines([
    "Neues TicTacToe-Spiel gestartet.",
    `Modus: ${TTT_MODE} (${tttModeLabel()})`,
    "Du bist 'X', die AI ist 'O'.",
    "Du beginnst.",
    ""
  ], "dim");

  tttPrintBoard();
}

function tttShowBoard() {
  if (!TTT_ACTIVE && TTT_BOARD.every(c => c === null)) {
    printLines(["Es läuft aktuell kein Spiel. 'ttt start' startet eins.", ""], "dim");
    return;
  }
  tttPrintBoard();
}

function tttParseMove(arg) {
  const n = parseInt(arg, 10);
  if (isNaN(n) || n < 1 || n > 9) return null;
  return n - 1;
}

async function tttHandleMove(arg) {
  if (TTT_SESSION === "online" && (TTT_ONLINE.active || TTT_ONLINE.gameId)) {
    await tttOnlineMove(arg);
    return;
  }

  if (TTT_SESSION !== "offline" || !TTT_ACTIVE) {
    printLines([
      "Es läuft aktuell kein lokales Spiel.",
      "Starte eines mit 'ttt start' oder spiele online mit 'ttt online host'.",
      ""
    ], "dim");
    return;
  }

  const idx = tttParseMove(arg);
  if (idx === null) {
    printLines(["Bitte ein Feld von 1 bis 9 wählen.", ""], "error");
    return;
  }

  if (TTT_BOARD[idx] !== null) {
    printLines(["Dieses Feld ist bereits belegt.", ""], "error");
    return;
  }

  // Spielerzug
  TTT_BOARD[idx] = TTT_USER;
  tttPrintBoard();

  // Gewinnercheck
  let result = tttCheckWinner(TTT_BOARD);
  if (result === TTT_USER) {
    printLines(["Du gewinnst. Nice Move. 🖤", ""], "success");
    tttReset();
    return;
  } else if (result === "draw") {
    printLines(["Unentschieden. Niemand gewinnt – sehr goth.", ""], "dim");
    tttReset();
    return;
  }

  // AI-Zug
  printLines(["AI ist am Zug...", ""], "dim");
  await sleep(400);

  tttAiMove();
  tttPrintBoard();

  result = tttCheckWinner(TTT_BOARD);
  if (result === TTT_AI) {
    printLines(["Die AI gewinnt. Die Maschine lacht leise im Schatten.", ""], "error");
    tttReset();
    return;
  } else if (result === "draw") {
    printLines(["Unentschieden. Der Krieg der Symbole endet in Balance.", ""], "dim");
    tttReset();
    return;
  }
}

async function tttHandleOnlineCommand(args) {
  const action = (args[0] || "").toLowerCase();

  if (!action || action === "help") {
    printLines([
      "Online-Multiplayer Befehle:",
      "  ttt online host [name]        - eigene Lobby eröffnen",
      "  ttt online join <CODE> [name] - beitreten",
      "  ttt online move <1-9>         - Zug machen",
      "  ttt online status             - Status & Board",
      "  ttt online leave              - Runde verlassen",
      "",
    ]);
    return;
  }

  if (action === "host" || action === "create") {
    await tttOnlineHost(args[1]);
    return;
  }

  if (action === "join") {
    await tttOnlineJoin(args[1], args[2]);
    return;
  }

  if (action === "move") {
    const moveArg = args[1];
    if (!moveArg) {
      printLines(["Verwendung: ttt online move <1-9>", ""], "error");
      return;
    }
    await tttOnlineMove(moveArg);
    return;
  }

  if (action === "status" || action === "info") {
    await tttOnlineStatus();
    return;
  }

  if (action === "board") {
    tttShowBoard();
    return;
  }

  if (action === "leave" || action === "quit" || action === "cancel") {
    await tttOnlineLeave();
    return;
  }

  printLines([
    `Unbekannter Online-Befehl: '${action}'`,
    "Tippe 'ttt online help' für eine Übersicht.",
    ""
  ], "error");
}

// öffentliches Command für 'ttt ...'
async function tttCommand(args) {
  const sub = (args[0] || "").toLowerCase();

  if (!sub || sub === "help") {
    tttPrintHelp();
    return;
  }

  if (sub === "online") {
    await tttHandleOnlineCommand(args.slice(1));
    return;
  }

  if (sub === "start") {
    tttStartGame();
    return;
  }

  if (sub === "board") {
    tttShowBoard();
    return;
  }

  if (sub === "move") {
    const moveArg = args[1];
    if (!moveArg) {
      printLines(["Verwendung: ttt move <1-9>", ""], "error");
      return;
    }
    await tttHandleMove(moveArg);
    return;
  }

  if (sub === "mode") {
    const modeArg = args[1];
    if (!modeArg) {
      printLines([
        "Aktueller TicTacToe-Modus:",
        `  ${TTT_MODE} (${tttModeLabel()})`,
        "",
        "Setzen mit:",
        "  ttt mode easy",
        "  ttt mode normal",
        "  ttt mode hard",
        ""
      ], "dim");
      return;
    }
    tttSetMode(modeArg);
    return;
  }

  if (sub === "quit") {
    if (TTT_SESSION === "online" && (TTT_ONLINE.active || TTT_ONLINE.gameId)) {
      await tttOnlineLeave();
      return;
    }

    if (TTT_ACTIVE) {
      tttReset();
      printLines(["Spiel abgebrochen. Zurück im Darknetz-Terminal.", ""], "dim");
    } else {
      printLines(["Es läuft kein Spiel, das man abbrechen könnte.", ""], "dim");
    }
    return;
  }

  printLines([
    `Unbekannter ttt-Befehl: '${sub}'`,
    "Tippe 'ttt help' für eine Übersicht.",
    ""
  ], "error");
}

// ---------------------------------------------------------
// Registrierung im Game Hub (falls vorhanden)
// ---------------------------------------------------------
if (typeof registerGame === "function") {
  registerGame("ttt", {
    name: "TicTacToe",
    description: "3x3 TicTacToe gegen die Darknetz-AI.",
    start: () => tttStartGame(),
    help: () => tttPrintHelp()
  });
}

// ---------------------------------------------------------
// Input Interceptor für 1-9 Moves
// ---------------------------------------------------------
if (typeof window.registerInputInterceptor === "function") {
  window.registerInputInterceptor(async (cmd, parts, base) => {
    // Nur aktiv, wenn Spiel läuft
    if (!TTT_ACTIVE && (!TTT_ONLINE.active && !TTT_ONLINE.gameId)) return false;

    // Nur 1-9
    if (parts.length === 1 && /^[1-9]$/.test(base)) {
      await tttHandleMove(base);
      return true;
    }
    return false;
  });
}
