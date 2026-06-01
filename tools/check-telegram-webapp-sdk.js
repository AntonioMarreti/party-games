const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const LOCAL_JS_PATH = path.join(__dirname, '../js/libs/telegram-web-app.js');
const META_PATH = path.join(__dirname, '../js/libs/telegram-web-app.meta.json');
const REMOTE_URL = 'https://telegram.org/js/telegram-web-app.js';

function getSha256(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}

async function checkSdk() {
    if (!fs.existsSync(LOCAL_JS_PATH) || !fs.existsSync(META_PATH)) {
        console.error("Local SDK or meta file not found.");
        process.exit(1);
    }

    const localContent = fs.readFileSync(LOCAL_JS_PATH, 'utf8');
    // Normalize newlines in case curl or git mutated them
    const normalizedLocal = localContent.replace(/\r\n/g, '\n');
    const localSha = getSha256(localContent);

    const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));

    console.log(`Checking Telegram WebApp SDK...`);
    console.log(`Local SHA256 (from file): ${localSha}`);
    console.log(`Local SHA256 (from meta): ${meta.sha256}`);

    if (localSha !== meta.sha256) {
        console.warn("WARNING: Local file SHA256 does not match meta.json!");
    }

    console.log(`\nFetching remote SDK from ${REMOTE_URL}...`);

    https.get(REMOTE_URL, (res) => {
        if (res.statusCode !== 200) {
            console.error(`Failed to fetch remote SDK: HTTP ${res.statusCode}`);
            process.exit(1);
        }

        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            const remoteSha = getSha256(data);
            console.log(`Remote SHA256:          ${remoteSha}`);

            if (localSha === remoteSha) {
                console.log(`\n✅ SDK is UP TO DATE.`);
            } else {
                console.log(`\n⚠️  UPDATE AVAILABLE! Remote SDK has changed.`);
                console.log(`Please update js/libs/telegram-web-app.js and its meta.json.`);
            }
        });
    }).on('error', (err) => {
        console.error(`Error fetching remote SDK: ${err.message}`);
        process.exit(1);
    });
}

checkSdk();
