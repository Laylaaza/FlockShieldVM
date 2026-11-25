<?php
/*
 * FlockShield API
 *
 * Start vanuit de hoofdmap van het project:
 * php -S localhost:8000 -t frontend backend/router.php
 *
 * Voorbeeld:
 * http://localhost:8000/api/status
 */

// --------------------------------------------------
// 1. INSTELLINGEN
// --------------------------------------------------

// Vul deze gegevens in zodra je toegang hebt tot SQL Server.
$dbHost = "127.0.0.1,15433";
$dbName = "FlockShield";
$dbUser = "flockshield_api";
$dbPass = getenv("FLOCKSHIELD_DB_PASSWORD");

// --------------------------------------------------
// 2. ALGEMENE API-INSTELLINGEN
// --------------------------------------------------

header("Content-Type: application/json; charset=utf-8");

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

// JSON terugsturen en de request beëindigen.
function sendJson($data, $statusCode = 200)
{
    http_response_code($statusCode);

    echo json_encode(
        $data,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE
    );

    exit;
}

// JSON uit een POST-request lezen.
function getRequestData()
{
    $input = file_get_contents("php://input");
    $data = json_decode($input, true);

    if (!is_array($data)) {
        sendJson([
            "error" => "Ongeldige JSON-invoer"
        ], 400);
    }

    return $data;
}

// Controleren of een waarde een geldige UUID is.
function isValidUuid($value)
{
    return is_string($value) &&
        preg_match(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
            $value
        );
}

// Datum controleren en omzetten naar UTC.
function normalizeDateTime($value)
{
    try {
        $date = new DateTimeImmutable($value);
        $date = $date->setTimezone(new DateTimeZone("UTC"));

        return $date->format("Y-m-d H:i:s.v");
    } catch (Exception $e) {
        sendJson([
            "error" => "Ongeldige datum of tijd"
        ], 400);
    }
}

// --------------------------------------------------
// 3. VERBINDING MET SQL SERVER
// --------------------------------------------------

try {
    $db = new PDO(
        "sqlsrv:Server=$dbHost;Database=$dbName;Encrypt=true;TrustServerCertificate=true",
        $dbUser,
        $dbPass
    );

    $db->setAttribute(
        PDO::ATTR_ERRMODE,
        PDO::ERRMODE_EXCEPTION
    );

} catch (PDOException $e) {
    sendJson([
        "error" => "Databaseverbinding mislukt",
        "message" => "Controleer de SQL Server-instellingen."
    ], 500);
}

// --------------------------------------------------
// 4. REQUEST EN URL BEPALEN
// --------------------------------------------------

$method = $_SERVER["REQUEST_METHOD"];
$uri = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);

// --------------------------------------------------
// 5. API STATUS
// GET /api/status
// --------------------------------------------------

if ($method === "GET" && $uri === "/api/status") {

    $db->query("SELECT 1");

    sendJson([
        "status" => "online",
        "project" => "FlockShield",
        "message" => "API werkt",
        "database" => "connected"
    ]);
}

// --------------------------------------------------
// 6. MODULES OPHALEN
// GET /api/modules
// --------------------------------------------------

elseif ($method === "GET" && $uri === "/api/modules") {

    $statement = $db->query("
        SELECT
            module_id,
            module_code,
            naam,
            module_type,
            status
        FROM Modules
        ORDER BY module_id
    ");

    $modules = $statement->fetchAll(PDO::FETCH_ASSOC);

    sendJson([
        "count" => count($modules),
        "modules" => $modules
    ]);
}

// --------------------------------------------------
// 7. DETECTIES OPHALEN
// GET /api/detections
// --------------------------------------------------

elseif ($method === "GET" && $uri === "/api/detections") {

    $limit = isset($_GET["limit"])
        ? (int) $_GET["limit"]
        : 100;

    $limit = max(1, min($limit, 1000));

    $statement = $db->query("
        SELECT TOP ($limit)
            detectie_id,
            module_id,
            detectie_tijdstip,
            ontvangen_op,
            betrouwbaarheidsscore,
            invoerbron,
            model_versie
        FROM Detecties
        ORDER BY detectie_tijdstip DESC
    ");

    $detections = $statement->fetchAll(PDO::FETCH_ASSOC);

    sendJson([
        "count" => count($detections),
        "detections" => $detections
    ]);
}

// --------------------------------------------------
// 8. NIEUWE DETECTIE ONTVANGEN
// POST /api/detections
// --------------------------------------------------

elseif ($method === "POST" && $uri === "/api/detections") {

    $data = getRequestData();

    $required = [
        "module_id",
        "detectie_tijdstip",
        "invoerbron"
    ];

    foreach ($required as $field) {
        if (!isset($data[$field])) {
            sendJson([
                "error" => "Verplicht veld ontbreekt",
                "field" => $field
            ], 400);
        }
    }

    if (!is_numeric($data["module_id"]) ||
        (int) $data["module_id"] < 1) {
        sendJson(["error" => "Ongeldig module_id"], 400);
    }

    $score = $data["betrouwbaarheidsscore"] ?? null;

    if ($score !== null &&
        (!is_numeric($score) || $score < 0 || $score > 1)) {
        sendJson([
            "error" => "Betrouwbaarheidsscore moet tussen 0 en 1 liggen"
        ], 400);
    }

    $detectieId = $data["detectie_id"] ?? null;

    if ($detectieId !== null && !isValidUuid($detectieId)) {
        sendJson(["error" => "Ongeldige detectie_id"], 400);
    }

    $detectieTijdstip = normalizeDateTime(
        $data["detectie_tijdstip"]
    );

    $ontvangenOp = gmdate("Y-m-d H:i:s.v");

    if ($detectieId === null) {
        $detectieId = $db->query("SELECT NEWID()")->fetchColumn();
    }

    $statement = $db->prepare("
        INSERT INTO Detecties (
            detectie_id,
            module_id,
            detectie_tijdstip,
            ontvangen_op,
            betrouwbaarheidsscore,
            invoerbron,
            model_versie
        )
        VALUES (
            :detectie_id,
            :module_id,
            :detectie_tijdstip,
            :ontvangen_op,
            :score,
            :invoerbron,
            :model_versie
        )
    ");

    $statement->execute([
        ":detectie_id" => $detectieId,
        ":module_id" => (int) $data["module_id"],
        ":detectie_tijdstip" => $detectieTijdstip,
        ":ontvangen_op" => $ontvangenOp,
        ":score" => $score,
        ":invoerbron" => $data["invoerbron"],
        ":model_versie" => $data["model_versie"] ?? null
    ]);

    sendJson([
        "message" => "Detectie opgeslagen",
        "detectie_id" => $detectieId
    ], 201);
}

// --------------------------------------------------
// 9. AFSCHRIKACTIES OPHALEN
// GET /api/actions
// --------------------------------------------------

elseif ($method === "GET" && $uri === "/api/actions") {

    $limit = isset($_GET["limit"])
        ? (int) $_GET["limit"]
        : 100;

    $limit = max(1, min($limit, 1000));

    $statement = $db->query("
        SELECT TOP ($limit)
            afschrikactie_id,
            module_id,
            detectie_id,
            mechanisme_type,
            opdracht_tijdstip,
            activering_bevestigd_op,
            status,
            foutmelding
        FROM Afschrikacties
        ORDER BY opdracht_tijdstip DESC
    ");

    $actions = $statement->fetchAll(PDO::FETCH_ASSOC);

    sendJson([
        "count" => count($actions),
        "actions" => $actions
    ]);
}

// --------------------------------------------------
// 10. NIEUWE AFSCHRIKACTIE ONTVANGEN
// POST /api/actions
// --------------------------------------------------

elseif ($method === "POST" && $uri === "/api/actions") {

    $data = getRequestData();

    $required = [
        "module_id",
        "detectie_id",
        "mechanisme_type",
        "status"
    ];

    foreach ($required as $field) {
        if (!isset($data[$field])) {
            sendJson([
                "error" => "Verplicht veld ontbreekt",
                "field" => $field
            ], 400);
        }
    }

    if (!isValidUuid($data["detectie_id"])) {
        sendJson(["error" => "Ongeldige detectie_id"], 400);
    }

    if (!is_numeric($data["module_id"]) ||
        (int) $data["module_id"] < 1) {
        sendJson(["error" => "Ongeldig module_id"], 400);
    }

    $actionId = $db->query("SELECT NEWID()")->fetchColumn();

    $commandTime = isset($data["opdracht_tijdstip"])
        ? normalizeDateTime($data["opdracht_tijdstip"])
        : gmdate("Y-m-d H:i:s.v");

    $confirmedTime = isset($data["activering_bevestigd_op"])
        ? normalizeDateTime($data["activering_bevestigd_op"])
        : null;

    $statement = $db->prepare("
        INSERT INTO Afschrikacties (
            afschrikactie_id,
            module_id,
            detectie_id,
            mechanisme_type,
            opdracht_tijdstip,
            activering_bevestigd_op,
            status,
            foutmelding
        )
        VALUES (
            :action_id,
            :module_id,
            :detectie_id,
            :mechanisme_type,
            :command_time,
            :confirmed_time,
            :status,
            :foutmelding
        )
    ");

    $statement->execute([
        ":action_id" => $actionId,
        ":module_id" => (int) $data["module_id"],
        ":detectie_id" => $data["detectie_id"],
        ":mechanisme_type" => $data["mechanisme_type"],
        ":command_time" => $commandTime,
        ":confirmed_time" => $confirmedTime,
        ":status" => $data["status"],
        ":foutmelding" => $data["foutmelding"] ?? null
    ]);

    sendJson([
        "message" => "Afschrikactie opgeslagen",
        "afschrikactie_id" => $actionId
    ], 201);
}

// --------------------------------------------------
// 11. ENERGIEMETINGEN OPHALEN
// GET /api/energy
// --------------------------------------------------

elseif ($method === "GET" && $uri === "/api/energy") {

    $limit = isset($_GET["limit"])
        ? (int) $_GET["limit"]
        : 100;

    $limit = max(1, min($limit, 1000));

    $statement = $db->query("
        SELECT TOP ($limit)
            energiemeting_id,
            module_id,
            start_tijdstip,
            eind_tijdstip,
            energieverbruik_wh,
            meetmethode,
            activiteit
        FROM Energiemetingen
        ORDER BY start_tijdstip DESC
    ");

    $measurements = $statement->fetchAll(PDO::FETCH_ASSOC);

    sendJson([
        "count" => count($measurements),
        "measurements" => $measurements
    ]);
}

// --------------------------------------------------
// 12. NIEUWE ENERGIEMETING ONTVANGEN
// POST /api/energy
// --------------------------------------------------

elseif ($method === "POST" && $uri === "/api/energy") {

    $data = getRequestData();

    $required = [
        "module_id",
        "start_tijdstip",
        "eind_tijdstip",
        "energieverbruik_wh",
        "meetmethode"
    ];

    foreach ($required as $field) {
        if (!isset($data[$field])) {
            sendJson([
                "error" => "Verplicht veld ontbreekt",
                "field" => $field
            ], 400);
        }
    }

    if (!is_numeric($data["module_id"]) ||
        (int) $data["module_id"] < 1 ||
        !is_numeric($data["energieverbruik_wh"]) ||
        $data["energieverbruik_wh"] < 0) {
        sendJson(["error" => "Ongeldige energiemeting"], 400);
    }

    $statement = $db->prepare("
        INSERT INTO Energiemetingen (
            module_id,
            start_tijdstip,
            eind_tijdstip,
            energieverbruik_wh,
            meetmethode,
            activiteit
        )
        VALUES (
            :module_id,
            :start_time,
            :end_time,
            :energy,
            :method,
            :activity
        )
    ");

    $statement->execute([
        ":module_id" => (int) $data["module_id"],
        ":start_time" => normalizeDateTime($data["start_tijdstip"]),
        ":end_time" => normalizeDateTime($data["eind_tijdstip"]),
        ":energy" => $data["energieverbruik_wh"],
        ":method" => $data["meetmethode"],
        ":activity" => $data["activiteit"] ?? null
    ]);

    sendJson([
        "message" => "Energiemeting opgeslagen"
    ], 201);
}

// --------------------------------------------------
// 13. AI-TESTRONDES OPHALEN
// GET /api/ai/test-rounds
// --------------------------------------------------

elseif ($method === "GET" && $uri === "/api/ai/test-rounds") {

    $statement = $db->query("
        SELECT
            testronde_id,
            naam,
            model_versie,
            gegevensbron,
            beschrijving,
            uitgevoerd_op
        FROM AI_TestRondes
        ORDER BY uitgevoerd_op DESC
    ");

    $rounds = $statement->fetchAll(PDO::FETCH_ASSOC);

    sendJson([
        "count" => count($rounds),
        "test_rounds" => $rounds
    ]);
}

// --------------------------------------------------
// 14. AI-EVALUATIES OPHALEN
// GET /api/ai/evaluations
// --------------------------------------------------

elseif ($method === "GET" && $uri === "/api/ai/evaluations") {

    $statement = $db->query("
        SELECT
            evaluatie_id,
            testronde_id,
            test_item_id,
            testomstandigheid,
            vogels_werkelijk_aanwezig,
            vogels_gedetecteerd,
            betrouwbaarheidsscore
        FROM AI_Evaluaties
        ORDER BY evaluatie_id DESC
    ");

    $evaluations = $statement->fetchAll(PDO::FETCH_ASSOC);

    sendJson([
        "count" => count($evaluations),
        "evaluations" => $evaluations
    ]);
}

// --------------------------------------------------
// 15. NIEUWE AI-EVALUATIE ONTVANGEN
// POST /api/ai/evaluations
// --------------------------------------------------

elseif ($method === "POST" && $uri === "/api/ai/evaluations") {

    $data = getRequestData();

    $required = [
        "testronde_id",
        "test_item_id",
        "vogels_werkelijk_aanwezig",
        "vogels_gedetecteerd"
    ];

    foreach ($required as $field) {
        if (!array_key_exists($field, $data)) {
            sendJson([
                "error" => "Verplicht veld ontbreekt",
                "field" => $field
            ], 400);
        }
    }

    $actual = filter_var(
        $data["vogels_werkelijk_aanwezig"],
        FILTER_VALIDATE_BOOLEAN,
        FILTER_NULL_ON_FAILURE
    );

    $detected = filter_var(
        $data["vogels_gedetecteerd"],
        FILTER_VALIDATE_BOOLEAN,
        FILTER_NULL_ON_FAILURE
    );

    if ($actual === null || $detected === null) {
        sendJson([
            "error" => "Vogelvelden moeten true of false zijn"
        ], 400);
    }

    $score = $data["betrouwbaarheidsscore"] ?? null;

    if ($score !== null &&
        (!is_numeric($score) || $score < 0 || $score > 1)) {
        sendJson([
            "error" => "Betrouwbaarheidsscore moet tussen 0 en 1 liggen"
        ], 400);
    }

    $statement = $db->prepare("
        INSERT INTO AI_Evaluaties (
            testronde_id,
            test_item_id,
            testomstandigheid,
            vogels_werkelijk_aanwezig,
            vogels_gedetecteerd,
            betrouwbaarheidsscore
        )
        VALUES (
            :round_id,
            :item_id,
            :condition,
            :actual,
            :detected,
            :score
        )
    ");

    $statement->execute([
        ":round_id" => (int) $data["testronde_id"],
        ":item_id" => $data["test_item_id"],
        ":condition" => $data["testomstandigheid"] ?? null,
        ":actual" => $actual,
        ":detected" => $detected,
        ":score" => $score
    ]);

    sendJson([
        "message" => "AI-evaluatie opgeslagen"
    ], 201);
}

// --------------------------------------------------
// 16. DASHBOARDGEGEVENS
// GET /api/dashboard
// --------------------------------------------------

elseif ($method === "GET" && $uri === "/api/dashboard") {

    $modules = $db->query("
        SELECT
            COUNT(*) AS total
        FROM Modules
    ")->fetch(PDO::FETCH_ASSOC);

    $detectionsToday = $db->query("
        SELECT COUNT(*)
        FROM Detecties
        WHERE CAST(detectie_tijdstip AS DATE) =
              CAST(SYSUTCDATETIME() AS DATE)
    ")->fetchColumn();

    $actionsToday = $db->query("
        SELECT COUNT(*)
        FROM Afschrikacties
        WHERE CAST(opdracht_tijdstip AS DATE) =
              CAST(SYSUTCDATETIME() AS DATE)
    ")->fetchColumn();

    $latestDetection = $db->query("
        SELECT TOP 1
            detectie_id,
            module_id,
            detectie_tijdstip,
            betrouwbaarheidsscore,
            invoerbron
        FROM Detecties
        ORDER BY detectie_tijdstip DESC
    ")->fetch(PDO::FETCH_ASSOC);

    $moduleStatuses = $db->query("
        SELECT status, COUNT(*) AS aantal
        FROM Modules
        GROUP BY status
    ")->fetchAll(PDO::FETCH_ASSOC);

    sendJson([
        "modules" => [
            "total" => (int) $modules["total"],
            "statuses" => $moduleStatuses
        ],
        "detections" => [
            "today" => (int) $detectionsToday,
            "latest" => $latestDetection ?: null
        ],
        "actions" => [
            "today" => (int) $actionsToday
        ]
    ]);
}

// --------------------------------------------------
// 17. ONBEKEND ENDPOINT
// --------------------------------------------------

else {
    sendJson([
        "message" => "Endpoint niet gevonden of HTTP-methode niet toegestaan",
        "method" => $method,
        "path" => $uri
    ], 404);
}