// Core adventure engine logic.
import { parseInput } from './parser.js';
import { loadJson, loadAscii } from './loader.js';
import { runEvents } from './events.js';
import { startCombat, handleCombatAction } from './combat.js';
import { ADVENTURE_INDEX, getCurrentAdventure, getDataRoot, setCurrentAdventure } from './config.js';
import {
  advLog,
  clearAdventureUI,
  ensureAdventureUI,
  renderRoomContent,
  renderStatus,
  setAsciiContent
} from './ui.js';

const SAVE_PREFIX = 'darkadv_';

const defaultStats = { hp: 12, attack: 2, defense: 1 };

const createEmptyCache = () => ({
  world: null,
  rooms: {},
  items: {},
  objects: {},
  enemies: {},
  npcs: {},
  dialogs: {}
});

const createEmptyState = () => ({
  location: null,
  inventory: [],
  flags: {},
  stats: { ...defaultStats },
  inCombat: false,
  enemy: null,
  visited: {},
  lockedExits: {},
  npcFlags: {},
  dialog: { active: false, npcId: null, nodeId: null }
});

let cache = createEmptyCache();
let state = createEmptyState();
let adventureActive = false;
let activeAdventureId = null;

function isActive() {
  return adventureActive;
}

function deactivate() {
  adventureActive = false;
}

function getSaveKey() {
  const advId = getCurrentAdventure() ? getCurrentAdventure().id : 'default';
  if (typeof getUserName === 'function') {
    return `${SAVE_PREFIX}${advId}_${getUserName()}`;
  }
  return `${SAVE_PREFIX}${advId}_guest`;
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

async function loadRoom(id) {
  if (!cache.rooms[id]) {
    cache.rooms[id] = await loadJson(`rooms/${id}.json`);
  }
  return cache.rooms[id];
}

async function loadItem(id) {
  if (!cache.items[id]) {
    cache.items[id] = await loadJson(`items/${id}.json`);
  }
  return cache.items[id];
}

async function loadObject(id) {
  if (!cache.objects[id]) {
    cache.objects[id] = await loadJson(`objects/${id}.json`);
  }
  return cache.objects[id];
}

async function loadEnemy(id) {
  if (!cache.enemies[id]) {
    cache.enemies[id] = await loadJson(`enemies/${id}.json`);
  }
  return cache.enemies[id];
}

async function loadNpc(id) {
  if (!cache.npcs[id]) {
    cache.npcs[id] = await loadJson(`npcs/${id}.json`);
    if (cache.npcs[id].flags && !state.npcFlags[id]) {
      state.npcFlags[id] = { ...cache.npcs[id].flags };
    }
  }
  return cache.npcs[id];
}

async function loadDialog(npcId) {
  if (!cache.dialogs[npcId]) {
    cache.dialogs[npcId] = await loadJson(`dialogs/${npcId}.json`);
  }
  return cache.dialogs[npcId];
}

function npcVisible(npc) {
  if (!npc) return false;
  if (npc.hidden_if_flag && flagMatches(npc.hidden_if_flag)) return false;
  if (npc.only_if_flag && !flagMatches(npc.only_if_flag)) return false;
  return true;
}

async function listNpcsInRoom(roomId) {
  const room = await loadRoom(roomId);
  const npcIds = new Set(room.npcs || []);
  Object.values(cache.npcs).forEach((npc) => {
    if (npc.room && normalizeId(npc.room) === normalizeId(roomId)) {
      npcIds.add(npc.id);
    }
  });

  const visible = [];
  for (const npcId of npcIds) {
    // eslint-disable-next-line no-await-in-loop
    const npc = await loadNpc(npcId);
    if (npcVisible(npc)) {
      visible.push(npc);
    }
  }
  return visible;
}

function resetAdventureData(id) {
  cache = createEmptyCache();
  state = createEmptyState();
  activeAdventureId = id;
  adventureActive = false;
}

async function loadAdventureIndex() {
  const res = await fetch(ADVENTURE_INDEX);
  if (!res.ok) {
    throw new Error('Adventure-Index konnte nicht geladen werden.');
  }
  const data = await res.json();
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.adventures)) return data.adventures;
  throw new Error('Adventure-Index ist ungültig.');
}

function selectAdventureEntry(adventures, adventureId) {
  if (!adventures || !adventures.length) return null;
  const requestedId = adventureId ? normalizeId(adventureId) : null;
  if (requestedId) {
    const match = adventures.find((adv) => normalizeId(adv.id) === requestedId);
    if (match) return match;
  }
  return adventures.find((adv) => adv.default) || adventures[0];
}

async function loadAdventure(adventureId) {
  const adventures = await loadAdventureIndex();
  const selected = selectAdventureEntry(adventures, adventureId);
  if (!selected) {
    throw new Error('Kein Adventure verfügbar.');
  }

  if (normalizeId(selected.id) !== normalizeId(activeAdventureId)) {
    resetAdventureData(selected.id);
  }

  setCurrentAdventure(selected);

  const gameMeta = await loadJson('game.json');
  setCurrentAdventure(selected, gameMeta);

  cache.world = await loadJson('world.json');

  return getCurrentAdventure();
}

async function ensureAdventure(adventureId) {
  try {
    await loadAdventure(adventureId || getCurrentAdventure()?.id);
  } catch (err) {
    const msg = err?.message || 'Adventure konnte nicht geladen werden.';
    if (typeof printLines === 'function') {
      printLines([msg, ''], 'error');
    }
    throw err;
  }
}

function saveState() {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    getSaveKey(),
    JSON.stringify({
      location: state.location,
      inventory: state.inventory,
      flags: state.flags,
      stats: state.stats,
      inCombat: state.inCombat,
      enemy: state.enemy,
      visited: state.visited,
      lockedExits: state.lockedExits,
      npcFlags: state.npcFlags,
      dialog: state.dialog
    })
  );
}

function loadStateFromSave() {
  if (typeof localStorage === 'undefined') return false;
  const raw = localStorage.getItem(getSaveKey());
  if (!raw) return false;
  try {
    const saved = JSON.parse(raw);
    state = createEmptyState();
    Object.assign(state, saved);
    if (!state.dialog) {
      state.dialog = { active: false, npcId: null, nodeId: null };
    }
    if (!state.npcFlags) {
      state.npcFlags = {};
    }
    return true;
  } catch (err) {
    console.error('Savegame fehlerhaft:', err);
    return false;
  }
}

function clearSave() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(getSaveKey());
}

function normalizeId(str) {
  return (str || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function findMatchByNormalized(list = [], query = '') {
  const normalizedQuery = normalizeId(query);
  if (!normalizedQuery) return null;
  const exact = list.find((id) => normalizeId(id) === normalizedQuery);
  if (exact) return exact;
  return list.find((id) => normalizeId(id).includes(normalizedQuery)) || null;
}

function flagMatches(condition) {
  if (!condition || !condition.key) return true;
  return state.flags[condition.key] === condition.equals;
}

function inventoryMatches(list = []) {
  if (!Array.isArray(list) || !list.length) return true;
  return list.every((itemId) => state.inventory.includes(itemId));
}

function choiceHidden(choice = {}) {
  const condition = choice.hidden_if;
  if (!condition) return false;
  const inventoryHidden = condition.inventory && !inventoryMatches(condition.inventory);
  const flagHidden = condition.flag && !flagMatches(condition.flag);
  return inventoryHidden || flagHidden;
}

function choiceAllowed(choice = {}) {
  const req = choice.requires;
  if (!req) return true;
  if (req.inventory && !inventoryMatches(req.inventory)) return false;
  if (req.flag && !flagMatches(req.flag)) return false;
  return true;
}

function buildVisibleChoices(node = {}) {
  const visible = [];
  (node.choices || []).forEach((choice) => {
    if (choiceHidden(choice)) return;
    visible.push({ choice, locked: !choiceAllowed(choice) });
  });
  return visible;
}

function describeInventory() {
  ensureAdventureUI();
  if (!state.inventory.length) {
    advLog(['Dein Inventar ist leer.']);
    return;
  }
  const lines = ['Inventar:'];
  state.inventory.forEach((id) => lines.push(`- ${id}`));
  advLog(lines);
}

async function showRoom(firstTime = false) {
  ensureAdventureUI();
  const room = await loadRoom(state.location);
  state.visited[room.id] = true;

  if (room.ascii) {
    await loadAscii(room.ascii);
  } else {
    setAsciiContent('');
  }

  const lines = [];
  lines.push(room.title);
  lines.push('');
  lines.push(room.description);

  if (room.items && room.items.length) {
    lines.push('');
    lines.push('Hier siehst du: ' + room.items.map((i) => `"${i}"`).join(', '));
  }
  if (room.objects && room.objects.length) {
    lines.push('Objekte: ' + room.objects.join(', '));
  }
  const npcsInRoom = await listNpcsInRoom(room.id);
  if (npcsInRoom.length) {
    lines.push('Personen: ' + npcsInRoom.map((n) => n.name || n.id).join(', '));
  }
  const exits = Object.keys(room.exits || {});
  if (exits.length) {
    lines.push('Ausgänge: ' + exits.join(', '));
  }

  renderRoomContent(lines);
  renderStatus(state);

  const events = firstTime && room.on_first_enter ? room.on_first_enter : room.on_enter;
  if (Array.isArray(events) && events.length) {
    await runEvents(events, state, ctxForEvents());
  }
}

function ctxForEvents() {
  return {
    saveState,
    showCurrentRoom: async (first = false) => showRoom(first),
    startCombat: async (enemyId) => startCombat(enemyId, state, ctxForEvents()),
    loadEnemy,
    startDialog: async (npcId, nodeId = null) => startDialogWithNpc(npcId, nodeId),
    endDialog: () => endDialog(),
    gotoDialogNode: async (nodeId) => gotoDialogNode(nodeId),
    showDialogNode: async () => showDialogNode()
  };
}

async function performMove(action) {
  const room = await loadRoom(state.location);
  const direction = action.direction || action.object;
  const dest = room.exits ? room.exits[direction] : null;
  const lockKey = `${room.id}:${direction}`;

  if (!dest) {
    advLog([cache.world.messages.cannotGo]);
    return;
  }
  if (state.lockedExits[lockKey]) {
    advLog(['Der Weg ist versperrt.']);
    return;
  }

  state.location = dest;
  saveState();
  await showRoom(!state.visited[dest]);
}

async function performTake(action) {
    const room = await loadRoom(state.location);
    if (!action.object) {
      advLog([cache.world.messages.unknownCommand]);
      return;
    }
  const available = room.items || [];
  const match = findMatchByNormalized(available, action.object);

  if (!match) {
    advLog([cache.world.messages.cannotTake]);
    return;
  }
  const item = await loadItem(match);
  if (!item.pickup) {
    advLog(['Das lässt sich nicht mitnehmen.']);
    return;
  }
  room.items = available.filter((i) => i !== match);
  if (!state.inventory.includes(item.id)) {
    state.inventory.push(item.id);
  }
  advLog([`Du nimmst ${item.name}.`]);
  saveState();
}

async function performInspect(action) {
  const room = await loadRoom(state.location);

  // Kein Objekt angegeben → Umgebung / Raumbeschreibung erneut anzeigen
  if (!action.object) {
    await showRoom(false);
    return;
  }

  const candidates = (room.objects || []).concat(room.items || []);
  const match = findMatchByNormalized(candidates, action.object);
  if (!match) {
    advLog(['Nichts Besonderes.']);
    return;
  }

  if (room.objects.includes(match)) {
    const obj = await loadObject(match);
    const lines = [`${obj.name}: ${obj.description}`];
    advLog(lines);
    await runEvents(obj.inspect || [], state, ctxForEvents());
  } else if (room.items.includes(match) || state.inventory.includes(match)) {
    const item = await loadItem(match);
    advLog([`${item.name}: ${item.description}`]);
  }
}

async function performUse(action) {
  const room = await loadRoom(state.location);
  if (!action.object) {
    advLog([cache.world.messages.unknownCommand]);
    return;
  }
  const onObject = findMatchByNormalized(room.objects || [], action.object);
  if (onObject) {
    const obj = await loadObject(onObject);
    if (obj.locked) {
      await runEvents(obj.on_locked_use || [], state, ctxForEvents());
      return;
    }
    await runEvents(obj.use || [], state, ctxForEvents());
    return;
  }
  const itemMatch = findMatchByNormalized(state.inventory, action.object);
  if (itemMatch) {
    const item = await loadItem(itemMatch);
    await runEvents(item.on_use || [], state, ctxForEvents());
    return;
  }
  advLog([cache.world.messages.unknownCommand]);
}

async function performCombine(action) {
  const sourceId = normalizeId(action.object || '');
  const targetId = normalizeId(action.target || '');
  const match = findMatchByNormalized(state.inventory, action.object);
  if (!match) {
    advLog(['Dir fehlt ein benötigtes Item.']);
    return;
  }
  const item = await loadItem(match);
  const combination = item.combine ? item.combine[targetId] : null;
  if (!combination) {
    advLog(['Das lässt sich nicht kombinieren.']);
    return;
  }
  await runEvents(combination, state, ctxForEvents());
}

async function performTalk(action) {
  const npcs = await listNpcsInRoom(state.location);
  if (!npcs.length) {
    dialogLog(['Niemand antwortet.']);
    return;
  }

  let target = null;
  if (action.object) {
    const normalized = normalizeId(action.object);
    target = npcs.find(
      (npc) => normalizeId(npc.id) === normalized || normalizeId(npc.name || '').includes(normalized)
    );
  }

  if (!target) {
    target = npcs.length === 1 ? npcs[0] : null;
  }

  if (!target) {
    dialogLog(['Niemand antwortet.']);
    return;
  }

  await startDialogWithNpc(target.id, target.dialog_start);
}

function dialogLog(lines = [], cls) {
  if (typeof advLog === 'function') {
    advLog(lines, cls);
  } else if (typeof printLines === 'function') {
    const payload = Array.isArray(lines) ? lines : [String(lines)];
    printLines(payload, cls);
  }
}

function endDialog(showMessage = false) {
  if (!state.dialog.active) return;
  state.dialog = { active: false, npcId: null, nodeId: null };
  saveState();
  if (showMessage) {
    dialogLog(['(Dialog beendet)']);
  }
}

async function showDialogNode() {
  if (!state.dialog.active) return;
  ensureAdventureUI();
  const npc = await loadNpc(state.dialog.npcId);
  const dialog = await loadDialog(state.dialog.npcId);
  const nodeId = state.dialog.nodeId || dialog.start || npc.dialog_start || 'start';
  const node = dialog.nodes ? dialog.nodes[nodeId] : null;
  if (!node) {
    dialogLog(['(Dialog konnte nicht geladen werden.)']);
    endDialog();
    return;
  }

  state.dialog.nodeId = nodeId;
  saveState();

  if (node.ascii) {
    await loadAscii(node.ascii);
  }

  const visibleChoices = buildVisibleChoices(node);
  const lines = [];
  lines.push(`— ${npc.name || npc.id} —`);
  if (node.text) {
    lines.push(node.text);
  }
  if (visibleChoices.length) {
    visibleChoices.forEach(({ choice, locked }, idx) => {
      let label = `${idx + 1}. ${choice.text}`;
      if (locked) {
        label += ' [X]';
      }
      lines.push(label);
    });
  }
  lines.push('');
  if (visibleChoices.length) {
    lines.push(`Wähle 1-${visibleChoices.length} oder tippe 'abbrechen'.`);
  } else {
    lines.push("Tippe 'abbrechen', um den Dialog zu schließen.");
  }
  lines.push('');

  dialogLog(lines);
}

async function handleDialogChoice(index) {
  if (!state.dialog.active) return;
  const dialog = await loadDialog(state.dialog.npcId);
  const npc = await loadNpc(state.dialog.npcId);
  const nodeId = state.dialog.nodeId || dialog.start || npc.dialog_start || 'start';
  const node = dialog.nodes ? dialog.nodes[nodeId] : null;
  if (!node) {
    endDialog();
    return;
  }
  const visibleChoices = buildVisibleChoices(node);
  const selected = visibleChoices[index - 1];
  if (!selected) {
    dialogLog(['Bitte eine gültige Zahl wählen.']);
    return;
  }

  if (selected.locked) {
    dialogLog(['Das kannst du gerade nicht.']);
    await showDialogNode();
    return;
  }

  if (selected.choice.ascii) {
    await loadAscii(selected.choice.ascii);
  }

  if (Array.isArray(selected.choice.events) && selected.choice.events.length) {
    await runEvents(selected.choice.events, state, ctxForEvents());
  }

  if (!state.dialog.active) return;

  const nextNode = selected.choice.next || dialog.start || npc.dialog_start;
  if (nextNode === 'end' || !dialog.nodes?.[nextNode]) {
    endDialog();
    return;
  }

  state.dialog.nodeId = nextNode;
  saveState();
  await showDialogNode();
}

async function startDialogWithNpc(npcId, nodeId = null) {
  const npc = await loadNpc(npcId);
  const dialog = await loadDialog(npc.id);
  const startNode = nodeId || dialog.start || npc.dialog_start || 'start';
  state.dialog = { active: true, npcId: npc.id, nodeId: startNode };
  saveState();
  await showDialogNode();
}

async function gotoDialogNode(nodeId) {
  if (!state.dialog.active) return;
  state.dialog.nodeId = nodeId;
  saveState();
  await showDialogNode();
}

async function handleAction(action) {
  if (!action || !action.verb) {
    advLog([cache.world.messages.unknownCommand]);
    return;
  }

  if (state.inCombat) {
    const handled = await handleCombatAction(action, state, ctxForEvents());
    if (!handled) {
      advLog(['Kampf läuft bereits.']);
    }
    return;
  }

  switch (action.verb) {
    case 'go':
      await performMove(action);
      break;
    case 'take':
      await performTake(action);
      break;
    case 'inspect':
    case 'look':
      await performInspect(action);
      break;
    case 'use':
    case 'open':
    case 'close':
    case 'push':
    case 'pull':
      await performUse(action);
      break;
    case 'talk':
      await performTalk(action);
      break;
    case 'combine':
      await performCombine(action);
      break;
    case 'inventory':
      describeInventory();
      break;
    case 'help':
      printHelp();
      break;
    case 'exit':
      adventure.exit();
      break;
    case 'attack':
      await handleCombatAction(action, state, ctxForEvents());
      break;
    default:
      advLog([cache.world.messages.unknownCommand]);
  }
}

function printHelp() {
  advLog([
    'Adventure-Befehle:',
    '- adv start [name] | adv continue [name] | adv reset [name] | adv exit',
    '- Bewegung: geh nord/ost/sued/west oder n/s/o/w',
    '- nimm <item>, untersuche <objekt>',
    '- benutze <objekt|item>',
    '- sprich mit <person>',
    '- kombiniere <item> mit <anderes>',
    '- inventar, hilfe',
    '- exit oder quit beendet das Adventure'
  ]);
}

export const adventure = {
  async loadAdventure(adventureId) {
    await ensureAdventure(adventureId);
    return getCurrentAdventure();
  },
  async start(adventureId) {
    try {
      await ensureAdventure(adventureId);
    } catch {
      return;
    }
    adventureActive = true;
    state = createEmptyState();
    state.location = cache.world.startRoom;
    state.flags = clone(cache.world.globalFlags || {});
    saveState();
    ensureAdventureUI();
    advLog(['Starte Adventure...']);
    await showRoom(true);
  },
  async continue(adventureId) {
    try {
      await ensureAdventure(adventureId);
    } catch {
      return;
    }
    adventureActive = true;
    const loaded = loadStateFromSave();
    if (!loaded) {
      ensureAdventureUI();
      advLog(['Kein Spielstand gefunden. Starte neu.']);
      await adventure.start(adventureId);
      return;
    }
    ensureAdventureUI();
    advLog(['Lade letzten Spielstand...']);
    if (state.dialog.active) {
      dialogLog(['(Dialog fortgesetzt)']);
      await showDialogNode();
      return;
    }
    await showRoom(!state.visited[state.location]);
  },
  async reset(adventureId) {
    try {
      await ensureAdventure(adventureId);
    } catch {
      return;
    }
    clearSave();

    await adventure.start(adventureId);
  },
  async handleInput(text) {
    if (state.dialog?.active) {
      const trimmed = (text || '').trim();
      const normalized = normalizeId(trimmed);
      if (!trimmed) {
        dialogLog(["Zahl wählen oder 'abbrechen'."]);
        return;
      }
      if (['abbrechen', 'exit', 'bye', 'quit'].includes(normalized)) {
        endDialog(true);
        return;
      }
      if (/^\d+$/.test(trimmed)) {
        const num = Number.parseInt(trimmed, 10);
        if (num >= 1 && num <= 99) {
          await handleDialogChoice(num);
        } else {
          dialogLog(['Bitte eine gültige Zahl wählen.']);
        }
        return;
      }
      dialogLog(["Zahl wählen oder 'abbrechen'."]);
      return;
    }
    if (!cache.world) {
      try {
        await ensureAdventure();
      } catch {
        return;
      }
    }
    const action = parseInput(text);
    await handleAction(action);
  },
  help: printHelp,
  getState: () => state,
  getWorld: () => cache.world,
  getDataRoot,
  getCurrentAdventure,
  isActive,
  exit: () => {
    deactivate();
    clearAdventureUI();
    printLines(['Du verlässt das Adventure und kehrst ins Darknetz-Terminal zurück.', ''], 'dim');
  }
};

export default adventure;
