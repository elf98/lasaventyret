<?php
/**
 * Tar emot egna inspelningar av bokstavsljud från föräldravyn och sparar dem i recorded/ med ett
 * index (recorded/index.json) som appen läser vid start. Så kan Erik spela in på datorn och iPaden
 * hör inspelningen utan export/import eller ny deploy.
 *
 *   POST   /upload-recording.php?id=letter.s   (body: audio/wav, header X-Recording-Key)
 *   DELETE /upload-recording.php?id=letter.s
 *
 * Kräver att vhosten kör PHP (php-fpm) och att recorded/ är skrivbar för www-data.
 * Samma protokoll som Vite-pluginen scripts/recording-upload.ts i dev.
 */
header('Content-Type: application/json');
$key = $_SERVER['HTTP_X_RECORDING_KEY'] ?? '';
if ($key !== 'lasaventyret') {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'nyckel']);
    exit;
}
$id = $_GET['id'] ?? '';
if (!preg_match('/^[a-z0-9_.åäö-]{1,80}$/iu', $id)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'id']);
    exit;
}
$dir = __DIR__ . '/recorded';
if (!is_dir($dir) && !@mkdir($dir, 0775, true)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'katalog']);
    exit;
}
$indexPath = $dir . '/index.json';
$index = is_file($indexPath) ? json_decode(file_get_contents($indexPath), true) : null;
if (!is_array($index) || !isset($index['items'])) $index = ['items' => []];
$file = preg_replace('/[^a-zA-Z0-9._-]/', '_', strtr($id, ['å' => 'aa', 'ä' => 'ae', 'ö' => 'oe', 'Å' => 'AA', 'Ä' => 'AE', 'Ö' => 'OE'])) . '.wav';
$path = $dir . '/' . $file;

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    if (is_file($path)) @unlink($path);
    unset($index['items'][$id]);
    file_put_contents($indexPath, json_encode($index, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
    echo json_encode(['ok' => true]);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false]);
    exit;
}
$data = file_get_contents('php://input');
if (strlen($data) < 100 || strlen($data) > 5000000 || substr($data, 0, 4) !== 'RIFF') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'wav']);
    exit;
}
file_put_contents($path, $data);
@chmod($path, 0664);
$hash = substr(sha1($data), 0, 12);
$index['items'][$id] = ['file' => $file, 'hash' => $hash, 'at' => gmdate('c')];
file_put_contents($indexPath, json_encode($index, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
@chmod($indexPath, 0664);
echo json_encode(['ok' => true, 'file' => $file, 'hash' => $hash]);
