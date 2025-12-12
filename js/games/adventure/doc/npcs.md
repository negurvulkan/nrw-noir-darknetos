# NRW Noir Adventure Engine

## NPCs (`npcs/*.json`)

NPCs können in Räumen stehen und Dialoge starten.

### Pflichtfelder
- **id**: Eindeutige Kennung.
- **name**: Anzeigename in der Ausgabe.

### Optionale Felder
- **description**: Kurztext, wenn du den NPC beschreibst.
- **room**: Raum-ID, in dem der NPC verankert ist (alternativ über `rooms/*.json` verlinken).
- **dialog_start**: Einstiegsknoten für den Dialog (fällt sonst auf `dialogs/<id>.json` → `start` zurück).
- **flags**: Startwerte, die in `state.npcFlags[id]` gespiegelt werden können.
- **hidden_if_flag**: Blendet den NPC aus, wenn ein Flag `{ "key": "...", "equals": true }` passt.
- **only_if_flag**: Zeigt den NPC nur, wenn ein Flag passend gesetzt ist.

### Beispiel
```json
{
  "id": "hausmeister",
  "name": "Hausmeister Krause",
  "description": "Ein mürrischer Mann mit Taschenlampe.",
  "room": "flur",
  "dialog_start": "begruesung",
  "flags": { "geduld": 2 },
  "hidden_if_flag": { "key": "strom_an", "equals": true },
  "only_if_flag": { "key": "alarm_deaktiviert", "equals": true }
}
```
