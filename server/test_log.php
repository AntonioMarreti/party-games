<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/TelegramLogger.php';

echo "Testing Logger...\n";
echo "Token: " . substr(BOT_TOKEN, 0, 5) . "...\n";
echo "Channel: " . LOG_CHANNEL_ID . "\n";

TelegramLogger::log('test', 'This is a test message from one-off script.');
echo "Log sent.\n";
