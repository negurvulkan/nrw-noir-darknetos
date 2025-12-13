# NRW Noir Adventure Engine

**Version:** 1.11.0

## Features des Adventure Builders
- **Dashboard für Adventures:** Adventures auflisten, anlegen, bearbeiten, duplizieren und direkt aus dem Builder öffnen.
- **WYSIWYG-Welteditor:** Räume, Items, Objekte und NPCs erstellen oder bearbeiten, inklusive Karten-Navigation, ASCII-Vorschau und skalierbarer Raumkarte.
- **Dialog- und Actor-Tools:** Actors (NPCs & Gegner) teilen sich Sidebar und Editor; Dialogzustände werden weiter automatisch bereitgestellt und Dialoge lassen sich mit Karten-Visualisierung bearbeiten.
- **Actor-Collection & API:** NPCs und Gegner nutzen eine gemeinsame `actors`-Sammlung samt Typ-Feld; Laden/Speichern und Hooks laufen über die konsolidierte Struktur.
- **Actor-API mit Legacy-Wrappern:** Direkte Endpunkte für Actors (listen, laden, speichern, löschen) inklusive Rückwärtskompatibilität für alte NPC/Enemy-Aufrufe und Zusammenführung historischer Verzeichnisse beim Laden.
- **Enemy-Management:** Gegner können im Builder angelegt, editiert und mit ASCII-Art, Stats, Drops sowie Event-Ketten versehen werden.
- **Feingranulare Gegner-Hooks:** On Attack/Hit/Miss/Defeat können als Eventketten im Enemy-Editor gepflegt werden (Blockly-UI).
- **Gegenstandsbasierte Beute:** Gegner-Drops wählen jetzt reguläre Items aus der Adventure-Itemliste und landen als vollwertige Inventarobjekte.
- **Kampf-taugliche Items:** Items lassen sich mit Angriffs- und Verteidigungswerten versehen und im Kampf als Waffen einsetzen.
- **Item-Stacks & Mengen:** Inventare verwalten stapelbare Items mit Mengen, Einheiten und Max-Stack; Events und Blockly unterstützen optionale Mengenfelder.
- **Event-Block-Editor:** Blockly-basierter Editor zum visuellen Erstellen der Eventketten, die in den Adventures ausgeführt werden.
- **Adventure-Tests im Browser:** Aktuelles Adventure mit einem Klick im Terminal-Modus öffnen, um Änderungen direkt zu prüfen.
- **ASCII-Upload:** ASCII-Dateien hochladen und im Builder verwalten, damit Räume sofort passende Artworks erhalten.
- **Neue Demo-Adventure:** "Schatten der Domruine" als gotisches Beispiel mit Krypta, Turm, NPC-Dialogen, Gegnern und Beute.
- **Optionaler AI Assist:** Vorschläge für Namen, Beschreibungen, Event-Ketten und Plot-Hooks direkt im Builder erzeugen (via OpenAI und serverseitigem Proxy mit Feature Flag).
- **Crafting Light:** Kombinations-Rezepte mit Inputs, Tools, Stationen und Event-Ketten direkt im Item-Editor pflegen; On-Combine-Hooks lassen sich für Sonderaktionen definieren.

## AI Assist konfigurieren

- `.env` im Projekt-Root steuert die Verfügbarkeit (`DARKNET_AI_ENABLED=1`) und enthält den `OPENAI_API_KEY`.
- Beispiel-Variablen liegen in `.env-sample` und können kopiert werden.
- Ist das Feature deaktiviert, bleiben die Buttons im Builder ausgegraut und der API-Endpunkt liefert 403.
- `OPENAI_MAX_OUTPUT_TOKENS` steuert die Begrenzung der OpenAI-Antwort (verwendet als `max_tokens` beim API-Call).
