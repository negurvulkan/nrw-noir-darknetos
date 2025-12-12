import { ensureDialogForNpc, nodeIds, renameNode, removeNode, validateDialog } from './dialogs.js';

export function renderDialogEditor({ container, adventure, npcId, selection, setSelection, setDirty, createEventEditor, asciiFiles, items, showHeader = true }) {
  const dialog = ensureDialogForNpc(adventure, npcId);
  const currentNodeId = selection.dialogNodeId || dialog.start;
  const node = dialog.nodes[currentNodeId];

  container.innerHTML = '';
  if (showHeader) {
    const header = document.createElement('div');
    header.className = 'view-header';
    header.innerHTML = `<div class="badge"><span class="dot"></span> Dialog für ${npcId}</div>`;
    container.appendChild(header);
  }

  const warns = validateDialog(dialog);
  if (warns.length) {
    const warnBox = document.createElement('div');
    warnBox.className = 'card warning';
    warnBox.innerHTML = `<strong>Warnungen:</strong><br>${warns.map(w => `• ${w}`).join('<br>')}`;
    container.appendChild(warnBox);
  }

  const layout = document.createElement('div');
  layout.className = 'dialog-layout';

  layout.appendChild(renderNodeList(dialog, currentNodeId, (id) => {
    setSelection({ view: 'dialog', dialogId: npcId, dialogNodeId: id });
  }, (newId) => {
    setDirty(true);
    setSelection({ view: 'dialog', dialogId: npcId, dialogNodeId: newId });
  }, setDirty));

  if (node) {
    layout.appendChild(renderNodeDetail(dialog, currentNodeId, node, {
      dialog,
      setDirty,
      createEventEditor,
      asciiFiles,
      items,
      onUpdateNodeId: (newId) => {
        if (renameNode(dialog, currentNodeId, newId)) {
          setDirty(true);
          setSelection({ view: 'dialog', dialogId: npcId, dialogNodeId: newId });
        }
      },
      onSetStart: () => { dialog.start = currentNodeId; setDirty(true); setSelection({ view: 'dialog', dialogId: npcId, dialogNodeId: currentNodeId }); },
      onDelete: () => {
        if (removeNode(dialog, currentNodeId)) {
          setDirty(true);
          setSelection({ view: 'dialog', dialogId: npcId, dialogNodeId: dialog.start });
        }
      },
    }));
  }

  container.appendChild(layout);
}

function renderNodeList(dialog, currentNodeId, onSelect, onRenamed, setDirty) {
  const panel = document.createElement('div');
  panel.className = 'dialog-nodes';
  const title = document.createElement('div');
  title.className = 'panel-header';
  title.textContent = 'Dialog-Nodes';
  panel.appendChild(title);

  const list = document.createElement('div');
  list.className = 'dialog-node-list';
  nodeIds(dialog).forEach(id => {
    const row = document.createElement('div');
    row.className = 'dialog-node-row' + (id === currentNodeId ? ' active' : '');
    const label = document.createElement('div');
    label.className = 'dialog-node-label';
    label.textContent = id;
    if (dialog.start === id) {
      const star = document.createElement('span');
      star.textContent = '⭐';
      star.title = 'Start-Node';
      label.appendChild(star);
    }
    row.appendChild(label);
    row.onclick = () => onSelect(id);
    list.appendChild(row);
  });

  const actions = document.createElement('div');
  actions.className = 'dialog-node-actions';
  const add = document.createElement('button');
  add.textContent = 'Node hinzufügen';
  add.onclick = () => {
    const id = prompt('Neue Node-ID:');
    if (!id || dialog.nodes[id]) return;
    dialog.nodes[id] = { text: '', choices: [] };
    setDirty(true);
    onRenamed(id);
  };
  actions.appendChild(add);
  panel.append(list, actions);
  return panel;
}

function renderNodeDetail(dialog, nodeId, node, ctx) {
  const card = document.createElement('div');
  card.className = 'card dialog-node-detail';

  const title = document.createElement('div');
  title.className = 'dialog-node-title';
  title.innerHTML = `<strong>Node:</strong> ${nodeId}`;
  card.appendChild(title);

  const toolbar = document.createElement('div');
  toolbar.className = 'dialog-node-toolbar';
  const renameBtn = document.createElement('button');
  renameBtn.textContent = 'Umbenennen';
  renameBtn.onclick = () => {
    const newId = prompt('Neue Node-ID:', nodeId);
    if (newId && newId !== nodeId) {
      ctx.onUpdateNodeId(newId);
    }
  };
  const setStart = document.createElement('button');
  setStart.textContent = 'Als Start markieren';
  setStart.onclick = ctx.onSetStart;
  const delBtn = document.createElement('button');
  delBtn.className = 'danger';
  delBtn.textContent = 'Node löschen';
  delBtn.onclick = () => {
    if (confirm('Node wirklich löschen?') && ctx.onDelete) ctx.onDelete();
  };
  toolbar.append(renameBtn, setStart, delBtn);
  card.appendChild(toolbar);

  card.appendChild(textAreaField('Dialogtext', node.text || '', (v) => { node.text = v; ctx.setDirty(true); }));

  card.appendChild(asciiBlock(node, ctx));

  card.appendChild(choiceList(dialog, node, ctx));

  return card;
}

function textAreaField(label, value, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  const area = document.createElement('textarea');
  area.value = value || '';
  area.oninput = () => onChange(area.value);
  wrap.append(l, area);
  return wrap;
}

function asciiBlock(node, ctx) {
  const wrap = document.createElement('div');
  wrap.className = 'form-grid';
  wrap.append(
    selectField('ASCII Datei', node.ascii_file || '', ctx.asciiFiles.map(f => ({ value: f, label: f })), (v) => { node.ascii_file = v; ctx.setDirty(true); }),
    inputField('Schriftgröße', node.ascii_size || '', (v) => { node.ascii_size = v; ctx.setDirty(true); }),
    checkboxField('Als Wasserzeichen', node.ascii_watermark === true, (v) => { node.ascii_watermark = v; ctx.setDirty(true); }),
  );
  return wrap;
}

function choiceList(dialog, node, ctx, host) {
  const wrap = host || document.createElement('div');
  wrap.className = 'dialog-choices';
  wrap.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'panel-header';
  title.textContent = 'Antwortoptionen';
  wrap.appendChild(title);

  node.choices.forEach((choice, idx) => {
    const card = document.createElement('div');
    card.className = 'choice-card';
    card.appendChild(inputField('Antwort-Text', choice.text, (v) => { choice.text = v; ctx.setDirty(true); }));
    card.appendChild(selectField('Ziel', choice.next || '', nodeIds(dialog).concat('end').map(id => ({ value: id, label: id })), (v) => { choice.next = v; ctx.setDirty(true); }));
    card.appendChild(selectField('Status', choice.status || 'active', [
      { value: 'active', label: 'aktiv' },
      { value: 'locked', label: 'gesperrt' },
      { value: 'hidden', label: 'versteckt' },
    ], (v) => { choice.status = v; ctx.setDirty(true); }));

    card.appendChild(requirementsBlock('Bedingungen', choice.requires, ctx));
    card.appendChild(requirementsBlock('Verstecken wenn', choice.hidden_if, ctx));

    const eventWrap = document.createElement('div');
    eventWrap.className = 'choice-events';
    const btn = document.createElement('button');
    btn.textContent = '🧩 Events bearbeiten';
    btn.onclick = () => {
      eventWrap.innerHTML = '';
      const editor = ctx.createEventEditor(choice.events || [], (val) => { choice.events = val; ctx.setDirty(true); });
      eventWrap.appendChild(editor);
    };
    card.appendChild(btn);
    card.appendChild(eventWrap);

    const order = document.createElement('div');
    order.className = 'choice-order';
    const up = document.createElement('button');
    up.textContent = '↑';
    up.onclick = () => { moveChoice(node, idx, -1); choiceList(dialog, node, ctx, wrap); ctx.setDirty(true); };
    const down = document.createElement('button');
    down.textContent = '↓';
    down.onclick = () => { moveChoice(node, idx, 1); choiceList(dialog, node, ctx, wrap); ctx.setDirty(true); };
    const del = document.createElement('button');
    del.className = 'danger';
    del.textContent = 'Löschen';
    del.onclick = () => { node.choices.splice(idx, 1); ctx.setDirty(true); choiceList(dialog, node, ctx, wrap); };
    order.append(up, down, del);
    card.appendChild(order);

    wrap.appendChild(card);
  });

  const add = document.createElement('button');
  add.textContent = 'Choice hinzufügen';
  add.onclick = () => {
    node.choices.push({ text: '', next: '', status: 'active', requires: { items: [], flag: null }, hidden_if: { items: [], flag: null }, events: [] });
    ctx.setDirty(true);
    choiceList(dialog, node, ctx, wrap);
  };
  wrap.appendChild(add);
  return wrap;
}

function moveChoice(node, idx, delta) {
  const target = idx + delta;
  if (target < 0 || target >= node.choices.length) return;
  const [choice] = node.choices.splice(idx, 1);
  node.choices.splice(target, 0, choice);
}

function requirementsBlock(label, data, ctx) {
  const gate = data || { items: [], flag: null };
  const target = data || gate;
  const card = document.createElement('div');
  card.className = 'card gate-card';
  const title = document.createElement('div');
  title.className = 'gate-title';
  title.textContent = label;
  card.appendChild(title);

  const itemsField = selectField('Inventory Items', gate.items || [], (ctx.items || []).map(i => ({ value: i.id, label: i.name || i.id })), (vals) => {
    gate.items = Array.from(vals);
    target.items = gate.items;
    ctx.setDirty(true);
  }, true);
  card.appendChild(itemsField);

  const flagWrap = document.createElement('div');
  flagWrap.className = 'form-grid';
  flagWrap.append(
    inputField('Flag Key', gate.flag?.key || '', (v) => { gate.flag = v ? { key: v, equals: gate.flag?.equals !== false } : null; target.flag = gate.flag; ctx.setDirty(true); }),
    selectField('Flag Wert', gate.flag?.equals === false ? 'false' : 'true', [ { value: 'true', label: 'true' }, { value: 'false', label: 'false' } ], (v) => { if (gate.flag) gate.flag.equals = v === 'true'; target.flag = gate.flag; ctx.setDirty(true); })
  );
  card.appendChild(flagWrap);

  return card;
}

function selectField(label, value, options, onChange, multiple = false) {
  const f = document.createElement('div');
  f.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  const select = document.createElement('select');
  select.multiple = multiple;
  if (!multiple) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— wählen —';
    select.appendChild(placeholder);
  }
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (multiple && Array.isArray(value) ? value.includes(opt.value) : opt.value === value) o.selected = true;
    select.appendChild(o);
  });
  select.onchange = () => {
    if (multiple) {
      const vals = Array.from(select.selectedOptions).map(o => o.value);
      onChange(vals);
    } else {
      onChange(select.value);
    }
  };
  f.append(l, select);
  return f;
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

function checkboxField(label, value, onChange) {
  const f = document.createElement('div');
  f.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  const wrap = document.createElement('label');
  wrap.className = 'checkbox-inline';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!value;
  input.onchange = () => onChange(input.checked);
  wrap.append(input, document.createTextNode('aktiv'));
  f.append(l, wrap);
  return f;
}
