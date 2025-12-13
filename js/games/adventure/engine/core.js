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

let recipeIndex = [];
let recipeKeyIndex = new Map();

const createEmptyCache = () => ({
  world: null,
  rooms: {},
  items: {},
  objects: {},
  enemies: {},
  npcs: {},
  dialogs: {},
  itemIds: [],
  recipeIndexBuilt: false
});

const createEmptyState = () => ({
  location: null,
  inventory: [],
  flags: {},
  counters: {},
  stats: { ...defaultStats },
  inCombat: false,
  enemy: null,
  combat: { defending: false, enemyStartHp: null },
  visited: {},
  lockedExits: {},
  roomSpawns: {},
  npcFlags: {},
  npcs: {},
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

function ensureCounterState() {
  if (!state.counters || typeof state.counters !== 'object') {
    state.counters = {};
  }
  return state.counters;
}

function getCounter(key) {
  return ensureCounterState()[key] || 0;
}

function addCounter(key, amount = 1) {
  if (!key) return getCounter(key);
  const counters = ensureCounterState();
  const delta = Number.isFinite(amount) ? amount : 1;
  counters[key] = (counters[key] || 0) + delta;
  return counters[key];
}

function setCounter(key, value = 0) {
  if (!key) return getCounter(key);
  const counters = ensureCounterState();
  const val = Number.isFinite(value) ? value : 0;
  counters[key] = val;
  return counters[key];
}

function ensureRoomSpawn(roomId) {
  if (!state.roomSpawns || typeof state.roomSpawns !== 'object') {
    state.roomSpawns = {};
  }
  const key = normalizeId(roomId);
  if (!state.roomSpawns[key]) {
    state.roomSpawns[key] = { items: [], enemies: [], npcs: [] };
  }
  return state.roomSpawns[key];
}

function addSpawnedItem(roomId, itemId, qty = 1) {
  const spawn = ensureRoomSpawn(roomId);
  const normalizedId = normalizeId(itemId);
  if (!normalizedId) return spawn.items;
  const entry = spawn.items.find((it) => normalizeId(it.id) === normalizedId);
  const amount = Number.isFinite(qty) && qty > 0 ? qty : 1;
  if (entry) {
    entry.qty += amount;
  } else {
    spawn.items.push({ id: itemId, qty: amount });
  }
  return spawn.items;
}

function consumeSpawnedItem(roomId, itemId, qty = 1) {
  const spawn = ensureRoomSpawn(roomId);
  const normalizedId = normalizeId(itemId);
  const amount = Number.isFinite(qty) && qty > 0 ? qty : 1;
  spawn.items = (spawn.items || []).map((it) => ({ ...it })).filter((it) => {
    if (normalizeId(it.id) !== normalizedId) return true;
    const remaining = (it.qty || 0) - amount;
    if (remaining > 0) {
      it.qty = remaining;
      return true;
    }
    return false;
  });
  state.roomSpawns[normalizeId(roomId)] = spawn;
  return spawn.items;
}

function addSpawnedEnemy(roomId, enemyId, qty = 1) {
  const spawn = ensureRoomSpawn(roomId);
  const normalizedId = normalizeId(enemyId);
  if (!normalizedId) return spawn.enemies;
  const entry = spawn.enemies.find((en) => normalizeId(en.id) === normalizedId);
  const amount = Number.isFinite(qty) && qty > 0 ? qty : 1;
  if (entry) {
    entry.qty += amount;
  } else {
    spawn.enemies.push({ id: enemyId, qty: amount });
  }
  return spawn.enemies;
}

function addSpawnedNpc(roomId, npcId) {
  const normalizedRoom = normalizeId(roomId);
  if (!npcId || !normalizedRoom) return;
  ensureNpcState(npcId, normalizedRoom);
  state.npcs[npcId].room = normalizedRoom;
}

function moveNpcToRoom(npcId, roomId) {
  if (!npcId || !roomId) return;
  ensureNpcState(npcId, roomId);
  state.npcs[npcId].room = normalizeId(roomId);
}

function npcIsInRoom(npcId, roomId) {
  if (!npcId || !roomId) return false;
  const npcState = ensureNpcState(npcId);
  return normalizeId(npcState.room) === normalizeId(roomId);
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
  const itemId = cache.items[id].id || id;
  if (!cache.itemIds.includes(itemId)) {
    cache.itemIds.push(itemId);
  }
  if (cache.recipeIndexBuilt) {
    registerRecipeFromItem(cache.items[id]);
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

function ensureNpcState(npcId, defaultRoom = null) {
  if (!state.npcs || typeof state.npcs !== 'object') {
    state.npcs = {};
  }
  if (!state.npcFlags || typeof state.npcFlags !== 'object') {
    state.npcFlags = {};
  }
  if (!state.npcs[npcId]) {
    state.npcs[npcId] = { room: defaultRoom ? normalizeId(defaultRoom) : null, flags: {}, counters: {} };
  }
  if (!state.npcs[npcId].flags) {
    state.npcs[npcId].flags = {};
  }
  if (!state.npcs[npcId].counters) {
    state.npcs[npcId].counters = {};
  }
  if (!state.npcFlags[npcId]) {
    state.npcFlags[npcId] = state.npcs[npcId].flags;
  } else {
    state.npcs[npcId].flags = state.npcFlags[npcId];
  }
  return state.npcs[npcId];
}

async function loadNpc(id) {
  if (!cache.npcs[id]) {
    cache.npcs[id] = await loadJson(`npcs/${id}.json`);
    if (cache.npcs[id].flags && !state.npcFlags[id]) {
      state.npcFlags[id] = { ...cache.npcs[id].flags };
    }
  }
  ensureNpcState(id, cache.npcs[id]?.room);
  if (cache.npcs[id].flags && Object.keys(cache.npcs[id].flags).length && !Object.keys(state.npcs[id].flags).length) {
    state.npcs[id].flags = { ...cache.npcs[id].flags };
    state.npcFlags[id] = state.npcs[id].flags;
  }
  if (cache.npcs[id].counters && !state.npcs[id].counters) {
    state.npcs[id].counters = { ...cache.npcs[id].counters };
  }
  return cache.npcs[id];
}

async function loadDialog(npcId) {
  if (!cache.dialogs[npcId]) {
    cache.dialogs[npcId] = await loadJson(`dialogs/${npcId}.json`);
  }
  return cache.dialogs[npcId];
}

async function loadItemIndex() {
  if (cache.itemIds && cache.itemIds.length) {
    return cache.itemIds;
  }
  try {
    const index = await loadJson('items/index.json');
    if (Array.isArray(index)) {
      cache.itemIds = index;
      return cache.itemIds;
    }
  } catch (err) {
    console.warn('Item-Index konnte nicht geladen werden:', err);
  }
  cache.itemIds = cache.itemIds || [];
  return cache.itemIds;
}

function registerRecipeFromItem(item) {
  if (!item || !item.recipe || !Array.isArray(item.recipe.inputs)) return;
  const inputs = normalizeRecipeInputs(item.recipe.inputs);
  if (!inputs.length) return;
  const tools = normalizeRecipeTools(item.recipe.tools || []);
  const stations = (item.recipe.stations || []).map((s) => normalizeId(s.id || s)).filter(Boolean);
  const events = Array.isArray(item.recipe.events) ? item.recipe.events : [];
  const entry = {
    outputId: normalizeId(item.id),
    outputName: item.name || item.id,
    recipe: { inputs, tools, stations, events }
  };
  const key = buildRecipeKey(inputs);
  const exists = recipeKeyIndex.get(key)?.some((r) => r.outputId === entry.outputId);
  if (exists) return;
  recipeIndex.push(entry);
  if (!recipeKeyIndex.has(key)) {
    recipeKeyIndex.set(key, []);
  }
  recipeKeyIndex.get(key).push(entry);
}

async function ensureRecipeIndexBuilt() {
  if (cache.recipeIndexBuilt) return;
  resetRecipeData();
  const ids = await loadItemIndex();
  if (ids.length) {
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      const item = await loadItem(id);
      registerRecipeFromItem(item);
    }
  } else {
    Object.values(cache.items).forEach((item) => registerRecipeFromItem(item));
  }
  cache.recipeIndexBuilt = true;
}

function npcVisible(npc) {
  if (!npc) return false;
  if (npc.hidden_if_flag && flagMatches(npc.hidden_if_flag)) return false;
  if (npc.only_if_flag && !flagMatches(npc.only_if_flag)) return false;
  return true;
}

async function listNpcsInRoom(roomId) {
  const room = await loadRoom(roomId);
  const normalizedRoom = normalizeId(roomId);
  const npcIds = new Set(room.npcs || []);
  Object.entries(state.npcs || {}).forEach(([npcId, meta]) => {
    if (meta.room && normalizeId(meta.room) === normalizedRoom) {
      npcIds.add(npcId);
    }
  });
  Object.values(cache.npcs).forEach((npc) => {
    const npcState = ensureNpcState(npc.id, npc.room);
    const currentRoom = npcState.room || npc.room;
    if (currentRoom && normalizeId(currentRoom) === normalizedRoom) {
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
  resetRecipeData();
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
      counters: state.counters,
      stats: state.stats,
      inCombat: state.inCombat,
      enemy: state.enemy,
      combat: state.combat,
      visited: state.visited,
      lockedExits: state.lockedExits,
      roomSpawns: state.roomSpawns,
      npcFlags: state.npcFlags,
      npcs: state.npcs,
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
    if (!state.counters) {
      state.counters = {};
    }
    if (!state.roomSpawns) {
      state.roomSpawns = {};
    }
    if (!state.npcs) {
      state.npcs = {};
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

function resetRecipeData() {
  recipeIndex = [];
  recipeKeyIndex = new Map();
}

function buildRecipeKey(inputs = []) {
  return inputs.map((inp) => normalizeId(inp.id || inp)).sort().join('|');
}

function normalizeRecipeInputs(inputs = []) {
  return inputs
    .map((inp) => ({
      id: normalizeId(inp.id || inp),
      qty: Number.isFinite(inp.qty) && inp.qty > 0 ? inp.qty : 1
    }))
    .filter((inp) => inp.id);
}

function normalizeRecipeTools(tools = []) {
  return tools
    .map((tool) => ({
      id: normalizeId(tool.id || tool),
      qty: Number.isFinite(tool.qty) && tool.qty > 0 ? tool.qty : 1,
      consume: tool.consume === true
    }))
    .filter((tool) => tool.id);
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

async function showRoom(firstTime = false, options = {}) {
  const { recordVisit = true } = options;
  ensureAdventureUI();
  const room = await loadRoom(state.location);
  state.visited[room.id] = true;

  if (recordVisit) {
    addCounter(`enter:${normalizeId(room.id)}`, 1);
    addCounter(`visit:${normalizeId(room.id)}`, 1);
    saveState();
  }

  if (room.ascii) {
    await loadAscii(room.ascii);
  } else {
    setAsciiContent('');
  }

  const lines = [];
  lines.push(room.title);
  lines.push('');
  lines.push(room.description);

  const roomSpawns = ensureRoomSpawn(room.id);

  const staticItems = room.items || [];
  const spawnedItems = roomSpawns.items || [];
  if (staticItems.length || spawnedItems.length) {
    lines.push('');
    const spawnLabels = spawnedItems.map((i) => `"${i.id}"${i.qty && i.qty > 1 ? ` x${i.qty}` : ''}`);
    lines.push('Hier siehst du: ' + [...staticItems.map((i) => `"${i}"`), ...spawnLabels].join(', '));
  }
  if (room.objects && room.objects.length) {
    lines.push('Objekte: ' + room.objects.join(', '));
  }
  const npcsInRoom = await listNpcsInRoom(room.id);
  if (npcsInRoom.length) {
    lines.push('Personen: ' + npcsInRoom.map((n) => n.name || n.id).join(', '));
  }
  const spawnedEnemies = (roomSpawns.enemies || []).filter((e) => e.qty > 0);
  if (spawnedEnemies.length) {
    lines.push('Gefahren: ' + spawnedEnemies.map((e) => `${e.id}${e.qty > 1 ? ` x${e.qty}` : ''}`).join(', '));
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
    showCurrentRoom: async (first = false, opts = {}) => showRoom(first, opts),
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
    logDebugEvent: (event) => logEventForDebug(event),
    addCounter: (key, amount) => addCounter(key, amount),
    setCounter: (key, value) => setCounter(key, value),
    getCounter: (key) => getCounter(key),
    spawnItem: (roomId, itemId, qty) => addSpawnedItem(roomId, itemId, qty),
    spawnEnemy: (roomId, enemyId, qty) => addSpawnedEnemy(roomId, enemyId, qty),
    spawnNpc: (roomId, npcId) => addSpawnedNpc(roomId, npcId),
    moveNpc: (npcId, roomId) => moveNpcToRoom(npcId, roomId),
    npcIsInRoom: (npcId, roomId) => npcIsInRoom(npcId, roomId),
    getRoomSpawns: (roomId) => ensureRoomSpawn(roomId)
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
  const spawns = ensureRoomSpawn(room.id);
  const spawnItems = spawns.items || [];
  const match = findMatchByNormalized(available, action.object);
  const dynamicMatch = match ? null : findMatchByNormalized(spawnItems.map((i) => i.id), action.object);

  if (!match && !dynamicMatch) {
    advLog([cache.world.messages.cannotTake]);
    return;
  }
  const itemId = match || dynamicMatch;
  const item = await loadItem(itemId);
  if (!item.pickup) {
    advLog(['Das lässt sich nicht mitnehmen.']);
    return;
  }
  const qty = dynamicMatch ? Math.max(1, (spawnItems.find((i) => normalizeId(i.id) === normalizeId(dynamicMatch))?.qty || 1)) : 1;
  const added = await addToInventory(item.id, qty);
  if (!added) {
    advLog(['Du kannst das nicht mehr tragen.']);
    return;
  }
  if (match) {
    room.items = available.filter((i) => i !== match);
  } else {
    consumeSpawnedItem(room.id, item.id, qty);
  }
  advLog([`Du nimmst ${formatInventoryLine(item, getInvQty(item.id))}.`]);
  saveState();
}

async function performInspect(action) {
  const room = await loadRoom(state.location);

  // Kein Objekt angegeben → Umgebung / Raumbeschreibung erneut anzeigen
  if (!action.object) {
    await showRoom(false, { recordVisit: false });
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

function formatIngredient(id, qty = 1) {
  const cached = cache.items[id];
  const label = cached?.name || id;
  return qty > 1 ? `${label} (${qty}x)` : label;
}

function resolveStationRequirement(recipeStations = [], room = {}, specifiedStation = null) {
  const stations = recipeStations.map((s) => normalizeId(s)).filter(Boolean);
  const roomObjects = room.objects || [];

  if (specifiedStation) {
    const match = findMatchByNormalized(roomObjects, specifiedStation);
    if (!match) {
      return { ok: false, error: 'Hier gibt es keinen passenden Ort dafür.' };
    }
    if (stations.length && !stations.some((st) => st === normalizeId(match) || st === normalizeId(specifiedStation))) {
      return { ok: false, error: `Du brauchst dafür: ${stations.join(', ')}.` };
    }
    return { ok: true, station: normalizeId(match) };
  }

  if (!stations.length) {
    return { ok: true, station: null };
  }

  const matches = stations.filter((st) => findMatchByNormalized(roomObjects, st));
  if (matches.length === 1) {
    return { ok: true, station: matches[0] };
  }
  if (!matches.length) {
    return { ok: false, error: `Du brauchst dafür: ${stations.join(', ')}.` };
  }
  return { ok: false, error: `Wähle einen Ort: ${matches.join(', ')}.` };
}

function findCraftingMatch(tokens = [], room = {}, station = null) {
  const tokenSet = new Set(tokens.map((t) => normalizeId(t)).filter(Boolean));
  let lastStationError = null;
  for (const entry of recipeIndex) {
    const inputIds = entry.recipe.inputs.map((inp) => inp.id);
    const toolIds = (entry.recipe.tools || []).map((tool) => tool.id);
    const required = new Set([...inputIds, ...toolIds]);

    const hasAllInputs = inputIds.every((id) => tokenSet.has(id));
    if (!hasAllInputs) continue;
    const hasAllTools = toolIds.every((id) => tokenSet.has(id));
    if (!hasAllTools) continue;

    const extras = [...tokenSet].filter((id) => !required.has(id));
    if (extras.length) continue;

    const stationCheck = resolveStationRequirement(entry.recipe.stations, room, station);
    if (!stationCheck.ok) {
      lastStationError = stationCheck.error;
      continue;
    }
    return { entry, station: stationCheck.station || station, error: null };
  }
  return { entry: null, error: lastStationError };
}

function hasToolAvailable(tool, room) {
  const invQty = getInvQty(tool.id);
  const inRoom = !!findMatchByNormalized(room.objects || [], tool.id);
  if (tool.consume) {
    return invQty >= tool.qty;
  }
  return invQty >= tool.qty || inRoom;
}

async function tryOnCombineHooks(tokens = []) {
  const inventoryIds = tokens
    .map((token) => findMatchByNormalized(state.inventory, token))
    .filter((id) => id && getInvQty(id) > 0)
    .filter((id, idx, arr) => arr.indexOf(id) === idx);

  for (const baseId of inventoryIds) {
    // eslint-disable-next-line no-await-in-loop
    const item = await loadItem(baseId);
    const mapping = item.on_combine || item.combine || {};
    for (const [otherId, events] of Object.entries(mapping)) {
      const normalizedOther = normalizeId(otherId);
      const hasOther = inventoryIds.some((candidate) => normalizeId(candidate) === normalizedOther);
      if (hasOther && Array.isArray(events)) {
        // eslint-disable-next-line no-await-in-loop
        await runEvents(events, state, ctxForEvents());
        return true;
      }
    }
  }
  return false;
}

async function performCombine(action) {
  const room = await loadRoom(state.location);
  const items = Array.isArray(action.items) && action.items.length
    ? action.items
    : [action.object, action.target].filter(Boolean);
  const normalizedItems = items.map((i) => normalizeId(i)).filter(Boolean);

  if (normalizedItems.length < 2) {
    advLog(['Was genau willst du kombinieren?']);
    return;
  }

  const specifiedStation = action.station ? normalizeId(action.station) : null;
  if (specifiedStation && !findMatchByNormalized(room.objects || [], specifiedStation)) {
    advLog(['Hier gibt es keinen passenden Ort dafür.']);
    return;
  }

  await ensureRecipeIndexBuilt();
  const match = findCraftingMatch(normalizedItems, room, specifiedStation);
  if (match.entry) {
    const missingInputs = match.entry.recipe.inputs.filter((inp) => getInvQty(inp.id) < inp.qty);
    if (missingInputs.length) {
      const missing = missingInputs.map((inp) => formatIngredient(inp.id, inp.qty));
      advLog([`Dir fehlt: ${missing.join(', ')}.`]);
      return;
    }

    const missingTools = (match.entry.recipe.tools || []).filter((tool) => !hasToolAvailable(tool, room));
    if (missingTools.length) {
      const missing = missingTools.map((tool) => formatIngredient(tool.id, tool.qty));
      advLog([`Du brauchst dafür: ${missing.join(', ')}.`]);
      return;
    }

    match.entry.recipe.inputs.forEach((inp) => removeFromInventory(inp.id, inp.qty));
    (match.entry.recipe.tools || [])
      .filter((tool) => tool.consume)
      .forEach((tool) => removeFromInventory(tool.id, tool.qty));

    await addToInventory(match.entry.outputId, 1);
    const crafted = await loadItem(match.entry.outputId);
    advLog([`Du stellst her: ${crafted.name || match.entry.outputId}.`]);
    saveState();

    if (Array.isArray(match.entry.recipe.events) && match.entry.recipe.events.length) {
      await runEvents(match.entry.recipe.events, state, ctxForEvents());
    }
    saveState();
    return;
  }

  if (match.error) {
    advLog([match.error]);
    return;
  }

  const handled = await tryOnCombineHooks(normalizedItems);
  if (handled) return;

  advLog(['Das lässt sich nicht kombinieren.']);
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
    '- kombiniere <item> mit <anderes> [auf <station>]',
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
