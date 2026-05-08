<?php
/**
 * =========================================================
 * A3DIA — Diagnostic SMTP
 * =========================================================
 *
 * Outil pour tester la configuration SMTP sans envoyer de mail.
 * À utiliser pour debugger l'authentification.
 *
 * USAGE :
 *   1. Uploader ce fichier dans public_html/
 *   2. Visiter https://a3dia-info.org/diagnostic-smtp.php
 *   3. Voir le résultat
 *   4. SUPPRIMER CE FICHIER UNE FOIS LE PROBLÈME RÉSOLU
 *      (sinon il reste accessible publiquement)
 */

header('Content-Type: text/plain; charset=utf-8');

// Charger le .env
$envFile = __DIR__ . '/.env';
$smtp_pass = '';

if (is_file($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === ';' || $line[0] === '#') continue;
        if (strpos($line, '=') === false) continue;
        list($key, $value) = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        if (strlen($value) >= 2 && (
            ($value[0] === '"' && substr($value, -1) === '"') ||
            ($value[0] === "'" && substr($value, -1) === "'")
        )) {
            $value = substr($value, 1, -1);
        }
        if ($key === 'SMTP_PASS') $smtp_pass = $value;
    }
}

echo "==========================================\n";
echo "  DIAGNOSTIC SMTP A3DIA\n";
echo "==========================================\n\n";

echo "[1] FICHIER .env\n";
echo "    Existe : " . (is_file($envFile) ? "OUI" : "NON") . "\n";
echo "    Lisible : " . (is_readable($envFile) ? "OUI" : "NON") . "\n";
echo "    Mot de passe lu : " . (empty($smtp_pass) ? "VIDE !" : "longueur " . strlen($smtp_pass) . " caractères") . "\n";
echo "    Premier caractère : " . (empty($smtp_pass) ? "—" : substr($smtp_pass, 0, 1)) . "\n";
echo "    Dernier caractère : " . (empty($smtp_pass) ? "—" : substr($smtp_pass, -1)) . "\n\n";

if (empty($smtp_pass)) {
    echo "❌ PROBLÈME : Le mot de passe est vide. Vérifiez le fichier .env\n";
    exit;
}

// Tester plusieurs configurations SMTP
$configs_to_test = [
    [
        'name'   => 'smtp.hostinger.com:465 (SSL)',
        'host'   => 'smtp.hostinger.com',
        'port'   => 465,
        'secure' => 'ssl',
    ],
    [
        'name'   => 'smtp.hostinger.com:587 (STARTTLS)',
        'host'   => 'smtp.hostinger.com',
        'port'   => 587,
        'secure' => 'starttls',
    ],
    [
        'name'   => 'smtp.titan.email:465 (SSL)',
        'host'   => 'smtp.titan.email',
        'port'   => 465,
        'secure' => 'ssl',
    ],
    [
        'name'   => 'smtp.titan.email:587 (STARTTLS)',
        'host'   => 'smtp.titan.email',
        'port'   => 587,
        'secure' => 'starttls',
    ],
];

$user = 'contact@a3dia-info.org';

foreach ($configs_to_test as $cfg) {
    echo "─────────────────────────────────────────\n";
    echo "[TEST] {$cfg['name']}\n";
    echo "─────────────────────────────────────────\n";

    $result = testSmtpAuth($cfg['host'], $cfg['port'], $cfg['secure'], $user, $smtp_pass);

    if ($result['ok']) {
        echo "  ✅ AUTHENTIFICATION RÉUSSIE !\n";
        echo "  → Utilisez cette config dans envoi-contact.php :\n";
        echo "    \$SMTP_HOST = '{$cfg['host']}';\n";
        echo "    \$SMTP_PORT = {$cfg['port']};\n";
        echo "  Et adaptez SMTPSecure à : '{$cfg['secure']}'\n\n";
    } else {
        echo "  ❌ ÉCHEC\n";
        echo "  Étape : {$result['step']}\n";
        echo "  Erreur : {$result['error']}\n\n";
    }
}

echo "==========================================\n";
echo "  FIN DU DIAGNOSTIC\n";
echo "==========================================\n";
echo "\n⚠️  N'OUBLIEZ PAS DE SUPPRIMER CE FICHIER (diagnostic-smtp.php) une fois le problème résolu !\n";

// =========================================================
// FONCTION DE TEST
// =========================================================
function testSmtpAuth($host, $port, $secure, $user, $pass) {
    $context = stream_context_create([
        'ssl' => [
            'verify_peer'      => false, // pour le diagnostic, on accepte tout cert
            'verify_peer_name' => false,
            'allow_self_signed' => true,
        ]
    ]);

    $protocol = ($port == 465 && $secure === 'ssl') ? 'ssl://' : '';
    $errno = 0;
    $errstr = '';

    $socket = @stream_socket_client(
        "$protocol$host:$port",
        $errno,
        $errstr,
        10,
        STREAM_CLIENT_CONNECT,
        $context
    );

    if (!$socket) {
        return ['ok' => false, 'step' => 'connexion', 'error' => "$errstr ($errno)"];
    }
    stream_set_timeout($socket, 10);

    $read = function() use ($socket) {
        $r = '';
        while ($line = fgets($socket, 515)) {
            $r .= $line;
            if (substr($line, 3, 1) === ' ') break;
        }
        return $r;
    };

    // Banner
    $banner = $read();
    if (substr($banner, 0, 3) !== '220') {
        return ['ok' => false, 'step' => 'banner', 'error' => trim($banner)];
    }

    // EHLO
    fwrite($socket, "EHLO test.local\r\n");
    $ehlo = $read();
    if (substr($ehlo, 0, 3) !== '250') {
        return ['ok' => false, 'step' => 'EHLO', 'error' => trim($ehlo)];
    }

    // STARTTLS si nécessaire
    if ($secure === 'starttls') {
        fwrite($socket, "STARTTLS\r\n");
        $tls = $read();
        if (substr($tls, 0, 3) !== '220') {
            return ['ok' => false, 'step' => 'STARTTLS', 'error' => trim($tls)];
        }
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            return ['ok' => false, 'step' => 'TLS', 'error' => 'Activation TLS échouée'];
        }
        fwrite($socket, "EHLO test.local\r\n");
        $ehlo2 = $read();
    }

    // AUTH LOGIN
    fwrite($socket, "AUTH LOGIN\r\n");
    $auth = $read();
    if (substr($auth, 0, 3) !== '334') {
        return ['ok' => false, 'step' => 'AUTH LOGIN', 'error' => trim($auth)];
    }

    fwrite($socket, base64_encode($user) . "\r\n");
    $userResp = $read();
    if (substr($userResp, 0, 3) !== '334') {
        return ['ok' => false, 'step' => 'username', 'error' => trim($userResp)];
    }

    fwrite($socket, base64_encode($pass) . "\r\n");
    $passResp = $read();
    if (substr($passResp, 0, 3) !== '235') {
        return ['ok' => false, 'step' => 'password', 'error' => trim($passResp)];
    }

    // QUIT propre
    fwrite($socket, "QUIT\r\n");
    fclose($socket);

    return ['ok' => true];
}
