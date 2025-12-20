// ---------------------------------------------------------
// Ghostships Engine – API-Client und geteilte Spiellogik
// ---------------------------------------------------------

const DEFAULT_API = "content-builder/api/ghostships.php";
const DEFAULT_POLL_MS = 8000;
const BATTLESHIP_BASE = "content/games/battleship";
const SHIP_INDEX_URL = `${BATTLESHIP_BASE}/ships/index.json`;
const MATCH_CONFIG_URL = `${BATTLESHIP_BASE}/config.json`;
const BOARD_LETTERS = {
  8: ["A", "B", "C", "D", "E", "F", "G", "H"],
  10: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]
};

let shipCatalogCache = null;
let matchConfigCache = null;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Fehler beim Laden von ${url} (${res.status})`);
  }
  return res.json();
}

function normalizeSegments(length, segments = []) {
  if (!Array.isArray(segments) || !segments.length) {
    const auto = [];
    for (let i = 0; i < length; i++) {
      const name = i === 0 ? "front" : (i === length - 1 ? "rear" : "mid");
      auto.push({ name, col: i });
    }
    return auto;
  }
  return segments.map((seg, idx) => ({
    name: seg?.name || (idx === 0 ? "front" : (idx === length - 1 ? "rear" : "mid")),
    col: typeof seg?.col === "number" ? seg.col : idx
  }));
}

function normalizeSprite(def = {}, length, segments) {
  const tileSize = def.tileSize || 32;
  const cols = def.cols || segments?.length || length || 1;
  const rows = def.rows || 2;
  const states = {
    ok: { row: def.states?.ok?.row ?? 0 },
    hit: { row: def.states?.hit?.row ?? 1 }
  };
  const rotation = def.rotation || { verticalMethod: "cssRotate90" };

  return {
    ...def,
    tileSize,
    cols,
    rows,
    states,
    rotation,
    segments: normalizeSegments(length, def.segments || segments)
  };
}

function normalizeShipDefinition(def = {}) {
  const id = String(def.id || "").trim();
  const length = parseInt(def.length, 10);
  if (!id || !length) {
    throw new Error("Ungültige Schiffdefinition");
  }

  const rules = {
    spawnable: def.rules?.spawnable !== false,
    manifestable: !!def.rules?.manifestable,
    maxPerPlayer: typeof def.rules?.maxPerPlayer === "number" ? def.rules.maxPerPlayer : null
  };

  const sprite = normalizeSprite(def.sprite || {}, length, def.segments);
  const terminal = {
    charOk: def.terminal?.charOk || "#",
    charHit: def.terminal?.charHit || "X"
  };

  return {
    ...def,
    id,
    length,
    rules,
    sprite,
    segments: sprite.segments,
    terminal
  };
}

function normalizeHauntedRules(raw = {}) {
  const manifest = raw.manifest || {};
  const decay = raw.decay || {};
  const fog = raw.fog || {};
  return {
    enabled: raw.enabled !== false,
    chancePerTurn: typeof raw.chancePerTurn === "number" ? raw.chancePerTurn : 0.12,
    manifest: {
      enabled: manifest.enabled !== false,
      maxExtraSegmentsPerPlayer: manifest.maxExtraSegmentsPerPlayer ?? 2
    },
    decay: {
      enabled: decay.enabled !== false,
      cooldownTurns: decay.cooldownTurns ?? 2
    },
    fog: {
      enabled: fog.enabled !== false
    }
  };
}

export async function loadBattleshipCatalog() {
  if (shipCatalogCache) return shipCatalogCache;
  const index = await fetchJson(SHIP_INDEX_URL);
  const ids = Array.isArray(index?.shipIds) ? index.shipIds : [];
  const catalog = new Map();
  for (const id of ids) {
    const def = await fetchJson(`${BATTLESHIP_BASE}/ships/${id}.json`);
    const normalized = normalizeShipDefinition(def);
    catalog.set(normalized.id, normalized);
  }
  shipCatalogCache = catalog;
  return catalog;
}

export async function loadBattleshipConfig() {
  if (matchConfigCache) return matchConfigCache;
  const catalog = await loadBattleshipCatalog();
  const data = await fetchJson(MATCH_CONFIG_URL);
  const boardSize = parseInt(data.boardSize, 10) || 8;
  const fleet = [];
  (Array.isArray(data.fleet) ? data.fleet : []).forEach(entry => {
    const shipId = entry?.shipId;
    const count = parseInt(entry?.count, 10) || 0;
    if (!shipId || count <= 0) return;
    const def = catalog.get(shipId);
    if (!def) {
      throw new Error(`Unbekannter shipId in config: ${shipId}`);
    }
    const max = def.rules?.maxPerPlayer;
    if (typeof max === "number" && count > max) {
      throw new Error(`Config count für ${shipId} überschreitet maxPerPlayer (${max}).`);
    }
    fleet.push({ shipId, count, length: def.length, name: def.name });
  });

  const rules = {
    allowAdjacency: data.rules?.allowAdjacency !== false,
    hauntedEvents: normalizeHauntedRules(data.rules?.hauntedEvents || {})
  };

  matchConfigCache = { ...data, boardSize, fleet, rules };
  return matchConfigCache;
}

export class GhostshipsClient {
  constructor({ apiUrl = DEFAULT_API, pollMs = DEFAULT_POLL_MS } = {}) {
    this.apiUrl = apiUrl;
    this.pollMs = pollMs;
    this.state = {
      matchId: null,
      token: null,
      you: null,
      match: null,
      lastLogTs: 0
    };
    this.listeners = new Set();
    this.pollTimer = null;
  }

  getState() {
    return {
      ...this.state,
      active: !!(this.state.matchId && this.state.token)
    };
  }

  onState(fn) {
    if (typeof fn === "function") {
      this.listeners.add(fn);
    }
    return () => this.listeners.delete(fn);
  }

  emitState(payload) {
    this.listeners.forEach(fn => {
      try {
        fn(payload);
      } catch (e) {
        console.warn("Ghostships listener error", e);
      }
    });
  }

  reset() {
    this.stopPolling();
    this.state = {
      matchId: null,
      token: null,
      you: null,
      match: null,
      lastLogTs: 0
    };
  }

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  startPolling(tickFn) {
    this.stopPolling();
    const fn = tickFn || (() => this.fetchState().catch(() => {}));
    this.pollTimer = setInterval(fn, this.pollMs);
    return this.pollTimer;
  }

  async apiRequest(action, payload = {}) {
    const res = await fetch(this.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload })
    });

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error("Ungültige Antwort vom Ghostships-Server.");
    }

    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `Serverfehler (${res.status})`);
    }
    return data;
  }

  applyMatch(match) {
    if (!match) return null;
    const prev = this.state.match;
    const lastSeen = this.state.lastLogTs || 0;
    const logs = Array.isArray(match.log) ? match.log : [];
    const newLogs = logs.filter(entry => (entry.ts || 0) > lastSeen);
    const maxLog = logs.reduce((max, entry) => Math.max(max, entry.ts || 0), lastSeen);

    this.state = {
      ...this.state,
      match,
      matchId: match.id || this.state.matchId,
      you: match.you || this.state.you,
      lastLogTs: maxLog
    };

    const payload = { match, prev, delta: { logs: newLogs } };
    this.emitState(payload);

    if (match.phase === "finished") {
      this.stopPolling();
    }

    return match;
  }

  async createMatch(boardSize, user) {
    const res = await this.apiRequest("create", { boardSize, user });
    this.state.matchId = res.match?.id || null;
    this.state.token = res.token || null;
    this.state.you = res.match?.you || null;
    this.applyMatch(res.match);
    this.startPolling();
    return res.match;
  }

  async joinMatch(matchId, user, { rejoin = false } = {}) {
    const res = await this.apiRequest("join", { matchId, user, rejoin });
    this.state.matchId = res.match?.id || matchId;
    this.state.token = res.token || null;
    this.state.you = res.match?.you || null;
    this.applyMatch(res.match);
    this.startPolling();
    return res.match;
  }

  async fetchState() {
    if (!this.state.matchId || !this.state.token) return null;
    const res = await this.apiRequest("state", {
      matchId: this.state.matchId,
      token: this.state.token
    });
    return this.applyMatch(res.match);
  }

  async placeShip(ship, pos, dir) {
    if (!this.state.matchId || !this.state.token) throw new Error("Kein Match aktiv.");
    const res = await this.apiRequest("place", {
      matchId: this.state.matchId,
      token: this.state.token,
      ship,
      pos,
      dir: dir || "h"
    });
    return this.applyMatch(res.match);
  }

  async autoPlace() {
    if (!this.state.matchId || !this.state.token) throw new Error("Kein Match aktiv.");
    const res = await this.apiRequest("auto", {
      matchId: this.state.matchId,
      token: this.state.token
    });
    return this.applyMatch(res.match);
  }

  async setReady() {
    if (!this.state.matchId || !this.state.token) throw new Error("Kein Match aktiv.");
    const res = await this.apiRequest("ready", {
      matchId: this.state.matchId,
      token: this.state.token
    });
    return this.applyMatch(res.match);
  }

  async fire(pos) {
    if (!this.state.matchId || !this.state.token) throw new Error("Kein Match aktiv.");
    const res = await this.apiRequest("fire", {
      matchId: this.state.matchId,
      token: this.state.token,
      pos
    });
    return this.applyMatch(res.match);
  }

  async leaveMatch() {
    if (!this.state.matchId || !this.state.token) {
      this.reset();
      return null;
    }
    const res = await this.apiRequest("leave", {
      matchId: this.state.matchId,
      token: this.state.token
    });
    this.applyMatch(res.match);
    this.reset();
    return res.match;
  }

  async rematch() {
    if (!this.state.matchId || !this.state.token) throw new Error("Kein Match aktiv.");
    const res = await this.apiRequest("rematch", {
      matchId: this.state.matchId,
      token: this.state.token
    });
    return this.applyMatch(res.match);
  }

  loadSession({ matchId, token, you, lastLogTs = 0 } = {}) {
    if (!matchId || !token) return;
    this.state.matchId = matchId;
    this.state.token = token;
    this.state.you = you || this.state.you;
    this.state.lastLogTs = lastLogTs;
  }

  hasSession() {
    return !!(this.state.matchId && this.state.token);
  }
}

export function boardLetters(size) {
  const letters = BOARD_LETTERS[size];
  if (letters && Array.isArray(letters)) return letters;
  const safeSize = Number.isFinite(size) ? size : BOARD_LETTERS[8].length;
  const clamped = Math.max(BOARD_LETTERS[8].length, Math.min(safeSize, BOARD_LETTERS[10].length));
  return BOARD_LETTERS[10].slice(0, clamped);
}

// Default Export for backward compatibility or ease of use
export const GhostshipsEngine = {
  createClient(options) {
    return new GhostshipsClient(options || {});
  },
  loadBattleshipCatalog,
  loadBattleshipConfig,
  SHIP_INDEX_URL,
  MATCH_CONFIG_URL,
  boardLetters
};

export default GhostshipsEngine;
