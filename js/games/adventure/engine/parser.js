// Basic text parser for German adventure commands.
// Converts raw input strings into structured action objects.

const VERB_SYNONYMS = {
  // Bewegung
  go: ['geh', 'gehe', 'gehe nach', 'gehe zu', 'go', 'lauf', 'laufe', 'reise', 'n', 's', 'o', 'w', 'nord', 'sued', 'ost', 'west'],
  
  // Interaktion mit Items/Objekten
  take: ['nimm', 'nehmen', 'hole', 'grab', 'pick', 'stecke ein'],
  inspect: ['untersuche', 'untersuchen', 'inspect', 'schau', 'schau an', 'ansehen', 'look', 'betrachte'],
  look: ['umschauen', 'umsehen', 'l', 'look around'],
  use: ['benutze', 'nutze', 'verwende', 'use', 'bediene'],
  combine: ['kombiniere', 'kombinieren', 'combine', 'verbinde'],
  
  // Spezifische Objekt-Interaktionen
  open: ['öffne', 'oeffne', 'open', 'aufmachen'],
  close: ['schließe', 'schliesse', 'close', 'zumachen'],
  push: ['drücke', 'druecke', 'schiebe', 'push'],
  pull: ['ziehe', 'pull'],
  
  // Interaktion mit Actors (Kampf & Dialog)
  attack: ['angriff', 'angreifen', 'attack', 'schlag', 'schlage', 'kämpfe', 'kaempfe', 'töte', 'toete', 'fight'],
  defend: ['verteidige', 'verteidigen', 'block', 'blocken', 'defend', 'schutz'],
  flee: ['fliehe', 'fliehen', 'flucht', 'lauf weg', 'renne weg', 'escape', 'flee', 'rückzug', 'rueckzug'],
  talk: ['rede', 'rede mit', 'sprich', 'sprich mit', 'spreche', 'talk', 'dialog', 'frag', 'frage', 'ansprechen'],
  
  // UI / Meta
  inventory: ['inventar', 'tasche', 'beutel', 'i', 'inv', 'rucksack', 'ausrüstung'],
  help: ['hilfe', 'help', 'befehle', '?'],
  exit: ['exit', 'quit', 'beenden', 'verlassen', 'bye']
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
  // Prüft, ob der Input mit einem bekannten Synonym beginnt (Longest match first prinzipiell besser, 
  // aber hier reicht die Iteration, da Synonyme meist eindeutig sind).
  for (const [verb, list] of Object.entries(VERB_SYNONYMS)) {
    for (const entry of list) {
      // Exakter Match oder Wortanfang gefolgt von Leerzeichen
      if (input === entry || input.startsWith(`${entry} `)) {
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
 * @returns {{verb:string|null, object:string|null, target:string|null, direction:string|null, raw:string, items?:string[], station?:string|null}}
 */
export function parseInput(text) {
  const raw = text;
  const lower = normalizeUmlauts(text);

  // Leerer String
  if (!lower) {
    return { verb: null, object: null, target: null, direction: null, raw };
  }

  // 1. Spezialfall: Kombinieren ("benutze X mit Y")
  // Wird oft als "use" eingegeben, ist aber logisch ein "combine".
  const combineMatch =
    lower.match(/^(benutze|nutze|verwende)\s+(.+?)\s+mit\s+(.+)$/) ||
    lower.match(/^use\s+(.+?)\s+with\s+(.+)$/);

  if (combineMatch) {
    // Wenn es explizit "use" war, mappen wir es auf combine, wenn zwei Objekte da sind.
    return {
      verb: 'combine',
      // Group 1 ist das Verb, Group 2 das erste Objekt, Group 3 das zweite
      object: combineMatch[2].trim(), // Erstes Item
      target: combineMatch[3].trim(), // Zweites Item
      direction: null,
      raw
    };
  }

  const tokens = lower.split(/\s+/);

  // 2. Spezialfall: Reine Richtungseingabe (n, s, nord...)
  if (tokens.length === 1) {
    const direction = parseDirection(tokens[0]);
    if (direction) {
      return { verb: 'go', object: null, target: null, direction, raw };
    }
  }

  // 3. Standard Verb-Erkennung
  const verb = normalizeVerb(lower) || tokens[0];
  let direction = null;
  let object = null;
  let target = null;

  // Logik je nach Verb-Typ
  if (verb === 'combine') {
    // Parsing für komplexes Crafting: "kombiniere A und B [auf C]"
    const withoutVerb = lower
      .replace(/^(kombiniere|kombinieren|combine|verbinde)\s+/, '');
      
    // Station optional nach "auf" oder "on" filtern
    let station = null;
    let itemPart = withoutVerb;
    const stationMatch = withoutVerb.match(/(.+?)\s+(auf|on)\s+(.+)/);
    if (stationMatch) {
      itemPart = (stationMatch[1] || '').trim();
      station = (stationMatch[3] || '').trim();
    }

    // Items splitten (mit/und/with/and)
    const itemTokens = itemPart
      .split(/\s+(mit|with|und|and)\s+/)
      .map((part) => part.trim())
      .filter((part) => part && !['mit','with','und','and'].includes(part));

    // Fallback falls kein Trenner gefunden wurde
    const items = itemTokens.length ? itemTokens : (itemPart ? [itemPart.trim()] : []);
    
    return { 
      verb, 
      items, 
      station: station || null, 
      raw, 
      object: items[0] || null, 
      target: items[1] || null, 
      direction: null 
    };

  } else if (verb === 'go') {
    // "gehe nord" -> direction=nord
    // Versuche Richtung aus dem zweiten Token zu lesen
    const dirToken = tokens.find((t) => DIRECTION_ALIASES[t]);
    direction = dirToken ? parseDirection(dirToken) : null;
    
    // Falls keine Richtung erkannt wurde, ist es vielleicht "gehe zu X" (wobei X das object ist)
    if (!direction && tokens[1]) {
       // Entferne das Verb am Anfang
       const verbMatch = Object.values(VERB_SYNONYMS.go).find(v => lower.startsWith(v));
       object = lower.replace(verbMatch || tokens[0], '').trim();
       // Entferne Füllwörter wie "zu", "nach" am Anfang des Objekts, falls noch da
       object = object.replace(/^(zu|nach)\s+/, '');
    }

  } else {
    // Standard: Alles nach dem Verb ist das Objekt
    // Wir müssen herausfinden, welches Synonym benutzt wurde, um es abzuschneiden
    // Da normalizeVerb nur das Verb zurückgibt, rekonstruieren wir den Reststring.
    
    // Simple logic: remove first token if it matches, or try to strip known synonyms
    let rest = tokens.slice(1).join(' ');
    
    // Für "talk" (sprich mit ...) entfernen wir das "mit "
    if (verb === 'talk') {
      rest = rest.replace(/^(mit|zu|an)\s+/, '');
    }
    
    // Für "attack" (greife X an) - das "an" am Ende ist im Deutschen üblich
    if (verb === 'attack') {
        rest = rest.replace(/\s+an$/, '');
    }

    object = rest;
  }

  return { verb, object: object || null, target, direction, raw };
}