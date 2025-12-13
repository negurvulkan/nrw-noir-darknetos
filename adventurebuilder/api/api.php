<?php
// Flat-file API for the NRW Noir Adventure Builder.
// Patched to support Legacy Data Migration (loading old npcs/enemies folders).

header('Content-Type: application/json');

$baseDir = __DIR__ . '/../../js/games/adventure/adventures';
$indexPath = $baseDir . '/index.json';
$allowedActions = ['list_adventures', 'load_adventure', 'save_adventure', 'upload_ascii', 'create_adventure'];
$action = $_GET['action'] ?? '';

if (!in_array($action, $allowedActions, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Unknown action']);
    exit;
}

try {
    switch ($action) {
        case 'list_adventures':
            respond(listAdventures());
            break;
        case 'load_adventure':
            $id = requireId();
            respond(loadAdventure($id));
            break;
        case 'save_adventure':
            $id = requireId();
            $payload = readJsonBody();
            respond(saveAdventure($id, $payload));
            break;
        case 'upload_ascii':
            $id = requireId();
            respond(uploadAscii($id));
            break;
        case 'create_adventure':
            $payload = readJsonBody();
            respond(createAdventure($payload));
            break;
    }
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode(['error' => $e->getMessage()]);
}

function respond($data)
{
    echo json_encode($data);
}

function listAdventures()
{
    $index = readIndex();
    return ['adventures' => $index];
}

function requireId()
{
    $id = $_GET['id'] ?? '';
    if (!$id) {
        throw new Exception('Missing id');
    }
    $index = readIndex();
    foreach ($index as $adv) {
        if ($adv['id'] === $id) {
            return $id;
        }
    }
    throw new Exception('Unknown adventure id');
}

function readIndex()
{
    global $indexPath;
    if (!file_exists($indexPath)) {
        return [];
    }
    $content = file_get_contents($indexPath);
    $data = json_decode($content, true);
    return is_array($data) ? $data : [];
}

function loadAdventure($id)
{
    global $baseDir;
    $dir = adventurePath($id);
    
    // Core data
    $world = readJsonFile($dir . '/world.json');
    $game = readJsonFile($dir . '/game.json');
    
    // Collections
    $rooms = readJsonDirectory($dir . '/rooms');
    $items = readJsonDirectory($dir . '/items');
    $objects = readJsonDirectory($dir . '/objects');
    
    // NEW: Unified Actors
    $actors = readJsonDirectory($dir . '/actors');
    
    // LEGACY: Load old folders so frontend can migrate them
    // Without this, existing data is invisible to the migration logic
    $legacyNpcs = readJsonDirectory($dir . '/npcs');
    $legacyEnemies = readJsonDirectory($dir . '/enemies');
    
    $dialogs = readDialogDirectory($dir . '/dialogs');
    $asciiFiles = listFiles($dir . '/ascii');

    return [
        'adventure' => ['id' => $id],
        'data' => [
            'world' => $world,
            'game' => $game,
            'rooms' => $rooms,
            'items' => $items,
            'objects' => $objects,
            'actors' => $actors,
            // Send legacy data to frontend
            'npcs' => $legacyNpcs,
            'enemies' => $legacyEnemies,
            'dialogs' => $dialogs,
        ],
        'ascii' => $asciiFiles,
    ];
}

function saveAdventure($id, $payload)
{
    $dir = adventurePath($id);
    if (!is_dir($dir)) {
        throw new Exception('Adventure existiert nicht');
    }
    
    writeJsonFile($dir . '/world.json', $payload['world'] ?? new stdClass());
    writeJsonFile($dir . '/game.json', $payload['game'] ?? new stdClass());
    
    persistCollection($dir . '/rooms', $payload['rooms'] ?? [], 'rooms');
    persistCollection($dir . '/items', $payload['items'] ?? [], 'items');
    persistCollection($dir . '/objects', $payload['objects'] ?? [], 'objects');
    
    // Unified persistence for Actors
    // Note: We do NOT delete the 'npcs' and 'enemies' folders here to be safe,
    // but the data is now authoritatively saved in 'actors'.
    persistCollection($dir . '/actors', $payload['actors'] ?? [], 'actors');
    
    persistDialogs($dir . '/dialogs', $payload['dialogs'] ?? []);

    return ['status' => 'ok'];
}

function uploadAscii($id)
{
    $dir = adventurePath($id) . '/ascii';
    if (!is_dir($dir) && !mkdir($dir, 0777, true)) {
        throw new Exception('ASCII-Ordner konnte nicht angelegt werden');
    }
    if (!isset($_FILES['file'])) {
        throw new Exception('Keine Datei erhalten');
    }
    $file = $_FILES['file'];
    if ($file['error'] !== UPLOAD_ERR_OK) {
        throw new Exception('Upload-Fehler');
    }
    $name = basename($file['name']);
    if (!preg_match('/^[\w\-\.]+$/', $name)) {
        throw new Exception('Ungültiger Dateiname');
    }
    $target = $dir . '/' . $name;
    if (!move_uploaded_file($file['tmp_name'], $target)) {
        throw new Exception('Datei konnte nicht gespeichert werden');
    }
    return ['status' => 'ok', 'file' => $name];
}

function createAdventure($payload)
{
    global $indexPath, $baseDir;
    $id = sanitizeId($payload['id'] ?? '');
    if (!$id) {
        throw new Exception('ID fehlt');
    }
    $index = readIndex();
    foreach ($index as $adv) {
        if ($adv['id'] === $id) {
            throw new Exception('ID bereits vergeben');
        }
    }
    $title = trim($payload['title'] ?? $id);
    $description = trim($payload['description'] ?? '');
    $folder = $id;
    $index[] = [
        'id' => $id,
        'title' => $title,
        'folder' => $folder,
        'description' => $description,
        'default' => false,
    ];
    writeJsonFile($indexPath, $index);

    $dir = adventurePath($id);
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }
    @mkdir($dir . '/rooms', 0777, true);
    @mkdir($dir . '/items', 0777, true);
    @mkdir($dir . '/objects', 0777, true);
    @mkdir($dir . '/actors', 0777, true); // New unified directory
    @mkdir($dir . '/dialogs', 0777, true);
    @mkdir($dir . '/ascii', 0777, true);

    if (!empty($payload['source'])) {
        copyAdventure($payload['source'], $id);
        return ['status' => 'ok', 'id' => $id];
    }

    writeJsonFile($dir . '/world.json', [
        'id' => $id,
        'title' => $title,
        'startRoom' => '',
        'difficulty' => '',
        'globalFlags' => new stdClass(),
    ]);
    writeJsonFile($dir . '/game.json', [
        'title' => $title,
        'subtitle' => '',
        'intro' => '',
        'outro' => '',
    ]);

    return ['status' => 'ok', 'id' => $id];
}

function copyAdventure($sourceId, $targetId)
{
    $sourceDir = adventurePath($sourceId);
    if (!is_dir($sourceDir)) {
        throw new Exception('Quelle nicht gefunden');
    }
    $targetDir = adventurePath($targetId);
    $paths = ['world.json', 'game.json'];
    foreach ($paths as $file) {
        if (file_exists($sourceDir . '/' . $file)) {
            copy($sourceDir . '/' . $file, $targetDir . '/' . $file);
        }
    }
    copyDirectory($sourceDir . '/rooms', $targetDir . '/rooms');
    copyDirectory($sourceDir . '/items', $targetDir . '/items');
    copyDirectory($sourceDir . '/objects', $targetDir . '/objects');
    copyDirectory($sourceDir . '/actors', $targetDir . '/actors'); // Unified
    // Legacy copy support optional but recommended if full clone needed
    copyDirectory($sourceDir . '/npcs', $targetDir . '/npcs');
    copyDirectory($sourceDir . '/enemies', $targetDir . '/enemies');
    
    copyDirectory($sourceDir . '/dialogs', $targetDir . '/dialogs');
    copyDirectory($sourceDir . '/ascii', $targetDir . '/ascii');
}

function copyDirectory($source, $target)
{
    if (!is_dir($source)) return;
    if (!is_dir($target)) mkdir($target, 0777, true);
    $files = glob($source . '/*');
    foreach ($files as $file) {
        if (is_file($file)) {
            copy($file, $target . '/' . basename($file));
        }
    }
}

function persistCollection($dir, $entries, $type)
{
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }
    $ids = [];
    foreach ($entries as $entry) {
        $entryId = sanitizeId($entry['id'] ?? '');
        if (!$entryId) {
            throw new Exception("Ungültige ID in ${type}");
        }
        $ids[] = $entryId;
        $target = $dir . '/' . $entryId . '.json';
        writeJsonFile($target, $entry);
    }
    // Entferne Dateien, die nicht mehr existieren
    foreach (glob($dir . '/*.json') as $existing) {
        $basename = basename($existing, '.json');
        if ($basename === 'index') continue;
        if (!in_array($basename, $ids, true)) {
            unlink($existing);
        }
    }

    if ($type === 'items') {
        writeJsonFile($dir . '/index.json', array_values($ids));
    }
}

function persistDialogs($dir, $dialogs)
{
    if (!is_dir($dir)) mkdir($dir, 0777, true);
    $ids = [];
    foreach ($dialogs as $key => $dialog) {
        $dialogData = is_array($dialog) ? $dialog : (array)$dialog;
        // Check for actor ID, fallback to key or old 'npc' key
        $id = sanitizeId(is_string($key) ? $key : ($dialogData['actor'] ?? $dialogData['npc'] ?? ''));
        if (!$id) {
            throw new Exception('Ungültige Dialog-ID');
        }
        $ids[] = $id;
        writeJsonFile($dir . '/' . $id . '.json', $dialog);
    }
    foreach (glob($dir . '/*.json') as $existing) {
        $basename = basename($existing, '.json');
        if (!in_array($basename, $ids, true)) {
            unlink($existing);
        }
    }
}

function readJsonDirectory($dir)
{
    if (!is_dir($dir)) return [];
    $data = [];
    foreach (glob($dir . '/*.json') as $file) {
        if (basename($file) === 'index.json') continue;
        $content = readJsonFile($file);
        if ($content) $data[] = $content;
    }
    return $data;
}

function readDialogDirectory($dir)
{
    if (!is_dir($dir)) return new stdClass();
    $data = [];
    foreach (glob($dir . '/*.json') as $file) {
        $id = basename($file, '.json');
        $content = readJsonFile($file);
        if ($content) {
            $data[$id] = $content;
        }
    }
    return (object)$data;
}

function listFiles($dir)
{
    if (!is_dir($dir)) return [];
    $files = [];
    foreach (glob($dir . '/*') as $file) {
        if (is_file($file)) {
            $files[] = basename($file);
        }
    }
    sort($files);
    return $files;
}

function readJsonFile($file)
{
    if (!file_exists($file)) return new stdClass();
    $content = file_get_contents($file);
    $data = json_decode($content, true);
    return $data ?: new stdClass();
}

function writeJsonFile($file, $data)
{
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    file_put_contents($file, $json);
}

function adventurePath($id)
{
    global $baseDir;
    return $baseDir . '/' . sanitizeId($id);
}

function sanitizeId($id)
{
    $id = trim($id);
    if (!$id) return '';
    if (!preg_match('/^[a-zA-Z0-9_-]+$/', $id)) {
        throw new Exception('Ungültige ID');
    }
    return $id;
}

function readJsonBody()
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new Exception('Ungültiges JSON');
    }
    return $data;
}