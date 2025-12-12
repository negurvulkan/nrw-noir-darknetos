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
- **on_attack**: Eventliste für Spezialeffekte (kann für Erweiterungen genutzt werden).

### Beispiel
```json
{
  "id": "shadow_beast",
  "name": "Schattenbestie",
  "ascii": { "file": "ascii/beast.txt", "fontSize": 5 },
  "description": "Etwas bewegt sich im Dunkeln.",
  "stats": { "hp": 12, "attack": 3, "defense": 1 },
  "drops": ["kristall_fragment"],
  "on_attack": []
}
```
