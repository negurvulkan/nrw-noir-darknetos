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

const defaultStats = { hp: 12, maxHp: 12, attack: 2, defense: 1 };

const DEBUG_LOG_LIMIT = 200;
let debugLogging = false;
const debugLogEntries = [];

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
  combat: { defending: false, enemyStartHp: null },
  visited: {},
  lockedExits: {},
  npcFlags: {},
  dialog: { active: false, npcId: null, nodeId: null }
});

let cache = createEmptyCache();
let state = createEmptyState();
let adventureActive = false;
let activeAdventureId = null;

function formatTimestamp() {
  return new Date().toISOString();
}

function formatDebugEntry(entry) {
  const prefix = `[ADV DEBUG ${entry.timestamp}]`;
  if (entry.type === 'input') {
    return `${prefix} Eingabe: ${entry.payload}`;
  }
  if (entry.type === 'event') {
    const info = entry.payload?.type || 'unbekanntes Event';
    return `${prefix} Event: ${info}`;
  }
  return `${prefix} ${entry.type}`;
}

function pushDebugEntry(type, payload) {
  const entry = { timestamp: formatTimestamp(), type, payload };
  debugLogEntries.push(entry);
  if (debugLogEntries.length > DEBUG_LOG_LIMIT) {
    debugLogEntries.shift();
  }
  if (debugLogging) {
    const formatted = formatDebugEntry(entry);
    if (typeof printLines === 'function') {
      printLines([formatted], 'dim');
    } else {
      // eslint-disable-next-line no-console
      console.debug(formatted);
    }
  }
  return entry;
}

function logInputForDebug(text) {
  if (!debugLogging) return;
  pushDebugEntry('input', text);
}

function logEventForDebug(event) {
  if (!debugLogging) return;
  pushDebugEntry('event', event);
}

function setDebugLogging(enabled) {
  debugLogging = !!enabled;
  const status = debugLogging ? 'aktiviert' : 'deaktiviert';
  const lines = [`Adventure-Debug-Logging ${status}.`];
  if (debugLogging) {
    lines.push('Eingaben und Eventketten werden mit Zeitstempel protokolliert.');
  }
  lines.push('');
  if (typeof printLines === 'function') {
    printLines(lines, 'dim');
  }
  return debugLogging;
}

function printDebugLog(limit = 20) {
  const entries = debugLogEntries.slice(-limit);
  const lines = ['Adventure Debug-Log:', '--------------------'];
  if (!entries.length) {
    lines.push('Keine Einträge vorhanden.');
  } else {
    entries.forEach((entry) => {
      lines.push(formatDebugEntry(entry));
    });
  }
  lines.push('');
  if (typeof printLines === 'function') {
    printLines(lines, 'dim');
  } else {
    // eslint-disable-next-line no-console
    console.debug(lines.join('\n'));
  }
}

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

function normalizeInventoryEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return { id: entry, qty: 1 };
  const id = entry.id || entry.item || null;
  if (!id) return null;
  const qty = Number.isFinite(entry.qty) && entry.qty > 0 ? entry.qty : 1;
  return { id, qty };
}

function migrateInventory(raw = []) {
  if (!Array.isArray(raw)) return [];
  const aggregated = new Map();
  raw.forEach((entry) => {
    const normalized = normalizeInventoryEntry(entry);
    if (!normalized) return;
    const prev = aggregated.get(normalized.id) || 0;
    aggregated.set(normalized.id, prev + normalized.qty);
  });
  return Array.from(aggregated.entries()).map(([id, qty]) => ({ id, qty }));
}

function getInventoryEntries() {
  if (!Array.isArray(state.inventory)) return [];
  state.inventory = migrateInventory(state.inventory);
  return state.inventory;
}

function findInventoryEntry(id) {
  const normalized = normalizeId(id);
  return getInventoryEntries().find((entry) => normalizeId(entry.id) === normalized) || null;
}

function getInventoryIds() {
  return getInventoryEntries()
    .map((entry) => entry.id)
    .filter(Boolean);
}

function getInvQty(id) {
  const entry = findInventoryEntry(id);
  return entry?.qty || 0;
}

async function addToInventory(id, qty = 1) {
  state.inventory = migrateInventory(getInventoryEntries());
  const amount = Number.isFinite(qty) ? qty : 1;
  if (amount <= 0) return 0;
  const item = await loadItem(id);
  const itemId = item.id || id;
  const stackable = item.stackable === true;
  const maxStack = Number.isFinite(item.maxStack) && item.maxStack > 0 ? item.maxStack : Infinity;

  if (!stackable) {
    if (!findInventoryEntry(itemId)) {
      state.inventory.push({ id: itemId, qty: 1 });
      return 1;
    }
    return 0;
  }

  const entry = findInventoryEntry(itemId) || { id: itemId, qty: 0 };
  if (!findInventoryEntry(itemId)) {
    state.inventory.push(entry);
  }
  const before = entry.qty;
  entry.qty = Math.min(maxStack, entry.qty + amount);
  return entry.qty - before;
}

function removeFromInventory(id, qty = 1) {
  state.inventory = migrateInventory(getInventoryEntries());
  const entry = findInventoryEntry(id);
  const amount = Number.isFinite(qty) ? qty : 1;
  if (!entry || amount <= 0) return 0;
  if (entry.qty < amount) return 0;
  if (entry.qty === amount) {
    state.inventory = getInventoryEntries().filter((inv) => normalizeId(inv.id) !== normalizeId(id));
    return amount;
  }
  entry.qty -= amount;
  return amount;
}

function hasInventoryItem(id) {
  return getInvQty(id) > 0;
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
      combat: state.combat,
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
    state.inventory = migrateInventory(state.inventory);
    if (!state.stats) {
      state.stats = { ...defaultStats };
    }
    if (!state.stats.maxHp) {
      state.stats.maxHp = defaultStats.maxHp;
    }
    if (!state.dialog) {
      state.dialog = { active: false, npcId: null, nodeId: null };
    }
    if (!state.combat) {
      state.combat = { defending: false, enemyStartHp: null };
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
  const ids = list
    .map((entry) => (typeof entry === 'string' ? entry : entry?.id))
    .filter(Boolean);
  const exact = ids.find((id) => normalizeId(id) === normalizedQuery);
  if (exact) return exact;
  return ids.find((id) => normalizeId(id).includes(normalizedQuery)) || null;
}

function flagMatches(condition) {
  if (!condition || !condition.key) return true;
  return state.flags[condition.key] === condition.equals;
}

function inventoryMatches(list = []) {
  if (!Array.isArray(list) || !list.length) return true;
  return list.every((itemId) => getInvQty(itemId) > 0);
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

async function describeInventory() {
  ensureAdventureUI();
  const entries = getInventoryEntries();
  if (!entries.length) {
    advLog(['Dein Inventar ist leer.']);
    return;
  }
  const lines = ['Inventar:'];
  const items = await Promise.all(entries.map((entry) => loadItem(entry.id).catch(() => null)));
  items.forEach((item, idx) => {
    const entry = entries[idx];
    const label = item ? formatInventoryLine(item, entry.qty) : `${entry.id} x${entry.qty}`;
    lines.push(`- ${label}`);
  });
  advLog(lines);
}

function formatInventoryLine(item, qty = 1) {
  const name = item?.name || item?.id || 'Item';
  const unit = item?.unit ? ` ${item.unit}` : '';
  const amount = Number.isFinite(qty) ? qty : 1;
  if (item?.stackable || amount > 1) {
    return `${name} x${amount}${unit}`;
  }
  return name;
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
    loadItem,
    getInvQty: (id) => getInvQty(id),
    addToInventory: async (id, qty = 1) => addToInventory(id, qty),
    removeFromInventory: (id, qty = 1) => removeFromInventory(id, qty),
    startDialog: async (npcId, nodeId = null) => startDialogWithNpc(npcId, nodeId),
    endDialog: () => endDialog(),
    gotoDialogNode: async (nodeId) => gotoDialogNode(nodeId),
    showDialogNode: async () => showDialogNode(),
    logDebugEvent: (event) => logEventForDebug(event)
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
  const added = await addToInventory(item.id, 1);
  if (!added) {
    advLog(['Du kannst das nicht mehr tragen.']);
    return;
  }
  room.items = available.filter((i) => i !== match);
  advLog([`Du nimmst ${formatInventoryLine(item, getInvQty(item.id))}.`]);
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
  } else if (room.items.includes(match) || hasInventoryItem(match)) {
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
  if (itemMatch && getInvQty(itemMatch) > 0) {
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
  if (!match || getInvQty(match) <= 0) {
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
      await describeInventory();
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
    '- im Kampf: attack, defend, flee, use <item>',
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
    logInputForDebug(text);
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
  isDebugLoggingEnabled: () => debugLogging,
  setDebugLogging,
  printDebugLog,
  getDebugLog: () => [...debugLogEntries],
  exit: () => {
    deactivate();
    clearAdventureUI();
    printLines(['Du verlässt das Adventure und kehrst ins Darknetz-Terminal zurück.', ''], 'dim');
  }
};

export default adventure;
