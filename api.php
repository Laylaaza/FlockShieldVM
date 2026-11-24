<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$dataFile = __DIR__ . DIRECTORY_SEPARATOR . 'data.json';

function respond(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function readRecords(string $dataFile): array
{
    if (!is_file($dataFile)) {
        return [];
    }

    $contents = file_get_contents($dataFile);
    if ($contents === false || trim($contents) === '') {
        return [];
    }

    $decoded = json_decode($contents, true);
    if (!is_array($decoded) || !isset($decoded['records']) || !is_array($decoded['records'])) {
        return [];
    }

    return $decoded['records'];
}

function validateSensorData(mixed $payload): ?string
{
    if (!is_array($payload)) {
        return 'Request body must be a JSON object.';
    }

    if (!array_key_exists('pht', $payload) || !is_int($payload['pht']) || $payload['pht'] < 0) {
        return 'The "pht" value must be a non-negative integer.';
    }

    if (!array_key_exists('ir', $payload) || !is_int($payload['ir']) || !in_array($payload['ir'], [0, 1], true)) {
        return 'The "ir" value must be an integer: 0 or 1.';
    }

    if (!array_key_exists('Color', $payload) || !is_int($payload['Color']) || !in_array($payload['Color'], [0, 1, 2], true)) {
        return 'The "Color" value must be an integer: 0 (white), 1 (red), or 2 (off).';
    }

    return null;
}

if ($method === 'GET') {
    $records = readRecords($dataFile);
    $limit = isset($_GET['limit']) ? filter_var($_GET['limit'], FILTER_VALIDATE_INT) : null;

    if ($limit === false || ($limit !== null && ($limit < 1 || $limit > 1000))) {
        respond(400, ['error' => 'The limit must be an integer from 1 to 1000.']);
    }

    if ($limit !== null) {
        $records = array_slice($records, -$limit);
    }

    respond(200, [
        'count' => count($records),
        'records' => $records,
    ]);
}

if ($method === 'POST') {
    $rawBody = file_get_contents('php://input');
    if ($rawBody === false || trim($rawBody) === '') {
        respond(400, ['error' => 'Request body must contain JSON.']);
    }

    $payload = json_decode($rawBody, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        respond(400, ['error' => 'Request body must contain valid JSON.']);
    }

    $validationError = validateSensorData($payload);
    if ($validationError !== null) {
        respond(422, ['error' => $validationError]);
    }

    $record = [
        'pht' => $payload['pht'],
        'ir' => $payload['ir'],
        'Color' => $payload['Color'],
        'received_at' => gmdate('c'),
    ];
    $records = readRecords($dataFile);
    $records[] = $record;

    $encoded = json_encode(
        ['records' => $records],
        JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );

    if ($encoded === false || file_put_contents($dataFile, $encoded . PHP_EOL, LOCK_EX) === false) {
        respond(500, ['error' => 'Could not save the sensor data.']);
    }

    respond(201, $record);
}

header('Allow: GET, POST');
respond(405, ['error' => 'Method not allowed. Use GET or POST.']);
