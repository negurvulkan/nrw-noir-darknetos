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
 * Parse user input into a normalized action descriptor.
 * @param {string} text
 * @returns {{verb:string|null, object:string|null, target:string|null, direction:string|null, raw:string}}
 */
export function parseInput(text) {
  const raw = text;
  const lower = normalizeUmlauts(text);

  // Leerer String
  if (!lower) {
    return { verb: null, object: null, target: null, direction: null, raw };
  }

  // Spezialfall: "benutze X mit Y" / "nutze X mit Y" / "verwende X mit Y" / "use X with Y"
  const combineMatch =
    lower.match(/^(benutze|nutze|verwende)\s+(.+?)\s+mit\s+(.+)$/) ||
    lower.match(/^use\s+(.+?)\s+with\s+(.+)$/);
  
  if (combineMatch) {
    // Deutsch: [1]=verbwort, [2]=obj, [3]=target
    if (combineMatch[1] !== 'use') {
      return { verb: 'combine', object: combineMatch[2].trim(), target: combineMatch[3].trim(), direction: null, raw };
    }
  
    // Englisch: [1]=obj, [2]=target
    return { verb: 'combine', object: combineMatch[1].trim(), target: combineMatch[2].trim(), direction: null, raw };
  }

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

  // combine hat eigenes Schema: mehrere Items + optionale Station
  if (verb === 'combine') {
    const withoutVerb = lower.replace(/^kombiniere\s+/, '').replace(/^kombinieren\s+/, '').replace(/^combine\s+/, '');
    // Station optional nach "auf" oder "on"
    let station = null;
    let itemPart = withoutVerb;
    const stationMatch = withoutVerb.match(/(.+?)\s+(auf|on)\s+(.+)/);
    if (stationMatch) {
      itemPart = (stationMatch[1] || '').trim();
      station = (stationMatch[3] || '').trim();
    }

    const itemTokens = itemPart
      .split(/\s+(?:mit|with|und|and)\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    const items = itemTokens.length ? itemTokens : (itemPart ? [itemPart.trim()] : []);
    return { verb, items, station: station || null, raw, object: items[0] || null, target: items[1] || null, direction: null };
  } else if (verb === 'go') {
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
