// Adventure configuration and helpers for adventure selection.

export const ADVENTURES_ROOT = './js/games/adventure/adventures';
export const ADVENTURE_INDEX = `${ADVENTURES_ROOT}/index.json`;

let currentAdventure = null;

export function setCurrentAdventure(meta = null, gameMeta = {}) {
  currentAdventure = meta ? { ...meta, ...gameMeta } : null;
  return currentAdventure;
}

export function getCurrentAdventure() {
  return currentAdventure;
}

export function getDataRoot() {
  if (!currentAdventure) {
    throw new Error('Kein Adventure ausgewählt.');
  }
  return `${ADVENTURES_ROOT}/${currentAdventure.folder}`.replace(/\/$/, '');
}
