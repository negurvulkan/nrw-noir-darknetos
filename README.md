# NRW Noir DarknetOS

Interaktive Terminal-Simulation mit Spielen (TicTacToe, Adventure Engine) und Creator-Tools für eigene Adventures.

## Start

- **Terminal:** `index.html` direkt öffnen oder über einen statischen Webserver (empfohlen wegen Fetch-Aufrufen). Einstiegspunkt ist `/`.
- **Adventure Builder:** `/adventurebuilder/` lädt den Blockly-basierten Editor.
- **Content Builder Backend:** PHP-Backend unter `/content-builder/` inkl. JSON-Editor und API.

## Struktur

- `/js/core/` – Terminal-Runtime (Routing, Content-Lader, Login, Init).
- `/js/games/` – Game Hub, TicTacToe sowie Adventure Runtime/Commands.
- `/js/games/adventure/adventures/` – einzige Quelle für Adventure-Pakete (z. B. `default/`, `dunkler-wald/`).
- `/content/` – JSON-Content für Terminalbefehle (`index.json`, `motd.json`, etc.).
- `/adventurebuilder/` – UI-Assets & Blockly-Glue für den Adventure Builder.
- `/content-builder/` – PHP-Backend & JSON-Builder/API.

## Adventure & Saves

- Adventures werden über `adv start` geladen; ASCII/Assets stammen aus den Ordnern unter `/js/games/adventure/adventures/`.
- Spielstände (Adventure-Progress) werden lokal im Browser gespeichert (`localStorage`).

## Endpunkte

- Terminal: `/`
- Adventure Builder: `/adventurebuilder/`
- Content Builder/API: `/content-builder/`
