// ---------------------------------------------------------
// GAME HUB – zentrale Verwaltung von Minigames
// ---------------------------------------------------------

const GAME_REGISTRY = {};

// Spiele registrieren sich selbst über diese Funktion
function registerGame(id, config) {
  if (!id) return;
  GAME_REGISTRY[id] = {
    id,
    name: config.name || id,
    description: config.description || "",
    start: config.start || null,
    help: config.help || null
  };
}

function gameListLines() {
  const keys = Object.keys(GAME_REGISTRY).sort();

  if (!keys.length) {
    return ["Keine Spiele im Darknetz registriert.", ""];
  }

  const lines = [
    "Verfügbare Spiele im NRW Noir Darknetz:",
    "--------------------------------------"
  ];

  keys.forEach(id => {
    const g = GAME_REGISTRY[id];
    let label = `${id}  –  ${g.name}`;
    if (g.description) {
      label += `: ${g.description}`;
    }
    lines.push(label);
  });

  lines.push("");
  return lines;
}

async function handleGameHubCommand(args) {
  const sub = (args[0] || "").toLowerCase();

  // game / game list
  if (!sub || sub === "list") {
    printLines(gameListLines());
    return;
  }

  if (sub === "help") {
    printLines([
      "Game Hub Befehle:",
      "  game               - Liste aller Spiele",
      "  game list          - Liste aller Spiele",
      "  game <id>          - Spiel mit ID starten",
      "  game start <id>    - Spiel mit ID starten",
      "  game <id> help     - Hilfe zu einem Spiel (falls vorhanden)",
      ""
    ]);
    return;
  }

  // game start <id> / game <id>
  let gameId;
  let mode = "start";

  if (sub === "start") {
    gameId = (args[1] || "").toLowerCase();
  } else {
    gameId = sub;
    mode = (args[1] || "").toLowerCase();
  }

  if (!gameId) {
    printLines(["Bitte eine Spiel-ID angeben. (z.B. 'game ttt')", ""], "error");
    return;
  }

  const game = GAME_REGISTRY[gameId];
  if (!game) {
    printLines([
      `Unbekanntes Spiel: '${gameId}'`,
      "Tippe 'game list' für eine Übersicht.",
      ""
    ], "error");
    return;
  }

  if (mode === "help" || mode === "info") {
    if (typeof game.help === "function") {
      game.help();
    } else {
      printLines([
        `Für '${gameId}' ist keine eigene Hilfe hinterlegt.`,
        "",
      ], "dim");
    }
    return;
  }

  // default: starten
  if (typeof game.start === "function") {
    game.start();
  } else {
    printLines([
      `Spiel '${gameId}' ist registriert, hat aber keine Start-Funktion.`,
      ""
    ], "error");
  }
}