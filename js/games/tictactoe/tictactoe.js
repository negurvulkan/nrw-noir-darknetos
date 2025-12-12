// ---------------------------------------------------------
// MINIGAME: TicTacToe (TTT) – AI mit Schwierigkeitsgraden
// ---------------------------------------------------------

let TTT_ACTIVE = false;
let TTT_BOARD  = Array(9).fill(null); // 0–8

const TTT_USER = "X";
const TTT_AI   = "O";

let TTT_BOARD_CONTAINER = null; // fester Bereich im Output
let TTT_MODE = "normal";        // "easy" | "normal" | "hard"

// ---------------------------------------------------------
// Helper
// ---------------------------------------------------------

function tttReset() {
  TTT_BOARD = Array(9).fill(null);
  TTT_ACTIVE = false;
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
    "  ttt start              - neues Spiel starten",
    "  ttt move <1-9>         - dein Zug (klassisch)",
    "  <1-9>                  - im laufenden Spiel: Schnellzug (nur Zahl eintippen)",
    "  ttt board              - aktuelles Spielfeld anzeigen",
    "  ttt mode               - aktuellen Schwierigkeitsgrad anzeigen",
    "  ttt mode <easy|normal|hard> - Schwierigkeitsgrad setzen",
    "  ttt quit               - Spiel abbrechen",
    "",
    `Aktueller Modus: ${TTT_MODE} (${tttModeLabel()})`,
    "Du spielst 'X', die AI spielt 'O'.",
    ""
  ]);
}

function tttStartGame() {
  tttReset();
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
  if (!TTT_ACTIVE) {
    printLines([
      "Es läuft aktuell kein Spiel.",
      "Starte eines mit: ttt start",
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

// öffentliches Command für 'ttt ...'
async function tttCommand(args) {
  const sub = (args[0] || "").toLowerCase();

  if (!sub || sub === "help") {
    tttPrintHelp();
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