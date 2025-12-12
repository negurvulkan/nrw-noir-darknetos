# NRW Noir Adventure Engine

## Gegner (`enemies/*.json`)

Gegnerdaten steuern Kämpfe und Beute.

### Pflichtfelder
- **id**: Eindeutige Kennung.
- **name**: Gegnername.
- **description**: Kurzbeschreibung.
- **stats**: Werteobjekt mit `hp`, `attack`, `defense`.

### Optionale Felder
- **ascii**: `{ "file": "ascii/beast.txt", "fontSize": 5 }` wird beim Kampfstart geladen.
- **drops**: Array von Item-IDs, die bei Sieg ins Inventar gelegt werden.
- **hooks**: Objekt mit Eventlisten für Kampfmomente `{ on_attack: [], on_hit: [], on_miss: [], on_defeat: [] }`.
  - Legacy-Felder `on_attack` und `on_defeat` werden weiterhin eingelesen, empfohlen ist jedoch das `hooks`-Objekt.

### Beispiel
```json
{
  "id": "shadow_beast",
  "name": "Schattenbestie",
  "ascii": { "file": "ascii/beast.txt", "fontSize": 5 },
  "description": "Etwas bewegt sich im Dunkeln.",
  "stats": { "hp": 12, "attack": 3, "defense": 1 },
  "drops": ["kristall_fragment"],
  "hooks": {
    "on_attack": [ { "type": "message", "text": "Du gehst entschlossen in den Angriff." } ],
    "on_hit": [ { "type": "message", "text": "Die Bestie taumelt." } ],
    "on_miss": [ { "type": "message", "text": "Der Schlag verpufft wirkungslos." } ],
    "on_defeat": [ { "type": "message", "text": "Die Schatten zerfallen." } ]
  }
}
```
