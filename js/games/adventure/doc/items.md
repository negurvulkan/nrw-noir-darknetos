# NRW Noir Adventure Engine

## Items (`items/*.json`)

Items können aufgenommen, genutzt oder kombiniert werden.

### Pflichtfelder
- **id**: Eindeutige Kennung.
- **name**: Anzeigename.
- **description**: Kurzbeschreibung im Inventar.

### Optionale Felder
- **pickup**: `true/false`, ob das Item aufgenommen werden darf.
- **combine**: Objekt mit Ziel-Item-IDs als Keys und Eventlisten als Wert.
- **on_use**: Eventliste, wenn das Item aus dem Inventar heraus benutzt wird.

### Beispiel
```json
{
  "id": "schluesselkarte",
  "name": "Schlüsselkarte",
  "description": "Eine alte Keycard.",
  "pickup": true,
  "combine": {
    "tuerkonsole": [ { "type": "unlock_exit", "room": "eingangshalle", "direction": "nord" } ]
  },
  "on_use": [ { "type": "message", "text": "Du streichst über die Kontakte." } ]
}
```
