const Blockly = window.Blockly;

let blockOptions = {
  rooms: [],
  items: [],
  actors: [], // Neu: Unified list
};

function setBlockOptions(options = {}) {
  blockOptions = {
    rooms: options.rooms || [],
    items: options.items || [],
    actors: options.actors || [],
  };
}

// Helper: Filter actors by type for cleaner dropdowns, fallback to all actors if mixed
function actorDropdown(typeFilter = null, fallbackLabel = 'actor_id') {
  const list = blockOptions.actors || [];
  const filtered = typeFilter 
    ? list.filter(a => a.type === typeFilter).map(a => a.id)
    : list.map(a => a.id);
  
  return dropdownOptions(filtered, fallbackLabel);
}

function dropdownOptions(list = [], fallbackValue) {
  if (Array.isArray(list) && list.length) {
    return list.map((val) => [val, val]);
  }
  return [[fallbackValue, fallbackValue]];
}

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

if (Blockly?.Workspace?.prototype?.getAllVariables && Blockly?.Variables?.allUsedVarModels) {
  Blockly.Workspace.prototype.getAllVariables = function patchedGetAllVariables(opt_type) {
    return Blockly.Variables.allUsedVarModels(this, opt_type);
  };
}

function registerBlocks(options = {}) {
  setBlockOptions(options);
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
        .appendField(new Blockly.FieldDropdown(() => dropdownOptions(blockOptions.items, 'item_id')), 'ID')
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
        .appendField(new Blockly.FieldDropdown(() => dropdownOptions(blockOptions.items, 'item_id')), 'ID')
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
        .appendField(new Blockly.FieldDropdown(() => dropdownOptions(blockOptions.rooms, 'room_id')), 'ROOM')
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
        .appendField(new Blockly.FieldDropdown(() => dropdownOptions(blockOptions.rooms, 'room_id')), 'ROOM')
        .appendField('Richtung')
        .appendField(new Blockly.FieldTextInput('richtung'), 'DIR');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_transition = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput()
        .appendField('Wechsel zu Raum')
        .appendField(new Blockly.FieldDropdown(() => dropdownOptions(blockOptions.rooms, 'room_id')), 'ROOM');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_trigger_fight = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput()
        .appendField('Kampf triggern')
        // Erlaubt alle Actors, aber idealerweise Gegner
        .appendField(new Blockly.FieldDropdown(() => actorDropdown('enemy', 'enemy_id')), 'ENEMY');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_counter_add = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput()
        .appendField('Counter +')
        .appendField(new Blockly.FieldTextInput('counter_key'), 'KEY')
        .appendField('Menge')
        .appendField(new Blockly.FieldNumber(1, 1), 'AMOUNT');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_counter_set = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput()
        .appendField('Counter setzen')
        .appendField(new Blockly.FieldTextInput('counter_key'), 'KEY')
        .appendField('=')
        .appendField(new Blockly.FieldNumber(0), 'VALUE');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_counter_if = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput()
        .appendField('Wenn Counter')
        .appendField(new Blockly.FieldTextInput('counter_key'), 'KEY')
        .appendField(new Blockly.FieldDropdown([
          ['==', '=='],
          ['!=', '!='],
          ['<', '<'],
          ['<=', '<='],
          ['>', '>'],
          ['>=', '>='],
        ]), 'OP')
        .appendField(new Blockly.FieldNumber(0), 'VALUE');
      this.appendStatementInput('THEN').setCheck(null).appendField('Dann');
      this.appendStatementInput('ELSE').setCheck(null).appendField('Sonst');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_spawn_item = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput()
        .appendField('Spawn Item in')
        .appendField(new Blockly.FieldDropdown(() => dropdownOptions(blockOptions.rooms, 'room_id')), 'ROOM')
        .appendField(new Blockly.FieldDropdown(() => dropdownOptions(blockOptions.items, 'item_id')), 'ID')
        .appendField('Menge')
        .appendField(new Blockly.FieldNumber(1, 1), 'QTY');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  // Unified Actor Blocks:
  // Wir behalten die Namen "Gegner" und "NPC" für die UX bei,
  // mappen sie intern aber auf die Actors-Liste.

  Blockly.Blocks.event_spawn_enemy = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput()
        .appendField('Spawn Gegner in')
        .appendField(new Blockly.FieldDropdown(() => dropdownOptions(blockOptions.rooms, 'room_id')), 'ROOM')
        .appendField(new Blockly.FieldDropdown(() => actorDropdown('enemy', 'enemy_id')), 'ID')
        .appendField('Anzahl')
        .appendField(new Blockly.FieldNumber(1, 1), 'QTY');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_spawn_npc = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput()
        .appendField('Spawn/Move NPC')
        .appendField(new Blockly.FieldDropdown(() => actorDropdown('npc', 'npc_id')), 'ID')
        .appendField('nach Raum')
        .appendField(new Blockly.FieldDropdown(() => dropdownOptions(blockOptions.rooms, 'room_id')), 'ROOM');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_npc_move = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput()
        .appendField('Actor bewegen')
        .appendField(new Blockly.FieldDropdown(() => actorDropdown(null, 'actor_id')), 'ID')
        .appendField('nach')
        .appendField(new Blockly.FieldDropdown(() => dropdownOptions(blockOptions.rooms, 'room_id')), 'ROOM');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    },
  };

  Blockly.Blocks.event_npc_move_if_present = {
    init() {
      this.setStyle('event_blocks');
      this.appendDummyInput()
        .appendField('Actor bewegen, wenn in')
        .appendField(new Blockly.FieldDropdown(() => dropdownOptions(blockOptions.rooms, 'room_id')), 'FROM')
        .appendField(new Blockly.FieldDropdown(() => actorDropdown(null, 'actor_id')), 'ID')
        .appendField('nach')
        .appendField(new Blockly.FieldDropdown(() => dropdownOptions(blockOptions.rooms, 'room_id')), 'TO');
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
      return { type: 'trigger_fight', actor: block.getFieldValue('ENEMY') || '' }; // changed key to actor
    case 'event_flag_if':
      return {
        type: 'flag_if',
        key: block.getFieldValue('KEY') || '',
        equals: block.getFieldValue('EQUALS') === 'TRUE',
        then: connectionToEvents(block.getInput('THEN').connection),
        else: connectionToEvents(block.getInput('ELSE').connection),
      };
    case 'event_counter_add':
      return { type: 'counter_add', key: block.getFieldValue('KEY') || '', amount: Number(block.getFieldValue('AMOUNT')) || 1 };
    case 'event_counter_set':
      return { type: 'counter_set', key: block.getFieldValue('KEY') || '', value: Number(block.getFieldValue('VALUE')) || 0 };
    case 'event_counter_if':
      return {
        type: 'counter_if',
        key: block.getFieldValue('KEY') || '',
        op: block.getFieldValue('OP') || '==',
        value: Number(block.getFieldValue('VALUE')) || 0,
        then: connectionToEvents(block.getInput('THEN').connection),
        else: connectionToEvents(block.getInput('ELSE').connection),
      };
    case 'event_spawn_item':
      return {
        type: 'spawn_item',
        room: block.getFieldValue('ROOM') || '',
        id: block.getFieldValue('ID') || '',
        qty: Number(block.getFieldValue('QTY')) || 1,
      };
    case 'event_spawn_enemy':
      // Map legacy spawn_enemy to spawn_actor
      return {
        type: 'spawn_actor',
        room: block.getFieldValue('ROOM') || '',
        id: block.getFieldValue('ID') || '',
        qty: Number(block.getFieldValue('QTY')) || 1,
      };
    case 'event_spawn_npc':
      // Map legacy spawn_npc to spawn_actor
      return { type: 'spawn_actor', id: block.getFieldValue('ID') || '', room: block.getFieldValue('ROOM') || '' };
    case 'event_npc_move':
      return { type: 'actor_move', id: block.getFieldValue('ID') || '', to: block.getFieldValue('ROOM') || '' };
    case 'event_npc_move_if_present':
      return {
        type: 'actor_move_if_present',
        id: block.getFieldValue('ID') || '',
        from: block.getFieldValue('FROM') || '',
        to: block.getFieldValue('TO') || ''
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
      // Supporte beide Keys (alt 'enemy', neu 'actor')
      block.setFieldValue(event.actor || event.enemy || '', 'ENEMY');
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
    case 'counter_add':
      block = workspace.newBlock('event_counter_add');
      block.setFieldValue(event.key || '', 'KEY');
      block.setFieldValue(String(event.amount || 1), 'AMOUNT');
      break;
    case 'counter_set':
      block = workspace.newBlock('event_counter_set');
      block.setFieldValue(event.key || '', 'KEY');
      block.setFieldValue(String(event.value || 0), 'VALUE');
      break;
    case 'counter_if': {
      block = workspace.newBlock('event_counter_if');
      block.setFieldValue(event.key || '', 'KEY');
      block.setFieldValue(event.op || '==', 'OP');
      block.setFieldValue(String(event.value || 0), 'VALUE');
      const thenChain = buildChain(event.then || [], workspace);
      if (thenChain.start) block.getInput('THEN').connection.connect(thenChain.start.previousConnection);
      const elseChain = buildChain(event.else || [], workspace);
      if (elseChain.start) block.getInput('ELSE').connection.connect(elseChain.start.previousConnection);
      break;
    }
    case 'spawn_item':
      block = workspace.newBlock('event_spawn_item');
      block.setFieldValue(event.room || '', 'ROOM');
      block.setFieldValue(event.id || '', 'ID');
      block.setFieldValue(String(event.qty || 1), 'QTY');
      break;
    
    // Mapping der Unified Events zurück auf spezifische Blöcke für die Anzeige
    case 'spawn_actor':
    case 'spawn_enemy': 
    case 'spawn_npc':
      {
        // Einfache Heuristik: Hat Qty? -> Enemy Block, sonst NPC Block (Visualisierung)
        const isQty = (event.qty && event.qty > 1) || (event.type === 'spawn_enemy');
        if (isQty) {
          block = workspace.newBlock('event_spawn_enemy');
          block.setFieldValue(event.room || '', 'ROOM');
          block.setFieldValue(event.id || event.actor || event.enemy || '', 'ID');
          block.setFieldValue(String(event.qty || 1), 'QTY');
        } else {
          block = workspace.newBlock('event_spawn_npc');
          block.setFieldValue(event.id || event.actor || event.npc || '', 'ID');
          block.setFieldValue(event.room || '', 'ROOM');
        }
      }
      break;
    
    case 'actor_move':
    case 'npc_move':
      block = workspace.newBlock('event_npc_move');
      block.setFieldValue(event.id || event.actor || event.npc || '', 'ID');
      block.setFieldValue(event.to || '', 'ROOM');
      break;
      
    case 'actor_move_if_present':
    case 'npc_move_if_present':
      block = workspace.newBlock('event_npc_move_if_present');
      block.setFieldValue(event.from || '', 'FROM');
      block.setFieldValue(event.id || event.actor || event.npc || '', 'ID');
      block.setFieldValue(event.to || '', 'TO');
      break;
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

export function initEventBlockEditor(domElement, initialJsonArray = [], options = {}) {
  registerBlocks(options);
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
        { kind: 'block', type: 'event_counter_add' },
        { kind: 'block', type: 'event_counter_set' },
        { kind: 'block', type: 'event_counter_if' },
        { kind: 'block', type: 'event_spawn_item' },
        { kind: 'block', type: 'event_spawn_enemy' },
        { kind: 'block', type: 'event_spawn_npc' },
        { kind: 'block', type: 'event_npc_move' },
        { kind: 'block', type: 'event_npc_move_if_present' },
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