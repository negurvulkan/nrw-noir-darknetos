const TYPE_LABELS = { npc: 'NPC', enemy: 'Gegner' };

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

export function createActorDraft(type = 'npc', name = 'Neuer NPC') {
  const id = slugify(name) || (type === 'enemy' ? 'enemy' : 'npc');
  const base = { id, type, name, description: '', room: '' };
  if (type === 'npc') {
    return {
      ...base,
      dialog_start: 'start',
      hidden_if_flag: null,
      only_if_flag: null,
    };
  }
  return {
    ...base,
    ascii: { file: '', fontSize: 4 },
    stats: { hp: 10, attack: 1, defense: 0 },
    behavior: { fleeDifficulty: 0 },
    drops: [],
    hooks: { on_attack: [], on_hit: [], on_miss: [], on_defeat: [] },
  };
}

export function renderActorSidebar({ container, actors = [], selection, onSelect, onAddNpc, onAddEnemy }) {
  container.appendChild(sectionTitle('Akteure'));
  const list = document.createElement('div');
  list.className = 'nav-list';
  actors.forEach(actor => {
    const row = document.createElement('div');
    const active = selection.view === 'actor' && selection.actorId === actor.id;
    row.className = 'nav-item' + (active ? ' active' : '');
    const label = document.createElement('span');
    label.textContent = actor.name || actor.id;
    const badge = document.createElement('span');
    badge.className = 'badge inline';
    badge.textContent = TYPE_LABELS[actor.type] || actor.type || 'Actor';
    row.append(label, badge);
    row.onclick = () => onSelect(actor.id, actor.type);
    list.appendChild(row);
  });
  const btnRow = document.createElement('div');
  btnRow.style.display = 'grid';
  btnRow.style.gridTemplateColumns = '1fr';
  btnRow.style.gap = '6px';
  const btnNewNpc = document.createElement('button');
  btnNewNpc.textContent = 'Neuer NPC';
  btnNewNpc.style.width = '100%';
  btnNewNpc.onclick = onAddNpc;
  const btnNewEnemy = document.createElement('button');
  btnNewEnemy.textContent = 'Neuer Gegner';
  btnNewEnemy.style.width = '100%';
  btnNewEnemy.onclick = onAddEnemy;
  btnRow.append(btnNewNpc, btnNewEnemy);
  btnRow.style.marginTop = '8px';
  container.append(list, btnRow);
}

export function renderActorEditor(actor, ctx) {
  const { rooms = [], dialogs = {}, asciiFiles = [], widgets = {}, onUpdateActor, onUpdateEnemyStat, onUpdateEnemyBehavior, onUpdateEnemyAscii, onUpdateEnemyHook, onDelete, onOpenDialog } = ctx;
  const card = document.createElement('div');
  card.className = 'card';
  card.appendChild(header(actor));

  card.appendChild(section('Stammdaten', [
    fieldGrid([
      inputField('ID', actor.id, (v) => onUpdateActor('id', slugify(v) || actor.id)),
      inputField('Name', actor.name, (v) => onUpdateActor('name', v)),
      selectField('Raum', actor.room, rooms.map(r => ({ value: r.id, label: r.title || r.id })), (v) => onUpdateActor('room', v)),
      actor.type === 'npc'
        ? selectField('Start-Dialognode', actor.dialog_start, getDialogNodeOptions(dialogs, actor.id), (v) => onUpdateActor('dialog_start', v))
        : null,
    ].filter(Boolean)),
    textArea('Beschreibung', actor.description || '', (v) => onUpdateActor('description', v)),
  ]));

  if (actor.type === 'npc') {
    const dialogSection = section('Dialog & Sichtbarkeit', [
      flagFields('Nur anzeigen wenn Flag', actor.only_if_flag, (flag) => onUpdateActor('only_if_flag', normalizeFlag(flag))),
      flagFields('Verstecken wenn Flag', actor.hidden_if_flag, (flag) => onUpdateActor('hidden_if_flag', normalizeFlag(flag))),
      npcDialogStatus(actor, dialogs),
    ]);

    dialogSection.appendChild(actionRow([
      { label: 'Dialog bearbeiten', className: 'primary', onClick: () => onOpenDialog(actor.id) },
      { label: 'NPC löschen', className: 'danger', onClick: () => onDelete(actor.id) },
    ]));

    card.appendChild(dialogSection);
  }

  if (actor.type === 'enemy') {
    const asciiField = inputField('ASCII-Datei', actor.ascii?.file || '', (v) => onUpdateEnemyAscii('file', v));
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
    const fontField = inputField('ASCII Font Size', actor.ascii?.fontSize ?? '', (v) => onUpdateEnemyAscii('fontSize', v), 'number');

    const statsSection = section('Aussehen & Stats', [
      fieldGrid([asciiField, fontField]),
      fieldGrid([
        inputField('HP', actor.stats?.hp ?? '', (v) => onUpdateEnemyStat('hp', v), 'number'),
        inputField('Angriff', actor.stats?.attack ?? '', (v) => onUpdateEnemyStat('attack', v), 'number'),
        inputField('Verteidigung', actor.stats?.defense ?? '', (v) => onUpdateEnemyStat('defense', v), 'number'),
      ]),
      fieldGrid([
        inputField('Flucht-Wahrscheinlichkeit', actor.behavior?.fleeDifficulty ?? '', (v) => onUpdateEnemyBehavior('fleeDifficulty', v), 'number')
      ]),
      widgets.multiselectField
        ? widgets.multiselectField('Beute (Items)', ctx.items || [], actor.drops || [], (vals) => onUpdateActor('drops', vals))
        : null,
    ].filter(Boolean));

    card.appendChild(statsSection);

    if (widgets.eventArea) {
      card.appendChild(section('Kampf-Hooks', [
        widgets.eventArea('On Attack', actor.hooks?.on_attack || [], (val) => onUpdateEnemyHook('on_attack', val)),
        widgets.eventArea('On Hit', actor.hooks?.on_hit || [], (val) => onUpdateEnemyHook('on_hit', val)),
        widgets.eventArea('On Miss', actor.hooks?.on_miss || [], (val) => onUpdateEnemyHook('on_miss', val)),
        widgets.eventArea('On Defeat', actor.hooks?.on_defeat || [], (val) => onUpdateEnemyHook('on_defeat', val)),
      ]));
    }

    card.appendChild(actionRow([
      { label: 'Gegner löschen', className: 'danger', onClick: () => onDelete(actor.id) },
    ]));
  }

  return card;
}

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
  input.value = value || '';
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
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— wählen —';
  select.appendChild(placeholder);
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
  const equalsField = selectField(label + ' Wert', flag?.equals === false ? 'false' : 'true', [
    { value: 'true', label: 'true' },
    { value: 'false', label: 'false' },
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
  warn.className = 'hint muted';
  const dialog = dialogs[actor.id];
  const dialogMissing = !dialog;
  const startMissing = dialog && (!dialog.start || !dialog.nodes || !dialog.nodes[dialog.start]);
  const problems = [];
  if (dialogMissing) problems.push('Kein Dialog vorhanden');
  if (startMissing) problems.push('Start-Node fehlt');
  warn.textContent = problems.length ? '⚠ ' + problems.join(' · ') : 'Dialog verknüpft';
  return warn;
}

export { slugify };
