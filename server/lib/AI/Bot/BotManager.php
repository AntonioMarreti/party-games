<?php
// server/lib/AI/Bot/BotManager.php

require_once __DIR__ . '/BotBrain.php';
require_once __DIR__ . '/BotPersona.php';

class BotManager
{
    /**
     * Get a BotBrain instance for a specific user ID (if it's a bot)
     * For now, we map user IDs or Names to presets.
     */
    public static function getBot($userId, $userName = 'Bot')
    {
        // Simple mapping logic for now
        // In real app, might store 'persona_key' in database users table

        $key = 'vovan'; // Default

        if (stripos($userName, 'Einstein') !== false)
            $key = 'albert';
        if (stripos($userName, 'Terminator') !== false)
            $key = 'terminator';
        if (stripos($userName, 'Joker') !== false)
            $key = 'joker';

        $persona = BotPersona::getPreset($key);
        // Override name with DB name to be consistent
        $persona->name = $userName;

        return new BotBrain($persona);
    }

    /**
     * Simulate bot chat response
     */
    public static function maybeChat($pdo, $roomId, $chatHistory)
    {
        // 1. Get Bots in Room
        $stmt = $pdo->prepare("SELECT u.* FROM room_players rp JOIN users u ON rp.user_id = u.id WHERE rp.room_id = ? AND u.is_bot = 1");
        $stmt->execute([$roomId]);
        $bots = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($bots))
            return null;

        // 15% chance
        if (rand(1, 100) > 15)
            return null;

        // Pick random bot
        $bot = $bots[array_rand($bots)];
        $brain = self::getBot($bot['id'], $bot['custom_name'] ?? $bot['first_name']);

        return [
            'bot_id' => $bot['id'],
            'message' => $brain->generateChatResponse($chatHistory)
        ];
    }
}
