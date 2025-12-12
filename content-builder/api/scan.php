<?php
// scan.php – rekursiver Scanner für content/*.json
header("Content-Type: application/json; charset=utf-8");

$base = __DIR__ . "/../../content";

function scanDirRecursive($dir, $relBase = "") {
    $result = [];

    foreach (scandir($dir) as $item) {
        if ($item === "." || $item === "..") continue;

        $full = $dir . "/" . $item;
        $rel  = ltrim($relBase . "/" . $item, "/");

        if (is_dir($full)) {
            $result = array_merge(
                $result,
                scanDirRecursive($full, $rel)
            );
        } else if (is_file($full) && preg_match('/\.json$/i', $item)) {
            $jsonRaw = file_get_contents($full);
            $json = json_decode($jsonRaw, true);

            // Wir erwarten JSON mit mindestens "path" oder leiten es aus dem Dateinamen ab
            $path = null;
            if (is_array($json) && isset($json["path"])) {
                $path = $json["path"];
            } else {
                // Fallback: Dateiname ohne .json als Pfad verwenden
                $path = preg_replace('/\.json$/i', '', $rel);
            }

            // Normierung: führende Slashes entfernen
            $path = ltrim($path, "/");

            $result[] = [
                "path"     => $path,                         // z.B. "events/night-zero"
                "file"     => $rel,                          // z.B. "events/night-zero.json"
                "title"    => $json["title"] ?? null,
                "password" => $json["password"] ?? null
            ];
        }
    }
    return $result;
}

echo json_encode([
    "ok"    => true,
    "files" => scanDirRecursive($base)
]);