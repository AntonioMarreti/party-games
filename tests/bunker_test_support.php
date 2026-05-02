<?php

final class FakePdoStatement
{
    private array $rows = [];
    private int $fetchIndex = 0;

    public function __construct(private FakePdo $pdo, private string $sql)
    {
    }

    public function execute(array $params = []): bool
    {
        $this->rows = $this->pdo->runQuery($this->sql, $params);
        $this->fetchIndex = 0;
        return true;
    }

    public function fetchAll($mode = null): array
    {
        if ($mode === PDO::FETCH_COLUMN) {
            return array_map(static fn(array $row) => reset($row), $this->rows);
        }
        return $this->rows;
    }

    public function fetchColumn(int $column = 0): mixed
    {
        if (empty($this->rows)) {
            return false;
        }
        $row = $this->rows[0];
        return array_values($row)[$column] ?? false;
    }

    public function fetch($mode = null): array|false
    {
        if (!isset($this->rows[$this->fetchIndex])) {
            return false;
        }
        return $this->rows[$this->fetchIndex++];
    }
}

final class FakePdo
{
    public function __construct(private array $roomPlayers, private array $users)
    {
    }

    public function prepare(string $sql): FakePdoStatement
    {
        return new FakePdoStatement($this, $sql);
    }

    public function runQuery(string $sql, array $params): array
    {
        if (str_contains($sql, 'SELECT user_id FROM room_players WHERE room_id = ?')) {
            $roomId = (string) ($params[0] ?? '');
            $rows = array_filter($this->roomPlayers, static fn(array $row) => (string) $row['room_id'] === $roomId);
            return array_map(static fn(array $row) => ['user_id' => $row['user_id']], array_values($rows));
        }

        if (str_contains($sql, 'SELECT is_bot FROM room_players WHERE room_id = ? AND user_id = ?')) {
            [$roomId, $userId] = $params;
            foreach ($this->roomPlayers as $row) {
                if ((string) $row['room_id'] === (string) $roomId && (string) $row['user_id'] === (string) $userId) {
                    return [['is_bot' => $row['is_bot']]];
                }
            }
            return [];
        }

        if (str_contains($sql, 'SELECT first_name FROM users WHERE id = ?')) {
            $userId = (string) ($params[0] ?? '');
            return isset($this->users[$userId]) ? [['first_name' => $this->users[$userId]['first_name']]] : [];
        }

        return [];
    }
}

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
