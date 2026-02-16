<?php

function action_create_invoice($pdo, $user, $data)
{
    $amount = (int) ($data['amount'] ?? 0);

    // Validation
    if ($amount < 1)
        sendError("Minimum donation is 1 Star");
    if ($amount > 2500)
        sendError("Maximum donation is 2500 Stars");

    // Title & Description
    $title = "Donation";
    $description = "Support Party Games ($amount Stars)";
    $payload = "donation_" . $user['id'] . "_" . time(); // Unique payload
    $currency = "XTR";

    // Telegram API URL
    $url = "https://api.telegram.org/bot" . BOT_TOKEN . "/createInvoiceLink";

    // Prices array
    $prices = [
        ['label' => 'Donation', 'amount' => $amount] // Amount in Stars (1 Star = 1 amount unit for XTR?) 
        // Docs say: amount in the smallest units of the currency. 
        // For XTR (Telegram Stars), amount is just the number of stars. 1 star = 1 amount.
    ];

    $params = [
        'title' => $title,
        'description' => $description,
        'payload' => $payload,
        'provider_token' => "", // Empty for Telegram Stars
        'currency' => $currency,
        'prices' => json_encode($prices)
    ];

    // Make Request
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url . '?' . http_build_query($params)); // GET/POST supported. using GET for params here or POST fields? 
    // createInvoiceLink supports POST. Let's use POST for safety.
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $params);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    $resData = json_decode($response, true);

    if ($resData['ok']) {
        echo json_encode(['status' => 'ok', 'invoice_link' => $resData['result']]);
    } else {
        TelegramLogger::logError('payment', [
            'message' => 'Failed to create invoice',
            'response' => $response
        ]);
        sendError("Telegram API Error: " . ($resData['description'] ?? 'Unknown'));
    }
}
