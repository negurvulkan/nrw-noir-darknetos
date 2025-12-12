# NRW Noir Adventure Engine

## Weltdefinition (`world.json`)

Die `world.json` legt globale Einstellungen für ein Adventure fest und ist der Einstiegspunkt für die Engine.

### Pflichtfelder
- **startRoom**: Raum-ID, in die der Spieler beim Start teleportiert wird.
- **globalFlags**: Objekt für vordefinierte Flags (z. B. `{ "strom_an": true }`). Wird in den Spielzustand kopiert.
- **messages**: Sammlung zentraler Systemtexte (z. B. Fehlermeldungen).

### Optionale Felder
- **defaultFontSize**: Standard-Schriftgröße für ASCII-Art.

### Beispiel
```json
{
  "startRoom": "eingangshalle",
  "globalFlags": { "strom_an": false },
  "defaultFontSize": 6,
  "messages": {
    "unknownCommand": "Das habe ich nicht verstanden.",
    "cannotGo": "Dorthin kannst du nicht gehen.",
    "cannotTake": "Das kannst du nicht mitnehmen."
  }
}
```
