# NRW Noir Adventure Engine

## Dialoge (`dialogs/<npc>.json`)

Dialogdateien steuern Gespräche mit NPCs. Sie bestehen aus Knoten (`nodes`), zwischen denen per Auswahl gewechselt wird.

### Pflichtfelder
- **nodes**: Objekt mit Dialogknoten.

### Optionale Felder
- **start**: Knoten-ID für den Einstieg (fällt sonst auf `npc.dialog_start` oder `start`).

### Knotenstruktur
Jeder Knoten liegt unter `nodes.<id>` und kann enthalten:
- **text**: Gesprochene Zeile des NPC.
- **ascii**: ASCII-Art für den Knoten.
- **choices**: Array von Antwortoptionen.

### Choice-Struktur
Jedes Choice-Objekt unterstützt:
- **text**: Antworttext, der nummeriert angezeigt wird.
- **next**: Zielknoten-ID. `"end"` oder fehlende Knoten beenden den Dialog.
- **events**: Eventliste, die beim Anklicken ausgelöst wird.
- **ascii**: ASCII-Art nur für diese Auswahl.
- **requires**: Bedingungen, z. B. `{ "inventory": ["schluessel"], "flag": { "key": "quest", "equals": true } }`. Erfüllt? → wählbar, sonst `[X]` gelockt.
- **hidden_if**: Blendt die Auswahl aus, wenn Inventar/Flag-Bedingungen erfüllt sind (gleiche Struktur wie `requires`).

### Beispiel
```json
{
  "start": "begruesung",
  "nodes": {
    "begruesung": {
      "text": "Was willst du?",
      "choices": [
        { "text": "Nur schauen.", "next": "end" },
        {
          "text": "Ich suche den Schlüssel.",
          "next": "hinweis",
          "requires": { "flag": { "key": "alarm_deaktiviert", "equals": true } }
        }
      ]
    },
    "hinweis": {
      "text": "Vielleicht hilft dir die Karte im Keller.",
      "choices": [
        { "text": "Danke", "events": [ { "type": "message", "text": "Er nickt." } ], "next": "end" }
      ]
    }
  }
}
```
