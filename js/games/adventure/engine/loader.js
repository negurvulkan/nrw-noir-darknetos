// Adventure loader utilities
// Responsible for loading JSON assets and ASCII art for the adventure module.
import { ensureAdventureUI } from './ui.js';
import { getDataRoot } from './config.js';

function buildDataUrl(path) {
  const root = getDataRoot().replace(/\/$/, '');
  return `${root}/${path}`;
}

/**
 * Load a JSON file relative to the adventure data root.
 * @param {string} path Relative path inside the data directory.
 */
export async function loadJson(path) {
  const url = buildDataUrl(path);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Konnte Datei nicht laden: ${url}`);
  }
  return res.json();
}

function normalizeLegacyStats(data = {}) {
  if (data.stats && typeof data.stats === 'object') {
    return data.stats;
  }
  if (data.attributes && typeof data.attributes === 'object') {
    return data.attributes;
  }

  const hp = data.hp ?? data.health ?? data.maxHp;
  const attack = data.attack;
  const defense = data.defense;
  if ([hp, attack, defense].some((value) => Number.isFinite(value))) {
    const stats = {};
    if (Number.isFinite(hp)) {
      stats.hp = hp;
      stats.maxHp = data.maxHp ?? hp;
    }
    if (Number.isFinite(attack)) {
      stats.attack = attack;
    }
    if (Number.isFinite(defense)) {
      stats.defense = defense;
    }
    return stats;
  }
  return null;
}

function normalizeLegacyDialog(data = {}) {
  const dialogStart = data.dialog?.start || data.dialog_start || data.dialogStart;
  if (!dialogStart && !data.dialog) return undefined;
  return { ...(data.dialog || {}), start: dialogStart || data.dialog?.start };
}

function normalizeLegacyCombat(data = {}) {
  const enabledFromData =
    data.combat?.enabled ?? data.combat_enabled ?? data.combatEnabled ??
    (data.stats ? true : undefined);

  if (!data.combat && enabledFromData === undefined) return undefined;
  return { ...(data.combat || {}), enabled: enabledFromData ?? data.combat?.enabled ?? false };
}

export function mapLegacyActor(data = {}, fallbackId = null) {
  const actor = { ...data };
  const id = actor.id || fallbackId;

  const stats = normalizeLegacyStats(actor);
  const dialog = normalizeLegacyDialog(actor);
  const combat = normalizeLegacyCombat({ ...actor, stats });

  return {
    ...actor,
    id,
    name: actor.name || actor.title || id,
    description: actor.description || actor.desc || actor.text,
    stats,
    combat,
    dialog
  };
}

export async function loadActorJson(id) {
  const attempts = [
    { path: `actors/${id}.json` },
    { path: `npcs/${id}.json`, type: 'npc' },
    { path: `enemies/${id}.json`, type: 'enemy' }
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const raw = await loadJson(attempt.path);
      const mapped = mapLegacyActor(raw, id);
      if (attempt.type && !mapped.type) {
        mapped.type = attempt.type;
      }
      return mapped;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

/**
 * Load and render ASCII art in the adventure UI when available.
 * Falls back to printing directly into the terminal output.
 * @param {{file?: string, fontSize?: number} | string} asciiConfig
 */
export async function loadAscii(asciiConfig) {
  const file = typeof asciiConfig === 'string' ? asciiConfig : asciiConfig.file;
  const fontSize =
    typeof asciiConfig === 'object' ? asciiConfig.fontSize || asciiConfig.size : undefined;
  const url = buildDataUrl(file);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ASCII konnte nicht geladen werden: ${url}`);
  }
  const text = await res.text();

  if (typeof window !== 'undefined' && typeof ensureAdventureUI === 'function') {
    // Make sure the adventure UI exists so ASCII art ends up in the dedicated area.
    ensureAdventureUI();
  }

  if (typeof window !== 'undefined' && window.advAsciiEl) {
    window.advAsciiEl.textContent = text;
    if (fontSize) {
      window.advAsciiEl.style.fontSize = `${fontSize}px`;
    }
    return text;
  }

  if (typeof document !== 'undefined' && typeof outputEl !== 'undefined') {
    const pre = document.createElement('pre');
    pre.textContent = text;
    pre.style.fontFamily = 'monospace';
    if (fontSize) {
      pre.style.fontSize = `${fontSize}px`;
    }
    pre.classList.add('adventure-ascii');
    outputEl.appendChild(pre);
    outputEl.scrollTop = outputEl.scrollHeight;
  } else if (typeof printLines === 'function') {
    printLines(text.split('\n'));
  }

  return text;
}
