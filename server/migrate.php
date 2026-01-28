<?php
// Manual config to avoid file include issues and try IP
$db_host = '127.0.0.1'; // Try IP instead of localhost
$db_name = 'c68695_lapin_live_mpg';
$db_user = 'c68695_lapin_live';
$db_pass = 'QeCduDojbihuh84';

try {
    echo "Connecting to $db_host...<br>";
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    echo "Migrating database...<br>";
    
    // Add custom_name
    try {
        $pdo->exec("ALTER TABLE users ADD COLUMN custom_name VARCHAR(64) DEFAULT NULL");
        echo "Added custom_name column.<br>";
    } catch (PDOException $e) {
        echo "custom_name: " . $e->getMessage() . "<br>";
    }

    // Add custom_avatar
    try {
        $pdo->exec("ALTER TABLE users ADD COLUMN custom_avatar TEXT DEFAULT NULL");
        echo "Added custom_avatar column.<br>";
    } catch (PDOException $e) {
        echo "custom_avatar: " . $e->getMessage() . "<br>";
    }

    echo "Migration completed.";

} catch (Exception $e) {
    echo "Fatal Error: " . $e->getMessage();
}
