// ---------------------------------------------------------
// Ghostships Engine – API-Client und geteilte Spiellogik
// ---------------------------------------------------------

(function(global) {
  const DEFAULT_API = "content-builder/api/ghostships.php";
  const DEFAULT_POLL_MS = 8000;

  const FLEET = [
    { id: "wraith", length: 3 },
    { id: "barge", length: 2 },
    { id: "skiff", length: 2 },
    { id: "relic", length: 1 },
    { id: "relic", length: 1 },
  ];

  const SPRITE_META_URL = "content/games/ghostships_sprites.json";

  class GhostshipsClient {
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

  global.GhostshipsEngine = {
    createClient(options) {
      return new GhostshipsClient(options || {});
    },
    FLEET,
    SPRITE_META_URL
  };
})(window);
