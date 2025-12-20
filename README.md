# NRW Noir DarknetOS

Version 1.12.0

Interaktive Terminal-Simulation mit Spielen (TicTacToe, Adventure Engine) und Creator-Tools für eigene Adventures.

## Start

- **Terminal:** `index.html` direkt öffnen oder über einen statischen Webserver (empfohlen wegen Fetch-Aufrufen). Einstiegspunkt ist `/`.
- **Adventure Builder:** `/adventurebuilder/` lädt den Blockly-basierten Editor.
- **Content Builder Backend:** PHP-Backend unter `/content-builder/` inkl. JSON-Editor und API.

## Struktur

- `/js/core/` – Terminal-Runtime (Routing, Content-Lader, Login, Init).
- `/js/games/` – Game Hub, TicTacToe sowie Adventure Runtime/Commands.
- `/js/games/adventure/adventures/` – einzige Quelle für Adventure-Pakete (z. B. `default/`, `dunkler-wald/`). NPCs und Gegner
  werden dort als `actors/*.json` mit `type`-Feld geführt; Legacy-Verzeichnisse `npcs/` und `enemies/` bleiben lesbar.
- `/content/` – JSON-Content für Terminalbefehle (`index.json`, `motd.json`, etc.).
- `/adventurebuilder/` – UI-Assets & Blockly-Glue für den Adventure Builder.
- `/content-builder/` – PHP-Backend & JSON-Builder/API.

## Neu in 1.12.0

- Ghostships-Flotte mit neuen Schiffstypen und Längen: Dread (6), Galleon (5), Brig (4), Wraith (3) und Skiff (2) als Standardbesatzung.

## Neu in 1.6.0

- Terminal-Chat als Modul mit Präsenz-Anzeige (`chat online`) und privatem Messaging (`chat send <user> <msg>`, `chat inbox`).

## Neu in 1.7.0

- Neues Terminal-Minigame **Séance** (`seance ...`) mit regelbasiertem Geist „Violet Echo“: Fragen stellen (`ask`), auf Ereignisse warten (`listen`), Flüstern lesen/senden (`read`, `whisper`), Sitzungen hosten oder joinen (`start`, `invite`, `join`, `leave`, `end`) und Moderation (`mute`, `purge`). Stimmung/Patience werden pro Session getrackt; Whispers können über den Game Hub (`game seance`) oder direkt im Terminal gestartet werden.

## Neu in 1.8.0

- Neues Haunting-System: Mit geringer Chance heftet sich ein Geist persistent an den User. Spuk-Linien und Glitches erscheinen zeitgesteuert (localStorage-basiert), `haunt` zeigt den Status, `haunt calm` schwächt die Intensität leicht. Das Séance-Minigame kann den Spuk via `seance banish` beenden; Cooldowns und TTLs steuern Häufigkeit und Dauer.

## Neu in 1.11.0

- Ghostships lädt Flotten, Schiffstypen (inkl. Spritesheet-Metadaten) und Match-Regeln vollständig aus JSON (`content/games/battleship/`). GUI- und Terminal-Client nutzen den gemeinsamen Katalog und Match-Config, die API validiert Länge/Counts dynamisch, und das GUI rendert Schiffssprites nach dem 32×32-Spritesheet-Standard (row/col, 2 Zeilen ok/hit) ohne Hardcodes.

## Neu in 1.10.0

- Gemeinsame **Ghostships Engine** für Terminal und GUI (WebSocket-kompatibles Polling, Match-API bleibt unverändert).
- Neue responsive **Ghostships Web GUI** unter `/darknet/games/battleship`: zwei Grids (Radar & eigene Flotte), Turn-Indikator, Log, Auto-Platzierung, Platziermodus, CRT-Overlay sowie Spectator-Lesemodus.
- Spritesheet-Metadaten und Platzhalter-Sheets für Ghostships (32×32 Tiles, horizontal/vertikal, intakt/beschädigt) zur Integration von visuellen Assets (Fog/Manifest/Decay-Effekte).

## Neu in 1.10.1

- Ghostships kennzeichnet jetzt Treffer auf der eigenen Flotte deutlich: Terminal-Grids nutzen `=` auf getroffenen Segmenten, die GUI zeigt den passenden Framesheet-Hitframe auf den Schiffskacheln.

## Neu in 1.9.0

- Neues Multiplayer-Minigame **Ghostships** (`gs ...`): Battleship-Variante mit Geister-Flavor, manifestierenden Mini-Schiffen, Nebel-Feldern und fair begrenzter Fäule. Lobbys erstellen (`gs create`), Freunde per Chat einladen (`gs invite <user>`), Flotten platzieren (`gs place`/`gs auto`), bereit melden, feuern (`gs fire D5` oder Quickshot `D5`) und Rematches starten. Game Hub Eintrag inklusive.

## Neu in 1.6.1

- Chat nutzt jetzt einen Online-Backbone (`/content-builder/api/chat.php`) für Präsenz und Nachrichten zwischen Browsern; fällt bei fehlender Verbindung automatisch auf den lokalen Modus zurück.

## Neu in 1.5.0

- TicTacToe hat jetzt einen Online-Multiplayer im Terminal: `ttt online host` erstellt eine Lobby, `ttt online join <CODE>` tritt bei; Spielzustand läuft über `/content-builder/api/ttt-multiplayer.php`.

## Neu in 1.4.0

- Vereinheitlichtes Actor-System: NPCs und Gegner teilen sich eine zentrale `actors`-Sammlung, einen Editor-Flow und konsolidierte
  API-Endpunkte im Content-/Adventure-Builder. Datensätze tragen ein `type`-Feld (`npc`/`enemy`) und werden beim Laden automatisch
  auf die gemeinsame Struktur gemappt.

## Neu in 1.3.0

- Adventure-Counter (automatisch pro Raum-Eintritt, manuell per Events nutzbar) inklusive `counter_add`, `counter_set` und `counter_if`.
- Dynamische Spawns für Items/Enemies/NPCs pro Raum und neue Events `spawn_item`, `spawn_enemy`, `spawn_npc`.
- NPC-Laufwege via `npc_move` und `npc_move_if_present`; NPC-Positionen werden im Savegame mitgespeichert.
- Adventure Builder: neue Blockly-Blöcke mit Dropdowns für Räume/Items/Gegner/NPCs für die oben genannten Events.
- Beispiel im Default-Adventure: das Labor (`lab`) zählt Besuche, spawnt beim dritten Eintritt den `rattenkoenig` und schickt NPC Mika beim ersten Betreten auf die Straße.

## Adventure & Saves

- Adventures werden über `adv start` geladen; ASCII/Assets stammen aus den Ordnern unter `/js/games/adventure/adventures/`.
- Spielstände (Adventure-Progress) werden lokal im Browser gespeichert (`localStorage`).
- Mit `adv debug on` lässt sich ein Adventure-Debug-Log aktivieren, das Eingaben und ausgelöste Events in der Terminal-Sitzung protokolliert; `adv debug show` gibt die letzten Einträge aus.

## Endpunkte

- Terminal: `/`
- Adventure Builder: `/adventurebuilder/`
- Content Builder/API: `/content-builder/`
- Darknet-Chat Backend: `/content-builder/api/chat.php`

## AI Assist (optional)

- Die AI-Unterstützung für den Adventure Builder ist per `.env` steuerbar (`DARKNET_AI_ENABLED=1`).
- Der OpenAI API Key (`OPENAI_API_KEY`) bleibt ausschließlich im Backend; Beispiele stehen in `.env-sample`.
- Backend-Proxy: `/adventurebuilder/api/ai.php` (liefert 403, falls das Feature deaktiviert ist).
