<?php
// Mock logic from server
$score = 3622;
$pos = 1;

$rankBonus = 0;
if ($pos === 1) { $rankBonus = 100; }
else if ($pos === 2) { $rankBonus = 50; }
else if ($pos === 3) { $rankBonus = 20; }

$scoreBonus = min(150, floor(max(0, $score) / 10));
$xp = 20 + $rankBonus + $scoreBonus;

echo "Calculated JS XP: $xp\n";

function calculateXP($rank, $score)
{
    $base = 20;
    $rankBonus = 0;
    if ($rank === 1)
        $rankBonus = 100;
    elseif ($rank === 2)
        $rankBonus = 50;
    elseif ($rank === 3)
        $rankBonus = 20;

    $scoreBonus = min(150, floor(max(0, $score) / 10));

    return $base + $rankBonus + $scoreBonus;
}

echo "Assumed PHP XP: " . calculateXP($pos, $score) . "\n";
