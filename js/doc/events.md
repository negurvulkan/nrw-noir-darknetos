# NRW Noir Adventure Engine

## **Event-System – Dokumentation & Cheatsheet**

Das Event-System ist das Herzstück des Textadventures.
Mit Events steuerst du:

* Narrative Texte
* ASCII-Anzeigen
* Puzzle-Logik
* Flag-Abfragen
* Objekt-Interaktionen
* Kampfstart
* Raumwechsel
* Dynamische Ausgänge (öffnen/schließen)
* Inventar-Änderungen

Events werden immer als **JSON-Array** geschrieben.
Jede Zeile wird in Reihenfolge ausgeführt.

---

# **1. Event-Grundstruktur**

Ein Event ist immer ein Objekt:

```json
{ "type": "event_typ", ...weitere_felder }
```

Mehrere Events in Reihe:

```json
[
  { "type": "message", "text": "Ein kalter Wind streicht über deine Haut." },
  { "type": "flag_set", "key": "wind_aktiv", "value": true }
]
```

---

# **2. Komplettes Cheatsheet – alle Eventtypen auf einen Blick**

| Eventtyp          | Beschreibung                          | Beispiel                                                          |
| ----------------- | ------------------------------------- | ----------------------------------------------------------------- |
| **message**       | Text im Adventure ausgeben            | `{ "type": "message", "text": "Es knistert im Dunkeln." }`        |
| **ascii**         | ASCII-Datei anzeigen                  | `{ "type": "ascii", "file": "villa.txt" }`                        |
| **flag_set**      | Flag setzen/ändern                    | `{ "type": "flag_set", "key": "lampe_aktiv", "value": true }`     |
| **flag_if**       | Bedingung mit then/else               | siehe Beispiel unten                                              |
| **add_item**      | Item ins Inventar                     | `{ "type": "add_item", "id": "oellampe" }`                        |
| **remove_item**   | Item aus Inventar entfernen           | `{ "type": "remove_item", "id": "oellampe" }`                     |
| **unlock_exit**   | Ausgang in Raum öffnen                | `{ "type": "unlock_exit", "room": "villa", "direction": "nord" }` |
| **lock_exit**     | Ausgang schließen                     | `{ "type": "lock_exit", "room": "villa", "direction": "nord" }`   |
| **transition**    | Spieler in anderen Raum teleportieren | `{ "type": "transition", "to": "villa_vorhof" }`                  |
| **trigger_fight** | Kampf starten                         | `{ "type": "trigger_fight", "enemy": "geist" }`                   |

---

# 🧠 **3. Ausführliche Beispiele**

---

## MESSAGE – Erzählertext anzeigen

```json
{ 
  "type": "message", 
  "text": "Eine leise Stimme flüstert deinen Namen..." 
}
```

---

## ASCII – ASCII-Art laden

```json
{
  "type": "ascii",
  "file": "eingangshalle.txt"
}
```

ASCII-Dateien liegen üblicherweise unter:

```
adventures/<name>/ascii/
```

---

## FLAG_SET – Flags setzen

Flags sind Variablen, die du überall verwenden kannst.

```json
{
  "type": "flag_set",
  "key": "konsole_aktiv",
  "value": true
}
```

---

## FLAG_IF – Bedingte Logik

Mit `flag_if` kannst du Storyverläufe steuern:

```json
{
  "type": "flag_if",
  "key": "konsole_aktiv",
  "equals": true,
  "then": [
    { "type": "message", "text": "Die Konsole reagiert sofort und erwacht zum Leben." }
  ],
  "else": [
    { "type": "message", "text": "Nichts passiert. Vielleicht fehlt ihr Strom." }
  ]
}
```

---

## ADD_ITEM – Item aufnehmen

```json
{
  "type": "add_item",
  "id": "schluesselkarte"
}
```

---

## REMOVE_ITEM – Item entfernen

```json
{
  "type": "remove_item",
  "id": "schluesselkarte"
}
```

---

## UNLOCK_EXIT – Ausgang freischalten (klassisches Puzzle)

```json
{
  "type": "unlock_exit",
  "room": "eingangshalle",
  "direction": "nord"
}
```

Damit kann der Spieler nun `nord` gehen — vorher war der Weg blockiert.

---

## LOCK_EXIT – Ausgang blockieren

```json
{
  "type": "lock_exit",
  "room": "untergeschoss",
  "direction": "west"
}
```

---

## TRANSITION – Spieler in neuen Raum versetzen

Praktisch für Fallen, Teleporter oder Skripte:

```json
{
  "type": "transition",
  "to": "geheimraum"
}
```

---

## TRIGGER_FIGHT – Kampf starten

```json
{
  "type": "trigger_fight",
  "enemy": "waldgeist"
}
```

---

# 🔧 **4. Typische Event-Kombinationen (fertige Rezepte)**

---

### **Item aufnehmen + Nachricht**

```json
[
  { "type": "message", "text": "Du greifst vorsichtig nach der Karte." },
  { "type": "add_item", "id": "zerknuellte_karte" }
]
```

---

### **Tür öffnen, wenn Spieler Schlüssel besitzt**

```json
{
  "type": "flag_if",
  "key": "tuer_geoeffnet",
  "equals": false,
  "then": [
    { "type": "message", "text": "Die Tür klickt und öffnet sich." },
    { "type": "unlock_exit", "room": "villa_vorhof", "direction": "nord" },
    { "type": "flag_set", "key": "tuer_geoeffnet", "value": true }
  ],
  "else": [
    { "type": "message", "text": "Die Tür ist bereits offen." }
  ]
}
```

---

### **Belohnung + Teleport**

```json
[
  { "type": "message", "text": "Ein grelles Licht blendet dich..." },
  { "type": "add_item", "id": "kristall" },
  { "type": "transition", "to": "heiligtum" }
]
```

---

### **Trick: Event-Chains für Mini-Cutscenes**

```json
[
  { "type": "message", "text": "Du hörst ein tiefes Grollen." },
  { "type": "ascii", "file": "boss_unerwacht.txt" },
  { "type": "trigger_fight", "enemy": "sumpfbestie" }
]
```

---

# **5. Best Practices**

### Struktur klar halten

Schreibe Events lieber in mehrere kleine Events statt in große Monster-Blöcke.

### Flags immer sinnvoll benennen

`lampe_aktiv` statt `flag_12`.

### Räume und ASCII-Dateien konsistent benennen

→ erleichtert Debugging und Builder-Integrationen.

### Combine-Events nutzen!

Kombinationen sind mächtige Puzzle-Tools.

### Nach komplexen Sequenzen `transition` nutzen

Damit bleibt der Flow dynamisch.

---

# Bonus: Minimal-Event-Template zum Einfügen

```json
[
  { "type": "message", "text": "TEXT HIER" },
  { "type": "add_item", "id": "ITEM_ID" },
  { "type": "flag_set", "key": "FLAGNAME", "value": true },
  { "type": "unlock_exit", "room": "RAUM_ID", "direction": "nord" }
]
