<?php
// builder.php – NRW Noir Darknetz JSON File Builder + API

// === KONFIGURATION ===================================================
$CONTENT_DIR = __DIR__ . '/content';  // Zielordner für JSON-Dateien

// Hilfsfunktionen
function json_response($data, $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

function sanitize_relpath($rel) {
    // keine absoluten Pfade, keine .., nur „normale“ Zeichen + / + -
    $rel = trim($rel);
    $rel = str_replace("\\", "/", $rel);
    $rel = preg_replace('#/+#', '/', $rel);
    if (str_starts_with($rel, '/')) {
        $rel = substr($rel, 1);
    }
    if (str_contains($rel, '..')) {
        return null;
    }
    return $rel;
}

function ensure_json_extension($fileName) {
    if (!str_ends_with(strtolower($fileName), '.json')) {
        $fileName .= '.json';
    }
    return $fileName;
}

function scan_content_dir($baseDir, $relBase = '') {
    $result = [];
    if (!is_dir($baseDir)) {
        return $result;
    }

    foreach (scandir($baseDir) as $item) {
        if ($item === '.' || $item === '..') continue;

        $full = $baseDir . '/' . $item;
        $rel  = ltrim($relBase . '/' . $item, '/');

        if (is_dir($full)) {
            $result = array_merge($result, scan_content_dir($full, $rel));
        } elseif (is_file($full) && preg_match('/\.json$/i', $item)) {
            $raw  = file_get_contents($full);
            $json = json_decode($raw, true);
            $path = null;

            if (is_array($json) && isset($json['path'])) {
                $path = $json['path'];
            } else {
                $path = preg_replace('/\.json$/i', '', $rel);
            }
            $path = ltrim($path, '/');

            $meta = isset($json['meta']) && is_array($json['meta']) ? $json['meta'] : [];

            $result[] = [
                'file'       => $rel,                 // z.B. events/night-zero.json
                'path'       => $path,               // z.B. events/night-zero
                'title'      => $json['title'] ?? null,
                'password'   => $json['password'] ?? null,
                'linesCount' => isset($json['lines']) && is_array($json['lines'])
                                ? count($json['lines'])
                                : 0,
                'mtime'      => filemtime($full),
                'meta'       => [
                    'type'       => $meta['type']       ?? null,
                    'visibility' => $meta['visibility'] ?? null,
                    'owner'      => $meta['owner']      ?? null
                ]
            ];
        }
    }

    usort($result, function($a, $b) {
        return strcmp($a['path'], $b['path']);
    });

    return $result;
}

// === API-MODUS =======================================================

if (isset($_GET['api'])) {
    $action = $_GET['action'] ?? '';

    if ($action === 'list') {
        $files = scan_content_dir($CONTENT_DIR);
        json_response(['ok' => true, 'files' => $files]);
    }

    if ($action === 'load') {
        $rel = $_GET['file'] ?? '';
        $rel = sanitize_relpath($rel);
        if (!$rel) {
            json_response(['ok' => false, 'error' => 'Ungültiger Dateipfad.'], 400);
        }
        $full = $CONTENT_DIR . '/' . $rel;
        if (!is_file($full)) {
            json_response(['ok' => false, 'error' => 'Datei nicht gefunden.'], 404);
        }
        $raw = file_get_contents($full);
        $json = json_decode($raw, true);
        if ($json === null) {
            json_response(['ok' => false, 'error' => 'Fehler beim Parsen der JSON-Datei.'], 500);
        }
        json_response(['ok' => true, 'file' => $rel, 'data' => $json]);
    }

    if ($action === 'save') {
        $input = json_decode(file_get_contents('php://input'), true);
        if (!$input) {
            json_response(['ok' => false, 'error' => 'Keine oder ungültige JSON-Daten.'], 400);
        }

        $fileRel = $input['file'] ?? '';
        $doc     = $input['doc']  ?? null;

        if (!$doc || !is_array($doc)) {
            json_response(['ok' => false, 'error' => 'Fehlendes oder ungültiges Dokument.'], 400);
        }

        $fileRel = sanitize_relpath($fileRel);
        if (!$fileRel) {
            json_response(['ok' => false, 'error' => 'Ungültiger Dateiname.'], 400);
        }
        $fileRel = ensure_json_extension($fileRel);

        $full = $CONTENT_DIR . '/' . $fileRel;

        // ggf. Verzeichnisse anlegen
        $dir = dirname($full);
        if (!is_dir($dir)) {
            if (!mkdir($dir, 0775, true) && !is_dir($dir)) {
                json_response(['ok' => false, 'error' => 'Konnte Verzeichnis nicht anlegen.'], 500);
            }
        }

        // Minimales Schema sicherstellen
        $path     = isset($doc['path']) ? trim($doc['path']) : '';
        $title    = isset($doc['title']) ? $doc['title'] : '';
        $password = $doc['password'] ?? null;
        $lines    = $doc['lines'] ?? [];
        $meta     = isset($doc['meta']) && is_array($doc['meta']) ? $doc['meta'] : [];

        if (!is_array($lines)) {
            $lines = [];
        }

        // Meta normalisieren
        $nowIso = date('c');

        if (empty($meta['created_at'])) {
            $meta['created_at'] = $nowIso;
        }
        $meta['updated_at'] = $nowIso;

        if (!empty($meta['tags']) && is_string($meta['tags'])) {
            $tags = array_map('trim', explode(',', $meta['tags']));
            $tags = array_values(array_filter($tags, fn($t) => $t !== ''));
            $meta['tags'] = $tags;
        } elseif (!isset($meta['tags']) || !is_array($meta['tags'])) {
            $meta['tags'] = [];
        }

        $out = [
            'path'     => $path,
            'title'    => $title,
            'password' => $password !== '' ? $password : null,
            'meta'     => $meta,
            'lines'    => $lines
        ];

        $json = json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            json_response(['ok' => false, 'error' => 'Fehler beim JSON-Encode.'], 500);
        }

        if (file_put_contents($full, $json) === false) {
            json_response(['ok' => false, 'error' => 'Fehler beim Schreiben der Datei.'], 500);
        }

        json_response(['ok' => true, 'file' => $fileRel]);
    }

    json_response(['ok' => false, 'error' => 'Unbekannte Aktion.'], 400);
}

// === HTML-GUI ========================================================

?><!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>NRW Noir Darknetz – JSON File Builder (Server)</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      --bg: #050308;
      --panel: #140c20;
      --panel-alt: #1b112b;
      --border: #3a244d;
      --accent: #c563ff;
      --accent-soft: #ff86ff;
      --text: #f5f2ff;
      --text-dim: #a78bd2;
      --danger: #ff4f9a;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      padding: 16px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: radial-gradient(circle at top, #251037 0, #050308 55%);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: stretch;
    }

    .app {
      width: 100%;
      max-width: 1250px;
      background: #07030f;
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 0 40px #000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .header {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(90deg, #140c20, #1e1431);
      font-size: 13px;
      color: var(--text-dim);
    }

    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .dot.red    { background: #ff5f57; }
    .dot.yellow { background: #febc2e; }
    .dot.green  { background: #28c840; }

    .title {
      margin-left: 8px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .body {
      display: grid;
      grid-template-columns: 260px minmax(0, 1.1fr) minmax(0, 1fr);
      min-height: 520px;
    }

    .panel {
      padding: 14px;
      border-right: 1px solid var(--border);
    }

    .panel:last-child {
      border-right: none;
    }

    .panel-left {
      background: #070311;
    }

    .panel-center {
      background: var(--panel);
    }

    .panel-right {
      background: var(--panel-alt);
    }

    h2 {
      margin: 0 0 6px;
      font-size: 15px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--accent-soft);
    }

    .subtitle {
      font-size: 11px;
      color: var(--text-dim);
      margin-bottom: 10px;
    }

    label {
      display: block;
      font-size: 11px;
      margin: 8px 0 4px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    input[type="text"],
    select,
    textarea {
      width: 100%;
      background: #12081f;
      border-radius: 8px;
      border: 1px solid #3a244d;
      padding: 7px 8px;
      color: var(--text);
      font-family: inherit;
      font-size: 12px;
      outline: none;
      transition: border 0.15s, box-shadow 0.15s, background 0.15s;
    }

    input[type="text"]:focus,
    select:focus,
    textarea:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px rgba(197, 99, 255, 0.4);
      background: #190b2a;
    }

    textarea {
      min-height: 150px;
      resize: vertical;
      font-family: "Fira Code","JetBrains Mono",ui-monospace,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre;
    }

    .field-row {
      display: flex;
      gap: 8px;
    }

    .field-row > div {
      flex: 1;
    }

    .hint {
      font-size: 10px;
      color: var(--text-dim);
      margin-top: 2px;
    }

    button {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 5px 10px;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      background: #190b2a;
      color: var(--text);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: background 0.15s, border 0.15s, transform 0.05s;
    }

    button.primary {
      border-color: var(--accent);
      background: linear-gradient(135deg, #c563ff, #ff86ff);
      color: #060109;
    }

    button:hover {
      transform: translateY(-1px);
      border-color: var(--accent-soft);
    }

    button:active {
      transform: translateY(0);
    }

    .md-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 4px 0 6px;
    }

    .md-btn {
      padding: 3px 8px;
      font-size: 10px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: #1b0f2a;
      color: var(--text-dim);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .md-btn span {
      font-size: 11px;
    }

    .md-btn:hover {
      border-color: var(--accent-soft);
      color: var(--accent-soft);
      transform: translateY(-1px);
    }

    .md-btn:active {
      transform: translateY(0);
    }

    .file-list {
      border-radius: 10px;
      border: 1px solid #3a244d;
      padding: 6px;
      background: #090313;
      font-size: 11px;
      max-height: 420px;
      overflow: auto;
    }

    .file-item {
      padding: 5px 6px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 1px;
      margin-bottom: 2px;
    }

    .file-item:hover {
      background: rgba(197, 99, 255, 0.15);
    }

    .file-item.active {
      background: rgba(197, 99, 255, 0.3);
      border-left: 2px solid var(--accent-soft);
    }

    .file-path {
      font-family: "Fira Code", monospace;
      font-size: 11px;
    }

    .file-meta {
      font-size: 10px;
      color: var(--text-dim);
    }

    .preview {
      background: #0b0416;
      border-radius: 10px;
      border: 1px solid #3a244d;
      padding: 9px;
      font-family: "Fira Code", monospace;
      font-size: 11px;
      color: var(--text);
      overflow: auto;
      max-height: 400px;
      white-space: pre;
    }

    .status-bar {
      padding: 6px 12px;
      border-top: 1px solid var(--border);
      font-size: 11px;
      color: var(--text-dim);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #05020d;
    }

    .status-bar span strong {
      color: var(--accent-soft);
    }

    .status-bar .error {
      color: var(--danger);
    }

    #lines[readonly] {
      background: #0f051a;
      opacity: 0.8;
      cursor: not-allowed;
    }

    .meta-timestamp {
      font-size: 11px;
      color: var(--text-dim);
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid #3a244d;
      background: #12081f;
      min-height: 28px;
      display: flex;
      align-items: center;
    }

    @media (max-width: 1000px) {
      .body {
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
      }
      .panel-left {
        display: none;
      }
    }

    @media (max-width: 800px) {
      .body {
        grid-template-columns: minmax(0, 1fr);
      }
      .panel-center {
        border-right: none;
        border-bottom: 1px solid var(--border);
      }
    }
  </style>
</head>
<body>
<div class="app">
  <div class="header">
    <div class="dot red"></div>
    <div class="dot yellow"></div>
    <div class="dot green"></div>
    <div class="title">NRW NOIR DARKNETZ · JSON FILE BUILDER (SERVER)</div>
  </div>

  <div class="body">
    <div class="panel panel-left">
      <h2>Dateien</h2>
      <div class="subtitle">
        JSON-Dateien aus <code>/content</code>.<br>
        Klick zum Laden, Speichern überschreibt diese Datei.
      </div>
      <div style="margin-bottom:6px;">
        <button id="btn-reload-list">Neu laden</button>
      </div>
      <div id="file-list" class="file-list">
        <div style="font-size:11px; color:var(--text-dim);">
          Lade Dateiliste…
        </div>
      </div>
    </div>

    <div class="panel panel-center">
      <h2>Dokument</h2>
      <div class="subtitle">
        Baue oder bearbeite hier einen Darknetz-Content-Block.
      </div>

      <label for="path">Path</label>
      <input id="path" type="text" placeholder="z.B. events/night-zero">
      <div class="hint">Virtueller Pfad (für <code>cat events/night-zero</code>, <code>ls</code>, <code>tree</code> …)</div>

      <label for="title">Titel</label>
      <input id="title" type="text" placeholder="z.B. NIGHT ZERO – 30. Januar 2026 – Indie Duisburg">

      <div class="field-row">
        <div>
          <label for="password">Passwort (optional)</label>
          <input id="password" type="text" placeholder="leer lassen für öffentlich">
        </div>
        <div>
          <label for="filename">Dateipfad (rel. zu /content)</label>
          <input id="filename" type="text" placeholder="z.B. events/night-zero.json">
          <div class="hint">Verzeichnisse werden bei Bedarf angelegt. <code>.json</code> wird automatisch ergänzt, falls nötig.</div>
        </div>
      </div>

      <!-- META-Block -->
      <div class="field-row">
        <div>
          <label for="meta-type">Typ</label>
          <select id="meta-type">
            <option value="">(kein Typ)</option>
            <option value="event">event</option>
            <option value="doc">doc</option>
            <option value="tool">tool</option>
            <option value="lore">lore</option>
            <option value="system">system</option>
          </select>
          <div class="hint">Klassifizierung, z.B. event, doc, tool, lore, system.</div>
        </div>
        <div>
          <label for="meta-visibility">Visibility</label>
          <select id="meta-visibility">
            <option value="">(keine Angabe)</option>
            <option value="public">public</option>
            <option value="internal">internal</option>
            <option value="secret">secret</option>
          </select>
          <div class="hint">Gedachte Sichtbarkeit (für stat / Übersicht).</div>
        </div>
      </div>

      <div class="field-row">
        <div>
          <label for="meta-owner">Owner</label>
          <input id="meta-owner" type="text" placeholder="z.B. hanjo, nrw-noir, system">
        </div>
        <div>
          <label for="meta-tags">Tags</label>
          <input id="meta-tags" type="text" placeholder="z.B. event, night-zero, indie-duisburg">
          <div class="hint">Kommagetrennt, z.B. <code>event, night-zero</code>.</div>
        </div>
      </div>

      <label for="meta-description">Beschreibung</label>
      <textarea id="meta-description" placeholder="Kurzbeschreibung für stat-Output."></textarea>

      <div class="field-row">
        <div>
          <label>Created At</label>
          <div id="meta-created" class="meta-timestamp">–</div>
        </div>
        <div>
          <label>Updated At</label>
          <div id="meta-updated" class="meta-timestamp">–</div>
        </div>
      </div>

      <!-- Markdown-Block -->
      <label for="md-input">Markdown (optional)</label>
      <div class="md-toolbar">
        <button type="button" class="md-btn" data-md-action="h1"><span>H1</span></button>
        <button type="button" class="md-btn" data-md-action="h2"><span>H2</span></button>
        <button type="button" class="md-btn" data-md-action="bold"><span>Bold</span></button>
        <button type="button" class="md-btn" data-md-action="italic"><span>Italic</span></button>
        <button type="button" class="md-btn" data-md-action="ul"><span>• List</span></button>
        <button type="button" class="md-btn" data-md-action="ol"><span>1. List</span></button>
        <button type="button" class="md-btn" data-md-action="quote"><span>&gt; Quote</span></button>
        <button type="button" class="md-btn" data-md-action="hr"><span>HR</span></button>
      </div>
      <textarea id="md-input" placeholder="# Überschrift
Freier Markdown-Text.
- Bullet
- Noch einer"></textarea>
      <div class="hint">
        Der Inhalt wird automatisch in das <code>lines[]</code>-Format für das Terminal umgewandelt.
      </div>

      <label for="lines">Inhalt (Lines)</label>
      <textarea id="lines" readonly placeholder="Automatisch generiert aus Markdown."></textarea>

      <div style="margin-top:8px; display:flex; gap:6px;">
        <button id="btn-new">Neu (Form leeren)</button>
        <button id="btn-save" class="primary">Auf Server speichern</button>
      </div>
    </div>

    <div class="panel panel-right">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <div>
          <h2>JSON Preview</h2>
          <div class="subtitle">So wird die Datei auf dem Server gespeichert.</div>
        </div>
        <div style="display:flex; gap:6px;">
          <button id="btn-refresh">Preview aktualisieren</button>
          <button id="btn-copy">In Zwischenablage</button>
        </div>
      </div>
      <pre id="preview" class="preview">{ }</pre>
    </div>
  </div>

  <div class="status-bar">
    <span id="status-left">Bereit.</span>
    <span id="status-right">Darknetz File Builder v1.0</span>
  </div>
</div>

<script>
  const statusLeft  = document.getElementById("status-left");
  const statusRight = document.getElementById("status-right");

  const fileListEl  = document.getElementById("file-list");
  const btnReload   = document.getElementById("btn-reload-list");

  const pathInput     = document.getElementById("path");
  const titleInput    = document.getElementById("title");
  const passwordInput = document.getElementById("password");
  const filenameInput = document.getElementById("filename");

  const metaTypeSelect       = document.getElementById("meta-type");
  const metaVisibilitySelect = document.getElementById("meta-visibility");
  const metaOwnerInput       = document.getElementById("meta-owner");
  const metaTagsInput        = document.getElementById("meta-tags");
  const metaDescInput        = document.getElementById("meta-description");
  const metaCreatedEl        = document.getElementById("meta-created");
  const metaUpdatedEl        = document.getElementById("meta-updated");

  const mdInput       = document.getElementById("md-input");
  const linesInput    = document.getElementById("lines");

  const btnNew        = document.getElementById("btn-new");
  const btnSave       = document.getElementById("btn-save");
  const btnRefresh    = document.getElementById("btn-refresh");
  const btnCopy       = document.getElementById("btn-copy");
  const mdToolbarBtns = document.querySelectorAll(".md-btn");

  const previewEl  = document.getElementById("preview");

  let currentFile = null; // relativer Pfad wie "events/night-zero.json"

  function setStatus(msg, isError = false) {
    statusLeft.textContent = msg;
    if (isError) statusLeft.classList.add("error");
    else statusLeft.classList.remove("error");
  }

  async function api(action, params = {}, method = "GET") {
    let url = "builder.php?api=1&action=" + encodeURIComponent(action);
    const options = { method, headers: {} };

    if (method === "GET") {
      if (params.file) {
        url += "&file=" + encodeURIComponent(params.file);
      }
    } else {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(params);
    }

    const res = await fetch(url, options);
    const data = await res.json();
    return data;
  }

  async function loadFileList() {
    setStatus("Lade Dateiliste…");
    fileListEl.innerHTML = '<div style="font-size:11px; color:var(--text-dim);">Lade…</div>';

    try {
      const data = await api("list");
      if (!data.ok) {
        setStatus("Fehler beim Laden der Dateiliste: " + (data.error || "unbekannt"), true);
        return;
      }

      if (!data.files.length) {
        fileListEl.innerHTML = '<div style="font-size:11px; color:var(--text-dim);">Keine JSON-Dateien gefunden.</div>';
        setStatus("Keine JSON-Dateien in /content gefunden.");
        return;
      }

      const frag = document.createDocumentFragment();
      data.files.forEach(f => {
        const item = document.createElement("div");
        item.className = "file-item";
        item.dataset.file = f.file;

        const pathDiv = document.createElement("div");
        pathDiv.className = "file-path";
        pathDiv.textContent = f.path;

        const metaBits = [];
        if (f.meta && f.meta.type)       metaBits.push(f.meta.type);
        if (f.meta && f.meta.visibility) metaBits.push(f.meta.visibility);
        if (f.meta && f.meta.owner)      metaBits.push("@" + f.meta.owner);

        const metaDiv = document.createElement("div");
        metaDiv.className = "file-meta";
        const d = new Date(f.mtime * 1000);
        const metaStr = metaBits.length ? (" · " + metaBits.join(" · ")) : "";
        metaDiv.textContent = `${f.file} · ${f.linesCount} Zeilen · ${d.toLocaleString()}${metaStr}`;

        item.appendChild(pathDiv);
        item.appendChild(metaDiv);

        item.addEventListener("click", () => {
          document.querySelectorAll(".file-item").forEach(el => el.classList.remove("active"));
          item.classList.add("active");
          loadFile(f.file);
        });

        frag.appendChild(item);
      });

      fileListEl.innerHTML = "";
      fileListEl.appendChild(frag);
      setStatus(`Dateiliste aktualisiert (${data.files.length} Dateien).`);

    } catch (err) {
      console.error(err);
      setStatus("Fehler beim Laden der Dateiliste: " + err, true);
    }
  }

  async function loadFile(fileRel) {
    setStatus("Lade Datei " + fileRel + "…");
    try {
      const data = await api("load", { file: fileRel });
      if (!data.ok) {
        setStatus("Fehler beim Laden der Datei: " + (data.error || "unbekannt"), true);
        return;
      }

      const obj  = data.data || {};
      const meta = obj.meta || {};

      currentFile = data.file;
      statusRight.textContent = "Geladen: " + data.file;

      pathInput.value      = obj.path  || "";
      titleInput.value     = obj.title || "";
      passwordInput.value  = obj.password || "";
      filenameInput.value  = data.file;

      metaTypeSelect.value       = meta.type       || "";
      metaVisibilitySelect.value = meta.visibility || "";
      metaOwnerInput.value       = meta.owner      || "";
      if (Array.isArray(meta.tags)) {
        metaTagsInput.value = meta.tags.join(", ");
      } else if (typeof meta.tags === "string") {
        metaTagsInput.value = meta.tags;
      } else {
        metaTagsInput.value = "";
      }
      metaDescInput.value        = meta.description || "";
      metaCreatedEl.textContent  = meta.created_at  || "–";
      metaUpdatedEl.textContent  = meta.updated_at  || "–";

      // Lines übernehmen (Markdown bleibt leer – wird nicht rekonstruiert)
      linesInput.value = Array.isArray(obj.lines) ? obj.lines.join("\n") : "";
      mdInput.value    = "";

      refreshPreview();
      setStatus("Datei geladen: " + data.file);
    } catch (err) {
      console.error(err);
      setStatus("Fehler beim Laden der Datei: " + err, true);
    }
  }

  function buildDocObject() {
    const path = pathInput.value.trim();
    const title = titleInput.value.trim();
    const pw = passwordInput.value.trim();

    // Meta bauen
    const type       = metaTypeSelect.value || null;
    const visibility = metaVisibilitySelect.value || null;
    const owner      = metaOwnerInput.value.trim() || null;

    const rawTags = metaTagsInput.value
      .split(",")
      .map(t => t.trim())
      .filter(t => t.length > 0);
    const tags = rawTags;

    const description = metaDescInput.value.trim() || null;

    const created_at = (metaCreatedEl.textContent && metaCreatedEl.textContent !== "–")
      ? metaCreatedEl.textContent
      : null;
    const updated_at = (metaUpdatedEl.textContent && metaUpdatedEl.textContent !== "–")
      ? metaUpdatedEl.textContent
      : null;

    const rawLines = linesInput.value.replace(/\r\n/g, "\n").split("\n");
    const lines = rawLines;

    const meta = {
      type,
      visibility,
      owner,
      tags,
      description,
      created_at,
      updated_at
    };

    return {
      path: path || "",
      title: title || "",
      password: pw.length ? pw : null,
      meta: meta,
      lines: lines
    };
  }

  function refreshPreview() {
    try {
      const obj = buildDocObject();
      const json = JSON.stringify(obj, null, 2);
      previewEl.textContent = json;
      setStatus(`Preview aktualisiert – ${obj.lines.length} Zeilen Inhalt.`);
    } catch (err) {
      previewEl.textContent = "// Fehler beim Erzeugen der JSON-Vorschau\n" + err;
      setStatus("Fehler beim Erzeugen der JSON-Vorschau.", true);
    }
  }

  async function saveToServer() {
    const doc = buildDocObject();
    let fileRel = filenameInput.value.trim();

    if (!fileRel) {
      // fallback: Pfad als Basis nehmen
      const p = doc.path || "darknetz-doc";
      fileRel = p.replace(/[^\w\-\/]+/g, "_") + ".json";
    }

    setStatus("Speichere " + fileRel + "…");

    try {
      const data = await api("save", { file: fileRel, doc }, "POST");
      if (!data.ok) {
        setStatus("Fehler beim Speichern: " + (data.error || "unbekannt"), true);
        return;
      }

      currentFile = data.file;
      filenameInput.value = data.file;
      statusRight.textContent = "Gespeichert: " + data.file;
      setStatus("Datei gespeichert: " + data.file);

      // Updated-At lokal auf "jetzt" setzen (Backend schreibt es auch rein)
      metaUpdatedEl.textContent = new Date().toISOString();

      // Liste neu laden, um ggf. neue Datei zu sehen
      loadFileList();
    } catch (err) {
      console.error(err);
      setStatus("Fehler beim Speichern: " + err, true);
    }
  }

  function copyPreview() {
    const text = previewEl.textContent;
    if (!text.trim()) {
      setStatus("Nichts zu kopieren.", true);
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => setStatus("JSON in Zwischenablage kopiert."))
        .catch(err => setStatus("Clipboard-Fehler: " + err, true));
    } else {
      const tmp = document.createElement("textarea");
      tmp.value = text;
      tmp.style.position = "fixed";
      tmp.style.opacity = "0";
      document.body.appendChild(tmp);
      tmp.select();
      try {
        document.execCommand("copy");
        setStatus("JSON in Zwischenablage kopiert.");
      } catch (err) {
        setStatus("Clipboard-Fehler: " + err, true);
      }
      document.body.removeChild(tmp);
    }
  }

  function clearForm() {
    currentFile = null;
    pathInput.value      = "";
    titleInput.value     = "";
    passwordInput.value  = "";
    filenameInput.value  = "";

    metaTypeSelect.value       = "";
    metaVisibilitySelect.value = "";
    metaOwnerInput.value       = "";
    metaTagsInput.value        = "";
    metaDescInput.value        = "";
    metaCreatedEl.textContent  = "–";
    metaUpdatedEl.textContent  = "–";

    mdInput.value    = "";
    linesInput.value = "";

    statusRight.textContent = "Neues Dokument (noch nicht gespeichert)";
    document.querySelectorAll(".file-item").forEach(el => el.classList.remove("active"));
    refreshPreview();
    setStatus("Formular geleert. Neues Dokument.");
  }

  function applyMdFormat(action) {
    const el = mdInput;
    el.focus();

    const start = el.selectionStart;
    const end   = el.selectionEnd;
    const value = el.value;
    const selected = value.slice(start, end);

    function replaceSelection(newText) {
      el.value = value.slice(0, start) + newText + value.slice(end);
      const pos = start + newText.length;
      el.selectionStart = el.selectionEnd = pos;
    }

    function getLineInfo() {
      let lineStart = value.lastIndexOf("\n", start - 1);
      if (lineStart === -1) lineStart = 0; else lineStart += 1;
      let lineEnd = value.indexOf("\n", end);
      if (lineEnd === -1) lineEnd = value.length;
      const lineText = value.slice(lineStart, lineEnd);
      return { lineStart, lineEnd, lineText };
    }

    if (action === "bold") {
      const t = selected || "Text";
      replaceSelection("**" + t + "**");
      return;
    }

    if (action === "italic") {
      const t = selected || "Text";
      replaceSelection("*" + t + "*");
      return;
    }

    if (action === "h1" || action === "h2") {
      const { lineStart, lineEnd, lineText } = getLineInfo();
      const prefix = (action === "h1") ? "# " : "## ";
      const newLine = prefix + lineText.replace(/^#+\s*/, "");
      el.value = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
      const pos = lineStart + newLine.length;
      el.selectionStart = el.selectionEnd = pos;
      return;
    }

    if (action === "ul") {
      const { lineStart, lineEnd, lineText } = getLineInfo();
      const trimmed = lineText.replace(/^[-*]\s+/, "");
      const newLine = "- " + trimmed;
      el.value = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
      const pos = lineStart + newLine.length;
      el.selectionStart = el.selectionEnd = pos;
      return;
    }

    if (action === "ol") {
      const { lineStart, lineEnd, lineText } = getLineInfo();
      const trimmed = lineText.replace(/^\d+\.\s+/, "");
      const newLine = "1. " + trimmed;
      el.value = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
      const pos = lineStart + newLine.length;
      el.selectionStart = el.selectionEnd = pos;
      return;
    }

    if (action === "quote") {
      const { lineStart, lineEnd, lineText } = getLineInfo();
      const trimmed = lineText.replace(/^>\s*/, "");
      const newLine = "> " + trimmed;
      el.value = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
      const pos = lineStart + newLine.length;
      el.selectionStart = el.selectionEnd = pos;
      return;
    }

    if (action === "hr") {
      const insert = (value && !value.endsWith("\n") ? "\n\n" : "\n") + "---\n";
      replaceSelection(insert);
      return;
    }
  }

  function convertMarkdownToLines(silent = false) {
    const md = mdInput.value.replace(/\r\n/g, "\n");
    const mdLines = md.split("\n");
    const out = [];

    for (let i = 0; i < mdLines.length; i++) {
      let line = mdLines[i];

      const trimmedRight = line.replace(/\s+$/, "");

      if (trimmedRight === "") {
        out.push("");
        continue;
      }

      // Headings
      const hMatch = trimmedRight.match(/^(#{1,6})\s+(.*)$/);
      if (hMatch) {
        const level = hMatch[1].length;
        const text  = hMatch[2].trim();
        if (text) {
          out.push(text);
          const underlineChar = (level === 1) ? "=" : "-";
          out.push(underlineChar.repeat(text.length));
          out.push("");
        }
        continue;
      }

      // Unordered list
      const ulMatch = trimmedRight.match(/^[-*]\s+(.*)$/);
      if (ulMatch) {
        out.push("• " + ulMatch[1].trim());
        continue;
      }

      // Ordered list
      const olMatch = trimmedRight.match(/^\d+\.\s+(.*)$/);
      if (olMatch) {
        out.push("• " + olMatch[1].trim());
        continue;
      }

      // Quote
      const quoteMatch = trimmedRight.match(/^>\s?(.*)$/);
      if (quoteMatch) {
        out.push(" » " + quoteMatch[1].trim());
        continue;
      }

      // HR
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmedRight)) {
        out.push("".padEnd(20, "-"));
        continue;
      }

      // Inline formatting rausziehen
      let text = trimmedRight;
      text = text.replace(/\*\*(.+?)\*\*/g, "$1");
      text = text.replace(/\*(.+?)\*/g, "$1");
      text = text.replace(/`(.+?)`/g, "$1");

      out.push(text);
    }

    linesInput.value = out.join("\n");
    refreshPreview();
    if (!silent) {
      setStatus(`Markdown konvertiert – ${out.length} Zeilen übernommen.`);
    }
  }

  // Events
  btnReload.addEventListener("click", loadFileList);
  btnNew.addEventListener("click", clearForm);
  btnSave.addEventListener("click", saveToServer);
  btnRefresh.addEventListener("click", refreshPreview);
  btnCopy.addEventListener("click", copyPreview);

  mdToolbarBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-md-action");
      applyMdFormat(action);
      convertMarkdownToLines(true); // nach Formatierung direkt aktualisieren
    });
  });

  [pathInput, titleInput, passwordInput, metaOwnerInput, metaTagsInput, metaDescInput].forEach(el => {
    el.addEventListener("input", () => {
      refreshPreview();
    });
  });

  metaTypeSelect.addEventListener("change", refreshPreview);
  metaVisibilitySelect.addEventListener("change", refreshPreview);

  // Live-Konvertierung bei Änderungen im Markdown-Feld
  mdInput.addEventListener("input", () => {
    convertMarkdownToLines(true); // still, kein Status-Spam
  });

  // Initial
  refreshPreview();
  loadFileList();
</script>
</body>
</html>