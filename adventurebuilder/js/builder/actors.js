const TYPE_LABELS = { npc: 'NPC', enemy: 'Gegner', actor: 'Akteur' };

const slugify = (str = '') => str
  .toString()
  .toLowerCase()
  .trim()
  .replace(/\s+/g, '-')
  .replace(/[^a-z0-9_-]/g, '')
  .replace(/-+/g, '-');

export function ensureActorCollection(data) {
  if (!data.actors) data.actors = [];
  return data.actors;
}

// Erstellt nun einen generischen Actor mit allen notwendigen Properties
export function createActorDraft(name = 'Neuer Akteur', type = 'npc') {
  const id = slugify(name) || 'actor';
  return {
    id,
    type, // 'npc' oder 'enemy' als Voreinstellung/Tag
    name,
    description: '',
    room: '',
    dialog_start: 'start',
    hidden_if_flag: null,
    only_if_flag: null,
    ascii: { file: '', fontSize: 4 },
    stats: { hp: 10, attack: 1, defense: 0 },
    behavior: { fleeDifficulty: 0, hostile: type === 'enemy' },
    drops: [],
    hooks: { on_attack: [], on_hit: [], on_miss: [], on_defeat: [] },
    flags: {},
    counters: {}
  };
}

export function renderActorSidebar({ container, actors = [], selection, onSelect, onAddActor }) {
  container.appendChild(sectionTitle('Akteure'));
  
  const list = document.createElement('div');
  list.className = 'nav-list';
  
  // Sortieren: Erst NPCs, dann Gegner, dann Rest (optional)
  const sorted = [...actors].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

  sorted.forEach(actor => {
    const row = document.createElement('div');
    const active = selection.view === 'actor' && selection.actorId === actor.id;
    row.className = 'nav-item' + (active ? ' active' : '');
    
    const label = document.createElement('span');
    label.textContent = actor.name || actor.id;
    
    const badge = document.createElement('span');
    badge.className = 'badge inline';
    // Zeige "Kampf", wenn HP/Atk vorhanden sind, sonst Typ
    const isCombatant = (actor.stats?.attack > 0 || actor.stats?.hp > 0) && actor.type === 'enemy';
    badge.textContent = isCombatant ? '⚔' : (TYPE_LABELS[actor.type] || 'Actor');
    if (isCombatant) badge.title = 'Kämpfer';
    
    row.append(label, badge);
    row.onclick = () => onSelect(actor.id, actor.type);
    list.appendChild(row);
  });

  const btnNew = document.createElement('button');
  btnNew.textContent = 'Neuer Akteur';
  btnNew.style.width = '100%';
  btnNew.style.marginTop = '8px';
  btnNew.onclick = onAddActor; // Ruft nun die generische Add-Funktion auf

  container.append(list, btnNew);
}

export function renderActorEditor(actor, ctx) {
  const { 
    rooms = [], 
    dialogs = {}, 
    asciiFiles = [], 
    widgets = {}, 
    onUpdateActor, 
    // Wir nutzen jetzt generische Update-Wrapper im Main code oder hier direkt Mapping
    onDelete, 
    onOpenDialog 
  } = ctx;

  // Helper für sauberes Update verschachtelter Objekte
  const updateStat = (key, val) => {
    const stats = { ...actor.stats, [key]: Number(val) };
    onUpdateActor('stats', stats);
  };
  
  const updateBehavior = (key, val) => {
    const behavior = { ...actor.behavior, [key]: Number(val) };
    onUpdateActor('behavior', behavior);
  };

  const updateAscii = (key, val) => {
    const ascii = { ...actor.ascii, [key]: val };
    onUpdateActor('ascii', ascii);
  };

  const updateHook = (key, val) => {
    // Hooks initialisieren falls undefined
    const currentHooks = actor.hooks || {};
    const hooks = { ...currentHooks, [key]: val };
    onUpdateActor('hooks', hooks);
  };

  const card = document.createElement('div');
  card.className = 'card';
  card.appendChild(header(actor));

  // --- SEKTION 1: Stammdaten ---
  card.appendChild(section('Allgemein', [
    fieldGrid([
      inputField('ID', actor.id, (v) => onUpdateActor('id', slugify(v) || actor.id)),
      inputField('Name', actor.name, (v) => onUpdateActor('name', v)),
      selectField('Typ (Tag)', actor.type, [
        { value: 'npc', label: 'NPC (Friedlich)' }, 
        { value: 'enemy', label: 'Gegner (Feindlich)' }
      ], (v) => onUpdateActor('type', v)),
      selectField('Raum', actor.room, rooms.map(r => ({ value: r.id, label: r.title || r.id })), (v) => onUpdateActor('room', v)),
    ].filter(Boolean)),
    textArea('Beschreibung', actor.description || '', (v) => onUpdateActor('description', v)),
  ]));

  // --- SEKTION 2: Darstellung (ASCII) ---
  const asciiField = inputField('ASCII-Datei', actor.ascii?.file || '', (v) => updateAscii('file', v));
  const datalistId = `ascii-files-${actor.id}`;
  const datalist = document.createElement('datalist');
  datalist.id = datalistId;
  asciiFiles.forEach(file => {
    const opt = document.createElement('option');
    opt.value = file.file || file;
    datalist.appendChild(opt);
  });
  const input = asciiField.querySelector('input');
  if (input) input.setAttribute('list', datalistId);
  asciiField.appendChild(datalist);
  const fontField = inputField('Schriftgröße (px)', actor.ascii?.fontSize ?? 4, (v) => updateAscii('fontSize', Number(v)), 'number');

  card.appendChild(section('Darstellung', [
    fieldGrid([asciiField, fontField])
  ]));

  // --- SEKTION 3: Dialog & Logik ---
  const dialogSection = section('Dialog & Sichtbarkeit', [
    fieldGrid([
      selectField('Start-Dialognode', actor.dialog_start || 'start', getDialogNodeOptions(dialogs, actor.id), (v) => onUpdateActor('dialog_start', v)),
      npcDialogStatus(actor, dialogs)
    ]),
    fieldGrid([
      flagFields('Nur anzeigen wenn Flag', actor.only_if_flag, (flag) => onUpdateActor('only_if_flag', normalizeFlag(flag))),
      flagFields('Verstecken wenn Flag', actor.hidden_if_flag, (flag) => onUpdateActor('hidden_if_flag', normalizeFlag(flag))),
    ]),
    actionRow([
      { label: 'Dialog Editor öffnen', className: 'primary', onClick: () => onOpenDialog(actor.id) }
    ])
  ]);
  card.appendChild(dialogSection);

  // --- SEKTION 4: Kampfwerte ---
  // Wird immer angezeigt, damit man jeden Actor theoretisch bekämpfen kann
  const statsSection = section('Kampfwerte & Beute', [
    fieldGrid([
      inputField('HP (Lebenspunkte)', actor.stats?.hp ?? 10, (v) => updateStat('hp', v), 'number'),
      inputField('Angriff (Atk)', actor.stats?.attack ?? 1, (v) => updateStat('attack', v), 'number'),
      inputField('Verteidigung (Def)', actor.stats?.defense ?? 0, (v) => updateStat('defense', v), 'number'),
    ]),
    fieldGrid([
      inputField('Flucht-Schwierigkeit (0-1)', actor.behavior?.fleeDifficulty ?? 0, (v) => updateBehavior('fleeDifficulty', v), 'number'),
      // Checkbox für Hostile wäre hier auch gut, speichern wir aber meist im 'type' oder behavior
    ]),
    widgets.multiselectField
      ? widgets.multiselectField('Beute (Drops)', ctx.items || [], actor.drops || [], (vals) => onUpdateActor('drops', vals))
      : null,
  ].filter(Boolean));
  card.appendChild(statsSection);

  // --- SEKTION 5: Hooks (Events) ---
  if (widgets.eventArea) {
    card.appendChild(section('Event Hooks (Kampf/Interaktion)', [
      widgets.eventArea('On Attack (Wenn angegriffen)', actor.hooks?.on_attack || [], (val) => updateHook('on_attack', val)),
      widgets.eventArea('On Hit (Wenn getroffen)', actor.hooks?.on_hit || [], (val) => updateHook('on_hit', val)),
      widgets.eventArea('On Miss (Wenn verfehlt)', actor.hooks?.on_miss || [], (val) => updateHook('on_miss', val)),
      widgets.eventArea('On Defeat (Wenn besiegt)', actor.hooks?.on_defeat || [], (val) => updateHook('on_defeat', val)),
    ]));
  }

  // --- Footer Actions ---
  card.appendChild(actionRow([
    { label: 'Akteur löschen', className: 'danger', onClick: () => onDelete(actor.id) },
  ]));

  return card;
}

// --- Helpers ---

function header(actor) {
  const wrap = document.createElement('div');
  wrap.className = 'badge';
  const dot = document.createElement('span');
  dot.className = 'dot';
  wrap.append(dot, document.createTextNode(`${TYPE_LABELS[actor.type] || 'Actor'} ${actor.id}`));
  return wrap;
}

function sectionTitle(text) {
  const el = document.createElement('div');
  el.className = 'section-title';
  el.textContent = text;
  return el;
}

function fieldGrid(fields) {
  const grid = document.createElement('div');
  grid.className = 'form-grid';
  fields.forEach(f => f && grid.appendChild(f));
  return grid;
}

function section(title, nodes) {
  const wrap = document.createElement('div');
  wrap.className = 'card-section';
  wrap.appendChild(sectionTitle(title));
  nodes.filter(Boolean).forEach(node => wrap.appendChild(node));
  return wrap;
}

function actionRow(buttons) {
  const actions = document.createElement('div');
  actions.className = 'dialog-actions';
  buttons.forEach(btn => {
    const b = document.createElement('button');
    if (btn.className) b.className = btn.className;
    b.textContent = btn.label;
    b.onclick = btn.onClick;
    actions.appendChild(b);
  });
  return actions;
}

function inputField(label, value, onChange, type = 'text') {
  const f = document.createElement('div');
  f.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.value = value !== undefined && value !== null ? value : '';
  input.oninput = () => onChange(type === 'number' ? Number(input.value) : input.value);
  f.append(l, input);
  return f;
}

function textArea(label, value, onChange) {
  const f = document.createElement('div');
  f.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  const area = document.createElement('textarea');
  area.value = value || '';
  area.oninput = () => onChange(area.value);
  f.append(l, area);
  return f;
}

function selectField(label, value, options, onChange) {
  const f = document.createElement('div');
  f.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  const select = document.createElement('select');
  // Optional placeholder removed for cleaner UI if value exists
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === value) o.selected = true;
    select.appendChild(o);
  });
  select.onchange = () => onChange(select.value);
  f.append(l, select);
  return f;
}

function flagFields(label, flag, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'form-grid';
  const keyField = inputField(label + ' (Key)', flag?.key || '', (v) => onChange({ key: v, equals: flag?.equals ?? true }));
  
  // Kleiner Trick: Dropdown für Boolean Value
  const equalsField = selectField(label + ' Wert', flag?.equals === false ? 'false' : 'true', [
    { value: 'true', label: 'Wahr (True)' },
    { value: 'false', label: 'Falsch (False)' },
  ], (v) => onChange({ key: flag?.key || '', equals: v === 'true' }));
  
  wrap.append(keyField, equalsField);
  return wrap;
}

function normalizeFlag(flag) {
  if (!flag || !flag.key) return null;
  return { key: flag.key, equals: flag.equals !== false ? true : false };
}

function getDialogNodeOptions(dialogs, npcId) {
  const dialog = dialogs[npcId];
  if (!dialog || !dialog.nodes) return [{ value: 'start', label: 'start' }];
  return Object.keys(dialog.nodes).map(id => ({ value: id, label: id }));
}

function npcDialogStatus(actor, dialogs) {
  const warn = document.createElement('div');
  warn.className = 'field-status'; // CSS class needs to be generic
  warn.style.alignSelf = 'end';
  warn.style.padding = '8px';
  warn.style.fontSize = '0.9em';
  
  const dialog = dialogs[actor.id];
  const dialogMissing = !dialog;
  const startMissing = dialog && (!dialog.start || !dialog.nodes || !dialog.nodes[dialog.start]);
  
  if (dialogMissing) {
    warn.textContent = '⚠️ Kein Dialog verknüpft';
    warn.style.color = '#ffaa00';
  } else if (startMissing) {
    warn.textContent = '⚠️ Start-Node fehlt';
    warn.style.color = '#ff5555';
  } else {
    warn.textContent = '✅ Dialog aktiv';
    warn.style.color = '#55ff55';
  }
  return warn;
}

export { slugify };