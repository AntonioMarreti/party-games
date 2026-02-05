const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const INDEX_PHP = path.join(PROJECT_ROOT, 'index.php');
const VERSION_PHP = path.join(PROJECT_ROOT, 'layout/version.php');

// 1. Get current version from file and increment by 1
let nextVersion = 2305; // Starting point fallback

try {
    if (fs.existsSync(VERSION_PHP)) {
        const currentContent = fs.readFileSync(VERSION_PHP, 'utf8');
        const match = currentContent.match(/\$v\s*=\s*"(\d+)"/);
        if (match && match[1]) {
            nextVersion = parseInt(match[1]) + 1;
        } else {
            // If file exists but no number found, use git as sync point once
            const gitCount = execSync('git rev-list --count HEAD').toString().trim();
            nextVersion = parseInt(gitCount) + 2305;
        }
    } else {
        // First run: use git count + offset
        const gitCount = execSync('git rev-list --count HEAD').toString().trim();
        nextVersion = parseInt(gitCount) + 2305;
    }
} catch (e) {
    console.error('Determining version failed, strictly incrementing from baseline.');
    nextVersion = 2306;
}

const commitCount = nextVersion;

console.log(`🚀 New Build Version: ${commitCount}`);

// 2. Update layout/version.php (Priority)
if (fs.existsSync(VERSION_PHP)) {
    const newContent = `<?php $v = "${commitCount}"; ?>`;
    fs.writeFileSync(VERSION_PHP, newContent);
    console.log('✅ Updated layout/version.php');
} else {
    // Fallback: if version.php doesn't exist, try to create it if we are in modular mode
    try {
        if (!fs.existsSync(path.dirname(VERSION_PHP))) {
            fs.mkdirSync(path.dirname(VERSION_PHP), { recursive: true });
        }
        fs.writeFileSync(VERSION_PHP, `<?php $v = "${commitCount}"; ?>`);
        console.log('✅ Created layout/version.php');
    } catch (e) {
        console.error('❌ Could not create version.php');
    }
}

// 3. Update index.php or index.html (Backward Compatibility & Migration)
const targetFile = fs.existsSync(INDEX_PHP) ? INDEX_PHP : path.join(PROJECT_ROOT, 'index.html');

if (fs.existsSync(targetFile)) {
    let content = fs.readFileSync(targetFile, 'utf8');
    const versionRegex = /\?v=\d+/g;

    if (versionRegex.test(content)) {
        const newContent = content.replace(versionRegex, `?v=${commitCount}`);
        fs.writeFileSync(targetFile, newContent);
        console.log(`✅ Updated asset versions in ${path.basename(targetFile)}`);
    }
}

console.log('✨ Version bump complete!');
