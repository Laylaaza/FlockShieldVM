<?php

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($path === '/api' || str_starts_with($path, '/api/')) {
    require __DIR__ . '/api.php';
    return true;
}

if ($path === '/api.php') {
    require __DIR__ . '/smartlamp/api.php';
    return true;
}

if (in_array($path, ['/Dashboard', '/Dashboard/'], true)) {
    header('Location: /');
    return true;
}

if (preg_match('#^/Dashboard/(index\.html|gebeurtenissen\.html|style\.css|overzicht\.js|gebeurtenissen\.js|api\.js)$#', $path, $matches)) {
    header('Location: /' . $matches[1]);
    return true;
}

return false;
