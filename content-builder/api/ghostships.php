<?php
// Ghostships – Multiplayer Battleship Variante mit Haunted-Events
// Server-seitige Logik + einfacher Dateistore
header("Content-Type: application/json; charset=utf-8");

$dataDir   = __DIR__ . "/data";
$storeFile = $dataDir . "/ghostships-sessions.json";

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0777, true);
}

function gsRespond($payload, $code = 200)
{
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function gsLoadMatches($file)
{
    if (!file_exists($file)) {
        return [];
    }

    $raw = file_get_contents($file);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function gsSaveMatches($file, $matches)
{
    $fp = fopen($file, "c+");
    if (!$fp) {
        gsRespond(["ok" => false, "error" => "Konnte Speicherdatei nicht öffnen."], 500);
    }

    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        gsRespond(["ok" => false, "error" => "Dateilock fehlgeschlagen."], 500);
    }

    ftruncate($fp, 0);
    fwrite($fp, json_encode($matches, JSON_PRETTY_PRINT));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

function gsCleanupMatches(&$matches)
{
    $now = time();
    $changed = false;

    foreach ($matches as $id => $match) {
        $lastUpdate = $match['updated_at'] ?? $now;
        $age = $now - $lastUpdate;
        $phase = $match['phase'] ?? 'finished';

        if ($age > 12 * 60 * 60 || ($phase === 'lobby' && $age > 60 * 60)) {
            unset($matches[$id]);
            $changed = true;
        }
    }

    return $changed;
}

// ---------------------------------------------------------
// RNG – deterministisch pro Match
// ---------------------------------------------------------
function gsMulberry32Next(&$state)
{
    $state = ($state + 0x6D2B79F5) & 0xFFFFFFFF;
    $t = $state;
    $t = ($t ^ ($t >> 15)) * ($t | 1);
    $t ^= $t + (($t ^ ($t >> 7)) * ($t | 61));
    $t = ($t ^ ($t >> 14)) & 0xFFFFFFFF;
    return $t / 4294967296;
}

function gsRngChoice(&$state, $array)
{
    if (!is_array($array) || !count($array)) return null;
    $idx = (int) floor(gsMulberry32Next($state) * count($array));
    $idx = max(0, min(count($array) - 1, $idx));
    return $array[$idx];
}

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------
function gsCleanName($name, $fallback)
{
    $name = trim($name ?? '');
    $name = preg_replace('/[^a-z0-9 äöüß_\-\.]/iu', '', $name);
    if ($name === '') {
        $name = $fallback;
    }
    return substr($name, 0, 40);
}

function gsToken()
{
    return bin2hex(random_bytes(12));
}

function gsMatchId($matches)
{
    do {
        $id = 'GS-' . strtoupper(bin2hex(random_bytes(3)));
    } while (isset($matches[$id]));
    return $id;
}

function gsOpponent($player)
{
    return $player === 'A' ? 'B' : 'A';
}

function gsParsePos($pos, $size)
{
    $pos = strtoupper(trim($pos ?? ''));
    if (!preg_match('/^([A-J])([0-9]{1,2})$/', $pos, $m)) {
        return null;
    }

    $colLetter = $m[1];
    $rowNum = intval($m[2]);

    $maxLetter = $size === 10 ? 'J' : 'H';
    if (ord($colLetter) > ord($maxLetter)) return null;
    if ($rowNum < 1 || $rowNum > $size) return null;

    return $colLetter . $rowNum;
}

function gsNeighbors($pos, $size)
{
    $colLetter = $pos[0];
    $rowNum = intval(substr($pos, 1));
    $coords = [];
    foreach ([[1,0],[-1,0],[0,1],[0,-1]] as [$dc,$dr]) {
        $cOrd = ord($colLetter) + $dc;
        $r = $rowNum + $dr;
        if ($r < 1 || $r > $size) continue;
        $cLetter = chr($cOrd);
        if ($cLetter < 'A') continue;
        $coords[] = $cLetter . $r;
    }
    return $coords;
}

function gsFleet($boardSize)
{
    $fleet = [
        ['type' => 'wraith', 'length' => 3],
        ['type' => 'barge',  'length' => 2],
        ['type' => 'skiff',  'length' => 2],
        ['type' => 'relic',  'length' => 1],
        ['type' => 'relic',  'length' => 1],
    ];

    if ($boardSize >= 10) {
        // etwas mehr Präsenz auf 10x10
        $fleet[] = ['type' => 'wraith', 'length' => 3];
        $fleet[] = ['type' => 'relic',  'length' => 1];
    }

    return $fleet;
}

function gsEmptyBoard($size)
{
    return [
        'ships' => [],
        'shots' => [],
        'fogged' => [],
        'manifest_left' => 2,
    ];
}

function gsShipCountByType($board, $type)
{
    $count = 0;
    foreach ($board['ships'] as $ship) {
        if (($ship['type'] ?? '') === $type) {
            $count++;
        }
    }
    return $count;
}

function gsShipCells($startPos, $dir, $length, $size)
{
    $cells = [];
    $pos = gsParsePos($startPos, $size);
    if (!$pos) return null;

    $colLetter = $pos[0];
    $rowNum = intval(substr($pos, 1));
    $dir = strtolower($dir);

    for ($i = 0; $i < $length; $i++) {
        $c = $colLetter;
        $r = $rowNum;
        if ($dir === 'h') {
            $c = chr(ord($colLetter) + $i);
        } else {
            $r = $rowNum + $i;
        }

        $cell = gsParsePos($c . $r, $size);
        if (!$cell) return null;
        $cells[] = $cell;
    }

    return $cells;
}

function gsCellsFree($board, $cells)
{
    foreach ($board['ships'] as $ship) {
        foreach ($ship['cells'] as $cell) {
            if (in_array($cell, $cells, true)) {
                return false;
            }
        }
    }
    foreach ($cells as $cell) {
        if (in_array($cell, $board['shots'] ? array_column($board['shots'], 'pos') : [], true)) {
            return false;
        }
    }
    return true;
}

function gsPlaceShip(&$board, $fleet, $type, $pos, $dir, $size)
{
    $neededOfType = 0;
    foreach ($fleet as $def) {
        if ($def['type'] === $type) $neededOfType++;
    }

    if ($neededOfType === 0) {
        return "Unbekannter Schiffstyp.";
    }

    $already = gsShipCountByType($board, $type);
    if ($already >= $neededOfType) {
        return "Alle Schiffe dieses Typs sind bereits platziert.";
    }

    $length = null;
    foreach ($fleet as $def) {
        if ($def['type'] === $type) {
            $length = $def['length'];
            break;
        }
    }

    $cells = gsShipCells($pos, $dir, $length, $size);
    if (!$cells) {
        return "Position liegt außerhalb des Boards.";
    }

    if (!gsCellsFree($board, $cells)) {
        return "Position kollidiert mit bestehenden Schiffen.";
    }

    $board['ships'][] = [
        'id'    => $type . '-' . ($already + 1),
        'type'  => $type,
        'length'=> $length,
        'cells' => $cells,
        'hits'  => []
    ];

    return null;
}

function gsAutoPlace(&$board, $fleet, $size, &$rng)
{
    foreach ($fleet as $def) {
        $tries = 0;
        do {
            $colRange = range('A', $size === 10 ? 'J' : 'H');
            $randCol = gsRngChoice($rng, $colRange);
            $randRow = (int) floor(gsMulberry32Next($rng) * $size) + 1;
            $dir = gsMulberry32Next($rng) > 0.5 ? 'h' : 'v';
            $pos = $randCol . $randRow;
            $error = gsPlaceShip($board, $fleet, $def['type'], $pos, $dir, $size);
            $tries++;
        } while ($error && $tries < 200);

        if ($error) {
            return $error;
        }
    }
    return null;
}

function gsPlayerByToken($match, $token)
{
    foreach (['A','B'] as $p) {
        if (!empty($match['players'][$p]['token']) && $match['players'][$p]['token'] === $token) {
            return $p;
        }
    }
    return null;
}

function gsShipRemaining($ship)
{
    $hits = array_unique($ship['hits'] ?? []);
    return max(0, ($ship['length'] ?? 0) - count($hits));
}

function gsBoardRemaining($board)
{
    $rem = 0;
    foreach ($board['ships'] as $ship) {
        $rem += gsShipRemaining($ship);
    }
    return $rem;
}

function gsShipByCell(&$board, $pos)
{
    foreach ($board['ships'] as &$ship) {
        if (in_array($pos, $ship['cells'], true)) {
            return $ship;
        }
    }
    return null;
}

function gsAddLog(&$match, $entry)
{
    $entry['ts'] = $entry['ts'] ?? time();
    $match['log'][] = $entry;
    if (count($match['log']) > 200) {
        $match['log'] = array_slice($match['log'], -200);
    }
}

function gsRevealPendingShots(&$match)
{
    $reveals = [];
    foreach (['A','B'] as $p) {
        foreach ($match['boards'][$p]['shots'] as &$shot) {
            if (!empty($shot['revealed'])) continue;
            $revealAt = $shot['reveal_at'] ?? ($match['turn_counter'] + 1);
            if (($match['turn_counter'] ?? 0) >= $revealAt) {
                $shot['revealed'] = true;
                $reveals[] = $shot;
            }
        }
        unset($shot);
    }

    foreach ($reveals as $shot) {
        $sunk = !empty($shot['sunk']) ? true : false;
        gsAddLog($match, [
            'type'   => 'fog_reveal',
            'pos'    => $shot['pos'],
            'by'     => $shot['by'],
            'target' => $shot['target'],
            'result' => $shot['result'],
            'sunk'   => $sunk
        ]);
    }
}

function gsApplyFire(&$match, $player, $pos)
{
    $def = gsOpponent($player);
    $size = $match['board_size'];
    $board = &$match['boards'][$def];

    foreach ($board['shots'] as $shot) {
        if ($shot['pos'] === $pos) {
            return [false, 'Feld wurde bereits beschossen.'];
        }
    }

    $fogged = false;
    $fogIdx = array_search($pos, $board['fogged'], true);
    if ($fogIdx !== false) {
        $fogged = true;
        array_splice($board['fogged'], $fogIdx, 1);
    }

    $ship = gsShipByCell($board, $pos);
    $result = 'miss';
    $sunk = false;

    if ($ship) {
        if (!in_array($pos, $ship['hits'], true)) {
            $ship['hits'][] = $pos;
        }

        $result = 'hit';
        if (gsShipRemaining($ship) === 0) {
            $result = 'sunk';
            $sunk = true;
        }
    }

    $shotEntry = [
        'pos'     => $pos,
        'by'      => $player,
        'target'  => $def,
        'result'  => $result === 'sunk' ? 'hit' : $result,
        'sunk'    => $sunk,
        'ts'      => time(),
        'revealed'=> !$fogged,
        'reveal_at' => $fogged ? ($match['turn_counter'] + 1) : null
    ];

    $board['shots'][] = $shotEntry;

    gsAddLog($match, [
        'type'   => 'fire',
        'by'     => $player,
        'target' => $def,
        'pos'    => $pos,
        'result' => $fogged ? 'fogged' : ($sunk ? 'sunk' : $result),
        'fogged' => $fogged,
        'sunk'   => $sunk,
    ]);

    $remaining = gsBoardRemaining($board);
    if ($remaining <= 0) {
            $match['phase'] = 'finished';
            $match['winner'] = $player;
            $match['turn'] = null;
            gsAddLog($match, [
                'type' => 'system',
                'text' => "{$player} zieht alle gegnerischen Geisterschiffe ins Nichts.",
            ]);
        }

    return [true, null];
}

function gsMaybeEvent(&$match, $actor)
{
    $nowTurn = $match['turn_counter'] ?? 0;
    if (($match['haunted']['last_event_turn'] ?? -1) === $nowTurn) return;

    $state = &$match['rng_state'];
    $roll = gsMulberry32Next($state);
    if ($roll > 0.12) return; // 12% Basis

    $target = gsOpponent($actor);
    $board = &$match['boards'][$target];
    $size = $match['board_size'];
    $events = [];

    $hasManifestBudget = ($board['manifest_left'] ?? 0) > 0 && gsBoardRemaining($board) > 2;
    $hasDecay = ($match['haunted']['last_decay_target'] ?? null) !== $target;

    $eventFogOptions = array_values(array_diff(
        gsAllBoardCells($size),
        array_column($board['shots'], 'pos')
    ));

    if ($hasDecay && gsBoardRemaining($board) > 0) {
        $events[] = 'decay';
    }
    if ($hasManifestBudget) {
        $events[] = 'manifest';
    }
    if (count($eventFogOptions) > 0) {
        $events[] = 'fog';
    }

    if (!count($events)) return;

    $pick = gsRngChoice($state, $events);
    if ($pick === 'decay') {
        $shipCandidates = [];
        foreach ($board['ships'] as &$ship) {
            if (gsShipRemaining($ship) > 0) {
                $intact = array_values(array_diff($ship['cells'], $ship['hits']));
                if (count($intact)) {
                    $shipCandidates[] = [&$ship, $intact];
                }
            }
        }
        unset($ship);

        if (count($shipCandidates)) {
            [$shipRef, $cells] = gsRngChoice($state, $shipCandidates);
            $cell = gsRngChoice($state, $cells);
            if (!in_array($cell, $shipRef['hits'], true)) {
                $shipRef['hits'][] = $cell;
            }
            $sunk = gsShipRemaining($shipRef) === 0;
            $match['haunted']['last_decay_target'] = $target;
            gsAddLog($match, [
                'type'   => 'decay',
                'target' => $target,
                'ship'   => $shipRef['type'],
                'sunk'   => $sunk
            ]);
            if ($sunk && gsBoardRemaining($board) <= 0) {
                $match['phase'] = 'finished';
                $match['winner'] = $actor;
                $match['turn'] = null;
                gsAddLog($match, [
                    'type' => 'system',
                    'text' => "{$target} verliert die letzte Reling im Nebel.",
                ]);
            }
        }
    } elseif ($pick === 'manifest') {
        $len = ($board['manifest_left'] >= 2 && gsMulberry32Next($state) > 0.5) ? 2 : 1;
        $freeCells = array_values(array_diff(
            gsAllBoardCells($size),
            array_merge(array_column($board['shots'], 'pos'), gsAllShipCells($board))
        ));

        $placed = false;
        $tries = 0;
        while (!$placed && $tries < 80 && count($freeCells)) {
            $start = gsRngChoice($state, $freeCells);
            $dir = gsMulberry32Next($state) > 0.5 ? 'h' : 'v';
            $cells = gsShipCells($start, $dir, $len, $size);
            $tries++;
            if (!$cells) continue;
            if (!gsCellsFree($board, $cells)) continue;
            $board['ships'][] = [
                'id' => 'manifest-' . ($board['manifest_left']),
                'type' => $len === 1 ? 'wisp' : 'echo',
                'length' => $len,
                'cells' => $cells,
                'hits' => []
            ];
            $board['manifest_left'] -= $len;
            $placed = true;
            gsAddLog($match, [
                'type'   => 'manifest',
                'target' => $target,
                'length' => $len
            ]);
        }
    } elseif ($pick === 'fog') {
        $count = gsMulberry32Next($state) > 0.6 ? 2 : 1;
        $available = array_values(array_diff(
            gsAllBoardCells($size),
            array_merge(array_column($board['shots'], 'pos'), $board['fogged'])
        ));
        $added = [];
        for ($i = 0; $i < $count; $i++) {
            if (!count($available)) break;
            $choice = gsRngChoice($state, $available);
            $added[] = $choice;
            $board['fogged'][] = $choice;
            $available = array_values(array_diff($available, [$choice]));
        }
        if (count($added)) {
            gsAddLog($match, [
                'type'   => 'fog',
                'target' => $target,
                'count'  => count($added)
            ]);
        }
    }

    $match['haunted']['last_event_turn'] = $nowTurn;
}

function gsAllShipCells($board)
{
    $cells = [];
    foreach ($board['ships'] as $ship) {
        $cells = array_merge($cells, $ship['cells']);
    }
    return array_values(array_unique($cells));
}

function gsAllBoardCells($size)
{
    $cells = [];
    $cols = range('A', $size === 10 ? 'J' : 'H');
    for ($r = 1; $r <= $size; $r++) {
        foreach ($cols as $c) {
            $cells[] = $c . $r;
        }
    }
    return $cells;
}

function gsSerializeRadar($match, $player)
{
    $op = gsOpponent($player);
    $board = $match['boards'][$op];
    $hits = [];
    $misses = [];
    $pending = [];

    foreach ($board['shots'] as $shot) {
        if (($shot['by'] ?? '') !== $player) continue;
        if (!empty($shot['revealed'])) {
            if (($shot['result'] ?? '') === 'miss') {
                $misses[] = $shot['pos'];
            } else {
                $hits[] = $shot['pos'];
            }
        } else {
            $pending[] = $shot['pos'];
        }
    }

    return [
        'hits'   => array_values(array_unique($hits)),
        'misses' => array_values(array_unique($misses)),
        'pending'=> array_values(array_unique($pending)),
        'fogged' => array_values(array_unique($board['fogged'])),
    ];
}

function gsSerializeOwnBoard($board)
{
    $ships = [];
    foreach ($board['ships'] as $ship) {
        $ships[] = [
            'id'     => $ship['id'],
            'type'   => $ship['type'],
            'length' => $ship['length'],
            'cells'  => $ship['cells'],
            'hits'   => array_values(array_unique($ship['hits'])),
        ];
    }

    return [
        'ships' => $ships,
        'fogged'=> $board['fogged'],
        'manifestLeft' => $board['manifest_left'],
        'remaining' => gsBoardRemaining($board)
    ];
}

function gsSerializeMatch($match, $player)
{
    $op = gsOpponent($player);
    return [
        'id' => $match['id'],
        'boardSize' => $match['board_size'],
        'seed' => $match['seed'],
        'phase' => $match['phase'],
        'turn' => $match['turn'],
        'you'  => $player,
        'opponent' => $op,
        'players' => [
            'you' => $match['players'][$player] ?? null,
            'opponent' => $match['players'][$op] ?? null
        ],
        'ready' => [
            'you' => $match['players'][$player]['ready'] ?? false,
            'opponent' => $match['players'][$op]['ready'] ?? false,
        ],
        'winner' => $match['winner'] ?? null,
        'turnCounter' => $match['turn_counter'] ?? 0,
        'boards' => [
            'radar' => gsSerializeRadar($match, $player),
            'own'   => gsSerializeOwnBoard($match['boards'][$player])
        ],
        'log' => array_values($match['log'] ?? [])
    ];
}

function gsEnsureFleetComplete($board, $fleet)
{
    foreach ($fleet as $def) {
        if (gsShipCountByType($board, $def['type']) < 1) {
            return false;
        }
    }
    return true;
}

// ---------------------------------------------------------
// Input
// ---------------------------------------------------------
$input = json_decode(file_get_contents("php://input"), true);
if (!is_array($input)) {
    $input = [];
}

$action = $input['action'] ?? $_POST['action'] ?? $_GET['action'] ?? null;
if (!$action) {
    gsRespond(["ok" => false, "error" => "Keine Aktion angegeben."], 400);
}

$matches = gsLoadMatches($storeFile);
$dirty = gsCleanupMatches($matches);
$now = time();

// ---------------------------------------------------------
// Actions
// ---------------------------------------------------------
switch ($action) {
    case 'create': {
        $boardSize = intval($input['boardSize'] ?? 8);
        if (!in_array($boardSize, [8, 10])) {
            $boardSize = 8;
        }

        $name = gsCleanName($input['user'] ?? '', 'Host');
        $id = gsMatchId($matches);
        $tok = gsToken();
        $seed = random_int(1000, 999999999);

        $matches[$id] = [
            'id' => $id,
            'board_size' => $boardSize,
            'seed' => $seed,
            'rng_state' => $seed,
            'phase' => 'lobby',
            'turn' => null,
            'turn_counter' => 0,
            'created_at' => $now,
            'updated_at' => $now,
            'winner' => null,
            'players' => [
                'A' => ['user' => $name, 'token' => $tok, 'ready' => false],
                'B' => ['user' => null,  'token' => null, 'ready' => false],
            ],
            'boards' => [
                'A' => gsEmptyBoard($boardSize),
                'B' => gsEmptyBoard($boardSize)
            ],
            'haunted' => [
                'last_event_turn' => -1,
                'last_decay_target' => null
            ],
            'log' => []
        ];

        $dirty = true;
        gsSaveMatches($storeFile, $matches);
        gsRespond([
            'ok' => true,
            'token' => $tok,
            'match' => gsSerializeMatch($matches[$id], 'A')
        ]);
        break;
    }

    case 'join': {
        $id = strtoupper(trim($input['matchId'] ?? ''));
        if (!$id || !isset($matches[$id])) {
            gsRespond(['ok' => false, 'error' => 'Match nicht gefunden.'], 404);
        }
        $match = &$matches[$id];
        if (!empty($match['players']['B']['token']) && empty($input['rejoin'])) {
            gsRespond(['ok' => false, 'error' => 'Match ist bereits voll.'], 400);
        }

        $name = gsCleanName($input['user'] ?? '', 'Gast');
        if (empty($match['players']['B']['token'])) {
            $tok = gsToken();
            $match['players']['B'] = ['user' => $name, 'token' => $tok, 'ready' => false];
        } else {
            $tok = $match['players']['B']['token'];
            $match['players']['B']['user'] = $match['players']['B']['user'] ?: $name;
        }

        if ($match['phase'] === 'lobby') {
            $match['phase'] = 'setup';
        }

        $match['updated_at'] = $now;
        $dirty = true;
        gsSaveMatches($storeFile, $matches);
        gsRespond([
            'ok' => true,
            'token' => $tok,
            'match' => gsSerializeMatch($match, 'B')
        ]);
        break;
    }

    case 'state': {
        $id = strtoupper(trim($input['matchId'] ?? ''));
        $tok = $input['token'] ?? '';
        if (!$id || !isset($matches[$id])) {
            gsRespond(['ok' => false, 'error' => 'Match nicht gefunden.'], 404);
        }

        $match = &$matches[$id];
        $player = gsPlayerByToken($match, $tok);
        if (!$player) {
            gsRespond(['ok' => false, 'error' => 'Ungültiges Token.'], 403);
        }

        gsRevealPendingShots($match);
        if ($dirty) gsSaveMatches($storeFile, $matches);
        gsRespond(['ok' => true, 'match' => gsSerializeMatch($match, $player)]);
        break;
    }

    case 'place': {
        $id = strtoupper(trim($input['matchId'] ?? ''));
        $tok = $input['token'] ?? '';
        $ship = strtolower(trim($input['ship'] ?? ''));
        $pos = $input['pos'] ?? '';
        $dir = strtolower(trim($input['dir'] ?? 'h'));
        if (!$id || !isset($matches[$id])) gsRespond(['ok' => false, 'error' => 'Match nicht gefunden.'], 404);
        $match = &$matches[$id];
        $player = gsPlayerByToken($match, $tok);
        if (!$player) gsRespond(['ok' => false, 'error' => 'Ungültiges Token.'], 403);
        if ($match['phase'] !== 'setup') gsRespond(['ok' => false, 'error' => 'Schiffe können nur in der Setup-Phase platziert werden.'], 400);

        $fleet = gsFleet($match['board_size']);
        $board = &$match['boards'][$player];
        $normPos = gsParsePos($pos, $match['board_size']);
        if (!$normPos) gsRespond(['ok' => false, 'error' => 'Ungültige Position.'], 400);
        if (!in_array($dir, ['h','v'])) $dir = 'h';

        $error = gsPlaceShip($board, $fleet, $ship, $normPos, $dir, $match['board_size']);
        if ($error) gsRespond(['ok' => false, 'error' => $error], 400);

        $match['updated_at'] = $now;
        $dirty = true;
        gsSaveMatches($storeFile, $matches);
        gsRespond(['ok' => true, 'match' => gsSerializeMatch($match, $player)]);
        break;
    }

    case 'auto': {
        $id = strtoupper(trim($input['matchId'] ?? ''));
        $tok = $input['token'] ?? '';
        if (!$id || !isset($matches[$id])) gsRespond(['ok' => false, 'error' => 'Match nicht gefunden.'], 404);
        $match = &$matches[$id];
        $player = gsPlayerByToken($match, $tok);
        if (!$player) gsRespond(['ok' => false, 'error' => 'Ungültiges Token.'], 403);
        if ($match['phase'] !== 'setup') gsRespond(['ok' => false, 'error' => 'Automatische Platzierung nur in der Setup-Phase möglich.'], 400);

        $fleet = gsFleet($match['board_size']);
        $match['boards'][$player] = gsEmptyBoard($match['board_size']);
        $error = gsAutoPlace($match['boards'][$player], $fleet, $match['board_size'], $match['rng_state']);
        if ($error) gsRespond(['ok' => false, 'error' => $error], 400);

        $match['updated_at'] = $now;
        $dirty = true;
        gsSaveMatches($storeFile, $matches);
        gsRespond(['ok' => true, 'match' => gsSerializeMatch($match, $player)]);
        break;
    }

    case 'ready': {
        $id = strtoupper(trim($input['matchId'] ?? ''));
        $tok = $input['token'] ?? '';
        if (!$id || !isset($matches[$id])) gsRespond(['ok' => false, 'error' => 'Match nicht gefunden.'], 404);
        $match = &$matches[$id];
        $player = gsPlayerByToken($match, $tok);
        if (!$player) gsRespond(['ok' => false, 'error' => 'Ungültiges Token.'], 403);
        if (!in_array($match['phase'], ['setup','active'])) gsRespond(['ok' => false, 'error' => 'Ready geht nur während Setup.'], 400);

        $fleet = gsFleet($match['board_size']);
        if (!gsEnsureFleetComplete($match['boards'][$player], $fleet)) {
            gsRespond(['ok' => false, 'error' => 'Bitte platziere alle Schiffe, bevor du ready drückst.'], 400);
        }

        $match['players'][$player]['ready'] = true;
        if ($match['players']['A']['ready'] && $match['players']['B']['ready']) {
            $match['phase'] = 'active';
            $match['turn'] = gsMulberry32Next($match['rng_state']) > 0.5 ? 'A' : 'B';
            $match['turn_counter'] = 0;
            gsAddLog($match, [
                'type' => 'system',
                'text' => 'Beide Flotten im Schatten. Die Jagd beginnt.',
            ]);
        }

        $match['updated_at'] = $now;
        $dirty = true;
        gsSaveMatches($storeFile, $matches);
        gsRespond(['ok' => true, 'match' => gsSerializeMatch($match, $player)]);
        break;
    }

    case 'fire': {
        $id = strtoupper(trim($input['matchId'] ?? ''));
        $tok = $input['token'] ?? '';
        $pos = $input['pos'] ?? '';
        if (!$id || !isset($matches[$id])) gsRespond(['ok' => false, 'error' => 'Match nicht gefunden.'], 404);
        $match = &$matches[$id];
        $player = gsPlayerByToken($match, $tok);
        if (!$player) gsRespond(['ok' => false, 'error' => 'Ungültiges Token.'], 403);

        if ($match['phase'] !== 'active') gsRespond(['ok' => false, 'error' => 'Match ist nicht aktiv.'], 400);
        if ($match['turn'] !== $player) gsRespond(['ok' => false, 'error' => 'Du bist nicht am Zug.'], 400);

        gsRevealPendingShots($match);

        $normPos = gsParsePos($pos, $match['board_size']);
        if (!$normPos) gsRespond(['ok' => false, 'error' => 'Ungültige Position.'], 400);

        [$ok, $err] = gsApplyFire($match, $player, $normPos);
        if (!$ok) gsRespond(['ok' => false, 'error' => $err], 400);

        $match['turn_counter'] = ($match['turn_counter'] ?? 0) + 1;
        if ($match['phase'] === 'active') {
            $match['turn'] = gsOpponent($player);
        }

        gsMaybeEvent($match, $player);
        gsRevealPendingShots($match);

        $match['updated_at'] = $now;
        $dirty = true;
        gsSaveMatches($storeFile, $matches);
        gsRespond(['ok' => true, 'match' => gsSerializeMatch($match, $player)]);
        break;
    }

    case 'leave': {
        $id = strtoupper(trim($input['matchId'] ?? ''));
        $tok = $input['token'] ?? '';
        if (!$id || !isset($matches[$id])) {
            if ($dirty) gsSaveMatches($storeFile, $matches);
            gsRespond(['ok' => true, 'message' => 'Match bereits beendet.']);
        }

        $match = &$matches[$id];
        $player = gsPlayerByToken($match, $tok);
        if (!$player) gsRespond(['ok' => false, 'error' => 'Ungültiges Token.'], 403);

        $op = gsOpponent($player);
        $match['phase'] = 'finished';
        $match['winner'] = $op;
        $match['turn'] = null;
        gsAddLog($match, [
            'type' => 'system',
            'text' => "{$player} kappt die Verbindung und gibt auf.",
        ]);

        $match['updated_at'] = $now;
        $dirty = true;
        gsSaveMatches($storeFile, $matches);
        gsRespond(['ok' => true, 'match' => gsSerializeMatch($match, $player)]);
        break;
    }

    case 'rematch': {
        $id = strtoupper(trim($input['matchId'] ?? ''));
        $tok = $input['token'] ?? '';
        if (!$id || !isset($matches[$id])) gsRespond(['ok' => false, 'error' => 'Match nicht gefunden.'], 404);
        $match = &$matches[$id];
        $player = gsPlayerByToken($match, $tok);
        if (!$player) gsRespond(['ok' => false, 'error' => 'Ungültiges Token.'], 403);
        if ($match['phase'] !== 'finished') gsRespond(['ok' => false, 'error' => 'Rematch erst nach Ende möglich.'], 400);

        $seed = random_int(1000, 999999999);
        $match['seed'] = $seed;
        $match['rng_state'] = $seed;
        $match['phase'] = 'setup';
        $match['turn'] = null;
        $match['turn_counter'] = 0;
        $match['winner'] = null;
        $match['boards'] = [
            'A' => gsEmptyBoard($match['board_size']),
            'B' => gsEmptyBoard($match['board_size'])
        ];
        $match['players']['A']['ready'] = false;
        $match['players']['B']['ready'] = false;
        $match['haunted'] = [
            'last_event_turn' => -1,
            'last_decay_target' => null
        ];
        $match['log'] = [];
        gsAddLog($match, [
            'type' => 'system',
            'text' => 'Rematch gestartet. Schiffe kehren als Schatten zurück.',
        ]);
        $match['updated_at'] = $now;
        $dirty = true;
        gsSaveMatches($storeFile, $matches);
        gsRespond(['ok' => true, 'match' => gsSerializeMatch($match, $player)]);
        break;
    }

    default:
        if ($dirty) gsSaveMatches($storeFile, $matches);
        gsRespond(['ok' => false, 'error' => 'Unbekannte Aktion.'], 400);
}
