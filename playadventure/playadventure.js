import adventure from "../js/games/adventure/engine/core.js"; 
// ↑ Pfad ggf. anpassen

const output = document.getElementById("output");
const statusEl = document.getElementById("status");
const advSelect = document.getElementById("advSelect");

const dirChips = document.getElementById("dirChips");
const verbChips = document.getElementById("verbChips");
const ctxChips = document.getElementById("ctxChips");

const btnStart = document.getElementById("btnStart");
const btnContinue = document.getElementById("btnContinue");
const btnReset = document.getElementById("btnReset");

const freeInput = document.getElementById("freeInput");
const btnSend = document.getElementById("btnSend");

// ==== WICHTIG: Engine-UI erwartet outputEl / printLines global ====
window.outputEl = output;

window.printLines = function (lines = [], cls) {
  const arr = Array.isArray(lines) ? lines : [String(lines)];
  arr.forEach((line) => {
    const div = document.createElement("div");
    div.textContent = line;
    if (cls) div.className = cls;
    output.appendChild(div);
  });
  output.scrollTop = output.scrollHeight;
};

function setStatus(msg, isErr = false) {
  statusEl.innerHTML = isErr ? `<span class="err">${msg}</span>` : msg;
}

// ==== API (Adventure Builder Flat-File) ====
// Pfad ggf. anpassen:
// Wenn api.php z.B. unter /darknet/js/games/adventure/builder/api.php liegt:
const API_URL = "../adventurebuilder/api/api.php";

async function api(action, params = {}) {
  const url = new URL(API_URL, window.location.href);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok || data?.error) throw new Error(data?.error || "API Fehler");
  return data;
}

// Fallback ohne api.php: direkt index.json (Pfad aus config.js)【:contentReference[oaicite:3]{index=3}】
const INDEX_JSON = "/darknet/js/games/adventure/adventures/index.json";

// ==== Daten-Cache für Button-Context ====
let advData = null; // { adventure:{id}, data:{ rooms/items/objects/npcs... } }
let currentAdventureId = null;

function normalizeId(s) {
  return (s || "").toLowerCase().trim()
    .replace(/\s+/g, "_")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

function getRoomById(roomId) {
  const rid = normalizeId(roomId);
  const rooms = advData?.data?.rooms || [];
  return rooms.find(r => normalizeId(r.id) === rid) || null;
}

function labelOf(entry, fallback) {
  return entry?.name || entry?.title || entry?.label || fallback;
}

function clear(el){ el.innerHTML = ""; }

function addChip(el, text, onClick, cls = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `chip ${cls}`.trim();
  b.textContent = text;
  b.addEventListener("click", onClick);
  el.appendChild(b);
}

async function send(cmd) {
  if (!cmd) return;
  // optional: echo (nice UX)
  window.printLines([`> ${cmd}`], "dim");

  await adventure.handleInput(cmd); // Engine nimmt Text entgegen【:contentReference[oaicite:4]{index=4}】
  refreshContextButtons();
}

function buildStaticButtons() {
  clear(dirChips);
  clear(verbChips);

  const dirs = [
    ["n", "geh nord"], ["s", "geh sued"], ["o", "geh ost"], ["w", "geh west"],
    ["up", "geh hoch"], ["down", "geh runter"]
  ];
  dirs.forEach(([label, cmd]) => addChip(dirChips, label, () => send(cmd), "dir"));

  const verbs = [
    ["look", "schau"],      // je nach Parser: "look" oder "schau"/"sieh"
    ["inv", "inventar"],
    ["help", "hilfe"],
    ["take", "nimm "],
    ["use", "benutze "],
    ["talk", "sprich mit "],
    ["inspect", "untersuche "],
  ];
  verbs.forEach(([label, cmd]) => addChip(verbChips, label, () => {
    // Für Verben mit Objekt-Suffix tippen wir ins Eingabefeld vor
    if (cmd.endsWith(" ")) {
      freeInput.value = cmd;
      freeInput.focus();
    } else {
      send(cmd);
    }
  }, "verb"));
}

function refreshContextButtons() {
  clear(ctxChips);

  const state = adventure.getState?.();
  if (!state || !advData) return;

  const room = getRoomById(state.location);
  if (!room) return;

  // Exits
  const exits = room.exits || room.connections || {};
  Object.keys(exits).forEach((dir) => {
    addChip(ctxChips, `➡ ${dir}`, () => send(`geh ${dir}`));
  });

  // Items im Raum
  (room.items || []).forEach((itemId) => {
    addChip(ctxChips, `📦 ${itemId}`, () => send(`nimm ${itemId}`));
  });

  // Objekte im Raum
  (room.objects || []).forEach((objId) => {
    addChip(ctxChips, `🔎 ${objId}`, () => send(`untersuche ${objId}`));
    addChip(ctxChips, `🛠 ${objId}`, () => send(`benutze ${objId}`));
  });

  // NPCs im Raum
  (room.npcs || []).forEach((npcId) => {
    addChip(ctxChips, `🗣 ${npcId}`, () => send(`sprich mit ${npcId}`));
  });

  // Inventory quick chips
	(state.inventory || []).forEach((entry) => {
	  const id  = entry.id || entry.item;
	  const qty = entry.qty ?? 1;
	  if (!id) return;

	  const label = qty > 1 ? `🎒 ${id} ×${qty}` : `🎒 ${id}`;

	  addChip(ctxChips, label, () => {
		freeInput.value = `benutze ${id}`;
		freeInput.focus();
	  });
	});
}

async function loadAdventureList() {
  setStatus("Lade Adventures…");
  let list = [];

  // 1) Erst api.php probieren (sauber, weil egal wo index.json liegt)
  try {
    const data = await api("list_adventures");
    list = Array.isArray(data.adventures) ? data.adventures : [];
  } catch {
    // 2) Fallback: index.json direkt
    const res = await fetch(INDEX_JSON);
    const data = await res.json();
    list = Array.isArray(data) ? data : (Array.isArray(data.adventures) ? data.adventures : []);
  }

  if (!list.length) {
    advSelect.innerHTML = `<option value="">(keine Adventures)</option>`;
    setStatus("Keine Adventures gefunden.", true);
    return;
  }
	
  if (typeof adventure.setAdventureIndex === "function") {
  	adventure.setAdventureIndex(list);
  }
  advSelect.innerHTML = "";
  list.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = a.title ? `${a.id} — ${a.title}` : a.id;
    advSelect.appendChild(opt);
  });

  // default markieren
  const def = list.find(a => a.default) || list[0];
  advSelect.value = def.id;

  setStatus(`Adventures geladen: ${list.length}`);
}

async function loadSelectedAdventureData() {
  const id = advSelect.value;
  if (!id) return;

  setStatus(`Lade Adventure-Daten: ${id} …`);

  // wir holen *komplette* Daten via api.php, damit Buttons wissen, was im Raum ist
  const data = await api("load_adventure", { id });
  advData = data;
  currentAdventureId = id;

  setStatus(`Bereit: ${id}`);
}

async function startSelected(mode = "start") {
  const id = advSelect.value;
  if (!id) return;

  // erst Daten holen, dann Engine starten
  await loadSelectedAdventureData();

  // Output etwas “cleaner”
  output.innerHTML = "";

  if (mode === "continue") await adventure.continue(id);
  else if (mode === "reset") await adventure.reset(id);
  else await adventure.start(id);

  refreshContextButtons();
}

// ==== Events ====
advSelect.addEventListener("change", async () => {
  try {
    await loadSelectedAdventureData();
    refreshContextButtons();
  } catch (e) {
    setStatus(e.message, true);
  }
});

btnStart.addEventListener("click", () => startSelected("start"));
btnContinue.addEventListener("click", () => startSelected("continue"));
btnReset.addEventListener("click", () => startSelected("reset"));

btnSend.addEventListener("click", () => {
  const cmd = freeInput.value.trim();
  freeInput.value = "";
  send(cmd);
});

freeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    btnSend.click();
  }
});

// ==== Init ====
buildStaticButtons();
loadAdventureList()
  .then(loadSelectedAdventureData)
  .then(refreshContextButtons)
  .catch(e => setStatus(e.message, true));
