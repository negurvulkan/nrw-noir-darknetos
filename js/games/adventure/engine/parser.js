// Basic text parser for German adventure commands.

const VERB_SYNONYMS = {
  go: ['geh', 'gehe', 'gehe nach', 'gehe zu', 'go', 'lauf', 'laufe', 'reise', 'n', 's', 'o', 'w', 'nord', 'sued', 'ost', 'west'],
  take: ['nimm', 'nehmen', 'hole', 'grab', 'pick'],
  inspect: ['untersuche', 'untersuchen', 'inspect', 'schau', 'schau an', 'ansehen', 'look'],
  look: ['umschauen', 'umsehen'],
  use: ['benutze', 'nutze', 'verwende', 'use'],
  open: ['öffne', 'oeffne', 'open'],
  close: ['schließe', 'schliesse', 'close'],
  push: ['drücke', 'druecke', 'schiebe', 'push'],
  pull: ['ziehe', 'pull'],
  attack: ['angriff', 'angreifen', 'attack', 'schlag', 'kämpfe', 'kaempfe'],
  defend: ['verteidige', 'verteidigen', 'block', 'blocken', 'defend'],
  flee: ['fliehe', 'fliehen', 'flucht', 'lauf weg', 'renne weg', 'escape', 'flee'],
  combine: ['kombiniere', 'kombinieren', 'combine'],
  talk: ['rede', 'rede mit', 'sprich', 'sprich mit', 'spreche', 'talk', 'dialog'],
  inventory: ['inventar', 'tasche', 'beutel', 'i', 'inv', 'rucksack'],
  help: ['hilfe', 'help'],
  exit: ['exit', 'quit', 'beenden', 'verlassen']
};

const DIRECTION_ALIASES = {
  n: 'nord',
  s: 'sued',
  o: 'ost',
  w: 'west',
  nord: 'nord',
  sued: 'sued',
  ost: 'ost',
  west: 'west'
};

function normalizeUmlauts(str = '') {
  return str
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeVerb(input) {
  for (const [verb, list] of Object.entries(VERB_SYNONYMS)) {
    for (const entry of list) {
      if (input.startsWith(`${entry} `) || input === entry) {
        return verb;
      }
    }
  }
  return null;
}

function parseDirection(word) {
  return DIRECTION_ALIASES[word] || null;
}

/**
 * Parse combine-ish input (kombiniere/benutze/use) into a unified payload:
 * { verb:'combine', items:[...], station, object, target, raw }
 */
function parseCombinePayload(lower, raw) {
  // akzeptiert:
  // - kombiniere ...
  // - benutze/nutze/verwende ...
  // - use ...
  const headMatch = lower.match(/^(kombiniere|kombinieren|combine|benutze|nutze|verwende|use)\s+(.+)$/);
  if (!headMatch) return null;

  let rest = (headMatch[2] || '').trim();
  if (!rest) {
    return { verb: 'combine', items: [], station: null, raw, object: null, target: null, direction: null };
  }

  // optional: "use X with Y" -> wir können "with" später im Split behandeln
  // optional Station: "... auf/an/on/at tisch"
  let station = null;
  const stationMatch = rest.match(/(.+?)\s+(auf|an|on|at)\s+(.+)$/);
  if (stationMatch) {
    rest = (stationMatch[1] || '').trim();
    station = (stationMatch[3] || '').trim();
  }

  // Items trennen: "mit/und/with/and"
  // ✅ NON-capturing, damit "mit" nicht als Token im Array landet
  const items = rest
    .split(/\s+(?:mit|with|und|and)\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (!items.length) {
    return { verb: 'combine', items: [], station: station || null, raw, object: null, target: null, direction: null };
  }

  return {
    verb: 'combine',
    items,
    station: station || null,
    raw,
    object: items[0] || null,
    target: items[1] || null,
    direction: null
  };
}

/**
 * Parse user input into a normalized action descriptor.
 * @param {string} text
 * @returns {{verb:string|null, object:string|null, target:string|null, direction:string|null, raw:string, items?:string[], station?:string|null}}
 */
export function parseInput(text) {
  const raw = text;
  const lower = normalizeUmlauts(text);

  // Leerer String
  if (!lower) {
    return { verb: null, object: null, target: null, direction: null, raw };
  }

  // ✅ NEU: Combine/Benutze/Use früh abfangen (inkl. mehrere Items + Station)
  const combinePayload = parseCombinePayload(lower, raw);
  if (combinePayload) return combinePayload;

  const tokens = lower.split(/\s+/);

  // Direction short-cuts
  if (tokens.length === 1) {
    const direction = parseDirection(tokens[0]);
    if (direction) {
      return { verb: 'go', object: null, target: null, direction, raw };
    }
  }

  const verb = normalizeVerb(lower) || tokens[0];
  let direction = null;
  let object = null;
  let target = null;

  if (verb === 'go') {
    // attempt to find direction after verb
    const dirToken = tokens.find((t) => DIRECTION_ALIASES[t]);
    direction = dirToken ? parseDirection(dirToken) : null;
    if (!direction && tokens[1]) {
      object = tokens[1];
    }
  } else {
    object = tokens.slice(1).join(' ');
    if (verb === 'talk' && object.startsWith('mit ')) {
      object = object.replace(/^mit\s+/, '');
    }
  }

  return { verb, object: object || null, target, direction, raw };
}
