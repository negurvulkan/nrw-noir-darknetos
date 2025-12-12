// Adventure command registration for the terminal router.
import adventure from '../engine/core.js';

const ADVENTURE_INDEX = './js/games/adventure/adventures/index.json';

if (typeof window !== 'undefined') {
  window.darknetAdventure = adventure;
}

function ensureGameRegistered() {
  if (typeof registerGame === 'function') {
    registerGame('adventure', {
      id: 'adventure',
      title: 'NRW Noir Adventure',
      start: adventure.start,
      continue: adventure.continue,
      reset: adventure.reset,
      help: adventure.help,
      handleInput: adventure.handleInput
    });
  }
}

function printCommandHelp() {
  printLines([
    'Adventure Befehle:',
    'adv start [name]    - Neues Abenteuer starten',
    'adv continue [name] - Letzten Spielstand laden',
    'adv list            - Liste aller Adventures',
    'adv reset [name]    - Spielstand zurücksetzen',
    'adv debug on|off    - Adventure-Debug-Log aktivieren/deaktivieren',
    'adv debug show      - Letzte Debug-Einträge anzeigen',
    'adv exit            - Adventure beenden',
    'adv help            - Diese Hilfe',
    'Während des Adventures werden Eingaben direkt interpretiert.'
  ]);
}

async function loadAdventureList() {
  try {
    const res = await fetch(ADVENTURE_INDEX);
    if (!res.ok) throw new Error('Index konnte nicht geladen werden');
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.adventures)) return data.adventures;
  } catch (err) {
    console.warn('Adventure-Liste konnte nicht geladen werden:', err);
  }
  return [{ id: 'adventure', title: 'NRW Noir Adventure' }];
}

async function printAdventureList() {
  const adventures = await loadAdventureList();
  if (!adventures.length) {
    printLines(['Keine Adventures gefunden.', ''], 'error');
    return;
  }

  const lines = ['Verfügbare Adventures:', '---------------------'];
  adventures.forEach((adv) => {
    const title = adv.title ? `: ${adv.title}` : '';
    const description = adv.description ? ` — ${adv.description}` : '';
    lines.push(`- ${adv.id}${title}${description}`);
  });
  lines.push('');
  printLines(lines);
}

async function handleAdvCommand(args = []) {
  ensureGameRegistered();
  const sub = (args[0] || '').toLowerCase();
  const adventureId = args[1];
  switch (sub) {
    case 'start':
      await adventure.start(adventureId);
      break;
    case 'continue':
      await adventure.continue(adventureId);
      break;
    case 'list':
      await printAdventureList();
      break;
    case 'reset':
      await adventure.reset(adventureId);
      break;
    case 'debug': {
      const mode = (args[1] || '').toLowerCase();
      if (mode === 'on') {
        adventure.setDebugLogging(true);
      } else if (mode === 'off') {
        adventure.setDebugLogging(false);
      } else if (mode === 'show') {
        adventure.printDebugLog();
      } else {
        printLines([
          'Debug-Modus für Adventure-Eingaben:',
          '  adv debug on   - Logging aktivieren',
          '  adv debug off  - Logging deaktivieren',
          '  adv debug show - Letzte 20 Einträge anzeigen',
          ''
        ], 'dim');
      }
      break;
    }
    case 'exit':
    case 'quit':
      adventure.exit();
      break;
    case 'help':
    default:
      printCommandHelp();
  }
}

export function register(router) {
  ensureGameRegistered();
  if (router && typeof router.registerCommand === 'function') {
    router.registerCommand('adv', handleAdvCommand);
  } else if (typeof window !== 'undefined' && window.registerCommand) {
    window.registerCommand('adv', handleAdvCommand);
  }
}

// Auto-register when loaded in browser context with a global router.
if (typeof window !== 'undefined' && window.commandRouter) {
  register(window.commandRouter);
}

export default handleAdvCommand;
