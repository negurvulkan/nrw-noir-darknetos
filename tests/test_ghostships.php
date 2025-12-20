<?php
// Mock server variables to satisfy basename check in ghostships.php
$_SERVER['SCRIPT_FILENAME'] = __DIR__ . '/test_ghostships.php';

// Include the logic file
require_once __DIR__ . '/../content-builder/api/ghostships.php';

// Mock Config
global $GS_GAME_CONFIG;
$GS_GAME_CONFIG = [
    'boardSize' => 8,
    'fleetCounts' => ['scout' => 2],
    'fleetExpanded' => [['type' => 'scout', 'length' => 2], ['type' => 'scout', 'length' => 2]],
    'rules' => ['hauntedEvents' => ['enabled' => false]]
];

// Helper to create a ship
function createShip($id, $type, $cells) {
    return [
        'id' => $id,
        'type' => $type,
        'length' => count($cells),
        'cells' => $cells,
        'hits' => []
    ];
}

// Setup a mock match
$match = [
    'id' => 'TEST-001',
    'board_size' => 8,
    'seed' => 12345,
    'phase' => 'active',
    'turn' => 'A',
    'turn_counter' => 10,
    'players' => [
        'A' => ['user' => 'PlayerA', 'token' => 'tokA', 'ready' => true],
        'B' => ['user' => 'PlayerB', 'token' => 'tokB', 'ready' => true],
    ],
    'spectators' => [
        'tokSpec' => ['user' => 'Spec', 'token' => 'tokSpec']
    ],
    'boards' => [
        'A' => [
            'ships' => [],
            'shots' => [],
            'fogged' => [],
            'manifest_left' => 0
        ],
        'B' => [
            'ships' => [],
            'shots' => [],
            'fogged' => [],
            'manifest_left' => 0
        ]
    ],
    'log' => []
];

// Player B ships
$ship1 = createShip('scout-1', 'scout', ['A1', 'A2']); // Intact
$ship2 = createShip('scout-2', 'scout', ['C1', 'C2']); // Sunk

// Hits on Ship 2 (Sunk)
$ship2['hits'] = ['C1', 'C2'];
// One hit on Ship 1 (Not sunk)
$ship1['hits'] = ['A1'];

$match['boards']['B']['ships'] = [$ship1, $ship2];

// Register shots in board B (fired by A)
$match['boards']['B']['shots'][] = ['pos' => 'C1', 'by' => 'A', 'result' => 'hit', 'revealed' => true];
$match['boards']['B']['shots'][] = ['pos' => 'C2', 'by' => 'A', 'result' => 'sunk', 'revealed' => true];
$match['boards']['B']['shots'][] = ['pos' => 'A1', 'by' => 'A', 'result' => 'hit', 'revealed' => true];

echo "--- Test 1: Active Game (Player A View) ---\n";
$radarA = gsSerializeRadar($match, 'A');
$visibleShipsA = $radarA['ships'];
echo "Visible Ships count: " . count($visibleShipsA) . "\n";
if (count($visibleShipsA) === 1 && $visibleShipsA[0]['id'] === 'scout-2') {
    echo "PASS: Only sunk ship visible.\n";
} else {
    echo "FAIL: Expected 1 sunk ship, got " . count($visibleShipsA) . "\n";
    print_r($visibleShipsA);
}

echo "\n--- Test 2: Game Finished (Player A View) ---\n";
$matchFinished = $match;
$matchFinished['phase'] = 'finished';
$radarFinished = gsSerializeRadar($matchFinished, 'A');
$visibleShipsFinished = $radarFinished['ships'];
echo "Visible Ships count: " . count($visibleShipsFinished) . "\n";
if (count($visibleShipsFinished) === 2) {
    echo "PASS: All ships visible.\n";
} else {
    echo "FAIL: Expected 2 ships, got " . count($visibleShipsFinished) . "\n";
}

echo "\n--- Test 3: Spectator View (Active Game) ---\n";
$serializedSpec = gsSerializeMatch($match, 'spectator');

// Spectator sees 'A' as Own, 'B' as Radar
$ownBoardSpec = $serializedSpec['boards']['own'];
$radarBoardSpec = $serializedSpec['boards']['radar'];

// Check Own (Player A has no ships in this mock, let's add one to verify)
// Actually we didn't add ships to A, let's check B (Radar) which has 2 ships
$visibleRadarSpec = $radarBoardSpec['ships'];
echo "Spectator Radar Ships count: " . count($visibleRadarSpec) . "\n";

if (count($visibleRadarSpec) === 2) {
    echo "PASS: Spectator sees all radar ships.\n";
} else {
    echo "FAIL: Expected 2 ships for spectator, got " . count($visibleRadarSpec) . "\n";
}

// Check identity mapping
if ($serializedSpec['you'] === null && $serializedSpec['spectator'] === true) {
    echo "PASS: Spectator identity flags correct.\n";
} else {
    echo "FAIL: Spectator identity flags incorrect.\n";
}
