<?php
// Isolated action smoke: no config, database, Telegram requests or application runtime.
class ScheduledTestResponse extends Error {
    public array $payload;
    public function __construct(array $payload) { $this->payload = $payload; }
}
function sendError($message) { throw new ScheduledTestResponse(['status' => 'error', 'message' => $message]); }
function recordGamificationEvent(...$args) {}
function clearUserRooms(...$args) {}
function generateAvailableRoomCode($pdo) { return 'TEST'; }
function logRoomLifecycle(...$args) {}
class TelegramLogger {
    public static array $results = [];
    public static array $sent = [];
    public static array $errors = [];
    public static $lastError = null;
    public static function sendRequest($method, $params) {
        self::$sent[] = $params;
        $result = array_shift(self::$results);
        if ($result instanceof Throwable) throw $result;
        return json_encode(['ok' => (bool) $result]);
    }
    public static function logEvent(...$args) {}
    public static function logError(...$args) { self::$errors[] = $args; }
}
$source = file_get_contents(__DIR__ . '/../server/actions/scheduled_games.php');
// Replace only process-exit response adapter; execute the real action implementations.
$source = str_replace("require_once __DIR__ . '/../lib/gamification.php';", '', $source);
$source = preg_replace('/function scheduled_send_ok\(\$payload = \[\]\)\s*\{.*?\n\}/s',
    'function scheduled_send_ok($payload = []) { throw new ScheduledTestResponse(array_merge(["status" => "ok"], $payload)); }', $source, 1);
eval(substr($source, 5));
function check($condition, $message) { if (!$condition) throw new RuntimeException($message); }
class ScheduledTestStmt {
    private $pdo; private string $sql; private array $rows = [];
    public function __construct($pdo, $sql) { $this->pdo = $pdo; $this->sql = preg_replace('/\s+/', ' ', trim($sql)); }
    public function execute($params = []) { $this->rows = $this->pdo->run($this->sql, $params); return true; }
    public function fetch() { return $this->rows[0] ?? false; }
    public function fetchAll() { return $this->rows; }
    public function fetchColumn() { $row = $this->fetch(); return is_array($row) ? reset($row) : $row; }
}
class ScheduledTestPdo {
    public array $games = []; public array $subscriptions = []; public array $manual = [];
    public array $rooms = []; public array $sql = []; public bool $transaction = false;
    public bool $manualSchema = true;
    public function prepare($sql) { return new ScheduledTestStmt($this, $sql); }
    public function query($sql) { $stmt = $this->prepare($sql); $stmt->execute(); return $stmt; }
    public function exec($sql) { $this->run(preg_replace('/\s+/', ' ', trim($sql)), []); }
    public function beginTransaction() { $this->transaction = true; }
    public function commit() { $this->transaction = false; }
    public function rollBack() { $this->transaction = false; }
    public function inTransaction() { return $this->transaction; }
    public function lastInsertId() { return 100; }
    public function run($sql, $params) {
        $this->sql[] = $sql;
        if (str_starts_with($sql, 'SHOW COLUMNS')) return [['Field' => $params[0]]];
        if (str_starts_with($sql, 'SHOW TABLES')) return $params[0] === 'scheduled_game_manual_reminders' && !$this->manualSchema ? [] : [[$params[0]]];
        if (str_starts_with($sql, 'SELECT id FROM scheduled_games')) return array_values(array_map(fn($g) => ['id' => $g['id']], array_filter($this->games, fn($g) => $g['status'] === 'scheduled' && strtotime($g['starts_at']) < time()-3600)));
        if (str_starts_with($sql, "UPDATE scheduled_games SET status = 'expired'")) {
            foreach ($this->games as &$g) if ($g['status'] === 'scheduled' && strtotime($g['starts_at']) < time()-3600) $g['status'] = 'expired';
            return [];
        }
        if (str_starts_with($sql, 'SELECT sg.id, sg.room_id')) return array_values(array_filter($this->games, fn($g) => $g['status'] === 'live' && $g['room_id'] !== null && !isset($this->rooms[$g['room_id']])));
        if (str_starts_with($sql, 'UPDATE scheduled_games sg')) {
            foreach ($this->games as &$g) if ($g['status'] === 'live' && $g['room_id'] !== null && !isset($this->rooms[$g['room_id']])) $g['status'] = 'expired';
            return [];
        }
        if (str_starts_with($sql, 'SELECT sg.id,')) {
            check(str_contains($sql, 'NOW() - INTERVAL 1 HOUR'), 'List must retain the existing one-hour grace period');
            check(str_contains($sql, "OR sg.status = 'live')"), 'Visibility must group live and scheduled before ID filtering');
            $rows = array_values(array_filter($this->games, fn($g) => $g['status'] === 'live' || ($g['status'] === 'scheduled' && strtotime($g['starts_at']) >= time()-3600)));
            usort($rows, fn($a,$b) => strcmp($a['starts_at'], $b['starts_at']));
            if (str_contains($sql, 'AND sg.id = ?')) $rows = array_values(array_filter($rows, fn($g) => $g['id'] === end($params)));
            return array_slice($rows, 0, str_contains($sql, 'LIMIT 1') && !str_contains($sql, 'LIMIT 30') ? 1 : 30);
        }
        if (str_starts_with($sql, 'SELECT * FROM scheduled_games')) return isset($this->games[$params[0]]) ? [$this->games[$params[0]]] : [];
        if (str_starts_with($sql, 'SELECT status FROM scheduled_game_subscriptions')) return isset($this->subscriptions[$params[1]]) ? [['status' => $this->subscriptions[$params[1]]['status']]] : [];
        if (str_starts_with($sql, 'SELECT COUNT(*)')) return [[count(array_filter($this->subscriptions, fn($s) => $s['status'] === 'subscribed'))]];
        if (str_starts_with($sql, 'INSERT INTO scheduled_game_subscriptions')) {
            $this->subscriptions[$params[1]] = ['status' => 'subscribed', 'reminder_sent_at' => null, 'cancelled_at' => null]; return [];
        }
        if (str_starts_with($sql, 'INSERT INTO rooms')) { $this->rooms[100] = true; return []; }
        if (str_starts_with($sql, 'INSERT INTO room_players') || str_starts_with($sql, 'INSERT INTO public_rooms')) return [];
        if (str_starts_with($sql, "UPDATE scheduled_games SET status = 'live'")) { $this->games[end($params)]['status']='live'; return []; }
        if (str_starts_with($sql, 'SELECT created_at')) return $this->manual ? [['created_at' => date('Y-m-d H:i:s')]] : [];
        if (str_starts_with($sql, 'SELECT s.id as subscription_id')) return array_map(fn($id) => ['subscription_id' => $id, 'user_id' => $id, 'telegram_id' => $id], array_keys(array_filter($this->subscriptions, fn($s) => $s['status'] === 'subscribed')));
        if (str_starts_with($sql, 'SELECT u.telegram_id')) return [];
        if (str_starts_with($sql, 'INSERT INTO scheduled_game_manual_reminders')) {
            check(count(TelegramLogger::$sent) > 0, 'Cooldown must be created after delivery');
            check(TelegramLogger::$results === [], 'Cooldown must wait for every delivery attempt');
            check($params[2] > 0, 'Cooldown must require delivered messages');
            $this->manual[] = $params; return [];
        }
        throw new RuntimeException('Unhandled test SQL: ' . $sql);
    }
}
function game($id = 1, $offset = 600, $status = 'scheduled') {
    return ['id' => $id, 'host_id' => 1, 'game_type' => 'durak', 'title' => 'Test', 'starts_at' => date('Y-m-d H:i:s', time()+$offset), 'status' => $status, 'room_id' => null, 'room_code' => 'TEST', 'min_players' => 4, 'max_players' => 4];
}
function invoke($action, $pdo, $userId = 1, $data = ['scheduled_game_id' => 1]) {
    try { $action($pdo, ['id' => $userId], $data); }
    catch (ScheduledTestResponse $response) { return $response->payload; }
    throw new RuntimeException('Action did not produce a response');
}
if (($argv[1] ?? '') === 'missing-schema') {
    $pdo = new ScheduledTestPdo(); $pdo->manualSchema = false;
    $result = invoke('action_send_scheduled_game_manual_reminder', $pdo);
    check($result['status'] === 'error' && !TelegramLogger::$sent, 'Missing schema must fail safely before sends');
    check($result['message'] === 'Напоминания временно недоступны', 'Missing schema returns controlled error');
    check(str_contains(json_encode(TelegramLogger::$errors), 'migration 018 required'), 'Missing schema logs migration requirement');
    echo "PASS missing schema\n"; exit;
}
$pdo = new ScheduledTestPdo();
$pdo->games = [1 => game(), 2 => game(2,-600), 3 => game(3,-3700), 4 => game(4,600,'cancelled')];
$result = invoke('action_get_scheduled_games', $pdo, 1, []);
check(array_column($result['games'],'id') === [2,1], 'Future and grace-period games must be visible; cancelled/expired hidden');
check($pdo->games[3]['status'] === 'expired', 'Old scheduled must expire');
$pdo = new ScheduledTestPdo();
for ($i=1;$i<=31;$i++) $pdo->games[$i] = game($i,600+$i);
check(count(invoke('action_get_scheduled_games',$pdo,1,[])['games']) === 30, 'Normal list retains LIMIT 30');
check(invoke('action_get_scheduled_games',$pdo,1,['scheduled_game_id'=>31])['games'][0]['id'] === 31, 'Target bypasses list limit');
foreach (['cancelled','expired'] as $status) {
    $pdo->games[31]['status']=$status;
    check(!invoke('action_get_scheduled_games',$pdo,1,['scheduled_game_id'=>31])['games'], 'Terminal target hidden');
}
check(!invoke('action_get_scheduled_games',$pdo,1,['scheduled_game_id'=>999])['games'], 'Missing target hidden');
$pdo->games[31]=game(31,600,'live');
check(invoke('action_get_scheduled_games',$pdo,1,['scheduled_game_id'=>31])['games'][0]['room_code']==='TEST','Live target retains room flow');
$pdo = new ScheduledTestPdo(); $pdo->games[1]=game();
check(invoke('action_subscribe_scheduled_game',$pdo,2)['status']==='ok','New subscription succeeds');
$pdo->subscriptions[2]['reminder_sent_at']='sent';
$pdo->games[1]['max_players']=2;
$before=$pdo->subscriptions;
check(invoke('action_subscribe_scheduled_game',$pdo,2)['already_subscribed']===true,'Full repeated subscription is no-op');
check($pdo->subscriptions===$before,'Repeated subscription preserves all fields');
$pdo->subscriptions[2]['status']='cancelled';
$pdo->subscriptions[3]=['status'=>'subscribed'];
check(invoke('action_subscribe_scheduled_game',$pdo,2)['status']==='error','Cancelled restore checks capacity');
unset($pdo->subscriptions[3]);
check(invoke('action_subscribe_scheduled_game',$pdo,2)['status']==='ok','Cancelled restore succeeds with capacity');
check($pdo->subscriptions[2]['reminder_sent_at']===null && $pdo->subscriptions[2]['cancelled_at']===null,'Restore resets marks');
foreach ([600=>false,240=>true,-600=>true] as $offset=>$allowed) {
    $pdo=new ScheduledTestPdo(); $pdo->games[1]=game(1,$offset);
    $result=invoke('action_open_scheduled_game',$pdo);
    check(($result['status']==='ok')===$allowed,'Open time guard');
    if ($allowed) check($result['warning']==='Минимум игроков ещё не набран' && $result['room_code']==='TEST','Shortage warns but opens');
}
foreach ([[false,false],[true,false],[true,true],[new RuntimeException('transport'),true]] as $delivery) {
    $pdo=new ScheduledTestPdo(); $pdo->games[1]=game();
    $pdo->subscriptions=[2=>['status'=>'subscribed'],3=>['status'=>'subscribed']];
    TelegramLogger::$results=$delivery; TelegramLogger::$sent=[];
    $result=invoke('action_send_scheduled_game_manual_reminder',$pdo);
    $count=count(array_filter($delivery,fn($r)=>$r===true));
    check(($result['status']==='ok')===($count>0),'Delivery determines API success');
    check(count($pdo->manual)===($count>0?1:0),'Zero delivery must not create cooldown');
    check(!$pdo->transaction,'Every result releases transaction');
    if ($count) {
        check($result['sent_count']===$count && $result['recipient_count']===2 && $result['skipped_count']===2-$count,'Delivery counts');
        check(invoke('action_send_scheduled_game_manual_reminder',$pdo)['status']==='error','Success enforces cooldown');
    } else {
        TelegramLogger::$results=[true,true];
        check(invoke('action_send_scheduled_game_manual_reminder',$pdo)['status']==='ok','Zero delivery can retry immediately');
    }
}
$pdo=new ScheduledTestPdo(); $pdo->games[1]=game();
check(invoke('action_send_scheduled_game_manual_reminder',$pdo)['status']==='error' && !$pdo->manual,'No recipients is not success');
check(!str_contains($source,'CREATE TABLE'),'Action source contains no runtime DDL');
$migration=file_get_contents(__DIR__.'/../server/migrations/018_add_scheduled_game_manual_reminders.php');
check(str_contains($migration,'CREATE TABLE IF NOT EXISTS scheduled_game_manual_reminders'),'Migration has repeat-safe create');
echo "PASS scheduled actions: listing, target lookup, subscribe, open, delivery, schema\n";
