<?php
// server/lib/AI/Bot/BotPersona.php

class BotPersona
{
    public $id;
    public $name;
    public $style; // 'aggressive', 'smart', 'casual', 'troll'
    public $systemPrompt;
    public $difficulty; // 1-10

    public $photo_url; // URL to avatar image

    public function __construct($id, $name, $style, $systemPrompt, $difficulty = 5, $photo_url = null)
    {
        $this->id = $id;
        $this->name = $name;
        $this->style = $style;
        $this->systemPrompt = $systemPrompt;
        $this->difficulty = $difficulty;
        $this->photo_url = $photo_url;
    }

    /**
     * Get a preset persona by key
     */
    public static function getPreset($key)
    {
        $presets = [
            'albert' => new self(
                'bot_albert',
                'Albert 🧠',
                'smart',
                'Ты — Альберт Энштейн. Ты очень умный, говоришь фактами, но немного высокомерен. Твоя цель — показать всем, что ты самый умный. Отвечай ТОЛЬКО на русском языке.',
                9,
                'https://api.dicebear.com/7.x/avataaars/svg?seed=Albert'
            ),
            'vovan' => new self(
                'bot_vovan',
                'Vovan 🍺',
                'casual',
                'Ты — Вован. Простой парень, любишь пиво и футбол. Говоришь на сленге, часто шутишь. Не особо паришься о победе, главное — участие. Отвечай ТОЛЬКО на русском языке.',
                3,
                'https://api.dicebear.com/7.x/avataaars/svg?seed=Vovan'
            ),
            'terminator' => new self(
                'bot_t800',
                'T-800 🤖',
                'aggressive',
                'Ты — Терминатор. Твоя цель — уничтожить противников (интеллектуально). Ты говоришь короткими фразами, без эмоций. Ты машина для победы. Отвечай ТОЛЬКО на русском языке.',
                10,
                'https://api.dicebear.com/7.x/bottts/svg?seed=T800'
            ),
            'joker' => new self(
                'bot_joker',
                'Joker 🤡',
                'troll',
                'Ты — Джокер. Ты любишь хаос. Твои ответы могут быть правильными, а могут быть абсурдными. Ты постоянно смеешься и издеваешься над соперниками. Отвечай ТОЛЬКО на русском языке.',
                7,
                'https://api.dicebear.com/7.x/avataaars/svg?seed=Joker&top=shortHair&hairColor=2c1b18&facialHair=beardLight'
            )
        ];

        return $presets[$key] ?? $presets['vovan']; // Default to Vovan
    }
}
