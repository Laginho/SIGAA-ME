const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'electron', 'services', 'http-scraper.service.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Add the opening if statement before line 150
const before = "            $('.itemMenu').each((_, el) => {";
const afterOpening = "            // Skip navigation if using Playwright HTML (already navigated)\n            if (!preFetchedHtml) {\n            $('.itemMenu').each((_, el) => {";

content = content.replace(before, afterOpening);

// Add the closing bracket before the file scanning section
const beforeClosing = "            const $files = cheerio.load(filesPageData);";
const afterClosing = "            } else {\n                this.log('[HttpScraper] Using Playwright HTML directly.');\n            }\n\n            const $files = cheerio.load(filesPageData);";

content = content.replace(beforeClosing, afterClosing);

// Write back
fs.writeFileSync(filePath, content, 'utf8');

console.log('✅ Fix applied successfully!');
