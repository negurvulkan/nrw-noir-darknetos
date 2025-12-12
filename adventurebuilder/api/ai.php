<?php
// AI Assist proxy for NRW Noir Adventure Builder
// Responsible for guarding the OpenAI key, feature flag, simple caching and rate limiting.

header('Content-Type: application/json');

$projectRoot = realpath(__DIR__ . '/../../');
$envPath = $projectRoot . '/.env';

loadEnvFile($envPath);

// Configuration
$featureEnabled = envBool('DARKNET_AI_ENABLED', false);
$apiKey = env('OPENAI_API_KEY');
$model = env('OPENAI_MODEL', 'gpt-4.1-mini');
$maxOutputTokens = (int) env('OPENAI_MAX_OUTPUT_TOKENS', 500);
$temperature = (float) env('OPENAI_TEMPERATURE', 0.8);
$cacheEnabled = envBool('AI_CACHE_ENABLED', true);
$cacheTtl = (int) env('AI_CACHE_TTL_SECONDS', 86400);

$cacheDir = __DIR__ . '/cache';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0777, true);
}

if (!$featureEnabled) {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        http_response_code(403);
        echo json_encode(['error' => 'AI Assist ist deaktiviert.', 'enabled' => false]);
        exit;
    }
    http_response_code(403);
    echo json_encode(['error' => 'AI Assist ist deaktiviert.']);
    exit;
}

if (!$apiKey) {
    http_response_code(500);
    echo json_encode(['error' => 'OPENAI_API_KEY fehlt']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        echo json_encode([
            'enabled' => true,
            'model' => $model,
            'cache' => $cacheEnabled,
        ]);
        exit;
    }
    http_response_code(405);
    echo json_encode(['error' => 'Unsupported method']);
    exit;
}

// simple request size guard
$rawBody = file_get_contents('php://input');
if (strlen($rawBody) > 4096) {
    http_response_code(413);
    echo json_encode(['error' => 'Payload zu groß (max 4 KB).']);
    exit;
}

$payload = json_decode($rawBody, true);
if (!$payload) {
    http_response_code(400);
    echo json_encode(['error' => 'Ungültiger JSON-Body']);
    exit;
}

enforceRateLimit($cacheDir);

$validationError = validateRequest($payload);
if ($validationError) {
    http_response_code(422);
    echo json_encode(['error' => $validationError]);
    exit;
}

$prompt = buildPrompt($payload);
$cacheKey = hash('sha256', json_encode([$payload, $prompt]));

if ($cacheEnabled) {
    $cached = readCache($cacheDir, $cacheKey, $cacheTtl);
    if ($cached !== null) {
        echo $cached;
        exit;
    }
}

$openAiResponse = callOpenAi($apiKey, $model, $temperature, $maxOutputTokens, $prompt);
if ($openAiResponse['error'] ?? false) {
    http_response_code(500);
    echo json_encode(['error' => $openAiResponse['error']]);
    exit;
}

$content = $openAiResponse['content'] ?? '';
$decoded = decodeJsonResponse($content);
if ($decoded === null) {
    http_response_code(502);
    echo json_encode(['error' => 'Antwort war kein gültiges JSON']);
    exit;
}

$jsonResponse = json_encode($decoded);
if ($cacheEnabled) {
    writeCache($cacheDir, $cacheKey, $jsonResponse);
}

echo $jsonResponse;
exit;

// --- Helpers ---

function loadEnvFile($path)
{
    if (!file_exists($path)) {
        return;
    }
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (str_starts_with(trim($line), '#') || strpos($line, '=') === false) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        $_ENV[$key] = $value;
        putenv($key . '=' . $value);
    }
}

function env($key, $default = null)
{
    $val = getenv($key);
    return $val === false ? $default : $val;
}

function envBool($key, $default = false)
{
    $val = env($key, null);
    if ($val === null) return $default;
    return in_array(strtolower((string) $val), ['1', 'true', 'yes', 'on'], true);
}

function validateRequest($payload)
{
    $mode = $payload['mode'] ?? '';
    $entityType = $payload['entityType'] ?? '';
    if (!in_array($mode, ['entity', 'events', 'plot'], true)) {
        return 'mode muss entity, events oder plot sein';
    }
    if ($mode === 'entity' && !in_array($entityType, ['room', 'item', 'object', 'npc', 'enemy'], true)) {
        return 'entityType fehlt oder ist ungültig';
    }
    return null;
}

function enforceRateLimit($cacheDir)
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $window = 600; // 10 minutes
    $maxRequests = 30;
    $file = $cacheDir . '/rate_' . preg_replace('/[^a-zA-Z0-9_]/', '_', $ip) . '.json';
    $now = time();
    $entries = [];
    if (file_exists($file)) {
        $existing = json_decode(file_get_contents($file), true);
        if (is_array($existing)) $entries = $existing;
    }
    $entries = array_values(array_filter($entries, fn($ts) => $ts > $now - $window));
    if (count($entries) >= $maxRequests) {
        http_response_code(429);
        echo json_encode(['error' => 'Rate Limit erreicht, bitte später erneut versuchen']);
        exit;
    }
    $entries[] = $now;
    file_put_contents($file, json_encode($entries));
}

function buildPrompt($payload)
{
    $mode = $payload['mode'];
    $entity = $payload['entityType'] ?? '';
    $seed = trim($payload['seed'] ?? '');
    $context = $payload['context'] ?? [];
    $constraints = $payload['constraints'] ?? [];
    $language = $constraints['language'] ?? 'de';
    $tone = $constraints['tone'] ?? 'noir';
    $length = $constraints['length'] ?? 'medium';
    $existingIds = $context['existingIds'] ?? [];
    $style = $payload['style'] ?? 'nrw-noir-darknet';

    $guidance = [
        'Du arbeitest für den NRW Noir DarknetOS Adventure Builder.',
        'Sprache: ' . $language . ' | Ton: ' . $tone . ' | Länge: ' . $length,
        'Gib ausschließlich gültiges JSON ohne Markdown oder zusätzlichen Text zurück.',
        'Nutze ASCII-sichere IDs: lowercase, a-z0-9_, ersetze ä->ae, ö->oe, ü->ue, ß->ss.',
        'Vermeide IDs aus existingIds: ' . implode(', ', $existingIds),
        'Event-Typen: message, ascii, flag_set, flag_if (mit then/else Arrays), add_item, remove_item, unlock_exit, lock_exit, transition, trigger_fight.',
        'Halte dich an den Style: ' . $style,
    ];

    $user = [
        'mode' => $mode,
        'entityType' => $entity,
        'seed' => $seed,
        'context' => $context,
        'constraints' => $constraints,
    ];

    return implode("\n", $guidance) . "\nNutzerwunsch:" . json_encode($user, JSON_UNESCAPED_UNICODE);
}

function callOpenAi($apiKey, $model, $temperature, $maxOutputTokens, $prompt)
{
    $endpoint = 'https://api.openai.com/v1/chat/completions';
    $body = [
        'model' => $model,
        'messages' => [
            ['role' => 'system', 'content' => 'Du bist ein Adventure-Autor. Antworte nur mit JSON ohne Umschweife.'],
            ['role' => 'user', 'content' => $prompt],
        ],
        'temperature' => $temperature,
        'max_output_tokens' => $maxOutputTokens,
        'response_format' => ['type' => 'json_object'],
    ];

    $options = [
        CURLOPT_URL => $endpoint,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($body),
        CURLOPT_TIMEOUT => 30,
    ];

    $ch = curl_init();
    curl_setopt_array($ch, $options);
    $result = curl_exec($ch);
    if ($result === false) {
        return ['error' => 'OpenAI-Anfrage fehlgeschlagen: ' . curl_error($ch)];
    }
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $json = json_decode($result, true);
    if ($status >= 400) {
        $msg = $json['error']['message'] ?? ('HTTP Fehler ' . $status);
        return ['error' => $msg];
    }
    $content = $json['choices'][0]['message']['content'] ?? '';
    return ['content' => $content];
}

function decodeJsonResponse($content)
{
    $decoded = json_decode($content, true);
    if (is_array($decoded)) return $decoded;
    // Try to salvage JSON block
    if (preg_match('/\{.*\}/s', $content, $m)) {
        $decoded = json_decode($m[0], true);
        if (is_array($decoded)) return $decoded;
    }
    return null;
}

function readCache($dir, $key, $ttl)
{
    $file = $dir . '/' . $key . '.json';
    if (!file_exists($file)) return null;
    if (time() - filemtime($file) > $ttl) return null;
    return file_get_contents($file);
}

function writeCache($dir, $key, $content)
{
    $file = $dir . '/' . $key . '.json';
    @file_put_contents($file, $content);
}

if (!function_exists('str_starts_with')) {
    function str_starts_with($haystack, $needle)
    {
        return strpos($haystack, $needle) === 0;
    }
}
