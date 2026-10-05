<?php
// Load only real job functions, never its config/bootstrap or DB execution body.
$source = file_get_contents(__DIR__ . '/../server/jobs/send_scheduled_game_reminders.php');
$start = strpos($source, 'const SCHEDULED_REMINDER_CUSTOM_EMOJI_ID');
$end = strpos($source, "\ntry {\n    if (!scheduledReminderTableExists");
if ($start === false || $end === false || $end <= $start) throw new RuntimeException('Job function boundary not found');
eval(substr($source, $start, $end - $start));
class TelegramLogger {
    public static array $responses = [];
    public static array $calls = [];
    public static function sendRequest($method, $params) {
        self::$calls[] = ['method'=>$method,'params'=>$params];
        if (!self::$responses) throw new LogicException('Unexpected Telegram call');
        $result = array_shift(self::$responses);
        if ($result instanceof Throwable) throw $result;
        return $result;
    }
}
function reminderCheck($condition, $message) { if (!$condition) throw new RuntimeException($message); }
$ok = json_encode(['ok'=>true,'result'=>['message_id'=>1]]);
$reject = json_encode(['ok'=>false,'error_code'=>400]);
$game = ['title'=>'<b>A&B "title"</b>\' <tg-button>', 'starts_at'=>'2026-10-04 19:42:00', 'game_type'=>'durak','subscribers_count'=>1,'max_players'=>4];
$url = scheduledReminderDeepLinkUrl(42, 'https://t.me/test_bot/app');
$escaped = htmlspecialchars($game['title'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$logFile = tempnam(sys_get_temp_dir(), 'scheduled-reminder-test-');
$previousLog = ini_get('error_log');
ini_set('error_log', $logFile);
try {
    foreach ([true,false] as $isHost) {
        $body = scheduledReminderMessage($game,$isHost);
        reminderCheck(str_starts_with($body, $isHost?'Ваша игра «':'Игра «'), 'Body has no heading emoji prefix');
        reminderCheck(!str_contains($body, '<tg-emoji'), 'Body has no custom emoji markup');
        $label = $isHost?'Открыть комнату':'Открыть игру';
        foreach ([
            [[$ok],true,['sendRichMessage']],
            [[$reject,$ok],true,['sendRichMessage','sendMessage']],
            [[$reject,$reject],false,['sendRichMessage','sendMessage']],
            [[$reject,false],false,['sendRichMessage','sendMessage']],
            [[false],false,['sendRichMessage']],
            [[''],false,['sendRichMessage']],
            [['{invalid'],false,['sendRichMessage']],
            [['null'],false,['sendRichMessage']],
            [['{"ok":"false"}'],false,['sendRichMessage']],
            [[new RuntimeException('secret-marker timeout')],false,['sendRichMessage']],
        ] as [$responses,$delivered,$methods]) {
            TelegramLogger::$responses=$responses; TelegramLogger::$calls=[];
            reminderCheck(scheduledReminderSend(1001,$body,$label,$url,false)===$delivered,'Only confirmed delivery returns true');
            reminderCheck(array_column(TelegramLogger::$calls,'method')===$methods,'Explicit-only fallback');
            $html=TelegramLogger::$calls[0]['params']['rich_message']['html'];
            reminderCheck(str_contains($html,'<h3><tg-emoji emoji-id="6023852878597200124">🎮</tg-emoji> Скоро игра</h3>'),'Automatic heading');
            reminderCheck(str_contains($html,$escaped) && !str_contains($html,$game['title']) && !str_contains($html,'&amp;lt;'),'Title escaped once');
            reminderCheck(substr_count($html, '<tg-emoji ') === 1, 'Exactly one custom emoji in Rich heading');
            reminderCheck(str_contains($html,'<b>19:42</b>'),'Existing time preserved');
            reminderCheck(str_contains($html,'<tg-button-row align="center"><tg-button type="url" style="primary" url="'.$url.'">'.$label.'</tg-button>'),'Host/subscriber primary centered CTA and scheduled link');
            reminderCheck(str_contains($html,$isHost?'Записались: 1/4. Откройте комнату':'Хост скоро откроет комнату'),'Existing role-specific body');
            if (count($methods)===2) {
                $fallback=TelegramLogger::$calls[1]['params'];
                reminderCheck($fallback['text']===$body && $fallback['parse_mode']==='HTML','Fallback text unchanged');
                reminderCheck($fallback['reply_markup']['inline_keyboard'][0][0]===['text'=>$label,'url'=>$url],'Fallback CTA unchanged');
            }
        }
        TelegramLogger::$responses=[]; TelegramLogger::$calls=[];
        ob_start();
        try { $sent=scheduledReminderSend(1001,$body,$label,$url,true); $output=ob_get_contents(); }
        finally { ob_end_clean(); }
        reminderCheck($sent && !TelegramLogger::$calls,'Dry-run simulates success without Telegram');
        reminderCheck(str_contains($output,'sendRichMessage') && str_contains($output,$label) && str_contains($output,$url),'Dry-run rich diagnostic');
    }
    TelegramLogger::$responses=[$ok]; TelegramLogger::$calls=[];
    reminderCheck(scheduledReminderSend(1001,'Safe','CTA "<&','https://t.me/test_bot/app?startapp=TEST"&42',false),'URL escaping send');
    $html=TelegramLogger::$calls[0]['params']['rich_message']['html'];
    reminderCheck(str_contains($html,'TEST&quot;&amp;42') && str_contains($html,'CTA &quot;&lt;&amp;'),'CTA and URL attribute escaped');
    reminderCheck(!str_contains(file_get_contents($logFile),'secret-marker'),'Transport exception data stays redacted');
    echo "PASS automatic reminder transport: host/subscriber rich body/CTA, fallback, ambiguity, dry-run, escaping\n";
} finally { ini_set('error_log',$previousLog); unlink($logFile); }
