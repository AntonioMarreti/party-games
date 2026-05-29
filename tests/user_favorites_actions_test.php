<?php

function sendError($message)
{
    throw new RuntimeException($message);
}

function normalize_user_public_fields($user)
{
    return $user;
}

require __DIR__ . '/../server/actions/user.php';

function favoritesTestAssert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function makePdoException($sqlState, $message)
{
    $e = new PDOException($message);
    $e->errorInfo = [$sqlState];
    return $e;
}

class FavoritesActionsTestStmt
{
    private FavoritesActionsTestPdo $pdo;
    private string $sql;
    private array $params = [];

    public function __construct(FavoritesActionsTestPdo $pdo, string $sql)
    {
        $this->pdo = $pdo;
        $this->sql = trim(preg_replace('/\s+/', ' ', $sql));
    }

    public function execute(array $params = []): bool
    {
        $this->params = $params;

        if (str_contains($this->sql, 'SELECT game_id FROM user_favorites') || str_contains($this->sql, 'SELECT 1 FROM user_favorites')) {
            if (!$this->pdo->tableExists) {
                throw makePdoException('42S02', 'missing table');
            }
            return true;
        }

        if (str_contains($this->sql, 'INSERT INTO user_favorites')) {
            $gameId = (string) $params[1];
            if ($this->pdo->duplicateNextInsert) {
                $this->pdo->duplicateNextInsert = false;
                $this->pdo->likes[$gameId] = true;
                throw makePdoException('23000', 'duplicate key');
            }
            $this->pdo->likes[$gameId] = true;
            return true;
        }

        if (str_contains($this->sql, 'DELETE FROM user_favorites')) {
            unset($this->pdo->likes[(string) $params[1]]);
            return true;
        }

        return true;
    }

    public function fetchColumn(int $column = 0)
    {
        if (str_contains($this->sql, 'SELECT 1 FROM user_favorites')) {
            return !empty($this->pdo->likes[(string) $this->params[1]]) ? 1 : false;
        }

        return false;
    }

    public function fetchAll($mode = null): array
    {
        if (str_contains($this->sql, 'SELECT game_id FROM user_favorites')) {
            return array_keys($this->pdo->likes);
        }

        return [];
    }
}

class FavoritesActionsTestPdo
{
    public bool $tableExists = false;
    public bool $duplicateNextInsert = false;
    public int $execCalls = 0;
    public array $likes = [];

    public function exec(string $sql): void
    {
        if (str_contains($sql, 'CREATE TABLE IF NOT EXISTS user_favorites')) {
            $this->tableExists = true;
            $this->execCalls++;
        }
    }

    public function prepare(string $sql): FavoritesActionsTestStmt
    {
        return new FavoritesActionsTestStmt($this, $sql);
    }
}

$user = ['id' => 7];

$pdo = new FavoritesActionsTestPdo();
ob_start();
action_get_favorites($pdo, $user, []);
$initialFavorites = json_decode(ob_get_clean(), true);
favoritesTestAssert($initialFavorites === ['status' => 'ok', 'favorites' => []], 'get_favorites should lazily create the table and return an empty list');
favoritesTestAssert($pdo->execCalls === 1, 'get_favorites should run CREATE TABLE only once on a missing-table error');

$pdo->duplicateNextInsert = true;
ob_start();
action_toggle_like($pdo, $user, ['game_id' => 'spyfall']);
$toggle = json_decode(ob_get_clean(), true);
favoritesTestAssert($toggle === ['status' => 'ok', 'is_liked' => true], 'toggle_like should treat duplicate inserts as an idempotent success');
favoritesTestAssert(!empty($pdo->likes['spyfall']), 'toggle_like should leave the favorite stored after a duplicate insert race');
favoritesTestAssert($pdo->execCalls === 1, 'toggle_like should not rerun CREATE TABLE after the table already exists');

ob_start();
action_get_favorites($pdo, $user, []);
$favorites = json_decode(ob_get_clean(), true);
favoritesTestAssert($favorites === ['status' => 'ok', 'favorites' => ['spyfall']], 'get_favorites should return the stored favorite');

echo "User favorites action tests passed\n";
