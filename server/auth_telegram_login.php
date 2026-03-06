<?php
// server/auth_telegram_login.php
// Validates Telegram Login OIDC id_token (JWT) using JWKS public keys

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth.php';

/**
 * Validate a Telegram Login id_token and return user data
 * @param string $idToken - JWT id_token from Telegram.Login.auth()
 * @return array|false - User data array or false on failure
 */
function validateTelegramIdToken($idToken)
{
    // 1. Decode JWT without verification first (to get header)
    $parts = explode('.', $idToken);
    if (count($parts) !== 3) {
        TelegramLogger::logError('auth', ['message' => 'Invalid JWT format', 'code' => 'JWT_FORMAT']);
        return false;
    }

    $header = json_decode(base64url_decode($parts[0]), true);
    $payload = json_decode(base64url_decode($parts[1]), true);
    $signature = base64url_decode($parts[2]);

    if (!$header || !$payload || !$signature) {
        TelegramLogger::logError('auth', ['message' => 'Failed to decode JWT parts', 'code' => 'JWT_DECODE']);
        return false;
    }

    // 2. Verify claims
    if (($payload['iss'] ?? '') !== 'https://oauth.telegram.org') {
        TelegramLogger::logError('auth', ['message' => 'Invalid issuer', 'code' => 'JWT_ISS', 'stack' => json_encode($payload)]);
        return false;
    }

    if (($payload['aud'] ?? '') !== TG_CLIENT_ID) {
        TelegramLogger::logError('auth', ['message' => 'Invalid audience', 'code' => 'JWT_AUD', 'stack' => "Expected: " . TG_CLIENT_ID . ", Got: " . ($payload['aud'] ?? 'null')]);
        return false;
    }

    if (($payload['exp'] ?? 0) < time()) {
        TelegramLogger::logError('auth', ['message' => 'Token expired', 'code' => 'JWT_EXP']);
        return false;
    }

    // 3. Fetch JWKS and verify signature
    $kid = $header['kid'] ?? null;
    $alg = $header['alg'] ?? null;

    if (!$kid || !$alg) {
        TelegramLogger::logError('auth', ['message' => 'Missing kid or alg in JWT header', 'code' => 'JWT_HEADER']);
        return false;
    }

    $jwk = getJWK($kid);
    if (!$jwk) {
        TelegramLogger::logError('auth', ['message' => 'JWK not found for kid: ' . $kid, 'code' => 'JWK_NOT_FOUND']);
        return false;
    }

    $publicKey = jwkToPublicKey($jwk);
    if (!$publicKey) {
        TelegramLogger::logError('auth', ['message' => 'Failed to convert JWK to public key', 'code' => 'JWK_CONVERT']);
        return false;
    }

    // Verify RS256 signature
    $signInput = $parts[0] . '.' . $parts[1];
    $verified = openssl_verify($signInput, $signature, $publicKey, OPENSSL_ALGO_SHA256);

    if ($verified !== 1) {
        TelegramLogger::logError('auth', ['message' => 'JWT signature verification failed', 'code' => 'JWT_SIG']);
        return false;
    }

    // 4. Extract user data
    return [
        'id' => $payload['id'] ?? $payload['sub'] ?? null,
        'first_name' => $payload['name'] ?? 'User',
        'username' => $payload['preferred_username'] ?? '',
        'photo_url' => $payload['picture'] ?? ''
    ];
}

/**
 * Fetch JWKS from Telegram and find key by kid
 */
function getJWK($kid)
{
    // Cache JWKS in /tmp for 1 hour
    $cacheFile = sys_get_temp_dir() . '/tg_jwks_cache.json';
    $cacheTTL = 3600;

    $jwks = null;
    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTTL) {
        $jwks = json_decode(file_get_contents($cacheFile), true);
    }

    if (!$jwks) {
        $ctx = stream_context_create(['http' => ['timeout' => 10]]);
        $response = @file_get_contents('https://oauth.telegram.org/.well-known/jwks.json', false, $ctx);
        if (!$response) {
            TelegramLogger::logError('auth', ['message' => 'Failed to fetch JWKS', 'code' => 'JWKS_FETCH']);
            return null;
        }
        $jwks = json_decode($response, true);
        file_put_contents($cacheFile, $response);
    }

    if (!isset($jwks['keys']))
        return null;

    foreach ($jwks['keys'] as $key) {
        if (($key['kid'] ?? '') === $kid) {
            return $key;
        }
    }
    return null;
}

/**
 * Convert JWK (RSA) to OpenSSL public key resource
 */
function jwkToPublicKey($jwk)
{
    if (($jwk['kty'] ?? '') !== 'RSA')
        return null;

    $n = base64url_decode($jwk['n']);
    $e = base64url_decode($jwk['e']);

    // Build DER-encoded RSA public key
    $modulus = ltrim($n, "\x00");
    if (ord($modulus[0]) > 0x7f) {
        $modulus = "\x00" . $modulus;
    }

    $exponent = ltrim($e, "\x00");
    if (ord($exponent[0]) > 0x7f) {
        $exponent = "\x00" . $exponent;
    }

    $modulus = encodeASN1Integer($modulus);
    $exponent = encodeASN1Integer($exponent);

    $rsaPublicKey = encodeASN1Sequence($modulus . $exponent);

    // RSA OID: 1.2.840.113549.1.1.1
    $rsaOid = "\x30\x0d\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01\x05\x00";
    $bitString = "\x00" . $rsaPublicKey;
    $bitString = "\x03" . encodeASN1Length(strlen($bitString)) . $bitString;

    $der = encodeASN1Sequence($rsaOid . $bitString);

    $pem = "-----BEGIN PUBLIC KEY-----\n" .
        chunk_split(base64_encode($der), 64, "\n") .
        "-----END PUBLIC KEY-----";

    return openssl_pkey_get_public($pem);
}

function base64url_decode($data)
{
    $data = str_replace(['-', '_'], ['+', '/'], $data);
    $pad = strlen($data) % 4;
    if ($pad)
        $data .= str_repeat('=', 4 - $pad);
    return base64_decode($data);
}

function encodeASN1Length($length)
{
    if ($length < 0x80)
        return chr($length);
    $temp = ltrim(pack('N', $length), "\x00");
    return chr(0x80 | strlen($temp)) . $temp;
}

function encodeASN1Integer($data)
{
    return "\x02" . encodeASN1Length(strlen($data)) . $data;
}

function encodeASN1Sequence($data)
{
    return "\x30" . encodeASN1Length(strlen($data)) . $data;
}
