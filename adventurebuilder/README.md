# NRW Noir Adventure Engine

**Version:** 1.5.0

## Features des Adventure Builders
- **Dashboard für Adventures:** Adventures auflisten, anlegen, bearbeiten, duplizieren und direkt aus dem Builder öffnen.
- **WYSIWYG-Welteditor:** Räume, Items, Objekte und NPCs erstellen oder bearbeiten, inklusive Karten-Navigation, ASCII-Vorschau und skalierbarer Raumkarte.
- **Dialog- und NPC-Tools:** NPC-Sammlungen automatisch bereitstellen, Dialogzustände initialisieren und Dialoge mit Karten-Visualisierung bearbeiten.
- **NPC- und Dialog-API:** NPC-Daten und Dialogbäume werden beim Laden und Speichern durch die API berücksichtigt.
- **Enemy-Management:** Gegner können im Builder angelegt, editiert und mit ASCII-Art, Stats, Drops sowie Event-Ketten versehen werden.
- **Gegenstandsbasierte Beute:** Gegner-Drops wählen jetzt reguläre Items aus der Adventure-Itemliste und landen als vollwertige Inventarobjekte.
- **Kampf-taugliche Items:** Items lassen sich mit Angriffs- und Verteidigungswerten versehen und im Kampf als Waffen einsetzen.
- **Event-Block-Editor:** Blockly-basierter Editor zum visuellen Erstellen der Eventketten, die in den Adventures ausgeführt werden.
- **Adventure-Tests im Browser:** Aktuelles Adventure mit einem Klick im Terminal-Modus öffnen, um Änderungen direkt zu prüfen.
- **ASCII-Upload:** ASCII-Dateien hochladen und im Builder verwalten, damit Räume sofort passende Artworks erhalten.
- **Neue Demo-Adventure:** "Schatten der Domruine" als gotisches Beispiel mit Krypta, Turm, NPC-Dialogen, Gegnern und Beute.
- **Optionaler AI Assist:** Vorschläge für Namen, Beschreibungen, Event-Ketten und Plot-Hooks direkt im Builder erzeugen (via OpenAI und serverseitigem Proxy mit Feature Flag).

## AI Assist konfigurieren

- `.env` im Projekt-Root steuert die Verfügbarkeit (`DARKNET_AI_ENABLED=1`) und enthält den `OPENAI_API_KEY`.
- Beispiel-Variablen liegen in `.env-sample` und können kopiert werden.
- Ist das Feature deaktiviert, bleiben die Buttons im Builder ausgegraut und der API-Endpunkt liefert 403.
