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
