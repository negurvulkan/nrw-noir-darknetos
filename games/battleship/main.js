import { GhostshipsEngine } from "../../js/games/ghostships/engine.js";

const client = GhostshipsEngine.createClient({ pollMs: 3500 });

const state = {
  spectator: false,
  retro: false,
  manifestCells: new Set(),
  decayCells: new Set(),
  revealCells: new Set(),
  lastFog: new Set(),
  shipCatalog: null,
  matchConfig: null
};

const els = {
  name: document.getElementById("input-name"),
  size: document.getElementById("select-size"),
  match: document.getElementById("input-match"),
  create: document.getElementById("btn-create"),
  join: document.getElementById("btn-join"),
  copyId: document.getElementById("btn-copy-id"),
  createLink: document.getElementById("btn-create-link"),
  copyLink: document.getElementById("btn-copy-link"),
  leave: document.getElementById("btn-leave"),
  rematch: document.getElementById("btn-rematch"),
  ready: document.getElementById("btn-ready"),
  auto: document.getElementById("btn-auto"),
  refresh: document.getElementById("btn-refresh"),
  turn: document.getElementById("turn-indicator"),
  readyIndicator: document.getElementById("ready-indicator"),
  status: document.getElementById("status-text"),
  radarBoard: document.getElementById("radar-board"),
  ownBoard: document.getElementById("own-board"),
  logList: document.getElementById("log-list"),
  toggleCRT: document.getElementById("toggle-crt"),
  toggleSpectate: document.getElementById("toggle-spectate"),
  togglePlace: document.getElementById("toggle-place"),
  shipSelect: document.getElementById("select-ship"),
  dirSelect: document.getElementById("select-dir")
};

const STORAGE_KEY = "ghostships_gui_name";

function boardLetters(size) {
  if (typeof GhostshipsEngine?.boardLetters === "function") {
    return GhostshipsEngine.boardLetters(size);
  }
  return size === 10
    ? ["A","B","C","D","E","F","G","H","I","J"]
    : ["A","B","C","D","E","F","G","H"];
}

function forEachBoardCell(size, cb) {
  const letters = boardLetters(size);
  for (let r = 1; r <= size; r++) {
    letters.forEach(col => cb(`${col}${r}`));
  }
}

function createBoardGrid(size, renderCell) {
  const grid = document.createElement("div");
  grid.className = "grid";
  grid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${size}, 1fr)`;
  forEachBoardCell(size, pos => grid.appendChild(renderCell(pos)));
  return grid;
}

function attachCellAction(btn, handler) {
  btn.addEventListener("click", handler);
  btn.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handler();
    }
  });
}

function userLabel() {
  const base = (els.name.value || "").trim() || "user";
  return `${base} (GUI)`;
}

function saveName() {
  try {
    localStorage.setItem(STORAGE_KEY, els.name.value || "");
  } catch (_) { /* ignore */ }
}

function loadName() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      els.name.value = saved;
    }
  } catch (_) { /* ignore */ }
}

function setStatus(text) {
  els.status.textContent = text;
}

function formatLogEntry(entry) {
  switch (entry.type) {
    case "system": return entry.text || "System.";
    case "fire":
      if (entry.fogged) return `Feuer ${entry.pos}: Nebel verschluckt das Echo…`;
      if (entry.sunk) return `Feuer ${entry.pos}: versenkt!`;
      return `Feuer ${entry.pos}: ${entry.result || "treffer?"}`;
    case "decay": return "Ein Schiff wird vom Nebel gefressen.";
    case "manifest": return `Manifestation: ${entry.length === 2 ? "Echo-Schiff" : "Wisp"}`;
    case "fog": return `Nebel legt sich über ${entry.count || 1} Feld(er).`;
    case "fog_reveal": return `Nebel weicht bei ${entry.pos}: ${entry.result}`;
    default: return JSON.stringify(entry);
  }
}

function applyShipSprite(btn, ship, pos, isHit) {
  const orientation = detectOrientation(ship);
  btn.dataset.ship = ship.type;
  btn.dataset.orientation = orientation;
  btn.dataset.frame = isHit ? "hit" : "ok";
  const spriteFrame = getSpriteFrame(ship, pos, orientation, isHit);
  if (spriteFrame) {
    btn.dataset.sprite = spriteFrame.sprite;
    btn.style.setProperty("--sprite-url", `url(${spriteFrame.sprite})`);
    btn.style.setProperty("--sprite-bg-width", `${spriteFrame.bgWidth}px`);
    btn.style.setProperty("--sprite-bg-height", `${spriteFrame.bgHeight}px`);
    btn.style.setProperty("--sprite-frame-x", `${spriteFrame.posX}px`);
    btn.style.setProperty("--sprite-frame-y", `${spriteFrame.posY}px`);
    btn.style.setProperty("--sprite-size", `${spriteFrame.tile}px`);
  }
}

function renderRadar(match) {
  const size = match.boardSize;
  const radar = match.boards?.radar || { hits: [], misses: [], pending: [], fogged: [] };
  const hits = new Set(radar.hits || []);
  const misses = new Set(radar.misses || []);
  const pending = new Set(radar.pending || []);
  const fogged = new Set(radar.fogged || []);

  const shipMap = {};
  if (Array.isArray(radar.ships)) {
    radar.ships.forEach(ship => {
      (ship.cells || []).forEach(cell => {
        shipMap[cell] = ship;
      });
    });
  }

  return createBoardGrid(size, pos => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cell";
    btn.dataset.pos = pos;
    btn.ariaLabel = `Feld ${pos}`;
    if (hits.has(pos)) btn.classList.add("hit");
    if (misses.has(pos)) btn.classList.add("miss");
    if (pending.has(pos)) btn.classList.add("pending");
    if (fogged.has(pos)) btn.classList.add("fog");
    if (state.revealCells.has(`radar-${pos}`)) btn.classList.add("reveal");

    const ship = shipMap[pos];
    if (ship) {
      btn.classList.add("ship");
      if (hits.has(pos)) btn.classList.add("hit");
      applyShipSprite(btn, ship, pos, hits.has(pos));
    }

    attachCellAction(btn, () => fireAt(pos));
    return btn;
  });
}

function renderOwnBoard(match) {
  const size = match.boardSize;
  const own = match.boards?.own || { ships: [], fogged: [] };
  const fogged = new Set(own.fogged || []);
  const cells = {};

  (own.ships || []).forEach(ship => {
    (ship.cells || []).forEach(cell => {
      cells[cell] = cells[cell] || { ships: [] };
      cells[cell].ships.push(ship);
    });
    (ship.hits || []).forEach(hit => {
      cells[hit] = cells[hit] || { ships: [] };
      cells[hit].hit = true;
    });
  });

  return createBoardGrid(size, pos => {
    const cell = cells[pos] || {};
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cell";
    btn.dataset.pos = pos;
    btn.ariaLabel = `Feld ${pos}`;

    if (cell.ships?.length) btn.classList.add("ship");
    if (cell.hit) btn.classList.add("hit");
    if (fogged.has(pos)) btn.classList.add("fog");
    if (state.decayCells.has(pos)) btn.classList.add("decay");
    if (state.manifestCells.has(pos)) btn.classList.add("manifest");
    if (state.revealCells.has(`own-${pos}`)) btn.classList.add("reveal");
    if (cell.ships?.length) {
      applyShipSprite(btn, cell.ships[0], pos, !!cell.hit);
    }

    attachCellAction(btn, () => placeAt(pos));
    return btn;
  });
}

function updateBoards(match) {
  els.radarBoard.innerHTML = "";
  els.ownBoard.innerHTML = "";
  els.radarBoard.appendChild(renderRadar(match));
  els.ownBoard.appendChild(renderOwnBoard(match));
}

function renderLog(match) {
  const log = Array.isArray(match.log) ? match.log.slice(-5) : [];
  els.logList.innerHTML = "";
  log.forEach(entry => {
    const item = document.createElement("div");
    item.className = "log-item";
    const ts = entry.ts ? new Date(entry.ts * 1000) : null;
    const time = document.createElement("div");
    time.className = "time";
    time.textContent = ts ? ts.toLocaleTimeString() : "";
    const text = document.createElement("div");
    text.className = "text";
    text.textContent = formatLogEntry(entry);
    item.appendChild(time);
    item.appendChild(text);
    els.logList.appendChild(item);
  });
}

function updateInfo(match) {
  els.turn.textContent = match.phase === "active"
    ? (match.turn === match.you ? "Du bist dran" : "Wartest…")
    : match.phase.toUpperCase();
  els.readyIndicator.textContent = `Du: ${match.ready?.you ? "bereit" : "setup"} · Gegner: ${match.ready?.opponent ? "bereit" : "wartet"}`;
  els.status.textContent = `Match ${match.id} · Phase ${match.phase}${match.winner ? ` · Gewinner: ${match.winner === match.you ? "Du" : "Gegner"}` : ""}`;

  const active = ["setup", "active"].includes(match.phase);
  els.copyId.disabled = !active;
  els.createLink.disabled = !active;
  els.copyLink.disabled = !active;
  els.leave.disabled = !active;
  els.rematch.disabled = match.phase !== "finished";
  els.ready.disabled = match.phase === "finished";
  els.auto.disabled = match.phase !== "setup";
}

function applyAnimations(match, prev, delta) {
  state.manifestCells.clear();
  state.decayCells.clear();
  state.revealCells.clear();

  const own = match.boards?.own;
  const prevOwn = prev?.boards?.own;

  const currentCells = new Set((own?.ships || []).flatMap(s => s.cells || []));
  const prevCells = new Set((prevOwn?.ships || []).flatMap(s => s.cells || []));
  const newCells = [...currentCells].filter(c => !prevCells.has(c));

  const currentHits = new Set((own?.ships || []).flatMap(s => s.hits || []));
  const prevHits = new Set((prevOwn?.ships || []).flatMap(s => s.hits || []));
  const freshHits = [...currentHits].filter(c => !prevHits.has(c));

  const currentFog = new Set(own?.fogged || []);
  const prevFog = new Set(prevOwn?.fogged || []);
  const newFog = [...currentFog].filter(c => !prevFog.has(c));

  (delta.logs || []).forEach(entry => {
    if (entry.type === "manifest" && entry.target === match.you) {
      newCells.forEach(cell => state.manifestCells.add(cell));
    }
    if (entry.type === "decay" && entry.target === match.you) {
      freshHits.forEach(cell => state.decayCells.add(cell));
    }
    if (entry.type === "fog_reveal" && entry.by === match.you) {
      state.revealCells.add(`radar-${entry.pos}`);
    }
    if (entry.type === "fog" && entry.target === match.you) {
      newFog.forEach(cell => state.revealCells.add(`own-${cell}`));
    }
  });
}

function render(match, prev, delta) {
  if (!match) {
    els.radarBoard.innerHTML = "";
    els.ownBoard.innerHTML = "";
    els.logList.innerHTML = "";
    els.turn.textContent = "Wartet…";
    els.readyIndicator.textContent = "Setup";
    return;
  }
  applyAnimations(match, prev, delta || { logs: [] });
  updateBoards(match);
  updateInfo(match);
  renderLog(match);
}

function detectOrientation(ship) {
  const cells = ship?.cells || [];
  if (cells.length < 2) return "h";
  const first = cells[0];
  const second = cells[1];
  return first[0] === second[0] ? "v" : "h";
}

function getShipDefinition(shipId) {
  return state.shipCatalog?.get(shipId) || null;
}

function getSpriteFrame(ship, cellPos, orientation, isHit) {
  const def = getShipDefinition(ship.type);
  const sprite = def?.sprite;
  if (!sprite?.url) return null;
  const tile = sprite.tileSize || 32;
  const row = isHit ? (sprite.states?.hit?.row ?? 1) : (sprite.states?.ok?.row ?? 0);
  const segmentIndex = (ship.cells || []).indexOf(cellPos);
  const seg = sprite.segments?.[segmentIndex] || { col: segmentIndex };
  const col = typeof seg.col === "number" ? seg.col : segmentIndex;
  return {
    sprite: sprite.url,
    bgWidth: (sprite.cols || (def?.length || 1)) * tile,
    bgHeight: (sprite.rows || 2) * tile,
    posX: col * tile,
    posY: row * tile,
    tile
  };
}

async function loadShipData() {
  const [catalog, config] = await Promise.all([
    GhostshipsEngine.loadBattleshipCatalog(),
    GhostshipsEngine.loadBattleshipConfig()
  ]);
  state.shipCatalog = catalog;
  state.matchConfig = config;
  syncShipSelectOptions();
  syncBoardSize(config.boardSize);
  const match = client.getState().match;
  if (match) {
    render(match, match, { logs: [] });
  }
}

async function fireAt(pos) {
  if (state.spectator) {
    setStatus("Spectator-Modus: Keine Befehle gesendet.");
    return;
  }
  const s = client.getState();
  const match = s.match;
  if (!match) return;
  if (match.phase !== "active") {
    setStatus("Match ist nicht aktiv.");
    return;
  }
  if (match.turn !== match.you) {
    setStatus("Nicht dein Zug.");
    return;
  }
  try {
    await client.fire(pos);
    setStatus(`Feuer auf ${pos} gesendet.`);
  } catch (e) {
    setStatus(e.message || String(e));
  }
}

async function placeAt(pos) {
  if (!els.togglePlace.checked) return;
  const match = client.getState().match;
  if (!match || match.phase !== "setup") return;
  if (state.spectator) return;
  const ship = els.shipSelect.value;
  const dir = els.dirSelect.value;
  try {
    await client.placeShip(ship, pos, dir);
    setStatus(`Schiff ${ship} bei ${pos} (${dir}) gesetzt.`);
  } catch (e) {
    setStatus(e.message || String(e));
  }
}

async function handleCreate() {
  try {
    const size = state.matchConfig?.boardSize || parseInt(els.size.value, 10) || 8;
    const match = await client.createMatch(size, userLabel());
    els.match.value = match?.id || "";
    setStatus(`Match ${match?.id} erstellt.`);
  } catch (e) {
    setStatus(e.message || String(e));
  }
}

async function handleJoin() {
  try {
    const code = (els.match.value || "").trim().toUpperCase();
    if (!code) {
      setStatus("Bitte eine Match-ID eingeben.");
      return;
    }
    const match = await client.joinMatch(code, userLabel());
    els.match.value = match?.id || code;
    setStatus(`Match ${match?.id} beigetreten.`);
  } catch (e) {
    setStatus(e.message || String(e));
  }
}

async function handleReady() {
  try {
    await client.setReady();
    setStatus("Bereit gemeldet.");
  } catch (e) {
    setStatus(e.message || String(e));
  }
}

async function handleAuto() {
  try {
    await client.autoPlace();
    setStatus("Auto-Platzierung abgeschlossen.");
  } catch (e) {
    setStatus(e.message || String(e));
  }
}

async function handleLeave() {
  try {
    await client.leaveMatch();
    setStatus("Match verlassen.");
    render(null);
  } catch (e) {
    setStatus(e.message || String(e));
  }
}

async function handleRematch() {
  try {
    await client.rematch();
    setStatus("Rematch gestartet.");
  } catch (e) {
    setStatus(e.message || String(e));
  }
}

async function handleRefresh() {
  try {
    await client.fetchState();
    setStatus("Status aktualisiert.");
  } catch (e) {
    setStatus(e.message || String(e));
  }
}

function copy(text) {
  if (!text) return;
  navigator.clipboard?.writeText(text);
}

function copyId() {
  const match = client.getState().match;
  if (!match) return;
  copy(match.id);
  setStatus("Match-ID kopiert.");
}

function getMatchLink(matchId) {
  const path = window.location.pathname.replace(/\/$/, "");
  return `${window.location.origin}${path}/?match=${matchId}`;
}

function createLink() {
  const match = client.getState().match;
  if (!match) return;
  copy(getMatchLink(match.id));
  setStatus("Match-Link kopiert.");
}

function copyLink() {
  const match = client.getState().match;
  if (!match) return;
  copy(getMatchLink(match.id));
  setStatus("Match-Link kopiert.");
}

function syncSpectator(flag) {
  state.spectator = flag;
  setStatus(flag ? "Spectator-Modus aktiv." : "Spieler-Modus aktiv.");
}

function syncCRT(flag) {
  document.body.classList.toggle("crt-on", flag);
}

function initMatchFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const matchId = params.get("match");
  if (matchId) {
    els.match.value = matchId;
  }
}

function bindEvents() {
  els.create.addEventListener("click", handleCreate);
  els.join.addEventListener("click", handleJoin);
  els.ready.addEventListener("click", handleReady);
  els.auto.addEventListener("click", handleAuto);
  els.leave.addEventListener("click", handleLeave);
  els.rematch.addEventListener("click", handleRematch);
  els.refresh.addEventListener("click", handleRefresh);
  els.copyId.addEventListener("click", copyId);
  els.createLink.addEventListener("click", createLink);
  els.copyLink.addEventListener("click", copyLink);
  els.toggleSpectate.addEventListener("change", e => syncSpectator(e.target.checked));
  els.toggleCRT.addEventListener("change", e => syncCRT(e.target.checked));
  els.name.addEventListener("change", saveName);
}

function syncShipSelectOptions() {
  if (!state.matchConfig || !state.shipCatalog) return;
  els.shipSelect.innerHTML = "";
  state.matchConfig.fleet.forEach(entry => {
    const def = getShipDefinition(entry.shipId);
    const opt = document.createElement("option");
    opt.value = entry.shipId;
    const labelName = def?.name || entry.shipId;
    const suffix = entry.count > 1 ? ` ×${entry.count}` : "";
    opt.textContent = `${labelName} (${entry.length})${suffix}`;
    els.shipSelect.appendChild(opt);
  });
  if (els.shipSelect.options.length) {
    els.shipSelect.value = els.shipSelect.options[0].value;
  }
}

function syncBoardSize(size) {
  if (!els.size) return;
  const existing = [...els.size.options].some(opt => opt.value === String(size));
  if (!existing) {
    const opt = document.createElement("option");
    opt.value = String(size);
    opt.textContent = `${size}×${size}`;
    els.size.appendChild(opt);
  }
  els.size.value = String(size);
  els.size.disabled = true;
}

client.onState(({ match, prev, delta }) => {
  if (!match) return;
  const prevPhase = prev?.phase;
  render(match, prev, delta);
  if (match.phase === "finished" && prevPhase !== "finished") {
    setStatus(`Match beendet. ${match.winner === match.you ? "Du gewinnst." : "Gegner gewinnt."}`);
  }
});

loadName();
bindEvents();
initMatchFromQuery();
loadShipData().catch(() => setStatus("Schiffsdaten konnten nicht geladen werden."));

setStatus("Bereit. Erstelle oder trete einem Match bei.");
