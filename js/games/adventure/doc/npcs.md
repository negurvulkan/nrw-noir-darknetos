# NRW Noir Adventure Engine

## Actors – NPCs (`actors/*.json` mit `type: "npc"`)

NPCs werden in der gemeinsamen Actor-Sammlung gespeichert, können in Räumen stehen und Dialoge starten. Legacy-Dateien unter
`npcs/*.json` werden beim Laden automatisch in die Actor-Struktur mit `type: "npc"` überführt.

### Pflichtfelder
- **id**: Eindeutige Kennung.
- **type**: Muss `npc` sein, wenn der Datensatz unter `actors/` liegt.
- **name**: Anzeigename in der Ausgabe.

### Optionale Felder
- **description**: Kurztext, wenn du den NPC beschreibst.
- **room**: Raum-ID, in dem der NPC verankert ist (alternativ über `rooms/*.json` verlinken).
- **dialog_start**: Einstiegsknoten für den Dialog (fällt sonst auf `dialogs/<id>.json` → `start` zurück).
- **flags**: Startwerte, die in `state.npcFlags[id]` gespiegelt werden können.
- **hidden_if_flag**: Blendet den NPC aus, wenn ein Flag `{ "key": "...", "equals": true }` passt.
- **only_if_flag**: Zeigt den NPC nur, wenn ein Flag passend gesetzt ist.

Während des Spiels werden Position, Flags und Counter des NPC in `state.npcs[id]` gepflegt. Dadurch können Events wie `npc_move` oder `npc_move_if_present` die aktuelle Raum-Zuordnung persistent verändern.

### Beispiel
```json
{
  "id": "hausmeister",
  "type": "npc",
  "name": "Hausmeister Krause",
  "description": "Ein mürrischer Mann mit Taschenlampe.",
  "room": "flur",
  "dialog_start": "begruesung",
  "flags": { "geduld": 2 },
  "hidden_if_flag": { "key": "strom_an", "equals": true },
  "only_if_flag": { "key": "alarm_deaktiviert", "equals": true }
}
```
