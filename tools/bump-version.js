const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(PROJECT_ROOT, 'index.html');

// 1. Get current git commit count as the build number
let commitCount;
try {
    commitCount = execSync('git rev-list --count HEAD').toString().trim();
    // Offset to match the current version style
    // +1 because pre-commit runs before the current commit is registered
    const offset = 2301;
    commitCount = parseInt(commitCount) + offset;
} catch (e) {
    console.error('Git not found or not a repository. Using current timestamp as fallback.');
    commitCount = Math.floor(Date.now() / 10000);
}

console.log(`🚀 New Build Version: ${commitCount}`);

// 2. Update index.html query parameters (?v=XXXX)
if (fs.existsSync(INDEX_HTML)) {
    let content = fs.readFileSync(INDEX_HTML, 'utf8');
    const versionRegex = /\?v=\d+/g;

    if (!versionRegex.test(content)) {
        console.error('❌ ERROR: No version parameters (?v=...) found in index.html!');
        process.exit(1);
    }

    const newContent = content.replace(versionRegex, `?v=${commitCount}`);
    fs.writeFileSync(INDEX_HTML, newContent);
    console.log('✅ Updated index.html asset versions');
} else {
    console.error('❌ ERROR: index.html not found!');
    process.exit(1);
}

console.log('✨ Version bump complete!');
