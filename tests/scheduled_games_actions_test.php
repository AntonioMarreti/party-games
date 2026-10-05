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
    public static array $methods = [];
    public static $lastError = null;
    public static function sendRequest($method, $params) {
        self::$sent[] = $params;
        self::$methods[] = $method;
        $result = array_shift(self::$results);
        if ($result instanceof Throwable) throw $result;
        return $result === true ? json_encode(['ok' => true]) : $result;
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
    public bool $notifyContacts = false;
    public $hostReminder = 'sent';
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
        if (str_starts_with($sql, 'SELECT u.telegram_id')) return $this->notifyContacts ? array_map(fn($id) => ['telegram_id' => $id], array_keys(array_filter($this->subscriptions, fn($s) => $s['status'] === 'subscribed'))) : [];
        if (str_starts_with($sql, 'UPDATE scheduled_games SET starts_at')) { $this->games[$params[1]]['starts_at']=$params[0]; return []; }
        if (str_starts_with($sql, "UPDATE scheduled_games SET status = 'cancelled'")) { $this->games[$params[0]]['status']='cancelled'; return []; }
        if (str_starts_with($sql, 'UPDATE scheduled_game_host_reminders SET reminder_sent_at = NULL')) { $this->hostReminder=null; return []; }
        if (str_starts_with($sql, 'UPDATE scheduled_game_subscriptions SET reminder_sent_at = NULL')) {
            foreach ($this->subscriptions as &$sub) $sub['reminder_sent_at']=null;
            return [];
        }
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
// P2.2 transport and notification regression cases, retaining all P1 checks above.
check(scheduled_rich_heading('<tg-emoji emoji-id="1">X</tg-emoji>') === '&lt;tg-emoji emoji-id=&quot;1&quot;&gt;X&lt;/tg-emoji&gt;', 'Unknown heading cannot inject raw markup');
$reject = json_encode(['ok' => false, 'error_code' => 400]);
$title = '<b>A&B "title"</b>\' <tg-button>';
$escapedTitle = htmlspecialchars($title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$scheduledUrl = scheduled_deep_link_url(1);
foreach ([
    [[true], 1, ['sendRichMessage']],
    [[$reject, true], 1, ['sendRichMessage', 'sendMessage']],
    [[$reject, $reject], 0, ['sendRichMessage', 'sendMessage']],
    [[false], 0, ['sendRichMessage']],
    [['{invalid'], 0, ['sendRichMessage']],
    [[''], 0, ['sendRichMessage']],
    [[new RuntimeException('transport')], 0, ['sendRichMessage']],
    [[true, false], 1, ['sendRichMessage', 'sendRichMessage']],
] as [$responses, $expectedCount, $methods]) {
    $pdo = new ScheduledTestPdo(); $pdo->games[1]=game(); $pdo->games[1]['title']=$title;
    $recipientCount = count($methods) === 2 && $methods[1] === 'sendRichMessage' ? 2 : 1;
    $pdo->subscriptions=[2=>['status'=>'subscribed']];
    if ($recipientCount === 2) $pdo->subscriptions[3]=['status'=>'subscribed'];
    TelegramLogger::$results=$responses; TelegramLogger::$sent=[]; TelegramLogger::$methods=[];
    $result=invoke('action_send_scheduled_game_manual_reminder',$pdo);
    check(($result['status']==='ok')===($expectedCount>0), 'Manual confirmed delivery determines success');
    check(count($pdo->manual)===($expectedCount>0?1:0), 'Manual zero/partial cooldown semantics');
    check(TelegramLogger::$methods===$methods, 'Manual rich/fallback/ambiguous methods');
    $html=TelegramLogger::$sent[0]['rich_message']['html'];
    check(str_contains($html, '<h3><tg-emoji emoji-id="6021536113108196448">🔔</tg-emoji> Напоминание об игре</h3>') && str_contains($html,$escapedTitle), 'Manual heading and escaped body');
    check(!str_contains($html,$title) && !str_contains($html,'&amp;lt;'), 'No title injection or double escaping');
    check(str_contains($html, '<tg-button-row align="center"><tg-button type="url" style="primary" url="'.$scheduledUrl.'">Открыть игру</tg-button>'), 'Manual existing scheduled CTA');
    if (in_array('sendMessage',$methods,true)) {
        check(TelegramLogger::$sent[1]['text']===scheduled_manual_reminder_message($pdo->games[1]),'Manual fallback body unchanged');
        check(TelegramLogger::$sent[1]['reply_markup']['inline_keyboard'][0][0]['url']===$scheduledUrl,'Manual fallback URL unchanged');
    }
    if ($expectedCount) check($result['sent_count']===$expectedCount && $result['recipient_count']===$recipientCount && $result['skipped_count']===$recipientCount-$expectedCount,'Manual counts preserved');
}
$pdo=new ScheduledTestPdo(); $pdo->games[1]=game(1,600,'live');
$pdo->subscriptions=[2=>['status'=>'subscribed']];
TelegramLogger::$results=[true]; TelegramLogger::$sent=[];
check(invoke('action_send_scheduled_game_manual_reminder',$pdo)['status']==='ok','Live manual reminder still available');
check(str_contains(TelegramLogger::$sent[0]['rich_message']['html'],'уже открыта. Можно заходить.'),'Live manual body preserved');

foreach (['reschedule','open','cancel'] as $event) {
    $pdo=new ScheduledTestPdo(); $pdo->games[1]=game(1,240); $pdo->games[1]['title']=$title;
    $pdo->notifyContacts=true;
    $pdo->subscriptions=[2=>['status'=>'subscribed','reminder_sent_at'=>'sent'],3=>['status'=>'subscribed','reminder_sent_at'=>'sent']];
    // First recipient throws or rejects; the second must still be notified.
    TelegramLogger::$results=$event==='cancel'?[$reject,true,true]:[new RuntimeException('transport'),true];
    TelegramLogger::$sent=[]; TelegramLogger::$methods=[];
    $data=['scheduled_game_id'=>1];
    if ($event==='reschedule') $data['starts_at']=date('Y-m-d H:i:s',time()+1200);
    $result=invoke('action_'.$event.'_scheduled_game',$pdo,1,$data);
    check($result['status']==='ok','Notification failure does not change action success');
    $html=TelegramLogger::$sent[0]['rich_message']['html'];
    check(str_contains($html,$escapedTitle) && !str_contains($html,$title) && !str_contains($html,'&amp;lt;'),'Event title escaped once');
    if ($event==='cancel') {
        check($pdo->games[1]['status']==='cancelled','Cancel lifecycle preserved');
        check(str_contains($html,'<h3><tg-emoji emoji-id="5807692706507399432">❌</tg-emoji> Игра отменена</h3>') && !str_contains($html,'<tg-button'),'Cancel has no CTA');
        check(TelegramLogger::$methods===['sendRichMessage','sendMessage','sendRichMessage'],'Cancel fallback and recipient isolation');
        check(!isset(TelegramLogger::$sent[1]['reply_markup']) && TelegramLogger::$sent[1]['text']==="Игра «{$escapedTitle}» отменена.",'Cancel plain fallback');
    } else {
        check(TelegramLogger::$methods===['sendRichMessage','sendRichMessage'],'Exception does not fallback or interrupt batch');
        $expectedUrl=$event==='open'?scheduled_room_deep_link_url('TEST'):$scheduledUrl;
        $label=$event==='open'?'Зайти в комнату':'Открыть игру';
        check(str_contains($html,'style="primary" url="'.$expectedUrl.'">'.$label.'</tg-button>'),'Event CTA destination');
        if ($event==='open') {
            check($pdo->games[1]['status']==='live' && !str_contains($html,'startapp=scheduled_'),'Open uses room flow');
            check(str_contains($html,'<h3><tg-emoji emoji-id="6019076101869934284">🚪</tg-emoji> Комната открыта</h3>'),'Open heading');
        } else {
            check(str_contains($html,'<h3><tg-emoji emoji-id="6035276353438227060">⏰</tg-emoji> Время игры изменилось</h3>') && str_contains($html,date('d.m.Y H:i',strtotime($data['starts_at']))),'Reschedule heading/time');
            check($pdo->hostReminder===null && $pdo->subscriptions[2]['reminder_sent_at']===null && $pdo->subscriptions[3]['reminder_sent_at']===null,'Reschedule resets host/subscriber marks');
        }
    }
}
echo "PASS scheduled actions: P1 guarantees, rich manual/event notifications, fallback, isolation, escaping\n";
