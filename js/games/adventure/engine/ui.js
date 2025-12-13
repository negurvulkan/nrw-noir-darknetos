// Adventure UI helpers for rendering a dedicated adventure area inside the terminal output.

let advRoot = null;
let advStatusEl = null;
let advAsciiEl = null;
let advRoomEl = null;
let advLogEl = null;

function appendToOutput(el) {
  if (typeof outputEl === 'undefined') return;
  outputEl.appendChild(el);
  outputEl.scrollTop = outputEl.scrollHeight;
}

export function ensureAdventureUI() {
  if (advRoot && advRoot.isConnected) return advRoot;
  if (typeof document === 'undefined' || typeof outputEl === 'undefined') return null;

  advRoot = document.createElement('div');
  advRoot.className = 'adv-ui';

  advStatusEl = document.createElement('div');
  advStatusEl.className = 'adv-status';

  advAsciiEl = document.createElement('pre');
  advAsciiEl.className = 'adv-ascii';

  advRoomEl = document.createElement('div');
  advRoomEl.className = 'adv-room';

  advLogEl = document.createElement('div');
  advLogEl.className = 'adv-log';

  advRoot.appendChild(advStatusEl);
  advRoot.appendChild(advAsciiEl);
  advRoot.appendChild(advRoomEl);
  advRoot.appendChild(advLogEl);

  appendToOutput(advRoot);

  if (typeof window !== 'undefined') {
    window.advAsciiEl = advAsciiEl;
  }

  return advRoot;
}

export function renderStatus(state) {
  if (!advStatusEl || !state) return;
  
  // Spieler Stats
  const hp = state.stats?.hp ?? '-';
  const maxHp = state.stats?.maxHp ?? null;
  const atk = state.stats?.attack ?? '-';
  const def = state.stats?.defense ?? '-';
  const hpText = maxHp ? `${Math.max(hp, 0)}/${maxHp}` : hp;
  const guard = state.combat?.defending ? ' (Verteidigung)' : '';
  
  let status = `[${state.location}]  HP ${hpText}  ⚔ ${atk}  🛡 ${def}${guard}`;

  // Kampf-Status (angepasst auf Actor/Opponent Logik)
  // Wir unterstützen activeOpponent (neu) und enemy (legacy fallback)
  const opponent = state.activeOpponent || state.enemy;
  
  if (state.inCombat && opponent) {
    const oppHp = Math.max(opponent.stats?.hp ?? 0, 0);
    const oppDef = opponent.stats?.defense ?? '-';
    const oppAtk = opponent.stats?.attack ?? '-';
    const name = opponent.name || opponent.id || 'Gegner';
    
    status += `  | Gegner: ${name} (${oppHp} HP, ⚔ ${oppAtk} 🛡 ${oppDef})`;
  }

  advStatusEl.textContent = status;
}

export function renderRoomContent(lines = []) {
  if (advRoomEl) {
    advRoomEl.textContent = lines.join('\n');
    return;
  }
  if (typeof printLines === 'function') {
    printLines(lines);
  }
}

export function setAsciiContent(text = '') {
  if (advAsciiEl) {
    advAsciiEl.textContent = text;
  }
}

export function advLog(lines = [], cls) {
  ensureAdventureUI();
  const payload = Array.isArray(lines) ? lines : [String(lines)];

  if (!advLogEl) {
    if (typeof printLines === 'function') {
      printLines(payload, cls);
    }
    return;
  }

  payload.forEach((text) => {
    const div = document.createElement('div');
    div.textContent = text;
    if (cls) div.className = cls;
    advLogEl.appendChild(div);
  });

  const maxLines = 50;
  while (advLogEl.childNodes.length > maxLines) {
    advLogEl.removeChild(advLogEl.firstChild);
  }

  if (typeof outputEl !== 'undefined') {
    outputEl.scrollTop = outputEl.scrollHeight;
  }
}

export function clearAdventureUI() {
  if (advRoot && advRoot.isConnected) {
    advRoot.remove();
  }
  advRoot = null;
  advStatusEl = null;
  advAsciiEl = null;
  advRoomEl = null;
  advLogEl = null;
  if (typeof window !== 'undefined') {
    delete window.advAsciiEl;
  }
}