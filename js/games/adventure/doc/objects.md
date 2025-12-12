# NRW Noir Adventure Engine

## Objekte (`objects/*.json`)

Objekte stehen in Räumen und reagieren auf **inspect** oder **use**.

### Pflichtfelder
- **id**: Eindeutige Kennung.
- **name**: Anzeigename im Raum.
- **description**: Kurztext für `untersuche`.

### Optionale Felder
- **inspect**: Eventliste bei `untersuche <objekt>`.
- **use**: Eventliste bei `benutze <objekt>`.
- **locked**: `true/false`, ob das Objekt aktuell gesperrt ist.
- **on_locked_use**: Eventliste, die ausgeführt wird, wenn das Objekt gesperrt ist und dennoch benutzt wird.

### Beispiel
```json
{
  "id": "konsole_main",
  "name": "Konsole",
  "description": "Ein flackerndes Terminal.",
  "inspect": [ { "type": "message", "text": "Die Tastatur wirkt klebrig." } ],
  "use": [ { "type": "ascii", "file": "ascii/boot.txt", "fontSize": 5 } ],
  "locked": false,
  "on_locked_use": []
}
```
