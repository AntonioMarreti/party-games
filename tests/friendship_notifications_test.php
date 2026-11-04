<?php
// Real actions with isolated DB/Telegram adapters: no production config or requests.
class TelegramLogger {
    public static array $responses = [];
    public static array $calls = [];
    public static function sendRequest($method, $params) {
        self::$calls[] = ['method'=>$method,'params'=>$params];
        if (!self::$responses) throw new LogicException('Unexpected Telegram request');
        $result=array_shift(self::$responses);
        if ($result instanceof Throwable) throw $result;
        return $result;
    }
    public static function logError(...$args) { throw new Error('Unexpected action error'); }
}
function sendError($message) { throw new Error($message); }
function createNotification($pdo, $recipient, $type, $actor) { $pdo->notifications[]=[$recipient,$type,$actor]; }
function check_achievements($pdo, $userId) { $pdo->achievements[]=$userId; }
require_once __DIR__.'/../server/actions/social.php';
function friendshipCheck($condition,$message) { if (!$condition) throw new RuntimeException($message); }
class FriendshipTestStmt {
    private $pdo; private string $sql; private array $rows=[];
    public function __construct($pdo,$sql) { $this->pdo=$pdo; $this->sql=$sql; }
    public function execute($params) { $this->rows=$this->pdo->run($this->sql,$params); }
    public function fetch() { return $this->rows[0] ?? false; }
}
class FriendshipTestPdo {
    public array $friendship=[];
    public array $notifications=[];
    public array $achievements=[];
    public function prepare($sql) { return new FriendshipTestStmt($this,$sql); }
    public function run($sql,$params) {
        if ($sql==='SELECT id FROM users WHERE id = ?') return [['id'=>$params[0]]];
        if (str_starts_with($sql,'SELECT * FROM friendships WHERE')) return $this->friendship?[$this->friendship]:[];
        if (str_starts_with($sql,'INSERT INTO friendships')) {
            $this->friendship=['id'=>7,'user_id'=>$params[0],'friend_id'=>$params[1],'status'=>'pending']; return [];
        }
        if ($sql==="SELECT id FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'pending'") {
            return !empty($this->friendship) && ($this->friendship['user_id'] ?? null)===$params[0] && ($this->friendship['friend_id'] ?? null)===$params[1] && ($this->friendship['status'] ?? null)==='pending'?[['id'=>7]]:[];
        }
        if ($sql==="UPDATE friendships SET status = 'accepted' WHERE id = ?") { $this->friendship['status']='accepted'; return []; }
        if ($sql==="DELETE FROM friendships WHERE id = ?") { $this->friendship=[]; return []; }
        if (str_starts_with($sql,"DELETE FROM notifications WHERE user_id = ? AND type = 'friend_request' AND actor_user_id = ?")) { $this->notifications=[]; return []; }
        if ($sql==='SELECT telegram_id, first_name FROM users WHERE id = ?') return [['telegram_id'=>1000+$params[0],'first_name'=>'Test']];
        throw new LogicException('Unexpected test SQL: ' . $sql);
    }
}
function friendshipRun($event,$responses,$nameField) {
    $pdo=new FriendshipTestPdo();
    if ($event==='friend_accepted') $pdo->friendship=['id'=>7,'user_id'=>2,'friend_id'=>1,'status'=>'pending'];
    TelegramLogger::$responses=$responses; TelegramLogger::$calls=[];
    $user=array_merge(['id'=>1,'first_name'=>'Default'],$nameField);
    ob_start();
    try {
        $action=$event==='friend_request'?'action_add_friend':'action_accept_friend';
        $action($pdo,$user,['friend_id'=>2]);
        $result=json_decode(ob_get_contents(),true,512,JSON_THROW_ON_ERROR);
    } finally { ob_end_clean(); }
    friendshipCheck($result===($event==='friend_request'?['status'=>'ok','friendship_status'=>'pending']:['status'=>'ok']),'Action success independent of delivery');
    friendshipCheck($pdo->friendship===['id'=>7,'user_id'=>$event==='friend_request'?1:2,'friend_id'=>$event==='friend_request'?2:1,'status'=>$event==='friend_request'?'pending':'accepted'],'Friendship state preserved');
    friendshipCheck($pdo->notifications===[[2,$event,1]],'In-app notification preserved');
    friendshipCheck($pdo->achievements===($event==='friend_accepted'?[1,2]:[]),'Achievements unchanged');
}
$ok=json_encode(['ok'=>true,'result'=>['message_id'=>1]]);
$reject=json_encode(['ok'=>false,'error_code'=>400]);
$name='<b>A&B "name"</b>\' <tg-button>';
$escaped=htmlspecialchars($name,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');
$logFile=tempnam(sys_get_temp_dir(),'friendship-test-');
$previousLog=ini_get('error_log'); ini_set('error_log',$logFile);
try {
    foreach (['friend_request','friend_accepted'] as $event) {
        foreach ([['custom_name'=>$name],['first_name'=>$name]] as $nameField) {
            foreach ([
                [[$ok],['sendRichMessage']],
                [[$reject,$ok],['sendRichMessage','sendMessage']],
                [[$reject,$reject],['sendRichMessage','sendMessage']],
                [[$reject,false],['sendRichMessage','sendMessage']],
                [[false],['sendRichMessage']],
                [[''],['sendRichMessage']],
                [['{invalid'],['sendRichMessage']],
                [['{"ok":"false"}'],['sendRichMessage']],
                [[new RuntimeException('secret-marker timeout')],['sendRichMessage']],
                [[new Error('secret-marker transport')],['sendRichMessage']],
            ] as [$responses,$methods]) {
                friendshipRun($event,$responses,$nameField);
                friendshipCheck(array_column(TelegramLogger::$calls,'method')===$methods,'Explicit-only fallback; no duplicates');
                friendshipCheck(TelegramLogger::$responses===[],'Expected requests consumed');
                $params=TelegramLogger::$calls[0]['params'];
                friendshipCheck($params['chat_id']===1002,'Correct recipient');
                $html=$params['rich_message']['html'];
                $heading=$event==='friend_request'?'<tg-emoji emoji-id="6021678620123077295">➕</tg-emoji> Новая заявка в друзья':'<tg-emoji emoji-id="6023940002008799618">👍</tg-emoji> Заявка принята';
                friendshipCheck(str_contains($html,'<h3>'.$heading.'</h3>'),'Approved custom emoji/heading/fallback');
                friendshipCheck(str_contains($html,'<b>'.$escaped.'</b>') && !str_contains($html,$name) && !str_contains($html,'&amp;lt;'),'Dynamic name escaped once');
                $body=$event==='friend_request'?' хочет добавить тебя.':' принял(а) твою заявку в друзья.';
                friendshipCheck(str_contains($html,$body),'Existing notification meaning');
                $cta='<tg-button-row align="center"><tg-button type="web_app" style="primary" url="https://lapin.live/mpg/">Открыть Party Games</tg-button></tg-button-row>';
                friendshipCheck(str_contains($html,$cta) && substr_count($html,'<tg-button ')===1,'One centered primary Web App CTA');
                $leaderboard='Теперь вы можете видеть друг друга в таблице лидеров друзей!';
                if ($event==='friend_accepted') friendshipCheck(str_contains($html,$leaderboard),'Leaderboard text preserved');
                if (count($methods)===2) {
                    $legacy=TelegramLogger::$calls[1]['params'];
                    $expected=$event==='friend_request'?"👋 <b>Боец, у тебя новая заявка в друзья!</b>\n\n👤 <b>{$escaped}</b> хочет добавить тебя.":"✅ <b>Ура! Новая дружба!</b>\n\n👤 <b>{$escaped}</b> принял(а) твою заявку в друзья.\n\n{$leaderboard}";
                    friendshipCheck($legacy['text']===$expected && $legacy['parse_mode']==='HTML','Legacy text preserved and escaped');
                    friendshipCheck($legacy['reply_markup']===['inline_keyboard'=>[[['text'=>'🎮 Открыть Party Games','web_app'=>['url'=>'https://lapin.live/mpg/']]]]],'Legacy Web App keyboard preserved');
                }
            }
        }
        TelegramLogger::$responses=[$ok]; TelegramLogger::$calls=[];
        friendshipCheck(social_send_friendship_notification(1002,$event,'Test')===true,'Helper confirms rich success');
        TelegramLogger::$responses=[$reject,$ok]; TelegramLogger::$calls=[];
        friendshipCheck(social_send_friendship_notification(1002,$event,'Test')===true,'Helper confirms fallback success');
        TelegramLogger::$responses=[$reject,$reject]; TelegramLogger::$calls=[];
        friendshipCheck(social_send_friendship_notification(1002,$event,'Test')===false,'Helper reports failed delivery');
    }
    $logs=file_get_contents($logFile);
    friendshipCheck(str_contains($logs,'ambiguous') && str_contains($logs,'exception') && !str_contains($logs,'secret-marker') && !str_contains($logs,$name),'Safe failure logging');

    // Verify action_reject_friend
    $rejectPdo = new FriendshipTestPdo();
    $rejectPdo->friendship = ['id'=>7,'user_id'=>2,'friend_id'=>1,'status'=>'pending'];
    $rejectPdo->notifications = [[1,'friend_request',2]];
    ob_start();
    try {
        action_reject_friend($rejectPdo, ['id'=>1,'first_name'=>'Recipient'], ['friend_id'=>2]);
        $rejectRes = json_decode(ob_get_contents(), true, 512, JSON_THROW_ON_ERROR);
    } finally { ob_end_clean(); }
    friendshipCheck($rejectRes === ['status'=>'ok'], 'Reject action returns ok');
    friendshipCheck($rejectPdo->friendship === [], 'Friendship record deleted on rejection');
    friendshipCheck($rejectPdo->notifications === [], 'Notification deleted on rejection');

    // Reject fails if caller is not the recipient
    $wrongPdo = new FriendshipTestPdo();
    $wrongPdo->friendship = ['id'=>7,'user_id'=>2,'friend_id'=>1,'status'=>'pending'];
    try {
        action_reject_friend($wrongPdo, ['id'=>2,'first_name'=>'Requester'], ['friend_id'=>1]);
        throw new LogicException('Requester should not be able to reject');
    } catch (Error $e) {
        friendshipCheck(str_contains($e->getMessage(), 'Заявка не найдена'), 'Only recipient can reject');
    }

    // Verify action_cancel_friend_request
    $cancelPdo = new FriendshipTestPdo();
    $cancelPdo->friendship = ['id'=>7,'user_id'=>1,'friend_id'=>2,'status'=>'pending'];
    $cancelPdo->notifications = [[2,'friend_request',1]];
    ob_start();
    try {
        action_cancel_friend_request($cancelPdo, ['id'=>1,'first_name'=>'Requester'], ['friend_id'=>2]);
        $cancelRes = json_decode(ob_get_contents(), true, 512, JSON_THROW_ON_ERROR);
    } finally { ob_end_clean(); }
    friendshipCheck($cancelRes === ['status'=>'ok'], 'Cancel action returns ok');
    friendshipCheck($cancelPdo->friendship === [], 'Friendship record deleted on cancel');
    friendshipCheck($cancelPdo->notifications === [], 'Notification deleted on cancel');

    // Cancel fails if caller is not the requester
    $wrongCancelPdo = new FriendshipTestPdo();
    $wrongCancelPdo->friendship = ['id'=>7,'user_id'=>1,'friend_id'=>2,'status'=>'pending'];
    try {
        action_cancel_friend_request($wrongCancelPdo, ['id'=>2,'first_name'=>'Recipient'], ['friend_id'=>1]);
        throw new LogicException('Recipient should not be able to cancel outgoing request');
    } catch (Error $e) {
        friendshipCheck(str_contains($e->getMessage(), 'Заявка не найдена'), 'Only requester can cancel');
    }

    // Anti-spam: cannot add oneself
    $selfPdo = new FriendshipTestPdo();
    try {
        action_add_friend($selfPdo, ['id'=>1,'first_name'=>'Me'], ['friend_id'=>1]);
        throw new LogicException('Self-friend request should fail');
    } catch (Error $e) {
        friendshipCheck(str_contains($e->getMessage(), 'Invalid user ID'), 'Self friend request rejected');
    }

    // Anti-spam: cannot duplicate pending request
    $dupPdo = new FriendshipTestPdo();
    $dupPdo->friendship = ['id'=>7,'user_id'=>1,'friend_id'=>2,'status'=>'pending'];
    try {
        action_add_friend($dupPdo, ['id'=>1,'first_name'=>'Me'], ['friend_id'=>2]);
        throw new LogicException('Duplicate request should fail');
    } catch (Error $e) {
        friendshipCheck(str_contains($e->getMessage(), 'Request already sent'), 'Duplicate request rejected');
    }

    // Anti-spam: blocked user cannot send request
    $blockPdo = new FriendshipTestPdo();
    $blockPdo->friendship = ['id'=>7,'user_id'=>2,'friend_id'=>1,'status'=>'blocked'];
    try {
        action_add_friend($blockPdo, ['id'=>1,'first_name'=>'Me'], ['friend_id'=>2]);
        throw new LogicException('Blocked user request should fail');
    } catch (Error $e) {
        friendshipCheck(str_contains($e->getMessage(), 'Action not allowed'), 'Blocked request rejected');
    }

    // Anti-spam: already friends
    $alreadyPdo = new FriendshipTestPdo();
    $alreadyPdo->friendship = ['id'=>7,'user_id'=>1,'friend_id'=>2,'status'=>'accepted'];
    try {
        action_add_friend($alreadyPdo, ['id'=>1,'first_name'=>'Me'], ['friend_id'=>2]);
        throw new LogicException('Already friends request should fail');
    } catch (Error $e) {
        friendshipCheck(str_contains($e->getMessage(), 'Already friends'), 'Already friends rejected');
    }

    echo "PASS friendship notifications, cancel, rejection, and anti-spam validation\n";
} finally { ini_set('error_log',$previousLog); unlink($logFile); }
