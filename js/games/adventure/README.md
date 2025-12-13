# NRW Noir Adventure Engine

**Version:** 1.4.0

Die NRW Noir Adventure Engine ist eine browserbasierte Textadventure-Plattform mit eingebautem Terminal-Interface und einem visuellen Adventure Builder. Engine und Builder sind darauf ausgelegt, komplette Adventures als JSON-Daten zu verwalten, Events auszuführen und die Welten direkt im Browser zu testen.

## Features der Adventure Engine
- **Event-gesteuerte Story-Logik:** JSON-basierte Events für Erzählertexte, ASCII-Anzeigen, Flag-Logik, Inventaränderungen, Raumwechsel und Kämpfe bilden den Kern des Adventuresystems.
- **Umfangreiche Eventtypen:** Message-, ASCII-, Flag-, Inventar-, Exit- und Teleport-Events sowie Kampf-Trigger können in Reihenfolge kombiniert werden.
- **Erweitertes Kampfsystem:** Angriff, Verteidigen, Fluchtchance, Item-Einsatz und vier Gegner-Hooks (on_attack/on_hit/on_miss/on_defeat) sind integriert und können über JSON konfiguriert werden.
- **Terminal-Interface:** Eingebautes Terminal mit Autocomplete, Nutzer-Login, Dateisystem-Commands (z. B. `ls`, `cd`, `cat`) und erweiterbarer Befehlsregistry für adventurespezifische Commands.
- **Debug-Modus im Terminal:** Per `adv debug on` aktivierbares Logging protokolliert Eingaben und ausgelöste Eventketten direkt in der Terminal-Sitzung und kann über `adv debug show` eingesehen werden.
- **Game Hub Integration:** Adventures können eigene Befehle registrieren und Minispiele wie Tic-Tac-Toe im Terminal verfügbar machen.
- **ASCII-Art Unterstützung:** Adventure-Räume können ASCII-Dateien laden und darstellen, um Stimmungen oder Hinweise zu visualisieren.
- **Crafting Light:** Combine-Befehle erlauben rezeptbasierte Items mit Tools, Stationen und optionalen Event-Hooks.


## Kampf-Hooks

Gegner können Event-Ketten an klar definierte Kampfmomente hängen. Alle Hooks werden über das Eventsystem ausgeführt und akzeptieren beliebige Event-Arrays (message, flag_set, add_item, transition, trigger_fight, ...).

- **hooks.on_attack**: Wird immer ausgelöst, sobald der Spieler „attack“ wählt – vor der Trefferprüfung.
- **hooks.on_hit**: Läuft nur, wenn der Angriff Schaden verursacht (nach dem Treffer-Log).
- **hooks.on_miss**: Läuft nur, wenn der Angriff keinen Schaden anrichtet (z. B. verfehlt oder abgeblockt).
- **hooks.on_defeat**: Wird nach dem Sieg über den Gegner ausgeführt.

Beispiel-Gegner:

```json
{
  "id": "shadow_beast",
  "name": "Schattenbestie",
  "description": "Etwas bewegt sich im Dunkeln.",
  "stats": { "hp": 12, "attack": 3, "defense": 1 },
  "hooks": {
    "on_attack": [ { "type": "message", "text": "Du atmest tief durch und greifst an." } ],
    "on_hit": [ { "type": "message", "text": "Das Biest heult auf." } ],
    "on_miss": [ { "type": "message", "text": "Dein Hieb geht ins Leere." } ],
    "on_defeat": [ { "type": "add_item", "id": "kristall_fragment" } ]
  }
}
```

Legacy-Felder `on_attack` und `on_defeat` werden weiterhin eingelesen und automatisch den neuen Hooks zugeordnet, empfohlen ist jedoch der Einsatz des `hooks`-Objekts.



## Projektstruktur
- `doc/` – Dokumentation, u. a. Event-Cheatsheet
- `games/` – Beispiel- oder Demo-Adventures
