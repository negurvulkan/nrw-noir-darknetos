# NRW Noir Adventure Engine

## Räume (`rooms/*.json`)

Räume beschreiben Umgebung, Ausgänge und Inhalte.

### Pflichtfelder
- **id**: Eindeutige Kennung.
- **title**: Überschrift des Raums.
- **description**: Fließtext, der beim Betreten angezeigt wird.
- **exits**: Objekt mit Richtungen (`nord`, `ost`, `sued`, `west`, …) und Ziel-Raum-IDs.

### Optionale Felder
- **ascii**: `{ "file": "ascii/datei.txt", "fontSize": 6 }` für ASCII-Art.
- **objects**: Array von Objekt-IDs, die im Raum stehen.
- **items**: Array von Item-IDs, die aufgenommen werden können.
- **actors**: Liste von Actor-IDs (NPCs oder Gegner mit `type`-Feld), die fest im Raum stehen oder in Kämpfe münden.
  Legacy-Felder `enemies` und `npcs` werden weiterhin eingelesen und im Loader auf Actors abgebildet.
- **on_enter**: Eventliste, die bei JEDEM Betreten ausgeführt wird.
- **on_first_enter**: Eventliste, die nur beim ersten Besuch läuft.

### Beispiel
```json
{
  "id": "eingangshalle",
  "title": "Eingangshalle",
  "ascii": { "file": "ascii/eingang.txt", "fontSize": 6 },
  "description": "Staub liegt in der Luft. Eine Tür führt nach Norden.",
  "exits": { "nord": "flur" },
  "objects": ["konsole_main"],
  "items": ["schluesselkarte"],
  "actors": ["hausmeister", "geist"],
  "on_enter": [],
  "on_first_enter": []
}
```
