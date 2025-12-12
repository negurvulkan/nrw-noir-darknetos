import { Api } from './api.js';
import { initEventBlockEditor } from './event-blockly.js';
import { renderNpcSidebar, renderNpcEditor, ensureNpcCollection, createNpcDraft } from './npcs.js';
import { dialogGraphInfo, ensureDialogState, ensureDialogForNpc, nodeIds } from './dialogs.js';
import { renderDialogEditor } from './dialogEditor.js';
import { autoLayout, renderDialogMap } from './dialogMap.js';

const state = {
  adventures: [],
  currentAdventure: null,
  data: null,
  dirty: false,
  selection: defaultSelection(),
  asciiFiles: [],
  map: { scale: 1, x: 0, y: 0 },
  dialogMaps: {},
};

const viewEl = document.getElementById('view');
const viewHeader = document.getElementById('view-header');
const sidebar = document.getElementById('sidebar-content');
const mapView = document.getElementById('map-view');
const asciiPreview = document.getElementById('ascii-preview');
const modalEl = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalClose = document.getElementById('modal-close');

function isFiniteNumber(val) {
  return typeof val === 'number' && Number.isFinite(val);
}

function $(sel) { return document.querySelector(sel); }

function toast(message, type = 'info') {
  const host = document.getElementById('notifications');
  const tpl = document.getElementById('toast-template');
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.textContent = message;
  if (type !== 'info') node.classList.add(type);
  host.appendChild(node);
  setTimeout(() => node.remove(), 4000);
}

function closeModal() {
  modalEl.classList.remove('open');
  modalBody.innerHTML = '';
}

function openModal(title, contentNode, onOpen) {
  modalTitle.textContent = title;
  modalBody.innerHTML = '';
  if (contentNode) modalBody.appendChild(contentNode);
  modalEl.classList.add('open');
  if (onOpen) window.setTimeout(onOpen, 0);
}

function defaultSelection(overrides = {}) {
  return {
    view: 'world',
    roomId: null,
    itemId: null,
    objectId: null,
    enemyId: null,
    npcId: null,
    dialogId: null,
    dialogNodeId: null,
    dialogMode: 'editor',
    ...overrides,
  };
}

function setDirty(flag = true) {
  state.dirty = flag;
  const btn = document.getElementById('btn-save');
  btn.textContent = flag ? 'Speichern*' : 'Speichern';
}

modalClose.addEventListener('click', closeModal);
modalEl.addEventListener('click', (ev) => {
  if (ev.target === modalEl || ev.target.dataset.close !== undefined) closeModal();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && modalEl.classList.contains('open')) closeModal();
});

function init() {
  $('#btn-dashboard').addEventListener('click', renderDashboard);
  $('#btn-save').addEventListener('click', saveCurrent);
  $('#btn-test').addEventListener('click', () => {
    if (!state.currentAdventure) return;
    const url = `./index.html?adv=${state.currentAdventure.id}`;
    window.open(url, '_blank');
  });
  loadAdventures();
}

async function loadAdventures() {
  try {
    const res = await Api.listAdventures();
    state.adventures = res.adventures || res;
    renderDashboard();
    const params = new URLSearchParams(window.location.search);
    const advFromQuery = params.get('adv');
    if (advFromQuery) openAdventure(advFromQuery);
  } catch (e) {
    toast('Konnte Adventure-Liste nicht laden: ' + e.message, 'error');
  }
}

function renderDashboard() {
  state.currentAdventure = null;
  state.data = null;
  sidebar.innerHTML = '';
  viewHeader.innerHTML = '<div class="badge"><span class="dot"></span> Dashboard</div>';
  const grid = document.createElement('div');
  grid.className = 'dashboard-grid';

  const newCard = document.createElement('div');
  newCard.className = 'card';
  newCard.innerHTML = `<h3>Neues Adventure</h3><p>Lege eine frische Instanz an.</p><button class="primary" id="btn-new-adv">Adventure anlegen</button>`;
  grid.appendChild(newCard);
  newCard.querySelector('#btn-new-adv').addEventListener('click', promptNewAdventure);

  state.adventures.forEach((adv) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${adv.title}</h3>
      <p>${adv.description || ''}</p>
      <div class="badge"><span class="dot"></span> ${adv.id}</div>
      <div class="dashboard-actions">
        <button class="primary" data-id="${adv.id}">Bearbeiten</button>
        <button class="ghost" data-dup="${adv.id}">Duplizieren</button>
      </div>
    `;
    grid.appendChild(card);
    card.querySelector('[data-id]').addEventListener('click', () => openAdventure(adv.id));
    card.querySelector('[data-dup]').addEventListener('click', () => duplicateAdventure(adv));
  });
  viewEl.innerHTML = '';
  viewEl.appendChild(grid);
}

async function promptNewAdventure() {
  const id = prompt('Adventure-ID (slug, z.B. my-adventure):');
  if (!id) return;
  const title = prompt('Titel des Adventures:') || id;
  const description = prompt('Kurzbeschreibung:') || '';
  try {
    await Api.createAdventure({ id, title, description });
    toast('Adventure angelegt.');
    await loadAdventures();
    openAdventure(id);
  } catch (e) {
    toast('Erstellen fehlgeschlagen: ' + e.message, 'error');
  }
}

async function duplicateAdventure(source) {
  const id = prompt('Neue ID für die Kopie:', `${source.id}-kopie`);
  if (!id) return;
  try {
    await Api.createAdventure({ id, title: source.title + ' (Kopie)', description: source.description, source: source.id });
    toast('Adventure dupliziert.');
    await loadAdventures();
    openAdventure(id);
  } catch (e) {
    toast('Duplizieren fehlgeschlagen: ' + e.message, 'error');
  }
}

async function openAdventure(id) {
  try {
    const res = await Api.loadAdventure(id);
    state.currentAdventure = res.adventure || state.adventures.find(a => a.id === id) || { id };
    state.data = res.data || res;
    state.data.enemies = state.data.enemies || [];
    ensureNpcCollection(state.data);
    ensureDialogState(state.data);
    state.asciiFiles = res.ascii || res.asciiFiles || [];
    state.selection = defaultSelection();
    state.map = { scale: 1, x: 0, y: 0 };
    setDirty(false);
    renderEditor();
    renderSidebar();
    renderMap();
  } catch (e) {
    toast('Adventure laden fehlgeschlagen: ' + e.message, 'error');
  }
}

function renderSidebar() {
  if (!state.data) return;
  sidebar.innerHTML = '';

  const worldNav = document.createElement('div');
  worldNav.className = 'nav-item' + (state.selection.view === 'world' ? ' active' : '');
  worldNav.textContent = 'World & Game';
  worldNav.onclick = () => { state.selection = defaultSelection({ view: 'world' }); renderEditor(); renderSidebar(); };
  sidebar.appendChild(worldNav);

  sidebar.appendChild(sectionTitle('Räume'));
  const roomList = document.createElement('div');
  roomList.className = 'nav-list';
  (state.data.rooms || []).forEach(room => {
    const item = document.createElement('div');
    item.className = 'nav-item' + (state.selection.roomId === room.id ? ' active' : '');
    item.textContent = room.title || room.id;
    item.onclick = () => { state.selection = defaultSelection({ view: 'room', roomId: room.id }); renderEditor(); renderSidebar(); updateAsciiPreview(room.ascii); };
    roomList.appendChild(item);
  });
  const btnNewRoom = document.createElement('button');
  btnNewRoom.textContent = 'Neuen Raum anlegen';
  btnNewRoom.style.marginTop = '8px';
  btnNewRoom.onclick = addRoom;
  sidebar.appendChild(roomList);
  sidebar.appendChild(btnNewRoom);

  sidebar.appendChild(sectionTitle('Items'));
  const itemList = document.createElement('div');
  itemList.className = 'nav-list';
  (state.data.items || []).forEach(item => {
    const row = document.createElement('div');
    row.className = 'nav-item' + (state.selection.itemId === item.id ? ' active' : '');
    row.textContent = item.name || item.id;
    row.onclick = () => { state.selection = defaultSelection({ view: 'item', itemId: item.id }); renderEditor(); renderSidebar(); };
    itemList.appendChild(row);
  });
  const btnNewItem = document.createElement('button');
  btnNewItem.textContent = 'Neues Item';
  btnNewItem.style.marginTop = '8px';
  btnNewItem.onclick = addItem;
  sidebar.appendChild(itemList);
  sidebar.appendChild(btnNewItem);

  sidebar.appendChild(sectionTitle('Objekte'));
  const objectList = document.createElement('div');
  objectList.className = 'nav-list';
  (state.data.objects || []).forEach(obj => {
    const row = document.createElement('div');
    row.className = 'nav-item' + (state.selection.objectId === obj.id ? ' active' : '');
    row.textContent = obj.name || obj.id;
    row.onclick = () => { state.selection = defaultSelection({ view: 'object', objectId: obj.id }); renderEditor(); renderSidebar(); };
    objectList.appendChild(row);
  });
  const btnNewObject = document.createElement('button');
  btnNewObject.textContent = 'Neues Objekt';
  btnNewObject.style.marginTop = '8px';
  btnNewObject.onclick = addObject;
  sidebar.appendChild(objectList);
  sidebar.appendChild(btnNewObject);

  sidebar.appendChild(sectionTitle('Gegner'));
  const enemyList = document.createElement('div');
  enemyList.className = 'nav-list';
  (state.data.enemies || []).forEach(enemy => {
    const row = document.createElement('div');
    row.className = 'nav-item' + (state.selection.enemyId === enemy.id ? ' active' : '');
    row.textContent = enemy.name || enemy.id;
    row.onclick = () => { state.selection = defaultSelection({ view: 'enemy', enemyId: enemy.id }); renderEditor(); renderSidebar(); };
    enemyList.appendChild(row);
  });
  const btnNewEnemy = document.createElement('button');
  btnNewEnemy.textContent = 'Neuer Gegner';
  btnNewEnemy.style.marginTop = '8px';
  btnNewEnemy.onclick = addEnemy;
  sidebar.appendChild(enemyList);
  sidebar.appendChild(btnNewEnemy);

  renderNpcSidebar({
    container: sidebar,
    state,
    selection: state.selection,
    onSelect: (id) => { state.selection = defaultSelection({ view: 'npc', npcId: id }); renderEditor(); renderSidebar(); },
    onAdd: addNpc,
  });
}

function sectionTitle(label) {
  const el = document.createElement('div');
  el.className = 'section-title';
  el.textContent = label;
  return el;
}

function renderEditor() {
  if (!state.data) return;
  viewEl.innerHTML = '';
  if (state.selection.view === 'world') {
    renderWorld();
  } else if (state.selection.view === 'room') {
    renderRoomEditor();
  } else if (state.selection.view === 'item') {
    renderItemEditor();
  } else if (state.selection.view === 'object') {
    renderObjectEditor();
  } else if (state.selection.view === 'enemy') {
    renderEnemyEditor();
  } else if (state.selection.view === 'npc') {
    renderNpcView();
  } else if (state.selection.view === 'dialog') {
    renderDialogView();
  }
}

function renderWorld() {
  viewHeader.innerHTML = `<div class="badge"><span class="dot"></span> World & Game</div>`;
  const wrap = document.createElement('div');

  wrap.appendChild(renderWorldForm());
  wrap.appendChild(renderGameForm());
  viewEl.appendChild(wrap);
}

function renderWorldForm() {
  const card = document.createElement('div');
  card.className = 'card';
  const world = state.data.world || {};
  card.innerHTML = '<h3>world.json</h3>';
  card.appendChild(createFieldGrid([
    field('ID', 'text', world.id, (v) => updateWorld('id', v)),
    field('Title', 'text', world.title, (v) => updateWorld('title', v)),
    field('Start Room', 'text', world.startRoom, (v) => updateWorld('startRoom', v)),
    field('Difficulty', 'text', world.difficulty, (v) => updateWorld('difficulty', v)),
  ]));

  const flagsField = document.createElement('div');
  flagsField.className = 'field';
  flagsField.innerHTML = '<label>Global Flags (JSON)</label>';
  const area = document.createElement('textarea');
  area.value = JSON.stringify(world.globalFlags || {}, null, 2);
  area.onchange = () => safeJsonUpdate(area.value, (val) => updateWorld('globalFlags', val));
  flagsField.appendChild(area);
  card.appendChild(flagsField);
  return card;
}

function renderGameForm() {
  const card = document.createElement('div');
  card.className = 'card';
  const game = state.data.game || {};
  card.innerHTML = '<h3>game.json</h3>';
  card.appendChild(createFieldGrid([
    field('Titel', 'text', game.title, (v) => updateGame('title', v)),
    field('Untertitel', 'text', game.subtitle, (v) => updateGame('subtitle', v)),
    field('Intro', 'textarea', game.intro, (v) => updateGame('intro', v)),
    field('Outro', 'textarea', game.outro, (v) => updateGame('outro', v)),
  ]));
  return card;
}

function updateWorld(key, value) {
  state.data.world = state.data.world || {};
  state.data.world[key] = value;
  setDirty(true);
}

function updateGame(key, value) {
  state.data.game = state.data.game || {};
  state.data.game[key] = value;
  setDirty(true);
}

function renderRoomEditor() {
  const room = (state.data.rooms || []).find(r => r.id === state.selection.roomId);
  if (!room) return;
  viewHeader.innerHTML = `<div class="badge"><span class="dot"></span> Raum: ${room.id}</div>`;
  const card = document.createElement('div');
  card.className = 'card';

  card.appendChild(createFieldGrid([
    field('ID', 'text', room.id, (v) => updateRoom(room, 'id', v)),
    field('Titel', 'text', room.title, (v) => updateRoom(room, 'title', v)),
    field('ASCII', 'select', room.ascii || '', (v) => { updateRoom(room, 'ascii', v); updateAsciiPreview(v); }, { options: [''].concat(state.asciiFiles) }),
  ]));

  const desc = document.createElement('div');
  desc.className = 'field';
  desc.innerHTML = '<label>Beschreibung</label>';
  const descArea = document.createElement('textarea');
  descArea.value = room.description || '';
  descArea.oninput = () => updateRoom(room, 'description', descArea.value);
  desc.appendChild(descArea);
  card.appendChild(desc);

  const lists = document.createElement('div');
  lists.className = 'form-grid';
  lists.appendChild(multiselectField('Items', state.data.items || [], room.items || [], (vals) => updateRoom(room, 'items', vals)));
  lists.appendChild(multiselectField('Objekte', state.data.objects || [], room.objects || [], (vals) => updateRoom(room, 'objects', vals)));
  card.appendChild(lists);

  card.appendChild(exitTable(room));
  card.appendChild(eventArea('On First Enter', room.on_first_enter || [], (val) => updateRoom(room, 'on_first_enter', val)));
  card.appendChild(eventArea('On Enter', room.on_enter || [], (val) => updateRoom(room, 'on_enter', val)));

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '10px';
  const del = document.createElement('button');
  del.className = 'danger';
  del.textContent = 'Diesen Raum löschen';
  del.onclick = () => deleteRoom(room.id);
  actions.appendChild(del);
  card.appendChild(actions);

  card.appendChild(asciiUploadBlock());

  viewEl.appendChild(card);
}

function renderItemEditor() {
  const item = (state.data.items || []).find(i => i.id === state.selection.itemId);
  if (!item) return;
  viewHeader.innerHTML = `<div class="badge"><span class="dot"></span> Item: ${item.id}</div>`;
  const card = document.createElement('div');
  card.className = 'card';

  card.appendChild(createFieldGrid([
    field('ID', 'text', item.id, (v) => updateItem(item, 'id', v)),
    field('Name', 'text', item.name, (v) => updateItem(item, 'name', v)),
    field('Aufhebbar', 'checkbox', item.pickup !== false, (v) => updateItem(item, 'pickup', v)),
  ]));

  const desc = document.createElement('div');
  desc.className = 'field';
  desc.innerHTML = '<label>Beschreibung</label>';
  const area = document.createElement('textarea');
  area.value = item.description || '';
  area.oninput = () => updateItem(item, 'description', area.value);
  desc.appendChild(area);
  card.appendChild(desc);

  card.appendChild(combineTable(item));
  card.appendChild(eventArea('On Use', item.on_use || [], (val) => updateItem(item, 'on_use', val)));

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '10px';
  const del = document.createElement('button');
  del.className = 'danger';
  del.textContent = 'Item löschen';
  del.onclick = () => deleteItem(item.id);
  actions.appendChild(del);
  card.appendChild(actions);

  viewEl.appendChild(card);
}

function renderObjectEditor() {
  const obj = (state.data.objects || []).find(o => o.id === state.selection.objectId);
  if (!obj) return;
  viewHeader.innerHTML = `<div class="badge"><span class="dot"></span> Objekt: ${obj.id}</div>`;
  const card = document.createElement('div');
  card.className = 'card';

  card.appendChild(createFieldGrid([
    field('ID', 'text', obj.id, (v) => updateObject(obj, 'id', v)),
    field('Name', 'text', obj.name, (v) => updateObject(obj, 'name', v)),
    field('Gesperrt', 'checkbox', obj.locked === true, (v) => updateObject(obj, 'locked', v)),
  ]));

  const desc = document.createElement('div');
  desc.className = 'field';
  desc.innerHTML = '<label>Beschreibung</label>';
  const area = document.createElement('textarea');
  area.value = obj.description || '';
  area.oninput = () => updateObject(obj, 'description', area.value);
  desc.appendChild(area);
  card.appendChild(desc);

  card.appendChild(eventArea('On Inspect', obj.inspect || [], (val) => updateObject(obj, 'inspect', val)));
  card.appendChild(eventArea('On Use', obj.use || [], (val) => updateObject(obj, 'use', val)));
  card.appendChild(eventArea('On Locked Use', obj.on_locked_use || [], (val) => updateObject(obj, 'on_locked_use', val)));

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '10px';
  const del = document.createElement('button');
  del.className = 'danger';
  del.textContent = 'Objekt löschen';
  del.onclick = () => deleteObject(obj.id);
  actions.appendChild(del);
  card.appendChild(actions);

  viewEl.appendChild(card);
}

function renderEnemyEditor() {
  const enemy = (state.data.enemies || []).find(e => e.id === state.selection.enemyId);
  if (!enemy) return;
  viewHeader.innerHTML = `<div class="badge"><span class="dot"></span> Gegner: ${enemy.id}</div>`;
  const card = document.createElement('div');
  card.className = 'card';

  card.appendChild(createFieldGrid([
    field('ID', 'text', enemy.id, (v) => updateEnemy(enemy, 'id', v)),
    field('Name', 'text', enemy.name, (v) => updateEnemy(enemy, 'name', v)),
  ]));

  const asciiGrid = document.createElement('div');
  asciiGrid.className = 'form-grid';
  const asciiField = document.createElement('div');
  asciiField.className = 'field';
  const asciiLabel = document.createElement('label');
  asciiLabel.textContent = 'ASCII-Datei';
  const asciiInput = document.createElement('input');
  const listId = `ascii-files-${enemy.id}`;
  asciiInput.type = 'text';
  asciiInput.value = (enemy.ascii && enemy.ascii.file) || '';
  asciiInput.setAttribute('list', listId);
  asciiInput.oninput = () => updateEnemyAscii(enemy, 'file', asciiInput.value);
  const dl = document.createElement('datalist');
  dl.id = listId;
  (state.asciiFiles || []).forEach(file => {
    const opt = document.createElement('option');
    opt.value = file;
    dl.appendChild(opt);
  });
  asciiField.append(asciiLabel, asciiInput, dl);

  const fontField = field('ASCII Font Size', 'number', enemy.ascii?.fontSize ?? '', (v) => updateEnemyAscii(enemy, 'fontSize', v));
  asciiGrid.append(asciiField, fontField);
  card.appendChild(asciiGrid);

  const desc = document.createElement('div');
  desc.className = 'field';
  desc.innerHTML = '<label>Beschreibung</label>';
  const area = document.createElement('textarea');
  area.value = enemy.description || '';
  area.oninput = () => updateEnemy(enemy, 'description', area.value);
  desc.appendChild(area);
  card.appendChild(desc);

  card.appendChild(createFieldGrid([
    field('HP', 'number', enemy.stats?.hp ?? '', (v) => updateEnemyStat(enemy, 'hp', v)),
    field('Angriff', 'number', enemy.stats?.attack ?? '', (v) => updateEnemyStat(enemy, 'attack', v)),
    field('Verteidigung', 'number', enemy.stats?.defense ?? '', (v) => updateEnemyStat(enemy, 'defense', v)),
  ]));

  const behaviorGrid = document.createElement('div');
  behaviorGrid.className = 'form-grid';
  behaviorGrid.appendChild(field('Flucht-Wahrscheinlichkeit', 'number', enemy.behavior?.fleeDifficulty ?? '', (v) => updateEnemyBehavior(enemy, 'fleeDifficulty', v)));
  card.appendChild(behaviorGrid);

  const dropsField = document.createElement('div');
  dropsField.className = 'field';
  dropsField.innerHTML = '<label>Beute (kommagetrennt)</label>';
  const dropsInput = document.createElement('input');
  dropsInput.type = 'text';
  dropsInput.value = (enemy.drops || []).join(', ');
  dropsInput.oninput = () => updateEnemy(enemy, 'drops', dropsInput.value.split(',').map(d => d.trim()).filter(Boolean));
  dropsField.appendChild(dropsInput);
  card.appendChild(dropsField);

  card.appendChild(eventArea('On Attack', enemy.on_attack || [], (val) => updateEnemy(enemy, 'on_attack', val)));
  card.appendChild(eventArea('On Defeat', enemy.on_defeat || [], (val) => updateEnemy(enemy, 'on_defeat', val)));

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '10px';
  const del = document.createElement('button');
  del.className = 'danger';
  del.textContent = 'Gegner löschen';
  del.onclick = () => deleteEnemy(enemy.id);
  actions.appendChild(del);
  card.appendChild(actions);

  viewEl.appendChild(card);
}

function renderNpcView() {
  const npc = (state.data.npcs || []).find(n => n.id === state.selection.npcId);
  if (!npc) return;
  ensureDialogForNpc(state.data, npc.id);
  viewHeader.innerHTML = `<div class="badge"><span class="dot"></span> NPC: ${npc.id}</div>`;
  const card = renderNpcEditor(npc, {
    rooms: state.data.rooms || [],
    dialogs: state.data.dialogs || {},
    setDirty,
    onDelete: deleteNpc,
    onOpenDialog: (id) => {
      ensureDialogForNpc(state.data, id);
      state.selection = defaultSelection({ view: 'dialog', dialogId: id, dialogNodeId: null, npcId: id });
      renderEditor();
      renderSidebar();
    },
  });
  viewEl.appendChild(card);
}

function renderDialogView() {
  const dialogId = state.selection.dialogId || state.selection.npcId;
  if (!dialogId) return;
  const dialog = ensureDialogForNpc(state.data, dialogId);
  const mode = state.selection.dialogMode || 'editor';
  const graph = dialogGraphInfo(dialog);

  viewHeader.innerHTML = '';
  const badge = document.createElement('div');
  badge.className = 'badge';
  badge.innerHTML = `<span class="dot"></span> Dialog: ${dialogId}`;
  viewHeader.appendChild(badge);

  const tabs = document.createElement('div');
  tabs.className = 'dialog-tabs';
  const btnEditor = document.createElement('button');
  btnEditor.className = mode === 'editor' ? 'primary' : 'ghost';
  btnEditor.textContent = 'Dialog Editor';
  btnEditor.onclick = () => { state.selection = { ...state.selection, dialogMode: 'editor' }; renderEditor(); };
  const btnMap = document.createElement('button');
  btnMap.className = mode === 'map' ? 'primary' : 'ghost';
  btnMap.textContent = 'Dialog Map';
  btnMap.onclick = () => { state.selection = { ...state.selection, dialogMode: 'map' }; renderEditor(); };
  tabs.append(btnEditor, btnMap);
  viewHeader.appendChild(tabs);

  const actions = document.createElement('div');
  actions.className = 'dialog-actions';
  const warnLabel = document.createElement('div');
  warnLabel.className = 'dialog-warnings';
  warnLabel.textContent = `${graph.unreachable.length} unreachable · ${graph.missingTargets.length} fehlende Ziele`;
  actions.appendChild(warnLabel);

  if (mode === 'map') {
    const btnLayout = document.createElement('button');
    btnLayout.className = 'ghost';
    btnLayout.textContent = 'Auto-Layout';
    btnLayout.onclick = () => {
      autoLayout(dialog, dialog.meta.positions);
      setDirty(true);
      renderDialogView();
    };
    actions.appendChild(btnLayout);
  }
  viewHeader.appendChild(actions);

  viewEl.innerHTML = '';
  if (mode === 'map') {
    const mapState = state.dialogMaps[dialogId] || { scale: 1, x: 0, y: 0 };
    state.dialogMaps[dialogId] = mapState;
    renderDialogMap({
      container: viewEl,
      dialog,
      setDirty,
      mapState,
      onMapStateChange: (next) => { state.dialogMaps[dialogId] = next; },
      onSelectNode: (id) => { state.selection = { ...state.selection, dialogNodeId: id, dialogMode: 'editor' }; renderEditor(); },
      onEditChoice: (fromId, idx) => openChoiceEditor(dialog, fromId, idx),
    });
    appendDialogWarnings(viewEl, graph);
  } else {
    renderDialogEditor({
      container: viewEl,
      adventure: state.data,
      npcId: dialogId,
      selection: state.selection,
      setSelection: (sel) => { state.selection = { ...state.selection, ...sel }; renderEditor(); },
      setDirty,
      createEventEditor,
      asciiFiles: state.asciiFiles || [],
      items: state.data.items || [],
      showHeader: false,
    });
  }
}

function appendDialogWarnings(container, graph) {
  if (!graph.unreachable.length && !graph.missingTargets.length) return;
  const warn = document.createElement('div');
  warn.className = 'card warning';
  const list = [];
  if (graph.unreachable.length) list.push(`Unreachable: ${graph.unreachable.join(', ')}`);
  if (graph.missingTargets.length) list.push(`Fehlende Ziele: ${graph.missingTargets.map(m => `${m.from} → ${m.target || '???'}`).join(', ')}`);
  warn.innerHTML = `<strong>Hinweis:</strong> ${list.join(' · ')}`;
  container.appendChild(warn);
}

function openChoiceEditor(dialog, nodeId, idx) {
  const node = dialog.nodes?.[nodeId];
  if (!node || !node.choices[idx]) return;
  const choice = node.choices[idx];
  choice.requires = choice.requires || { items: [], flag: null };
  choice.hidden_if = choice.hidden_if || { items: [], flag: null };
  choice.events = choice.events || [];

  const wrap = document.createElement('div');
  wrap.className = 'choice-modal';

  wrap.appendChild(simpleField('Antwort-Text', choice.text || '', (v) => { choice.text = v; setDirty(true); }));

  const nextSelect = document.createElement('select');
  const opts = nodeIds(dialog).concat('end');
  opts.forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    if (id === choice.next) opt.selected = true;
    nextSelect.appendChild(opt);
  });
  nextSelect.onchange = () => { choice.next = nextSelect.value; setDirty(true); };
  wrap.appendChild(labeled('Ziel', nextSelect));

  wrap.appendChild(createGateEditor('Bedingungen', choice.requires));
  wrap.appendChild(createGateEditor('Verstecken wenn', choice.hidden_if));

  const eventWrap = document.createElement('div');
  const btn = document.createElement('button');
  btn.textContent = '🧩 Events bearbeiten';
  btn.onclick = () => {
    eventWrap.innerHTML = '';
    const editor = createEventEditor(choice.events || [], (val) => { choice.events = val; setDirty(true); });
    eventWrap.appendChild(editor);
  };
  wrap.appendChild(btn);
  wrap.appendChild(eventWrap);

  openModal('Choice bearbeiten', wrap);
}

function createGateEditor(label, gate) {
  const card = document.createElement('div');
  card.className = 'card gate-card';
  const title = document.createElement('div');
  title.className = 'panel-header';
  title.textContent = label;
  card.appendChild(title);

  const itemSelect = document.createElement('select');
  itemSelect.multiple = true;
  (state.data.items || []).forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name || item.id;
    if (gate.items?.includes(item.id)) opt.selected = true;
    itemSelect.appendChild(opt);
  });
  itemSelect.onchange = () => {
    gate.items = Array.from(itemSelect.selectedOptions).map(o => o.value);
    setDirty(true);
  };
  card.appendChild(labeled('Benötigte Items', itemSelect));

  const flagWrap = document.createElement('div');
  flagWrap.className = 'flag-editor';
  const keyInput = document.createElement('input');
  keyInput.value = gate.flag?.key || '';
  keyInput.placeholder = 'flag-key';
  keyInput.oninput = () => {
    gate.flag = gate.flag || { key: '', equals: true };
    gate.flag.key = keyInput.value;
    if (!gate.flag.key) gate.flag = null;
    setDirty(true);
  };
  const equals = document.createElement('input');
  equals.type = 'checkbox';
  equals.checked = gate.flag?.equals !== false;
  equals.onchange = () => {
    gate.flag = gate.flag || { key: keyInput.value, equals: true };
    gate.flag.equals = equals.checked;
    if (!gate.flag.key) gate.flag = null;
    setDirty(true);
  };
  flagWrap.appendChild(labeled('Flag-Key', keyInput));
  const eqLabel = document.createElement('label');
  eqLabel.className = 'checkbox-inline';
  eqLabel.appendChild(equals);
  eqLabel.appendChild(document.createTextNode('Equals true'));
  flagWrap.appendChild(eqLabel);
  card.appendChild(flagWrap);

  return card;
}

function labeled(label, node) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  wrap.appendChild(l);
  wrap.appendChild(node);
  return wrap;
}

function simpleField(label, value, onChange) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.oninput = () => onChange(input.value);
  return labeled(label, input);
}

function createFieldGrid(fields) {
  const grid = document.createElement('div');
  grid.className = 'form-grid';
  fields.forEach(f => grid.appendChild(f));
  return grid;
}

function field(labelText, type, value, onChange, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const label = document.createElement('label');
  label.textContent = labelText;
  wrap.appendChild(label);
  let input;
  if (type === 'textarea') {
    input = document.createElement('textarea');
    input.value = value || '';
    input.oninput = () => onChange(input.value);
  } else if (type === 'select') {
    input = document.createElement('select');
    (opts.options || []).forEach(optVal => {
      const opt = document.createElement('option');
      opt.value = optVal;
      opt.textContent = optVal || '— keine —';
      if (optVal === value) opt.selected = true;
      input.appendChild(opt);
    });
    input.onchange = () => onChange(input.value);
  } else if (type === 'checkbox') {
    const boxWrap = document.createElement('label');
    boxWrap.className = 'checkbox-inline';
    input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!value;
    input.onchange = () => onChange(input.checked);
    boxWrap.appendChild(input);
    boxWrap.appendChild(document.createTextNode('aktiv'));
    wrap.appendChild(boxWrap);
    return wrap;
  } else {
    input = document.createElement('input');
    input.type = type;
    input.value = value || '';
    input.oninput = () => onChange(input.value);
  }
  wrap.appendChild(input);
  return wrap;
}

function multiselectField(labelText, options, selected, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const label = document.createElement('label');
  label.textContent = labelText;
  wrap.appendChild(label);
  const select = document.createElement('select');
  select.multiple = true;
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.id;
    o.textContent = opt.name || opt.id;
    if (selected.includes(opt.id)) o.selected = true;
    select.appendChild(o);
  });
  select.onchange = () => {
    const vals = Array.from(select.selectedOptions).map(o => o.value);
    onChange(vals);
  };
  wrap.appendChild(select);
  return wrap;
}

function generateDefaultExitFlag(roomId, direction) {
  return `exit_${roomId}_${direction}_open`;
}

function textListField(labelText, values, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const label = document.createElement('label');
  label.textContent = labelText;
  wrap.appendChild(label);
  const input = document.createElement('textarea');
  input.value = (values || []).join('\n');
  input.oninput = () => {
    const list = input.value.split(/\n+/).map(v => v.trim()).filter(Boolean);
    onChange(list);
  };
  wrap.appendChild(input);
  return wrap;
}

function getExitMeta(room, dir) {
  return (room.exitMeta && room.exitMeta[dir]) || {};
}

function setExitMeta(room, dir, meta) {
  room.exitMeta = room.exitMeta || {};
  if (meta) {
    room.exitMeta[dir] = meta;
  } else if (room.exitMeta) {
    delete room.exitMeta[dir];
  }
}

function exitTable(room) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  wrap.innerHTML = '<label>Ausgänge</label>';
  const table = document.createElement('table');
  table.className = 'table';
  const head = document.createElement('tr');
  head.innerHTML = '<th>Richtung</th><th>Raum-ID</th><th>Anfangs versperrt</th><th>Versperrt durch Objekt-ID</th><th>Zustands-Flag (optional)</th><th></th>';
  table.appendChild(head);
  const exits = room.exits || {};
  Object.entries(exits).forEach(([dir, target]) => {
    table.appendChild(exitRow(room, dir, target));
  });
  const btn = document.createElement('button');
  btn.textContent = 'Ausgang hinzufügen';
  btn.onclick = () => {
    const key = prompt('Richtung (z.B. nord, ost)?');
    if (!key) return;
    room.exits = room.exits || {};
    room.exits[key] = '';
    setDirty(true);
    renderEditor();
    renderSidebar();
    renderMap();
  };
  wrap.appendChild(table);
  wrap.appendChild(btn);
  return wrap;
}

function exitRow(room, dir, target) {
  const meta = getExitMeta(room, dir);
  const tr = document.createElement('tr');
  const tdDir = document.createElement('td');
  const inputDir = document.createElement('input');
  inputDir.value = dir;
  inputDir.onchange = () => {
    const val = inputDir.value.trim();
    if (!val) return;
    room.exits = room.exits || {};
    delete room.exits[dir];
    room.exits[val] = target;
    const currentMeta = getExitMeta(room, dir);
    if (Object.keys(currentMeta).length) {
      setExitMeta(room, dir, null);
      setExitMeta(room, val, currentMeta);
    }
    setDirty(true);
    renderMap();
  };
  tdDir.appendChild(inputDir);
  const tdTarget = document.createElement('td');
  const inputTarget = document.createElement('input');
  inputTarget.value = target;
  inputTarget.onchange = () => { room.exits[dir] = inputTarget.value.trim(); setDirty(true); renderMap(); };
  tdTarget.appendChild(inputTarget);
  const tdLocked = document.createElement('td');
  const inputLocked = document.createElement('input');
  inputLocked.type = 'checkbox';
  inputLocked.checked = !!meta.locked;
  inputLocked.onchange = () => {
    const nextMeta = { ...getExitMeta(room, dir), locked: inputLocked.checked };
    setExitMeta(room, dir, nextMeta);
    setDirty(true);
  };
  tdLocked.appendChild(inputLocked);

  const tdObject = document.createElement('td');
  const inputObject = document.createElement('input');
  inputObject.setAttribute('list', `exit-object-list-${room.id}-${dir}`);
  inputObject.value = meta.objectId || '';
  inputObject.placeholder = 'tor_villa o.Ä.';
  inputObject.onchange = () => {
    const nextMeta = { ...getExitMeta(room, dir), objectId: inputObject.value.trim() };
    setExitMeta(room, dir, nextMeta);
    setDirty(true);
  };
  const datalist = document.createElement('datalist');
  datalist.id = `exit-object-list-${room.id}-${dir}`;
  (state.data.objects || []).forEach(obj => {
    const opt = document.createElement('option');
    opt.value = obj.id;
    opt.textContent = obj.name || obj.id;
    datalist.appendChild(opt);
  });
  tdObject.append(inputObject, datalist);

  const tdFlag = document.createElement('td');
  const inputFlag = document.createElement('input');
  inputFlag.value = meta.flag || '';
  inputFlag.placeholder = generateDefaultExitFlag(room.id, dir);
  inputFlag.onchange = () => {
    const nextMeta = { ...getExitMeta(room, dir), flag: inputFlag.value.trim() };
    setExitMeta(room, dir, nextMeta);
    setDirty(true);
  };
  tdFlag.appendChild(inputFlag);

  const tdBtn = document.createElement('td');
  const del = document.createElement('button');
  del.className = 'ghost';
  del.textContent = 'x';
  del.onclick = () => {
    delete room.exits[dir];
    setExitMeta(room, dir, null);
    setDirty(true);
    renderEditor();
    renderMap();
  };
  tdBtn.appendChild(del);
  tr.append(tdDir, tdTarget, tdLocked, tdObject, tdFlag, tdBtn);
  return tr;
}

function eventArea(labelText, value, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const label = document.createElement('label');
  label.textContent = labelText;
  wrap.appendChild(label);
  wrap.appendChild(createEventEditor(value, onChange));
  return wrap;
}

function createEventEditor(initialValue, onChange) {
  const container = document.createElement('div');
  container.className = 'event-editor';

  const tabs = document.createElement('div');
  tabs.className = 'event-tabs';
  const tabBlocks = document.createElement('button');
  tabBlocks.type = 'button';
  tabBlocks.textContent = 'Blöcke';
  const tabJson = document.createElement('button');
  tabJson.type = 'button';
  tabJson.textContent = 'JSON';
  tabs.append(tabBlocks, tabJson);

  const blockHost = document.createElement('div');
  blockHost.className = 'event-blockly-host';

  const jsonArea = document.createElement('textarea');
  jsonArea.value = JSON.stringify(initialValue || [], null, 2);

  const editor = initEventBlockEditor(blockHost, initialValue || []);

  if (window.Blockly && editor?.workspace) {
    window.setTimeout(() => {
      window.Blockly.svgResize(editor.workspace);
    }, 0);
  }

  const resizeObserver = new ResizeObserver(() => {
    if (window.Blockly?.svgResize) {
      window.Blockly.svgResize(editor.workspace);
    }
  });
  resizeObserver.observe(container);

  const syncBlocksToJson = (emitChange = false) => {
    const events = editor.getJson();
    jsonArea.value = JSON.stringify(events, null, 2);
    if (emitChange) onChange(events);
  };

  const syncJsonToBlocks = () => safeJsonUpdate(jsonArea.value, (val) => {
    editor.setJson(val);
    onChange(val);
  });

  editor.workspace.addChangeListener(() => syncBlocksToJson(true));

  const blockLauncher = document.createElement('div');
  blockLauncher.className = 'blockly-modal-launcher';
  const blockHint = document.createElement('p');
  blockHint.textContent = 'Öffne den Blockly-Editor im Modal, um Events per Drag & Drop zusammenzustellen.';
  const openBlocksBtn = document.createElement('button');
  openBlocksBtn.type = 'button';
  openBlocksBtn.textContent = 'Blockly-Editor öffnen';
  openBlocksBtn.onclick = () => {
    syncJsonToBlocks();
    openModal('Event Blockly Editor', blockHost, () => {
      if (window.Blockly?.svgResize) {
        window.Blockly.svgResize(editor.workspace);
        editor.workspace.scrollCenter();
      }
    });
  };
  blockLauncher.append(blockHint, openBlocksBtn);

  let activeTab = 'blocks';
  const setTab = (tab) => {
    activeTab = tab;
    tabBlocks.classList.toggle('active', tab === 'blocks');
    tabJson.classList.toggle('active', tab === 'json');
    blockLauncher.style.display = tab === 'blocks' ? 'block' : 'none';
    jsonArea.style.display = tab === 'json' ? 'block' : 'none';
  };

  tabBlocks.onclick = () => {
    if (activeTab === 'blocks') return;
    syncJsonToBlocks();
    setTab('blocks');
  };

  tabJson.onclick = () => {
    if (activeTab === 'json') return;
    syncBlocksToJson(false);
    setTab('json');
  };

  jsonArea.onchange = () => syncJsonToBlocks();

  setTab('blocks');
  container.append(tabs, blockLauncher, jsonArea);
  return container;
}

function combineTable(item) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  wrap.innerHTML = '<label>Combine Mapping</label>';
  const table = document.createElement('table');
  table.className = 'table';
  const head = document.createElement('tr');
  head.innerHTML = '<th>Ziel-ID</th><th>Event-Liste (JSON)</th><th></th>';
  table.appendChild(head);
  const combine = item.combine || {};
  Object.entries(combine).forEach(([targetId, events]) => {
    const tr = document.createElement('tr');
    const tdTarget = document.createElement('td');
    const inputTarget = document.createElement('input');
    inputTarget.value = targetId;
    inputTarget.onchange = () => {
      const newId = inputTarget.value.trim();
      if (!newId) return;
      delete item.combine[targetId];
      item.combine[newId] = events;
      setDirty(true);
    };
    tdTarget.appendChild(inputTarget);

    const tdEvents = document.createElement('td');
    const eventEditor = createEventEditor(events || [], (val) => { item.combine[targetId] = val; setDirty(true); });
    tdEvents.appendChild(eventEditor);

    const tdBtn = document.createElement('td');
    const del = document.createElement('button');
    del.className = 'ghost';
    del.textContent = 'x';
    del.onclick = () => { delete item.combine[targetId]; setDirty(true); renderEditor(); };
    tdBtn.appendChild(del);

    tr.append(tdTarget, tdEvents, tdBtn);
    table.appendChild(tr);
  });

  const btn = document.createElement('button');
  btn.textContent = 'Mapping hinzufügen';
  btn.onclick = () => {
    const target = prompt('Ziel-Item-ID für Kombination:');
    if (!target) return;
    item.combine = item.combine || {};
    item.combine[target] = [];
    setDirty(true);
    renderEditor();
  };
  wrap.append(table, btn);
  return wrap;
}

function asciiUploadBlock() {
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.innerHTML = '<h4>ASCII Upload</h4><p>Neue ASCII-Datei hochladen und dem Raum zuordnen.</p>';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,.asc,.ansi,.ans';
  const btn = document.createElement('button');
  btn.textContent = 'Hochladen';
  btn.onclick = async () => {
    const file = input.files && input.files[0];
    if (!file || !state.currentAdventure) return;
    try {
      await Api.uploadAscii(state.currentAdventure.id, file);
      toast('ASCII hochgeladen');
      const res = await Api.loadAdventure(state.currentAdventure.id);
      state.data = res.data || res;
      state.asciiFiles = res.ascii || res.asciiFiles || [];
      renderSidebar();
      renderEditor();
    } catch (e) {
      toast('Upload fehlgeschlagen: ' + e.message, 'error');
    }
  };
  wrap.append(input, btn);
  return wrap;
}

function safeJsonUpdate(text, cb) {
  try {
    const val = JSON.parse(text || '[]');
    cb(val);
    setDirty(true);
  } catch (e) {
    toast('JSON ungültig: ' + e.message, 'error');
  }
}

function updateRoom(room, key, value) {
  room[key] = value;
  setDirty(true);
  if (key === 'exits') renderMap();
}

function updateItem(item, key, value) {
  item[key] = value;
  setDirty(true);
}

function updateObject(obj, key, value) {
  obj[key] = value;
  setDirty(true);
}

function updateEnemy(enemy, key, value) {
  enemy[key] = value;
  setDirty(true);
}

function updateEnemyAscii(enemy, key, value) {
  enemy.ascii = enemy.ascii || {};
  const parsed = key === 'fontSize' ? Number(value) : value;
  enemy.ascii[key] = key === 'fontSize' && !value ? '' : (Number.isFinite(parsed) || key !== 'fontSize' ? parsed : '');
  setDirty(true);
}

function updateEnemyStat(enemy, key, value) {
  enemy.stats = enemy.stats || {};
  const num = Number(value);
  enemy.stats[key] = Number.isFinite(num) ? num : 0;
  setDirty(true);
}

function updateEnemyBehavior(enemy, key, value) {
  enemy.behavior = enemy.behavior || {};
  const num = Number(value);
  enemy.behavior[key] = Number.isFinite(num) ? num : 0;
  setDirty(true);
}

function addRoom() {
  const id = prompt('Neue Raum-ID:');
  if (!id) return;
  const newRoom = { id, title: id, description: '', ascii: '', items: [], objects: [], exits: {}, exitMeta: {}, on_enter: [], on_first_enter: [] };
  state.data.rooms = state.data.rooms || [];
  state.data.rooms.push(newRoom);
  state.selection = defaultSelection({ view: 'room', roomId: id });
  setDirty(true);
  renderSidebar();
  renderEditor();
  renderMap();
}

function deleteRoom(id) {
  if (!confirm('Raum wirklich löschen?')) return;
  state.data.rooms = (state.data.rooms || []).filter(r => r.id !== id);
  state.selection = defaultSelection({ view: 'world' });
  setDirty(true);
  renderSidebar();
  renderEditor();
  renderMap();
}

function addItem() {
  const id = prompt('Neue Item-ID:');
  if (!id) return;
  const item = { id, name: id, description: '', pickup: true, combine: {}, on_use: [] };
  state.data.items = state.data.items || [];
  state.data.items.push(item);
  state.selection = defaultSelection({ view: 'item', itemId: id });
  setDirty(true);
  renderSidebar();
  renderEditor();
}

function deleteItem(id) {
  if (!confirm('Item löschen?')) return;
  state.data.items = (state.data.items || []).filter(i => i.id !== id);
  state.data.rooms = (state.data.rooms || []).map(room => ({
    ...room,
    items: (room.items || []).filter(itemId => itemId !== id)
  }));
  setDirty(true);
  state.selection = defaultSelection({ view: 'world' });
  renderSidebar();
  renderEditor();
}

function addObject() {
  const id = prompt('Neue Objekt-ID:');
  if (!id) return;
  const obj = { id, name: id, description: '', locked: false, use: [], on_locked_use: [], inspect: [] };
  state.data.objects = state.data.objects || [];
  state.data.objects.push(obj);
  state.selection = defaultSelection({ view: 'object', objectId: id });
  setDirty(true);
  renderSidebar();
  renderEditor();
}

function deleteObject(id) {
  if (!confirm('Objekt wirklich löschen?')) return;
  state.data.objects = (state.data.objects || []).filter(o => o.id !== id);
  state.data.rooms = (state.data.rooms || []).map(room => ({
    ...room,
    objects: (room.objects || []).filter(objId => objId !== id),
  }));
  state.selection = defaultSelection({ view: 'world' });
  setDirty(true);
  renderSidebar();
  renderEditor();
}

function addEnemy() {
  const id = prompt('Neue Gegner-ID:');
  if (!id) return;
  const enemy = { id, name: id, description: '', ascii: { file: '', fontSize: 4 }, stats: { hp: 10, attack: 1, defense: 0 }, behavior: { fleeDifficulty: 0 }, drops: [], on_attack: [], on_defeat: [] };
  state.data.enemies = state.data.enemies || [];
  state.data.enemies.push(enemy);
  state.selection = defaultSelection({ view: 'enemy', enemyId: id });
  setDirty(true);
  renderSidebar();
  renderEditor();
}

function deleteEnemy(id) {
  if (!confirm('Gegner wirklich löschen?')) return;
  state.data.enemies = (state.data.enemies || []).filter(e => e.id !== id);
  state.selection = defaultSelection({ view: 'world' });
  setDirty(true);
  renderSidebar();
  renderEditor();
}

function addNpc() {
  ensureNpcCollection(state.data);
  const name = prompt('Name des NPCs:');
  if (!name) return;
  const npc = createNpcDraft(name);
  state.data.npcs.push(npc);
  ensureDialogForNpc(state.data, npc.id);
  state.selection = defaultSelection({ view: 'npc', npcId: npc.id });
  setDirty(true);
  renderSidebar();
  renderEditor();
}

function deleteNpc(id) {
  if (!confirm('NPC wirklich löschen?')) return;
  state.data.npcs = (state.data.npcs || []).filter(n => n.id !== id);
  if (state.data.dialogs) delete state.data.dialogs[id];
  state.selection = defaultSelection({ view: 'world' });
  setDirty(true);
  renderSidebar();
  renderEditor();
}

function updateAsciiPreview(fileName) {
  if (!fileName) {
    asciiPreview.textContent = 'Keine ASCII-Datei zugeordnet.';
    return;
  }
  const path = `js/games/adventure/adventures/${state.currentAdventure.id}/ascii/${fileName}`;
  fetch(path).then(r => r.text()).then(text => asciiPreview.textContent = text).catch(() => asciiPreview.textContent = 'ASCII konnte nicht geladen werden.');
}

function renderMap() {
  mapView.innerHTML = '';
  const rooms = state.data?.rooms || [];
  if (!rooms.length) { mapView.textContent = 'Keine Räume vorhanden.'; return; }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 800 320');

  const panGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const zoomGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  panGroup.appendChild(zoomGroup);

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
  marker.setAttribute('id', 'arrow');
  marker.setAttribute('markerWidth', '6');
  marker.setAttribute('markerHeight', '6');
  marker.setAttribute('refX', '5');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M0,0 L6,3 L0,6 z');
  path.setAttribute('fill', 'rgba(255, 134, 255, 0.6)');
  marker.appendChild(path);
  defs.appendChild(marker);
  svg.appendChild(defs);

  const centerX = 400, centerY = 160, radius = 120;
  const defaultPositions = {};
  rooms.forEach((room, idx) => {
    const angle = (idx / rooms.length) * Math.PI * 2;
    defaultPositions[room.id] = {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    };
  });

  const positions = {};
  rooms.forEach(room => {
    const stored = room.mapPos || room.map_position; // fallback key for potential legacy naming
    if (stored && isFiniteNumber(stored.x) && isFiniteNumber(stored.y)) {
      positions[room.id] = { x: stored.x, y: stored.y };
    } else {
      positions[room.id] = defaultPositions[room.id];
    }
  });

  const lines = [];

  rooms.forEach(room => {
    const exits = room.exits || {};
    Object.values(exits).forEach(targetId => {
      if (!positions[targetId]) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', positions[room.id].x);
      line.setAttribute('y1', positions[room.id].y);
      line.setAttribute('x2', positions[targetId].x);
      line.setAttribute('y2', positions[targetId].y);
      line.setAttribute('class', 'map-link');
      line.dataset.from = room.id;
      line.dataset.to = targetId;
      zoomGroup.appendChild(line);
      lines.push(line);
    });
  });

  const roomNodes = {};
  rooms.forEach(room => {
    const pos = positions[room.id];
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', 'map-room');

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('rx', '8');
    rect.setAttribute('ry', '8');
    rect.setAttribute('width', '120');
    rect.setAttribute('height', '48');
    rect.setAttribute('class', 'map-node');
    group.appendChild(rect);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('class', 'map-text');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.textContent = room.title || room.id;
    group.appendChild(label);

    const updateRoomPosition = (p) => {
      rect.setAttribute('x', p.x - 60);
      rect.setAttribute('y', p.y - 24);
      label.setAttribute('x', p.x);
      label.setAttribute('y', p.y);
    };

    updateRoomPosition(pos);
    zoomGroup.appendChild(group);
    roomNodes[room.id] = { group, updateRoomPosition };
  });

  applyMapTransform(panGroup, zoomGroup);
  svg.appendChild(panGroup);
  mapView.appendChild(svg);

  const hint = document.createElement('div');
  hint.className = 'map-hint';
  hint.textContent = 'Scroll zum Zoomen, Karte ziehen zum Verschieben, Räume ziehen zum Anordnen';
  mapView.appendChild(hint);

  let isPanning = false;
  let last = { x: 0, y: 0 };
  let draggingRoom = null;
  let dragOffset = { x: 0, y: 0 };

  const toMapCoords = (clientX, clientY) => {
    const rect = svg.getBoundingClientRect();
    const point = {
      x: ((clientX - rect.left) / rect.width) * 800,
      y: ((clientY - rect.top) / rect.height) * 320,
    };
    return {
      x: (point.x - state.map.x) / state.map.scale,
      y: (point.y - state.map.y) / state.map.scale,
    };
  };

  const updateConnections = (roomId) => {
    lines.forEach(line => {
      if (line.dataset.from === roomId) {
        line.setAttribute('x1', positions[roomId].x);
        line.setAttribute('y1', positions[roomId].y);
      }
      if (line.dataset.to === roomId) {
        line.setAttribute('x2', positions[roomId].x);
        line.setAttribute('y2', positions[roomId].y);
      }
    });
  };

  const startDrag = (room, e) => {
    draggingRoom = room;
    const current = positions[room.id];
    const pointerPos = toMapCoords(e.clientX, e.clientY);
    dragOffset = { x: pointerPos.x - current.x, y: pointerPos.y - current.y };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('dragging');
  };

  Object.entries(roomNodes).forEach(([roomId, node]) => {
    const room = rooms.find(r => r.id === roomId);
    node.group.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      startDrag(room, e);
    });
  });

  svg.addEventListener('pointerdown', (e) => {
    isPanning = true;
    last = { x: e.clientX, y: e.clientY };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('panning');
  });

  svg.addEventListener('pointermove', (e) => {
    if (draggingRoom) {
      const pointerPos = toMapCoords(e.clientX, e.clientY);
      const newPos = { x: pointerPos.x - dragOffset.x, y: pointerPos.y - dragOffset.y };
      positions[draggingRoom.id] = newPos;
      roomNodes[draggingRoom.id].updateRoomPosition(newPos);
      updateConnections(draggingRoom.id);
      return;
    }
    if (!isPanning) return;
    const rect = svg.getBoundingClientRect();
    const deltaX = ((e.clientX - last.x) / rect.width) * 800;
    const deltaY = ((e.clientY - last.y) / rect.height) * 320;
    state.map.x += deltaX;
    state.map.y += deltaY;
    last = { x: e.clientX, y: e.clientY };
    applyMapTransform(panGroup, zoomGroup);
  });

  const endDrag = (e) => {
    if (!draggingRoom) return;
    const room = draggingRoom;
    room.mapPos = { ...positions[room.id] };
    setDirty(true);
    draggingRoom = null;
    svg.classList.remove('dragging');
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  };

  const endPan = (e) => {
    if (!isPanning) return;
    isPanning = false;
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
    svg.classList.remove('panning');
  };

  svg.addEventListener('pointerup', (e) => { endDrag(e); endPan(e); });
  svg.addEventListener('pointerleave', (e) => { endDrag(e); endPan(e); });

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const point = {
      x: ((e.clientX - rect.left) / rect.width) * 800,
      y: ((e.clientY - rect.top) / rect.height) * 320,
    };
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.5, Math.min(3, state.map.scale * factor));
    const oldScale = state.map.scale;
    if (newScale === oldScale) return;
    state.map.x += (oldScale - newScale) * point.x;
    state.map.y += (oldScale - newScale) * point.y;
    state.map.scale = newScale;
    applyMapTransform(panGroup, zoomGroup);
  }, { passive: false });
}

function applyMapTransform(panGroup, zoomGroup) {
  panGroup.setAttribute('transform', `translate(${state.map.x} ${state.map.y})`);
  zoomGroup.setAttribute('transform', `scale(${state.map.scale})`);
}

function ensureLockExitEvent(room, direction) {
  room.on_first_enter = room.on_first_enter || [];
  const exists = room.on_first_enter.some(ev => ev.type === 'lock_exit' && ev.room === room.id && ev.direction === direction);
  if (!exists) {
    room.on_first_enter.push({ type: 'lock_exit', room: room.id, direction });
  }
}

function ensureObjectHasExitControlLogic(object, meta, roomId, direction) {
  if (!object) return;
  object.use = object.use || [];
  const flag = meta.flag || generateDefaultExitFlag(roomId, direction);
  const unlockEvent = { type: 'unlock_exit', room: roomId, direction };
  const existingBlock = object.use.find(ev => ev.type === 'flag_if' && ev.key === flag);
  if (existingBlock) {
    const thenEvents = existingBlock.then || [];
    const hasUnlock = thenEvents.some(ev => ev.type === 'unlock_exit' && ev.room === roomId && ev.direction === direction);
    if (!hasUnlock) existingBlock.then = thenEvents.concat([unlockEvent]);
    return;
  }
  const block = {
    type: 'flag_if',
    key: flag,
    equals: true,
    then: [
      { type: 'message', text: 'Mit einem Ächzen schwingt das Tor auf.' },
      unlockEvent,
    ],
    else: [
      { type: 'message', text: 'Es rührt sich keinen Millimeter. Irgendetwas fehlt noch.' },
    ],
  };
  object.use.push(block);
}

function applyExitLockingMetaToRooms(adventureData) {
  const objects = adventureData.objects || [];
  const objectById = Object.fromEntries(objects.map(o => [o.id, o]));
  (adventureData.rooms || []).forEach(room => {
    room.exitMeta = room.exitMeta || {};
    const exitMeta = room.exitMeta;
    Object.entries(exitMeta).forEach(([direction, meta]) => {
      const normalizedMeta = { ...meta };
      normalizedMeta.flag = normalizedMeta.flag || generateDefaultExitFlag(room.id, direction);
      room.exitMeta[direction] = normalizedMeta;
      if (normalizedMeta.locked) ensureLockExitEvent(room, direction);
      if (normalizedMeta.objectId) {
        const obj = objectById[normalizedMeta.objectId];
        if (obj) {
          ensureObjectHasExitControlLogic(obj, normalizedMeta, room.id, direction);
        } else {
          console.warn(`Exit meta refers to missing object ${normalizedMeta.objectId}`);
        }
      }
    });
  });
}

function prepareAdventureForSave(data) {
  ensureNpcCollection(data);
  ensureDialogState(data);
  data.enemies = data.enemies || [];
  const cloned = JSON.parse(JSON.stringify(data));
  applyExitLockingMetaToRooms(cloned);
  return cloned;
}

async function saveCurrent() {
  if (!state.currentAdventure || !state.data) return;
  try {
    const prepared = prepareAdventureForSave(state.data);
    await Api.saveAdventure(state.currentAdventure.id, {
      world: prepared.world,
      game: prepared.game,
      rooms: prepared.rooms,
      items: prepared.items,
      objects: prepared.objects,
      enemies: prepared.enemies,
      npcs: prepared.npcs,
      dialogs: prepared.dialogs,
    });
    toast('Adventure gespeichert', 'success');
    setDirty(false);
  } catch (e) {
    toast('Speichern fehlgeschlagen: ' + e.message, 'error');
  }
}

init();
