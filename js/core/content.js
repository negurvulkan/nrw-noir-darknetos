// ---------------------------------------------------------
// CONTENT – Index, Dokumente, Banner, Boot, Scan, Tree
// ---------------------------------------------------------

// Banner (ASCII-Art) aus banner.txt laden
async function loadBanner() {
  try {
    const res = await fetch("banner.txt");

    if (!res.ok) {
      return null;
    }

    const text = await res.text();
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    return lines;
  } catch (err) {
    return null;
  }
}

// Auto-Skalierung für ASCII-Banner
function autoScaleBanner(lines) {
  if (!lines || !lines.length) return;

  const longest = Math.max(...lines.map(l => l.length));
  if (longest < 1) return;

  const container = outputEl;
  const rect = container.getBoundingClientRect();
  const maxWidth = rect.width * 0.70;

  const test = document.createElement("span");
  test.style.visibility = "hidden";
  test.style.position = "absolute";
  test.style.whiteSpace = "pre";
  test.style.fontFamily = getComputedStyle(container).fontFamily;
  test.textContent = "M".repeat(longest);

  const baseSize = 10;
  test.style.fontSize = baseSize + "px";

  document.body.appendChild(test);
  const measuredWidth = test.getBoundingClientRect().width;
  document.body.removeChild(test);

  if (!measuredWidth || measuredWidth <= 0) return;

  let size = baseSize * (maxWidth / measuredWidth);
  const minSize = 0.3;
  const maxSize = 9;
  size = Math.max(minSize, Math.min(maxSize, size));

  document.documentElement.style
    .setProperty("--banner-font-size", size + "px");
}

const CONTENT_SCAN_URL = '/content-builder/api/scan.php';

// Index laden & Filesystem aufbauen (Auto-Scan via scan.php)
async function loadFileIndex() {
  try {
    const res = await fetch(CONTENT_SCAN_URL);
    const data = await res.json();

    if (!data.ok) {
      printLines([
        "Fehler beim Laden der JSON-Dateien (scan.php).",
        String(data.error || ""),
        ""
      ], "error");
      return;
    }

    FILE_INDEX = {};
    FS_NODES   = {};

    data.files.forEach(entry => {
      // entry: { path, file, title, password }
      let path = (entry.path || "").replace(/^\/+/, ""); // "events/night-zero"
      if (!path) return;

      // Command automatisch aus letztem Pfadsegment
      const commandBase = path.split("/").slice(-1)[0];
      const command = commandBase.toLowerCase().replace(/[^a-z0-9]/g, "");

      const meta = {
        path,
        file: entry.file,           // z.B. "events/night-zero.json"
        title: entry.title || null,
        password: entry.password || null
      };

      // Virtuelles FS
      FS_NODES[path] = meta;

      // Command-Index (falls doppelt, gewinnt der zuletzt geladene Eintrag)
      FILE_INDEX[command] = meta;
    });

  } catch (err) {
    printLines([
      "Fehler beim Parsen der JSON-Dateien:",
      String(err),
      ""
    ], "error");
  }
}

// Dokument (JSON) laden + optional Passwort prüfen
async function loadDocumentByMeta(meta) {
  if (!meta || !meta.file) {
    return ["Ungültiger Eintrag.", ""];
  }

  try {
    const res = await fetch("content/" + meta.file);
    const doc = await res.json();

    const path = doc.path || meta.path || "unknown";

    // Passwort aus Datei oder Meta
    const pw = doc.password || meta.password || null;
    if (pw) {
      const entered = window.prompt(
        `Passwort für ${path} eingeben (oder abbrechen):`
      );
      if (entered !== pw) {
        return [
          `Zugriff verweigert für '${path}'.`,
          "Hinweis: Falsches Passwort oder falsches Ritual.",
          ""
        ];
      }
    }

    const header = doc.title
      ? [doc.title, "-".repeat(doc.title.length)]
      : [];

    return [...header, ...(doc.lines || []), ""];

  } catch (err) {
    return [
      "Fehler beim Laden der Datei:",
      String(err),
      ""
    ];
  }
}

async function loadDocumentByCommand(command) {
  const meta = FILE_INDEX[command];
  if (!meta) {
    return [`Kein Eintrag für '${command}' gefunden.`, ""];
  }
  return await loadDocumentByMeta(meta);
}

// Fake-Boot-Sequenz
async function runBootSequence() {
  if (FILE_INDEX["boot"]) {
    const lines = await loadDocumentByCommand("boot");
    printLines(lines, "dim");
    return;
  }

  const lines = [
    "> Initialisiere NRW Noir Darknetz…",
    "> Lade Knotenpunkte…",
    "> Verbinde mit Schattennetzwerk…",
    "> Prüfe Legalität…",
    "> ✔ Verbindung stabil – schattig, aber alles legal.",
    ""
  ];

  for (const line of lines) {
    printLines([line], "dim");
    await sleep(250);
  }
}

// Fake-Scan mit Progressbar
async function runScanCommand() {
  const steps = [0, 13, 37, 58, 79, 92, 100];

  for (let i = 0; i < steps.length; i++) {
    const p = steps[i];
    const barWidth = 20;
    const filled = Math.round((p / 100) * barWidth);
    const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
    const line = `[${bar}] ${String(p).padStart(3, " ")}%  Scanne Schattenknoten…`;
    printLines([line], "dim");
    await sleep(220);
  }

  if (FILE_INDEX["scan"]) {
    const lines = await loadDocumentByCommand("scan");
    printLines(lines);
  } else {
    printLines([
      "",
      "Scan abgeschlossen.",
      "Keine feindlichen Knoten gefunden – nur melancholische Signale.",
      ""
    ], "success");
  }
}

// TREE-Ausgabe
function buildTreeLines(dirSegments) {
  const lines = [];
  const startLabel = dirSegments.length === 0 ? "/" : segmentsToPath(dirSegments);

  lines.push(startLabel);
  renderTree(dirSegments, "  ", lines);
  lines.push("");
  return lines;
}

function renderTree(dirSegments, indent, lines) {
  const { dirs, files } = getChildrenOfDir(dirSegments);

  dirs.sort().forEach(dName => {
    lines.push(indent + dName + "/");
    renderTree(dirSegments.concat(dName), indent + "  ", lines);
  });

  files
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(f => {
      lines.push(indent + f.name);
    });
}