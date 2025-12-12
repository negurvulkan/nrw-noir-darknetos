export function ensureDialogState(data) {
  if (!data.dialogs) data.dialogs = {};
  return data.dialogs;
}

export function ensureDialogForNpc(data, npcId) {
  ensureDialogState(data);
  if (!data.dialogs[npcId]) {
    data.dialogs[npcId] = createEmptyDialog(npcId);
  }
  const dlg = data.dialogs[npcId];
  dlg.nodes = dlg.nodes || {};
  dlg.meta = dlg.meta || {};
  dlg.meta.positions = dlg.meta.positions || {};
  if (!dlg.nodes[dlg.start]) {
    dlg.nodes[dlg.start || 'start'] = { text: '', choices: [] };
    dlg.start = dlg.start || 'start';
  }
  normalizeDialog(dlg);
  return dlg;
}

export function createEmptyDialog(npcId) {
  return {
    npc: npcId,
    start: 'start',
    nodes: {
      start: { text: '', choices: [] },
    },
  };
}

export function normalizeDialog(dialog) {
  dialog.nodes = dialog.nodes || {};
  Object.entries(dialog.nodes).forEach(([id, node]) => {
    if (!node.choices) node.choices = [];
    node.choices = node.choices.map(choice => normalizeChoice(choice));
  });
  return dialog;
}

export function nodeIds(dialog) {
  return Object.keys(dialog.nodes || {});
}

export function renameNode(dialog, oldId, newId) {
  if (!dialog.nodes[oldId] || dialog.nodes[newId]) return false;
  dialog.nodes[newId] = dialog.nodes[oldId];
  delete dialog.nodes[oldId];
  if (dialog.start === oldId) dialog.start = newId;
  Object.values(dialog.nodes).forEach(node => {
    node.choices.forEach(choice => {
      if (choice.next === oldId) choice.next = newId;
    });
  });
  return true;
}

export function removeNode(dialog, nodeId) {
  if (dialog.start === nodeId) return false;
  delete dialog.nodes[nodeId];
  Object.values(dialog.nodes).forEach(node => {
    node.choices.forEach(choice => {
      if (choice.next === nodeId) choice.next = '';
    });
  });
  return true;
}

export function validateDialog(dialog) {
  const warnings = [];
  if (!dialog.start || !dialog.nodes?.[dialog.start]) {
    warnings.push('Start-Node fehlt');
  }
  Object.entries(dialog.nodes || {}).forEach(([id, node]) => {
    node.choices?.forEach((choice, idx) => {
      if (!choice.next) warnings.push(`Choice #${idx + 1} in ${id} ohne Ziel`);
    });
  });
  return warnings;
}

export function dialogGraphInfo(dialog) {
  const ids = nodeIds(dialog);
  const reachable = new Set();
  const missingTargets = [];

  if (dialog.start && dialog.nodes?.[dialog.start]) {
    const queue = [dialog.start];
    while (queue.length) {
      const current = queue.shift();
      if (reachable.has(current)) continue;
      reachable.add(current);
      const node = dialog.nodes[current];
      (node?.choices || []).forEach((choice, idx) => {
        if (!choice.next || choice.next === 'end') return;
        if (!dialog.nodes[choice.next]) {
          missingTargets.push({ from: current, index: idx, target: choice.next });
          return;
        }
        if (!reachable.has(choice.next)) queue.push(choice.next);
      });
    }
  }

  const unreachable = ids.filter(id => !reachable.has(id));
  return { reachable, unreachable, missingTargets };
}

function normalizeChoice(choice) {
  const normalized = { ...choice };
  normalized.text = normalized.text || '';
  normalized.next = normalized.next || '';
  normalized.status = normalized.status || 'active';
  normalized.events = normalized.events || [];
  normalized.requires = normalizeGate(normalized.requires);
  normalized.hidden_if = normalizeGate(normalized.hidden_if);
  return normalized;
}

function normalizeGate(gate) {
  if (!gate) return { items: [], flag: null };
  return {
    items: Array.isArray(gate.items) ? gate.items : [],
    flag: gate.flag && gate.flag.key ? { key: gate.flag.key, equals: gate.flag.equals !== false } : null,
  };
}
