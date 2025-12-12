# NRW Noir Adventure Engine

**Version:** 1.1.0

Die NRW Noir Adventure Engine ist eine browserbasierte Textadventure-Plattform mit eingebautem Terminal-Interface und einem visuellen Adventure Builder. Engine und Builder sind darauf ausgelegt, komplette Adventures als JSON-Daten zu verwalten, Events auszuführen und die Welten direkt im Browser zu testen.

## Features der Adventure Engine
- **Event-gesteuerte Story-Logik:** JSON-basierte Events für Erzählertexte, ASCII-Anzeigen, Flag-Logik, Inventaränderungen, Raumwechsel und Kämpfe bilden den Kern des Adventuresystems.
- **Umfangreiche Eventtypen:** Message-, ASCII-, Flag-, Inventar-, Exit- und Teleport-Events sowie Kampf-Trigger können in Reihenfolge kombiniert werden.
- **Erweitertes Kampfsystem:** Angriff, Verteidigen, Fluchtchance, Item-Einsatz und Gegner-Hooks (on_attack/on_defeat) sind integriert und können über JSON konfiguriert werden.
- **Terminal-Interface:** Eingebautes Terminal mit Autocomplete, Nutzer-Login, Dateisystem-Commands (z. B. `ls`, `cd`, `cat`) und erweiterbarer Befehlsregistry für adventurespezifische Commands.
- **Game Hub Integration:** Adventures können eigene Befehle registrieren und Minispiele wie Tic-Tac-Toe im Terminal verfügbar machen.
- **ASCII-Art Unterstützung:** Adventure-Räume können ASCII-Dateien laden und darstellen, um Stimmungen oder Hinweise zu visualisieren.



## Projektstruktur
- `doc/` – Dokumentation, u. a. Event-Cheatsheet
- `games/` – Beispiel- oder Demo-Adventures
