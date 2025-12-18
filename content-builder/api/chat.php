<?php
// Einfaches Online-Chat/BBS für das Terminal: Präsenz + Posteingang
header('Content-Type: application/json; charset=utf-8');

$dataDir = __DIR__ . '/data';
$storeFile = $dataDir . '/chat-store.json';
$presenceTtl = 120;       // Sekunden, die jemand als "online" gilt
$maxMessages = 100;       // Pro Benutzer gespeicherte Nachrichten
$maxMessageLength = 500;  // Zeichen pro Nachricht

if (!is_dir($dataDir)) {
    mkdir($dataDir, 0777, true);
}

function respond($payload, $code = 200)
{
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function cleanName($name, $fallback = 'guest')
{
    $name = trim((string) $name);
    $name = preg_replace('/[^a-z0-9 äöüß_\-\.]/iu', '', $name);
    $name = $name === '' ? $fallback : $name;
    return substr($name, 0, 40);
}

function cleanMessage($message, $maxLen)
{
    $msg = trim((string) $message);
    // Mehrzeilige Nachrichten auf eine Zeile begrenzen
    $msg = preg_replace('/\s+/', ' ', $msg);
    return substr($msg, 0, $maxLen);
}

function readStore($file)
{
    if (!file_exists($file)) {
        return ['presence' => [], 'mailbox' => []];
    }
    $raw = file_get_contents($file);
    $data = json_decode($raw, true);
    return [
        'presence' => is_array($data['presence'] ?? null) ? $data['presence'] : [],
        'mailbox'  => is_array($data['mailbox'] ?? null) ? $data['mailbox'] : [],
    ];
}

function saveStore($file, $store)
{
    $fp = fopen($file, 'c+');
    if (!$fp) {
        respond(['ok' => false, 'error' => 'Speicherdatei konnte nicht geöffnet werden.'], 500);
    }
    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        respond(['ok' => false, 'error' => 'Dateilock fehlgeschlagen.'], 500);
    }

    ftruncate($fp, 0);
    fwrite($fp, json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

function cleanupPresence(&$store, $ttl)
{
    $now = time();
    $store['presence'] = array_filter(
        $store['presence'] ?? [],
        fn($lastSeen) => is_int($lastSeen) && $now - $lastSeen <= $ttl
    );
}

function unreadCount($store, $user)
{
    $mailbox = $store['mailbox'][$user] ?? [];
    if (!is_array($mailbox)) return 0;
    return array_reduce($mailbox, fn($carry, $msg) => $carry + (!empty($msg['read']) ? 0 : 1), 0);
}

function appendMessage(&$store, $recipient, $message, $maxMessages)
{
    $store['mailbox'][$recipient] = $store['mailbox'][$recipient] ?? [];
    $list = is_array($store['mailbox'][$recipient]) ? $store['mailbox'][$recipient] : [];
    $list[] = $message;
    if (count($list) > $maxMessages) {
        $list = array_slice($list, -$maxMessages);
    }
    $store['mailbox'][$recipient] = $list;
}

function messagesFor($store, $user)
{
    $messages = $store['mailbox'][$user] ?? [];
    if (!is_array($messages)) return [];
    usort($messages, fn($a, $b) => ($a['ts'] ?? 0) <=> ($b['ts'] ?? 0));
    return $messages;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    $input = [];
}
$action = $input['action'] ?? $_POST['action'] ?? $_GET['action'] ?? null;

if (!$action) {
    respond(['ok' => false, 'error' => 'Keine Aktion angegeben.'], 400);
}

$store = readStore($storeFile);
$dirty = false;

switch ($action) {
    case 'heartbeat':
        $user = cleanName($input['user'] ?? '', 'guest');
        cleanupPresence($store, $presenceTtl);
        $store['presence'][$user] = time();
        $online = [];
        if (!empty($input['includeOnline'])) {
            foreach ($store['presence'] as $name => $ts) {
                $online[] = ['name' => $name, 'lastSeen' => $ts];
            }
            usort($online, fn($a, $b) => strcasecmp($a['name'], $b['name']));
        }
        $dirty = true;
        saveStore($storeFile, $store);
        respond([
            'ok' => true,
            'online' => $online,
            'unread' => unreadCount($store, $user),
        ]);
        break;

    case 'send':
        $from = cleanName($input['from'] ?? '', 'guest');
        $to = cleanName($input['to'] ?? '', '');
        $text = cleanMessage($input['text'] ?? '', $maxMessageLength);
        if ($to === '' || $text === '') {
            respond(['ok' => false, 'error' => 'Empfänger und Nachricht sind erforderlich.'], 400);
        }
        appendMessage($store, $to, [
            'from' => $from,
            'text' => $text,
            'ts'   => time(),
            'read' => false,
        ], $maxMessages);
        $dirty = true;
        saveStore($storeFile, $store);
        respond(['ok' => true]);
        break;

    case 'inbox':
        $user = cleanName($input['user'] ?? '', '');
        if ($user === '') {
            respond(['ok' => false, 'error' => 'Benutzername fehlt.'], 400);
        }
        $includeRead = filter_var($input['includeRead'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $markRead = !array_key_exists('markRead', $input) || filter_var($input['markRead'], FILTER_VALIDATE_BOOLEAN);

        $messages = messagesFor($store, $user);
        $filtered = $includeRead ? $messages : array_values(array_filter($messages, fn($m) => empty($m['read'])));
        $unreadBefore = unreadCount($store, $user);

        if ($markRead && $unreadBefore > 0 && isset($store['mailbox'][$user])) {
            $store['mailbox'][$user] = array_map(function ($msg) {
                $msg['read'] = true;
                return $msg;
            }, $store['mailbox'][$user]);
            $dirty = true;
            saveStore($storeFile, $store);
        }

        respond([
            'ok' => true,
            'messages' => $filtered,
            'unread' => $markRead ? 0 : $unreadBefore,
        ]);
        break;

    default:
        respond(['ok' => false, 'error' => 'Unbekannte Aktion.'], 400);
}

