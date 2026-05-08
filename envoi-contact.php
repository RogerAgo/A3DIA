<?php
/**
 * =========================================================
 * A3DIA — Envoi de formulaire de contact par email SMTP
 * =========================================================
 *
 * Ce script :
 *  - reçoit les données du formulaire de contact
 *  - les valide et nettoie
 *  - envoie un email via SMTP (Hostinger) à contact@a3dia-info.org
 *
 * Aucune dépendance externe (pas de PHPMailer, pas de Composer).
 * Implémentation SMTP native compatible avec n'importe quel serveur PHP.
 */

// =========================================================
// CONFIGURATION (lue depuis .env, avec fallback)
// =========================================================
$config = [
    'smtp_host' => 'smtp.hostinger.com',
    'smtp_port' => 465,
    'smtp_user' => 'contact@a3dia-info.org',
    'smtp_pass' => '',                      // chargé depuis .env ci-dessous
    'mail_from' => 'contact@a3dia-info.org',
    'mail_to'   => 'contact@a3dia-info.org',
    'from_name' => 'Site A3DIA',
];

// Charger le mot de passe depuis le fichier .env (jamais commité sur Git)
$envFile = __DIR__ . '/.env';
if (is_file($envFile)) {
    // Parsing manuel robuste (parse_ini_file échoue parfois sur certains caractères spéciaux)
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        // Ignorer les commentaires (commencent par ; ou #)
        if ($line === '' || $line[0] === ';' || $line[0] === '#') continue;
        // Format : CLE=VALEUR ou CLE="VALEUR"
        if (strpos($line, '=') === false) continue;
        list($key, $value) = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value);
        // Retirer les guillemets si présents
        if (strlen($value) >= 2 && (
            ($value[0] === '"' && substr($value, -1) === '"') ||
            ($value[0] === "'" && substr($value, -1) === "'")
        )) {
            $value = substr($value, 1, -1);
        }
        if ($key === 'SMTP_PASS') {
            $config['smtp_pass'] = $value;
        }
    }
}

// =========================================================
// RÉPONSES JSON
// =========================================================
header('Content-Type: application/json; charset=utf-8');

function respond($success, $message = '', $code = 200) {
    http_response_code($code);
    echo json_encode([
        'success' => $success,
        $success ? 'message' : 'error' => $message,
    ]);
    exit;
}

// =========================================================
// VALIDATION DE LA REQUÊTE
// =========================================================
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, 'Méthode non autorisée', 405);
}

// Anti-spam : honeypot avec nom moins évident pour éviter les autofills
// On accepte aussi 'website' (ancien nom) pour rétrocompatibilité
$honeypot = trim($_POST['hp_check'] ?? '');
$legacyHoneypot = trim($_POST['website'] ?? '');

// On ne déclenche le piège que si le champ contient quelque chose qui ressemble à un vrai input bot
// (les extensions de navigateur remplissent souvent avec des données aléatoires, mais peuvent aussi laisser vide)
if (!empty($honeypot)) {
    error_log("[A3DIA] Honeypot 'hp_check' déclenché : " . $honeypot);
    respond(true, 'Message reçu');
}
// On garde la vérif legacy mais loggée pour debug
if (!empty($legacyHoneypot)) {
    error_log("[A3DIA] Honeypot 'website' déclenché (extension autofill?) : " . $legacyHoneypot);
    // On NE bloque PLUS sur ce champ, qui se faisait remplir par les extensions
    // respond(true, 'Message reçu');
}

// Récupération des champs
$nom        = trim(strip_tags($_POST['nom']        ?? ''));
$email      = filter_var(trim($_POST['email']      ?? ''), FILTER_VALIDATE_EMAIL);
$telephone  = trim(strip_tags($_POST['telephone']  ?? ''));
$entreprise = trim(strip_tags($_POST['entreprise'] ?? ''));
$message    = trim(strip_tags($_POST['message']    ?? ''));

// Validation des champs obligatoires
if (empty($nom) || !$email || empty($message)) {
    respond(false, 'Veuillez remplir le nom, un email valide et un message.', 400);
}

// Anti-flood : vérifier qu'on n'a pas reçu une autre requête du même IP dans les 30 dernières secondes
$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
$lockFile = sys_get_temp_dir() . '/a3dia_contact_' . md5($ip);
if (is_file($lockFile) && (time() - filemtime($lockFile)) < 30) {
    respond(false, 'Veuillez patienter quelques secondes avant de renvoyer un message.', 429);
}
@touch($lockFile);

// =========================================================
// CONSTRUCTION DU MESSAGE
// =========================================================
$sujet = "Nouveau contact — A3DIA";

$corps  = "Vous avez reçu un nouveau message via le formulaire d'a3dia-info.org\n\n";
$corps .= str_repeat("-", 50) . "\n";
$corps .= "Nom        : $nom\n";
$corps .= "Email      : $email\n";
$corps .= "Téléphone  : " . ($telephone  ?: 'non renseigné') . "\n";
$corps .= "Entreprise : " . ($entreprise ?: 'non renseignée') . "\n";
$corps .= str_repeat("-", 50) . "\n\n";
$corps .= "Message :\n\n$message\n\n";
$corps .= str_repeat("-", 50) . "\n";
$corps .= "Pour répondre, cliquez simplement « Répondre ». Votre réponse arrivera directement à $email.\n";
$corps .= "\nIP : $ip\n";
$corps .= "Date : " . date('d/m/Y H:i:s') . "\n";

// =========================================================
// ENVOI VIA SMTP
// =========================================================
$debugLog = []; // Log de debug accessible en cas d'erreur

try {
    sendSmtpMail($config, $email, $nom, $sujet, $corps, $debugLog);
    
    // En mode debug, on peut ajouter le log au message pour comprendre
    if (isset($_GET['debug'])) {
        respond(true, "Message envoyé. Debug: " . implode(" | ", $debugLog));
    }
    respond(true, 'Message envoyé avec succès');
} catch (Exception $e) {
    error_log("[A3DIA] Erreur envoi mail : " . $e->getMessage());
    error_log("[A3DIA] Debug log : " . implode(" | ", $debugLog));
    
    $errorDetail = $e->getMessage();
    if (isset($_GET['debug'])) {
        $errorDetail .= " | Trace: " . implode(" → ", $debugLog);
    }
    respond(false, "Erreur d'envoi : " . $errorDetail, 500);
}

// =========================================================
// FONCTION SMTP NATIVE (pas de dépendance externe)
// =========================================================
function sendSmtpMail(array $config, string $replyEmail, string $replyName, string $subject, string $body, array &$debugLog = []): void {
    $debugLog[] = "Connect to {$config['smtp_host']}:{$config['smtp_port']}";
    
    // Connexion
    $context = stream_context_create([
        'ssl' => [
            'verify_peer'      => true,
            'verify_peer_name' => true,
        ]
    ]);

    $protocol = $config['smtp_port'] == 465 ? 'ssl://' : '';
    $host     = $protocol . $config['smtp_host'];
    $errno    = 0;
    $errstr   = '';

    $socket = @stream_socket_client(
        "$host:" . $config['smtp_port'],
        $errno,
        $errstr,
        15,
        STREAM_CLIENT_CONNECT,
        $context
    );

    if (!$socket) {
        throw new Exception("Connexion SMTP échouée : $errstr ($errno)");
    }
    stream_set_timeout($socket, 15);
    $debugLog[] = "Socket OK";

    // Helper pour lire les réponses serveur
    $expect = function (int $expectedCode, string $context = '') use ($socket, &$debugLog) {
        $response = '';
        while ($line = fgets($socket, 515)) {
            $response .= $line;
            if (substr($line, 3, 1) === ' ') break; // fin de réponse multi-ligne
        }
        $code = (int) substr($response, 0, 3);
        $debugLog[] = "$context → $code";
        if ($code !== $expectedCode) {
            throw new Exception("SMTP $context : code $code reçu (attendu $expectedCode). Réponse : " . trim($response));
        }
        return $response;
    };

    // Helper pour envoyer une commande
    $send = function (string $cmd) use ($socket) {
        fwrite($socket, $cmd . "\r\n");
    };

    // Bannière de bienvenue
    $expect(220, 'banner');

    // EHLO
    $send('EHLO ' . ($config['smtp_host']));
    $expect(250, 'EHLO');

    // Si port 587, on doit STARTTLS
    if ($config['smtp_port'] == 587) {
        $send('STARTTLS');
        $expect(220, 'STARTTLS');
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new Exception("Échec activation TLS");
        }
        $send('EHLO ' . $config['smtp_host']);
        $expect(250, 'EHLO post-TLS');
    }

    // Authentification AUTH LOGIN
    $send('AUTH LOGIN');
    $expect(334, 'AUTH LOGIN');
    $send(base64_encode($config['smtp_user']));
    $expect(334, 'username');
    $send(base64_encode($config['smtp_pass']));
    $expect(235, 'auth password');

    // Enveloppe
    $send('MAIL FROM:<' . $config['mail_from'] . '>');
    $expect(250, 'MAIL FROM');
    $send('RCPT TO:<' . $config['mail_to'] . '>');
    $expect(250, 'RCPT TO');

    // DATA
    $send('DATA');
    $expect(354, 'DATA');

    // Headers et corps en UTF-8
    $headers  = "From: " . encodeMimeHeader($config['from_name']) . " <" . $config['mail_from'] . ">\r\n";
    $headers .= "To: <" . $config['mail_to'] . ">\r\n";
    $headers .= "Reply-To: " . encodeMimeHeader($replyName) . " <$replyEmail>\r\n";
    $headers .= "Subject: " . encodeMimeHeader($subject) . "\r\n";
    $headers .= "Date: " . date('r') . "\r\n";
    $headers .= "Message-ID: <" . md5(uniqid('', true)) . "@a3dia-info.org>\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $headers .= "Content-Transfer-Encoding: 8bit\r\n";

    // Échapper les lignes commençant par "." (règle RFC 5321)
    $bodySafe = preg_replace('/^\./m', '..', $body);

    fwrite($socket, $headers . "\r\n" . $bodySafe . "\r\n.\r\n");
    $expect(250, 'envoi corps');

    // QUIT
    $send('QUIT');
    fclose($socket);
}

/**
 * Encode un header MIME pour gérer les accents UTF-8 (RFC 2047)
 */
function encodeMimeHeader(string $value): string {
    if (preg_match('/[^\x20-\x7e]/', $value)) {
        return '=?UTF-8?B?' . base64_encode($value) . '?=';
    }
    return $value;
}
