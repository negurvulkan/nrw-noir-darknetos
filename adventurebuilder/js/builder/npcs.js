const slugify = (str = '') => str
  .toString()
  .toLowerCase()
  .trim()
  .replace(/\s+/g, '-')
  .replace(/[^a-z0-9_-]/g, '')
  .replace(/-+/g, '-');

export function ensureNpcCollection(data) {
  if (!data.actors) data.actors = [];
  return data.actors.filter(actor => actor.type === 'npc');
}

export function createNpcDraft(name = 'Neuer NPC') {
  const id = slugify(name) || 'npc';
  return {
    id,
    type: 'npc',
    name,
    description: '',
    room: '',
    dialog_start: 'start',
    hidden_if_flag: null,
    only_if_flag: null,
  };
}

export function renderNpcSidebar({ container, actors = [], selection, onSelect, onAdd }) {
  container.appendChild(sectionTitle('NPCs'));
  const list = document.createElement('div');
  list.className = 'nav-list';
  actors.forEach(npc => {
    const row = document.createElement('div');
    row.className = 'nav-item' + (selection.npcId === npc.id && selection.view === 'npc' ? ' active' : '');
    row.textContent = npc.name || npc.id;
    row.onclick = () => onSelect(npc.id);
    list.appendChild(row);
  });
  const btnNew = document.createElement('button');
  btnNew.textContent = 'Neuer NPC';
  btnNew.style.marginTop = '8px';
  btnNew.onclick = onAdd;
  container.append(list, btnNew);
}

function sectionTitle(text) {
  const el = document.createElement('div');
  el.className = 'section-title';
  el.textContent = text;
  return el;
}

export function renderNpcEditor(npc, ctx) {
  const { rooms, dialogs, setDirty, onDelete, onOpenDialog } = ctx;
  const card = document.createElement('div');
  card.className = 'card';
  card.appendChild(header(npc.id));
  card.appendChild(fieldGrid([
    inputField('ID', npc.id, (v) => { npc.id = slugify(v); setDirty(true); }),
    inputField('Name', npc.name, (v) => {
      const prevId = npc.id;
      npc.name = v;
      if (!npc.id || npc.id === slugify(prevId)) {
        npc.id = slugify(v) || prevId;
      }
      setDirty(true);
    }),
    selectField('Raum', npc.room, rooms.map(r => ({ value: r.id, label: r.title || r.id })), (v) => { npc.room = v; setDirty(true); }),
    selectField('Start-Dialognode', npc.dialog_start, getDialogNodeOptions(dialogs, npc.id), (v) => { npc.dialog_start = v; setDirty(true); }),
  ]));

  card.appendChild(textArea('Beschreibung', npc.description || '', (v) => { npc.description = v; setDirty(true); }));
  card.appendChild(flagFields('Nur anzeigen wenn Flag', npc.only_if_flag, (flag) => { npc.only_if_flag = normalizeFlag(flag); setDirty(true); }));
  card.appendChild(flagFields('Verstecken wenn Flag', npc.hidden_if_flag, (flag) => { npc.hidden_if_flag = normalizeFlag(flag); setDirty(true); }));

  const warn = document.createElement('div');
  warn.className = 'hint muted';
  const dialog = dialogs[npc.id];
  const dialogMissing = !dialog;
  const startMissing = dialog && (!dialog.start || !dialog.nodes || !dialog.nodes[dialog.start]);
  const problems = [];
  if (dialogMissing) problems.push('Kein Dialog vorhanden');
  if (startMissing) problems.push('Start-Node fehlt');
  warn.textContent = problems.length ? '⚠ ' + problems.join(' · ') : 'Dialog verknüpft';
  card.appendChild(warn);

  const actions = document.createElement('div');
  actions.className = 'dialog-actions';
  const editDialog = document.createElement('button');
  editDialog.className = 'primary';
  editDialog.textContent = 'Dialog bearbeiten';
  editDialog.onclick = () => onOpenDialog(npc.id);
  const del = document.createElement('button');
  del.className = 'danger';
  del.textContent = 'NPC löschen';
  del.onclick = () => onDelete(npc.id);
  actions.append(editDialog, del);
  card.appendChild(actions);
  return card;
}

function header(id) {
  const wrap = document.createElement('div');
  wrap.className = 'badge';
  const dot = document.createElement('span');
  dot.className = 'dot';
  wrap.append(dot, document.createTextNode('NPC ' + id));
  return wrap;
}

function fieldGrid(fields) {
  const grid = document.createElement('div');
  grid.className = 'form-grid';
  fields.forEach(f => grid.appendChild(f));
  return grid;
}

function inputField(label, value, onChange) {
  const f = document.createElement('div');
  f.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  const input = document.createElement('input');
  input.value = value || '';
  input.oninput = () => onChange(input.value);
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
