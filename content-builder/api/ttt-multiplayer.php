<?php
// Online-Multiplayer für TicTacToe – einfacher Dateistore
header("Content-Type: application/json; charset=utf-8");

$dataDir  = __DIR__ . "/data";
$storeFile = $dataDir . "/ttt-sessions.json";

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0777, true);
}

function respond($payload, $code = 200) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function loadGames($file)
{
    if (!file_exists($file)) {
        return [];
    }

    $raw = file_get_contents($file);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function saveGames($file, $games)
{
    $fp = fopen($file, "c+");
    if (!$fp) {
        respond(["ok" => false, "error" => "Konnte Speicherdatei nicht öffnen."], 500);
    }

    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        respond(["ok" => false, "error" => "Dateilock fehlgeschlagen."], 500);
    }

    ftruncate($fp, 0);
    fwrite($fp, json_encode($games, JSON_PRETTY_PRINT));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

function cleanupGames(&$games)
{
    $now = time();
    $changed = false;

    foreach ($games as $id => $game) {
        $lastUpdate = $game['updated_at'] ?? $now;
        $age = $now - $lastUpdate;
        $status = $game['status'] ?? 'finished';

        if ($age > 6 * 60 * 60 || ($status === 'waiting' && $age > 60 * 60)) {
            unset($games[$id]);
            $changed = true;
        }
    }

    return $changed;
}

function gameId($games)
{
    $alphabet = str_split('ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
    do {
        $id = '';
        for ($i = 0; $i < 6; $i++) {
            $id .= $alphabet[random_int(0, count($alphabet) - 1)];
        }
    } while (isset($games[$id]));

    return $id;
}

function token()
{
    return bin2hex(random_bytes(16));
}

function cleanName($name, $fallback)
{
    $name = trim($name ?? '');
    $name = preg_replace('/[^a-z0-9 äöüß_\-\.]/iu', '', $name);
    if ($name === '') {
        $name = $fallback;
    }
    return substr($name, 0, 40);
}

function ensureBoard($board)
{
    $clean = array_fill(0, 9, null);
    if (is_array($board)) {
        foreach ($board as $i => $val) {
            if ($i >= 0 && $i < 9) {
                $clean[$i] = ($val === 'X' || $val === 'O') ? $val : null;
            }
        }
    }
    return $clean;
}

function winner($board)
{
    $wins = [
        [0,1,2],[3,4,5],[6,7,8],
        [0,3,6],[1,4,7],[2,5,8],
        [0,4,8],[2,4,6]
    ];

    foreach ($wins as [$a, $b, $c]) {
        if (!empty($board[$a]) && $board[$a] === $board[$b] && $board[$a] === $board[$c]) {
            return $board[$a];
        }
    }

    $filled = array_reduce($board, function($carry, $cell) {
        return $carry + (($cell === 'X' || $cell === 'O') ? 1 : 0);
    }, 0);

    return $filled === 9 ? 'draw' : null;
}

function playerByToken($game, $token)
{
    foreach (['X', 'O'] as $symbol) {
        if (!empty($game['players'][$symbol]['token']) && $game['players'][$symbol]['token'] === $token) {
            return $symbol;
        }
    }
    return null;
}

function serializeGame($game, $player)
{
    $opponent = $player === 'X' ? 'O' : 'X';
    return [
        'id' => $game['id'],
        'board' => ensureBoard($game['board'] ?? []),
        'turn' => $game['turn'] ?? null,
        'status' => $game['status'] ?? 'waiting',
        'winner' => $game['winner'] ?? null,
        'you' => $player,
        'opponent' => $opponent,
        'your_name' => $game['players'][$player]['name'] ?? null,
        'opponent_name' => $game['players'][$opponent]['name'] ?? null,
        'updated_at' => $game['updated_at'] ?? time(),
    ];
}

$input = json_decode(file_get_contents("php://input"), true);
if (!is_array($input)) {
    $input = [];
}

$action = $input['action'] ?? $_POST['action'] ?? $_GET['action'] ?? null;
if (!$action) {
    respond(["ok" => false, "error" => "Keine Aktion angegeben."], 400);
}

$games = loadGames($storeFile);
$dirty = cleanupGames($games);

$now = time();

switch ($action) {
    case 'create':
        $hostName = cleanName($input['name'] ?? '', 'Host');
        $id = gameId($games);
        $tok = token();

        $games[$id] = [
            'id' => $id,
            'board' => array_fill(0, 9, null),
            'turn' => 'X',
            'status' => 'waiting',
            'winner' => null,
            'players' => [
                'X' => ['token' => $tok, 'name' => $hostName],
                'O' => ['token' => null, 'name' => null]
            ],
            'updated_at' => $now
        ];

        $dirty = true;
        saveGames($storeFile, $games);
        respond([
            'ok' => true,
            'token' => $tok,
            'game' => serializeGame($games[$id], 'X')
        ]);
        break;

    case 'join':
        $id = strtoupper($input['gameId'] ?? '');
        if (!$id || !isset($games[$id])) {
            respond(['ok' => false, 'error' => 'Spiel nicht gefunden.'], 404);
        }

        $game = $games[$id];
        if (($game['status'] ?? '') !== 'waiting' || !empty($game['players']['O']['token'])) {
            respond(['ok' => false, 'error' => 'Dieses Spiel ist bereits belegt.'], 400);
        }

        $guestName = cleanName($input['name'] ?? '', 'Gast');
        $tok = token();

        $game['players']['O'] = ['token' => $tok, 'name' => $guestName];
        $game['status'] = 'active';
        $game['turn'] = 'X';
        $game['updated_at'] = $now;

        $games[$id] = $game;
        $dirty = true;
        saveGames($storeFile, $games);
        respond([
            'ok' => true,
            'token' => $tok,
            'game' => serializeGame($game, 'O')
        ]);
        break;

    case 'state':
        $id = strtoupper($input['gameId'] ?? '');
        $tok = $input['token'] ?? '';

        if (!$id || !isset($games[$id])) {
            respond(['ok' => false, 'error' => 'Spiel nicht gefunden.'], 404);
        }

        $player = playerByToken($games[$id], $tok);
        if (!$player) {
            respond(['ok' => false, 'error' => 'Ungültiger Spieler oder Token.'], 403);
        }

        if ($dirty) {
            saveGames($storeFile, $games);
        }

        respond([
            'ok' => true,
            'game' => serializeGame($games[$id], $player)
        ]);
        break;

    case 'move':
        $id = strtoupper($input['gameId'] ?? '');
        $tok = $input['token'] ?? '';
        $index = $input['index'] ?? null;

        if (!is_numeric($index)) {
            respond(['ok' => false, 'error' => 'Zug fehlt.'], 400);
        }
        $idx = intval($index);
        if ($idx < 0 || $idx > 8) {
            respond(['ok' => false, 'error' => 'Zug außerhalb des Boards.'], 400);
        }

        if (!$id || !isset($games[$id])) {
            respond(['ok' => false, 'error' => 'Spiel nicht gefunden.'], 404);
        }

        $game = $games[$id];
        $player = playerByToken($game, $tok);
        if (!$player) {
            respond(['ok' => false, 'error' => 'Ungültiger Spieler oder Token.'], 403);
        }

        if (($game['status'] ?? '') !== 'active') {
            respond(['ok' => false, 'error' => 'Dieses Spiel ist nicht mehr aktiv.'], 400);
        }

        if ($game['turn'] !== $player) {
            respond(['ok' => false, 'error' => 'Du bist nicht am Zug.'], 400);
        }

        $board = ensureBoard($game['board'] ?? []);
        if (!empty($board[$idx])) {
            respond(['ok' => false, 'error' => 'Feld ist bereits belegt.'], 400);
        }

        $board[$idx] = $player;
        $game['board'] = $board;

        $result = winner($board);
        if ($result) {
            $game['status'] = 'finished';
            $game['winner'] = $result;
            $game['turn'] = null;
        } else {
            $game['turn'] = ($player === 'X') ? 'O' : 'X';
        }

        $game['updated_at'] = $now;
        $games[$id] = $game;
        $dirty = true;

        saveGames($storeFile, $games);
        respond([
            'ok' => true,
            'game' => serializeGame($game, $player)
        ]);
        break;

    case 'leave':
        $id = strtoupper($input['gameId'] ?? '');
        $tok = $input['token'] ?? '';

        if (!$id || !isset($games[$id])) {
            if ($dirty) {
                saveGames($storeFile, $games);
            }
            respond(['ok' => true, 'message' => 'Session bereits beendet.']);
        }

        $game = $games[$id];
        $player = playerByToken($game, $tok);
        if (!$player) {
            respond(['ok' => false, 'error' => 'Ungültiger Spieler oder Token.'], 403);
        }

        $opponent = $player === 'X' ? 'O' : 'X';
        $game['status'] = 'abandoned';
        $game['turn'] = null;
        if (!empty($game['players'][$opponent]['token'])) {
            $game['winner'] = $opponent;
        } else {
            $game['winner'] = null;
        }
        $game['updated_at'] = $now;
        $games[$id] = $game;
        $dirty = true;

        saveGames($storeFile, $games);
        respond([
            'ok' => true,
            'game' => serializeGame($game, $player)
        ]);
        break;

    default:
        if ($dirty) {
            saveGames($storeFile, $games);
        }
        respond(['ok' => false, 'error' => 'Unbekannte Aktion.'], 400);
}
