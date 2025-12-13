const Blockly = window.Blockly;

const palette = {
  primary: '#b388ff',
  secondary: '#7b4aa8',
  tertiary: '#ff86ff',
  workspace: '#0c0714',
  flyout: '#140d1f',
};

const noirTheme = Blockly.Theme.defineTheme('nrw_noir', {
  base: Blockly.Themes.Dark,
  blockStyles: {
    event_blocks: {
      colourPrimary: palette.primary,
      colourSecondary: palette.secondary,
      colourTertiary: palette.tertiary,
    },
  },
  categoryStyles: {
    events_category: {
      colour: palette.primary,
    },
  },
  componentStyles: {
    workspaceBackgroundColour: palette.workspace,
    toolboxBackgroundColour: palette.workspace,
    toolboxForegroundColour: '#c563ff',
    flyoutBackgroundColour: palette.flyout,
    flyoutForegroundColour: '#c563ff',
    insertionMarkerColour: palette.tertiary,
    insertionMarkerOpacity: 0.3,
  },
  fontStyle: {
    family: 'Fira Code, JetBrains Mono, monospace',
    weight: '400',
    size: 12,
  },
});

// Blockly 10+ logs deprecation warnings for legacy variable helpers even if
// the workspace has no variable blocks. Patch the deprecated method to call the
// modern API without emitting a warning so the console stays clean.
if (Blockly?.Workspace?.prototype?.getAllVariables && Blockly?.Variables?.allUsedVarModels) {
  Blockly.Workspace.prototype.getAllVariables = function patchedGetAllVariables(opt_type) {
    return Blockly.Variables.allUsedVarModels(this, opt_type);
  };
}

function registerBlocks() {
  if (!Blockly || Blockly.Blocks.event_message) return;

  Blockly.Blocks.event_message = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput().appendField('Nachricht').appendField(new Blockly.FieldTextInput(''), 'TEXT');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Zeigt eine Nachricht an.');
    },
  };

  Blockly.Blocks.event_ascii = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput().appendField('ASCII Datei').appendField(new Blockly.FieldTextInput(''), 'FILE');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_flag_set = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput()
        .appendField('Flag setzen')
        .appendField(new Blockly.FieldTextInput('flag_key'), 'KEY')
        .appendField('=')
        .appendField(new Blockly.FieldDropdown([
          ['true', 'TRUE'],
          ['false', 'FALSE'],
        ]), 'VALUE');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_add_item = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput()
        .appendField('Item hinzufügen')
        .appendField(new Blockly.FieldTextInput('item_id'), 'ID')
        .appendField('Menge')
        .appendField(new Blockly.FieldNumber(1, 1), 'QTY');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_remove_item = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput()
        .appendField('Item entfernen')
        .appendField(new Blockly.FieldTextInput('item_id'), 'ID')
        .appendField('Menge')
        .appendField(new Blockly.FieldNumber(1, 1), 'QTY');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_unlock_exit = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput()
        .appendField('Ausgang entsperren')
        .appendField('Raum')
        .appendField(new Blockly.FieldTextInput('room_id'), 'ROOM')
        .appendField('Richtung')
        .appendField(new Blockly.FieldTextInput('richtung'), 'DIR');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_lock_exit = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput()
        .appendField('Ausgang sperren')
        .appendField('Raum')
        .appendField(new Blockly.FieldTextInput('room_id'), 'ROOM')
        .appendField('Richtung')
        .appendField(new Blockly.FieldTextInput('richtung'), 'DIR');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_transition = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput().appendField('Wechsel zu Raum').appendField(new Blockly.FieldTextInput('room_id'), 'ROOM');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_trigger_fight = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput().appendField('Kampf triggern').appendField(new Blockly.FieldTextInput('enemy_id'), 'ENEMY');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_flag_if = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput()
        .appendField('Wenn Flag')
        .appendField(new Blockly.FieldTextInput('flag_key'), 'KEY')
        .appendField('==')
        .appendField(new Blockly.FieldDropdown([
          ['true', 'TRUE'],
          ['false', 'FALSE'],
        ]), 'EQUALS');
      this.appendStatementInput('THEN').setCheck(null).appendField('Dann');
      this.appendStatementInput('ELSE').setCheck(null).appendField('Sonst');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };
}

function workspaceToEvents(workspace) {
  const events = [];
  const topBlocks = workspace.getTopBlocks(true);
  topBlocks.forEach(top => {
    let current = top;
    while (current) {
      const eventObj = blockToEvent(current);
      if (eventObj) events.push(eventObj);
      const next = current.nextConnection && current.nextConnection.targetBlock();
      current = next;
    }
  });
  return events;
}

function blockToEvent(block) {
  switch (block.type) {
    case 'event_message':
      return { type: 'message', text: block.getFieldValue('TEXT') || '' };
    case 'event_ascii':
      return { type: 'ascii', file: block.getFieldValue('FILE') || '' };
    case 'event_flag_set':
      return { type: 'flag_set', key: block.getFieldValue('KEY') || '', value: block.getFieldValue('VALUE') === 'TRUE' };
    case 'event_add_item':
      return {
        type: 'add_item',
        id: block.getFieldValue('ID') || '',
        qty: Number(block.getFieldValue('QTY')) || 1,
      };
    case 'event_remove_item':
      return {
        type: 'remove_item',
        id: block.getFieldValue('ID') || '',
        qty: Number(block.getFieldValue('QTY')) || 1,
      };
    case 'event_unlock_exit':
      return { type: 'unlock_exit', room: block.getFieldValue('ROOM') || '', direction: block.getFieldValue('DIR') || '' };
    case 'event_lock_exit':
      return { type: 'lock_exit', room: block.getFieldValue('ROOM') || '', direction: block.getFieldValue('DIR') || '' };
    case 'event_transition':
      return { type: 'transition', to: block.getFieldValue('ROOM') || '' };
    case 'event_trigger_fight':
      return { type: 'trigger_fight', enemy: block.getFieldValue('ENEMY') || '' };
    case 'event_flag_if':
      return {
        type: 'flag_if',
        key: block.getFieldValue('KEY') || '',
        equals: block.getFieldValue('EQUALS') === 'TRUE',
        then: connectionToEvents(block.getInput('THEN').connection),
        else: connectionToEvents(block.getInput('ELSE').connection),
      };
    default:
      return null;
  }
}

function connectionToEvents(connection) {
  if (!connection) return [];
  const first = connection.targetBlock();
  if (!first) return [];
  const events = [];
  let current = first;
  while (current) {
    const ev = blockToEvent(current);
    if (ev) events.push(ev);
    current = current.nextConnection && current.nextConnection.targetBlock();
  }
  return events;
}

function buildBlockForEvent(event, workspace) {
  let block;
  switch (event.type) {
    case 'message':
      block = workspace.newBlock('event_message');
      block.setFieldValue(event.text || '', 'TEXT');
      break;
    case 'ascii':
      block = workspace.newBlock('event_ascii');
      block.setFieldValue(event.file || '', 'FILE');
      break;
    case 'flag_set':
      block = workspace.newBlock('event_flag_set');
      block.setFieldValue(event.key || '', 'KEY');
      block.setFieldValue(event.value === false ? 'FALSE' : 'TRUE', 'VALUE');
      break;
    case 'add_item':
      block = workspace.newBlock('event_add_item');
      block.setFieldValue(event.id || '', 'ID');
      block.setFieldValue(String(event.qty || 1), 'QTY');
      break;
    case 'remove_item':
      block = workspace.newBlock('event_remove_item');
      block.setFieldValue(event.id || '', 'ID');
      block.setFieldValue(String(event.qty || 1), 'QTY');
      break;
    case 'unlock_exit':
      block = workspace.newBlock('event_unlock_exit');
      block.setFieldValue(event.room || '', 'ROOM');
      block.setFieldValue(event.direction || '', 'DIR');
      break;
    case 'lock_exit':
      block = workspace.newBlock('event_lock_exit');
      block.setFieldValue(event.room || '', 'ROOM');
      block.setFieldValue(event.direction || '', 'DIR');
      break;
    case 'transition':
      block = workspace.newBlock('event_transition');
      block.setFieldValue(event.to || '', 'ROOM');
      break;
    case 'trigger_fight':
      block = workspace.newBlock('event_trigger_fight');
      block.setFieldValue(event.enemy || '', 'ENEMY');
      break;
    case 'flag_if': {
      block = workspace.newBlock('event_flag_if');
      block.setFieldValue(event.key || '', 'KEY');
      block.setFieldValue(event.equals === false ? 'FALSE' : 'TRUE', 'EQUALS');
      const thenChain = buildChain(event.then || [], workspace);
      if (thenChain.start) block.getInput('THEN').connection.connect(thenChain.start.previousConnection);
      const elseChain = buildChain(event.else || [], workspace);
      if (elseChain.start) block.getInput('ELSE').connection.connect(elseChain.start.previousConnection);
      break;
    }
    default:
      return null;
  }
  block.initSvg();
  block.render();
  return block;
}

function buildChain(events, workspace) {
  let start = null;
  let prev = null;
  events.forEach(ev => {
    const block = buildBlockForEvent(ev, workspace);
    if (!block) return;
    block.moveBy(20, (prev ? prev.getRelativeToSurfaceXY().y + 70 : 20));
    if (!start) start = block;
    if (prev) prev.nextConnection.connect(block.previousConnection);
    prev = block;
  });
  return { start, end: prev };
}

function normalizeEventsInput(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Event JSON konnte nicht geparst werden:', e);
      return [];
    }
  }
  return [];
}

export function initEventBlockEditor(domElement, initialJsonArray = []) {
  registerBlocks();
  const workspace = Blockly.inject(domElement, {
    toolbox: {
      kind: 'flyoutToolbox',
      contents: [
        { kind: 'block', type: 'event_message' },
        { kind: 'block', type: 'event_ascii' },
        { kind: 'block', type: 'event_flag_set' },
        { kind: 'block', type: 'event_add_item' },
        { kind: 'block', type: 'event_remove_item' },
        { kind: 'block', type: 'event_unlock_exit' },
        { kind: 'block', type: 'event_lock_exit' },
        { kind: 'block', type: 'event_transition' },
        { kind: 'block', type: 'event_trigger_fight' },
        { kind: 'block', type: 'event_flag_if' },
      ],
    },
    scrollbars: true,
    theme: noirTheme,
  });

  function setJson(jsonArray) {
    Blockly.Events.disable();
    try {
      workspace.clear();
      const normalized = normalizeEventsInput(jsonArray);
      const chain = buildChain(normalized, workspace);
      if (chain.start) chain.start.moveBy(10, 10);
      if (Blockly?.svgResize) Blockly.svgResize(workspace);
    } finally {
      Blockly.Events.enable();
    }
  }

  setJson(initialJsonArray);

  return {
    workspace,
    getJson: () => workspaceToEvents(workspace),
    setJson,
  };
}
