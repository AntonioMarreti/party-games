<?php

const BLOKUS_BOARD_SIZE = 20;
const BLOKUS_COLORS = ['BLUE', 'YELLOW', 'RED', 'GREEN'];

// Piece Definitions (Same as engine.js but in PHP)
function getPieceDefinitions() {
    return [
        'I1' => [[0, 0]],
        'I2' => [[0, 0], [1, 0]],
        'I3' => [[0, 0], [1, 0], [2, 0]],
        'V3' => [[0, 0], [1, 0], [0, 1]],
        'I4' => [[0, 0], [1, 0], [2, 0], [3, 0]],
        'L4' => [[0, 0], [1, 0], [2, 0], [2, 1]],
        'O4' => [[0, 0], [1, 0], [0, 1], [1, 1]],
        'Z4' => [[0, 0], [1, 0], [1, 1], [2, 1]],
        'T4' => [[0, 0], [1, 0], [2, 0], [1, 1]],
        'I5' => [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
        'L5' => [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]],
        'P5' => [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
        'F5' => [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],
        'T5' => [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]],
        'U5' => [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
        'V5' => [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]],
        'W5' => [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]],
        'X5' => [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
        'Y5' => [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1]],
        'Z5' => [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]],
        'N5' => [[0, 0], [1, 0], [2, 0], [2, 1], [3, 1]],
    ];
}

// getInitialState now doesn't create grid. It just sets mode.
// We should create grid dynamically based on mode.
// Actually, PHP state usually stores the grid. 
// We will initialize grid when mode is selected in start_match, OR 
// we default to 20x20 in getInitialState but allow overwrite.

// To support dynamic size, we can't hardcode BLOKUS_BOARD_SIZE check.

function getInitialState() {
    // Default to Standard 20x20
    $size = 20; 
    $grid = array_fill(0, $size, array_fill(0, $size, null));
    $pieces = array_keys(getPieceDefinitions());
    
    $players = [];
    foreach (BLOKUS_COLORS as $color) {
        $players[$color] = [
            'color' => $color,
            'remainingPieces' => $pieces, // List of IDs
            'hasPlayedFirstMove' => false,
            'score' => 0,
            'is_bot' => false // Ready for bots
        ];
    }

    return [
        'status' => 'setup', // setup, playing, finished
        'mode' => 'standard', // standard, 2player, 3player, duo
        'boardSize' => $size,
        'grid' => $grid,
        'players' => $players,
        'turnOrder' => BLOKUS_COLORS,
        'currentTurnIndex' => 0,
        'greenOwnerIndex' => 0, // For 3player mode: index of player who controls Green this round
        'consecutivePasses' => 0,
        'lastMoveTime' => time(),
        'history' => [] // Log of moves
    ];
}

function handleGameAction($pdo, $room, $user, $data) {
    // Decode State
    $state = json_decode($room['game_state'], true);
    if (!$state) $state = getInitialState();

    $action = $data['game_action'] ?? '';

    // --- SETUP PHASE ---
    if ($state['status'] === 'setup') {
        if ($action === 'start_match') {
            if (!$room['is_host']) throw new Exception("Only host can start");
            
            $mode = $data['mode'] ?? 'standard';
            if (!in_array($mode, ['standard', '2player', '3player', 'duo'])) {
                $mode = 'standard';
            }

            $state['mode'] = $mode;
            
            // Re-initialize for Duo if needed
            if ($mode === 'duo') {
                $state['boardSize'] = 14;
                $state['grid'] = array_fill(0, 14, array_fill(0, 14, null));
                
                // Duo uses only 2 colors? Or P1/P2 use Blue/Yellow?
                // Rules say "Player 1 covers (4,4), Player 2 covers (9,9)".
                // Usually Duo uses Purple/Orange, but we can reuse Blue/Yellow (or Blue/Red).
                // Let's stick to turnOrder 0 and 1.
                // We need to limit turn order to just 2 colors.
                $state['turnOrder'] = ['BLUE', 'YELLOW']; // Simplification for Duo
                
                // Remove unused players from state?
                unset($state['players']['RED']);
                unset($state['players']['GREEN']);
            } else {
                $state['boardSize'] = 20;
                $state['grid'] = array_fill(0, 20, array_fill(0, 20, null));
                $state['turnOrder'] = BLOKUS_COLORS;
            }

            $state['status'] = 'playing';
            
            // Check player count to auto-adjust? 
            // For now rely on Host selection.
            
            updateGameState($room['id'], $state);
            return ['status' => 'ok', 'state' => $state];
        }
        return ['status' => 'ok', 'state' => $state];
    }

    // --- PLAYING PHASE ---
    $currentColor = $state['turnOrder'][$state['currentTurnIndex']];
    
    // Validate turn ownership based on mode
    $stmt = $pdo->prepare("SELECT user_id, is_host, is_bot FROM room_players WHERE room_id = ? ORDER BY id ASC");
    $stmt->execute([$room['id']]);
    $roomPlayers = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Find my index (0 to N)
    $myPlayerIndex = -1;
    foreach ($roomPlayers as $idx => $rp) {
        if ($rp['user_id'] == $user['id']) {
            $myPlayerIndex = $idx;
            break;
        }
    }
    
    if ($myPlayerIndex === -1) throw new Exception("You are not a player");

    $isMyTurn = false;
    $mode = $state['mode'] ?? 'standard';

    if ($mode === '2player') {
        // ... (Existing 2player logic)
        if ($myPlayerIndex === 0 && ($currentColor === 'BLUE' || $currentColor === 'RED')) {
            $isMyTurn = true;
        } elseif ($myPlayerIndex === 1 && ($currentColor === 'YELLOW' || $currentColor === 'GREEN')) {
            $isMyTurn = true;
        }
    } elseif ($mode === 'duo') {
        // Player 1 (0): BLUE (Start 4,4)
        // Player 2 (1): YELLOW (Start 9,9)
        if ($myPlayerIndex === 0 && $currentColor === 'BLUE') $isMyTurn = true;
        if ($myPlayerIndex === 1 && $currentColor === 'YELLOW') $isMyTurn = true;
        
    } elseif ($mode === '3player') {
        // Player 1 (0): BLUE
        // Player 2 (1): YELLOW
        // Player 3 (2): RED
        // GREEN is shared.
        
        $greenOwnerIndex = $state['greenOwnerIndex'] ?? 0;
        
        if ($currentColor === 'BLUE' && $myPlayerIndex === 0) $isMyTurn = true;
        if ($currentColor === 'YELLOW' && $myPlayerIndex === 1) $isMyTurn = true;
        if ($currentColor === 'RED' && $myPlayerIndex === 2) $isMyTurn = true;
        
        if ($currentColor === 'GREEN') {
             // Check who controls Green this time
             if ($myPlayerIndex === $greenOwnerIndex) {
                 $isMyTurn = true;
             }
        }
    } else {
        // Standard (4 players or mapped 1-to-1)
        if (isset(BLOKUS_COLORS[$myPlayerIndex]) && BLOKUS_COLORS[$myPlayerIndex] === $currentColor) {
            $isMyTurn = true;
        }
    }

    // Override for single player / debug
    if (count($roomPlayers) === 1) $isMyTurn = true;

    // BOT OVERRIDE: If the current turn belongs to a bot, allow the HOST to move for it
    if (!$isMyTurn) {
        $currentPlayerInfo = $roomPlayers[$state['currentTurnIndex']] ?? null;
        // Map color index to player index logic is complex above, but for standard games:
        if ($mode === 'standard') {
            $currentPlayerInfo = $roomPlayers[array_search($currentColor, BLOKUS_COLORS)] ?? null;
        } elseif ($mode === '2player') {
             // 2player: P1(0) controls Blue/Red, P2(1) controls Yellow/Green
             // If P1 is bot, P1 controls Blue/Red.
             // We need to know if the "Owner" of the current color is a bot.
             if ($myPlayerIndex === 0 && ($currentColor === 'BLUE' || $currentColor === 'RED')) $currentPlayerInfo = $roomPlayers[0];
             else $currentPlayerInfo = $roomPlayers[1];
        }
        
        // Simplified check: If I am HOST, and the "implied" owner of this turn is a bot -> Allow.
        // Actually, let's just reverse check:
        // Who owns this turn?
        $turnOwnerIndex = -1;
        if ($mode === 'standard') {
             $turnOwnerIndex = array_search($currentColor, BLOKUS_COLORS);
        }
        
        if ($turnOwnerIndex !== -1 && isset($roomPlayers[$turnOwnerIndex])) {
            $turnOwner = $roomPlayers[$turnOwnerIndex];
            if ($turnOwner['is_bot']) {
               // Verify if requestor is host
               $amIHost = false;
               foreach($roomPlayers as $rp) { 
                   if($rp['user_id'] == $user['id'] && !empty($rp['is_host'])) $amIHost = true; 
               }
               
               if ($amIHost) $isMyTurn = true;
            }
        }
    }

    if (!$isMyTurn) {
         throw new Exception("Not your turn");
    }

    if ($action === 'pass_turn') {
        $state['consecutivePasses']++;
        
        $state['history'][] = [
            'color' => $currentColor,
            'action' => 'pass'
        ];

        // Check End Game
        if ($state['consecutivePasses'] >= 4) {
            $state['status'] = 'finished';
            finalizeGame($pdo, $room['id'], $state);
        } else {
            advanceTurn($pdo, $room['id'], $state);
            // If 2 player mode and next color is also mine? No special handling needed, just next turn.
        }

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($action === 'place_piece') {
        $pieceId = $data['piece_id'];
        $shape = $data['shape'];
        
        // Fix for FormData serialization issues with nested arrays
        if (is_string($shape)) {
            $decoded = json_decode($shape, true);
            if (is_array($decoded)) {
                $shape = $decoded;
            }
        }
        
        $startX = (int)$data['x'];
        $startY = (int)$data['y'];

        validateMove($state, $currentColor, $pieceId, $shape, $startX, $startY);

        // Apply Move
        foreach ($shape as $p) {
            $x = $startX + $p[0];
            $y = $startY + $p[1];
            $state['grid'][$y][$x] = $currentColor;
        }

        // Update Player
        $playerState = &$state['players'][$currentColor];
        $playerState['remainingPieces'] = array_values(array_diff($playerState['remainingPieces'], [$pieceId]));
        $playerState['hasPlayedFirstMove'] = true;
        
        // Reset passes
        $state['consecutivePasses'] = 0;
        
        $state['history'][] = [
            'color' => $currentColor,
            'action' => 'place',
            'piece' => $pieceId,
            'x' => $startX,
            'y' => $startY
        ];

        // Check if player finished
        // Check if player finished
        if (empty($playerState['remainingPieces'])) {
           // Bonus score calculation logic is done at end
        }
        
        $state['consecutivePasses'] = 0;

        advanceTurn($pdo, $room['id'], $state);
        
        // Auto-end if no moves possible? (Hard to check efficiently in PHP without heuristics).
        // relying on manual pass for now.

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    throw new Exception("Unknown action");
}

function advanceTurn($pdo, $roomId, &$state) {
    // If just finished GREEN turn in 3-player mode, rotate the green owner
    $mode = $state['mode'] ?? 'standard';
    $completedTurnColor = $state['turnOrder'][$state['currentTurnIndex']];

    if ($mode === '3player' && $completedTurnColor === 'GREEN') {
        $state['greenOwnerIndex'] = ($state['greenOwnerIndex'] + 1) % 3;
    }
    
    $numColors = count($state['turnOrder']);
    $originalIndex = $state['currentTurnIndex'];
    
    // Look ahead for a playable turn
    for ($i = 0; $i < $numColors; $i++) {
        $nextIndex = ($state['currentTurnIndex'] + 1) % $numColors;
        $nextColor = $state['turnOrder'][$nextIndex];
        $player = $state['players'][$nextColor];
        
        $state['currentTurnIndex'] = $nextIndex;
        
        // If player has pieces, it's their turn
        if (!empty($player['remainingPieces'])) {
            return;
        }
        
        // If player has NO pieces, we count it as a "virtual pass" and continue search
        // BUT: if we circle back to original, everyone is empty?
        // Actually, let's check consecutive passes logic if we want strict rules.
        // But simply: If you have no pieces, you shouldn't be asked to move.
        // Game ends when "all players unable to move". 0 pieces = unable.
        // If loop completes 4 times, everyone is empty?
    }
    
    // If we exited loop without returning, it means everyone has 0 pieces.
    // Game Over.
    $state['status'] = 'finished';
    finalizeGame($pdo, $roomId, $state);
}

function validateMove($state, $color, $pieceId, $shape, $startX, $startY) {
    // 1. Check Piece Availability
    $player = $state['players'][$color];
    if (!in_array($pieceId, $player['remainingPieces'])) {
        throw new Exception("Piece already used");
    }

    // 2. Bounds & Overlap
    $boardSize = $state['boardSize'] ?? 20;
    
    $occupiedCoords = [];
    foreach ($shape as $p) {
        $x = $startX + $p[0];
        $y = $startY + $p[1];

        if ($x < 0 || $x >= $boardSize || $y < 0 || $y >= $boardSize) {
            throw new Exception("Out of bounds");
        }
        if ($state['grid'][$y][$x] !== null) {
            throw new Exception("Cell occupied");
        }
        $occupiedCoords[] = [$x, $y];
    }

    // 3. Adjacency Rules
    $connectsToCorner = false;
    
    // START POINTS
    $mode = $state['mode'] ?? 'standard';
    if ($mode === 'duo') {
        // Duo: Blue (P1) -> (4,4), Yellow (P2) -> (9,9)
        // Since we simplified turnOrder to [BLUE, YELLOW], index 0 is Blue, 1 is Yellow.
        if ($color === 'BLUE') $startPoints = ["4,4"];
        else $startPoints = ["9,9"];
    } else {
        // Standard (Corners)
        $max = $boardSize - 1;
        $startPoints = ["0,0", "0,{$max}", "{$max},0", "{$max},{$max}"]; 
    }

    foreach ($occupiedCoords as $c) {
        $cx = $c[0];
        $cy = $c[1];

        // Check Direct Neighbors (Sides) - MUST NOT BE SAME COLOR
        $neighbors = [[$cx+1, $cy], [$cx-1, $cy], [$cx, $cy+1], [$cx, $cy-1]];
        foreach ($neighbors as $n) {
            $nx = $n[0]; $ny = $n[1];
            if ($nx >= 0 && $nx < $boardSize && $ny >= 0 && $ny < $boardSize) {
                if ($state['grid'][$ny][$nx] === $color) {
                    throw new Exception("Cannot touch side of same color");
                }
            }
        }

        // Check Diagonal Neighbors (Corners) - MUST TOUCH AT LEAST ONE IF NOT FIRST MOVE
        $corners = [[$cx+1, $cy+1], [$cx-1, $cy-1], [$cx+1, $cy-1], [$cx-1, $cy+1]];
        foreach ($corners as $n) {
            $nx = $n[0]; $ny = $n[1];
            if ($nx >= 0 && $nx < $boardSize && $ny >= 0 && $ny < $boardSize) {
                if ($state['grid'][$ny][$nx] === $color) {
                    $connectsToCorner = true;
                }
            }
        }
    }

    if (!$player['hasPlayedFirstMove']) {
        // Must cover a board corner/start point
        $coversStartPoint = false;
        foreach ($occupiedCoords as $c) {
            if (in_array("{$c[0]},{$c[1]}", $startPoints)) {
                $coversStartPoint = true;
                break;
            }
        }
        if (!$coversStartPoint) throw new Exception("First move must cover your start point");
    } else {
        if (!$connectsToCorner) throw new Exception("Must connect to corner of same color");
    }
}

function finalizeGame($pdo, $roomId, &$state) {
    // 1. Calculate Raw Scores for each Color
    $rawScores = [];
    $definitions = getPieceDefinitions();
    
    foreach ($state['players'] as $color => $p) {
        $points = 0;
        $unplacedSquares = 0;
        foreach ($p['remainingPieces'] as $pid) {
            $def = $definitions[$pid];
            $unplacedSquares += count($def);
        }
        
        $points -= $unplacedSquares;
        
        if (empty($p['remainingPieces'])) {
            $points += 15;
            // Check last piece
            $lastMove = null;
            for ($i = count($state['history']) - 1; $i >= 0; $i--) {
                if ($state['history'][$i]['color'] === $color && $state['history'][$i]['action'] === 'place') {
                    $lastMove = $state['history'][$i];
                    break;
                }
            }
            if ($lastMove && $lastMove['piece'] === 'I1') { // Monomino
                $points += 5;
            }
        }
        $rawScores[$color] = $points;
    }

    // 2. Aggregate Scores based on Mode
    $finalPlayerScores = []; // playerId -> score
    $mode = $state['mode'] ?? 'standard';

    // Get User IDs
    $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ? ORDER BY id ASC");
    $stmt->execute([$roomId]);
    $uids = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (empty($uids)) return;

    if ($mode === '2player' && count($uids) >= 2) {
        // P1 (uids[0]) = Blue + Red
        $finalPlayerScores[$uids[0]] = $rawScores['BLUE'] + $rawScores['RED'];
        
        // P2 (uids[1]) = Yellow + Green
        $finalPlayerScores[$uids[1]] = $rawScores['YELLOW'] + $rawScores['GREEN'];

    } elseif ($mode === '3player' && count($uids) >= 3) {
        // P1 = Blue
        $finalPlayerScores[$uids[0]] = $rawScores['BLUE'];
        // P2 = Yellow
        $finalPlayerScores[$uids[1]] = $rawScores['YELLOW'];
        // P3 = Red
        $finalPlayerScores[$uids[2]] = $rawScores['RED'];
        // Green ignored
    } else {
        // Standard: Map 1-to-1 based on colors
        // Colors: BLUE, YELLOW, RED, GREEN
        foreach (BLOKUS_COLORS as $idx => $c) {
            if (isset($uids[$idx])) {
                $finalPlayerScores[$uids[$idx]] = $rawScores[$c];
            }
        }
    }

    // Save logic: We need to adapt the playersData structure
    // original code was sorting by color scores. Now we sort by Player Scores.
    
    arsort($finalPlayerScores);
    
    $playersData = [];
    $rank = 1;
    $prevScore = null;
    $realRank = 1;

    foreach ($finalPlayerScores as $uid => $score) {
        if ($prevScore !== null && $score < $prevScore) {
            $rank = $realRank;
        }
        $playersData[] = [
            'user_id' => $uid,
            'score' => $score,
            'rank' => $rank
        ];
        $prevScore = $score;
        $realRank++;
    }

    // Store display scores in state (for client to see color breakdown, we keep finalScores as map color->score?)
    // Actually, client might want to see P1 vs P2.
    // Let's store 'finalScores' as the RAW color scores, and 'gameResult' as the aggregated info.
    $state['finalScores'] = $rawScores; 
    $state['gameResults'] = $playersData; // For client to show "Winner: Player 1"

    // 3. Save Stats to DB
    global $routes; 
    $statsFile = __DIR__ . '/../actions/stats.php';
    if (file_exists($statsFile)) {
        require_once $statsFile;
        if (function_exists('recordGameStats')) {
             $roomStmt = $pdo->prepare("SELECT * FROM rooms WHERE id = ?");
             $roomStmt->execute([$roomId]);
             $roomInfo = $roomStmt->fetch(PDO::FETCH_ASSOC);
             if ($roomInfo) {
                 recordGameStats($pdo, $roomInfo, $playersData, 0);
             }
        }
    }
}
